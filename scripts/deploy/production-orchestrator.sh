#!/bin/bash
# ================================================================================
# SightEdit Production Deployment Orchestrator
# Comprehensive production deployment with health checks, rollback, and monitoring
# ================================================================================

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="$(basename "${0}")"
readonly LOG_FILE="/tmp/production-deploy.log"
readonly DEPLOY_CONFIG="${DEPLOY_CONFIG:-scripts/deploy/config/production.yml}"
readonly KUBECTL_TIMEOUT="${KUBECTL_TIMEOUT:-600s}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Deployment configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
DEPLOYMENT_STRATEGY="${DEPLOYMENT_STRATEGY:-blue-green}"
VERSION="${VERSION:-latest}"
DRY_RUN="${DRY_RUN:-false}"
SKIP_TESTS="${SKIP_TESTS:-false}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"
NAMESPACE="${NAMESPACE:-sightedit}"

# Health check configuration
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"
HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-10}"
ROLLBACK_TIMEOUT="${ROLLBACK_TIMEOUT:-180}"

# Deployment state tracking
declare -A DEPLOYMENT_STATUS=()
declare -A SERVICE_HEALTH=()
DEPLOYMENT_START_TIME=""
DEPLOYMENT_ID=""

# Logging functions
log() {
    echo -e "${2:-$GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "${LOG_FILE}"
}

log_error() {
    log "$1" "${RED}"
}

log_warning() {
    log "$1" "${YELLOW}"
}

log_info() {
    log "$1" "${BLUE}"
}

# Function to show usage
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [OPTIONS]

Production deployment orchestrator for SightEdit platform.

Options:
  -e, --environment      Target environment (default: production)
  -s, --strategy        Deployment strategy: blue-green, rolling, canary (default: blue-green)
  -v, --version         Image version to deploy (default: latest)
  -n, --namespace       Kubernetes namespace (default: sightedit)
  --dry-run            Simulate deployment without making changes
  --skip-tests         Skip pre-deployment tests
  --no-rollback        Disable automatic rollback on failure
  -h, --help           Show this help message

Deployment Strategies:
  blue-green    Zero-downtime deployment with immediate switch
  rolling       Gradual replacement of instances
  canary        Progressive traffic shifting to new version

Environment Variables:
  KUBECTL_TIMEOUT       Kubernetes operation timeout (default: 600s)
  HEALTH_CHECK_TIMEOUT  Health check timeout in seconds (default: 300)
  DEPLOY_CONFIG         Path to deployment configuration file
  AUTO_ROLLBACK         Enable automatic rollback (default: true)

Examples:
  $SCRIPT_NAME --strategy blue-green --version v1.2.0
  $SCRIPT_NAME --environment staging --strategy canary
  DRY_RUN=true $SCRIPT_NAME --version v1.2.0
EOF
}

# Function to parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -s|--strategy)
                DEPLOYMENT_STRATEGY="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            -n|--namespace)
                NAMESPACE="$2"
                shift 2
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --skip-tests)
                SKIP_TESTS="true"
                shift
                ;;
            --no-rollback)
                AUTO_ROLLBACK="false"
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Function to validate prerequisites
validate_prerequisites() {
    log_info "Validating deployment prerequisites..."
    
    # Check required tools
    local required_tools=("kubectl" "helm" "docker" "jq" "yq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            log_error "Required tool not found: $tool"
            exit 1
        fi
    done
    
    # Validate Kubernetes connection
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Unable to connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
        log_error "Namespace '$NAMESPACE' does not exist"
        exit 1
    fi
    
    # Validate deployment strategy
    case "$DEPLOYMENT_STRATEGY" in
        blue-green|rolling|canary)
            log_info "Using deployment strategy: $DEPLOYMENT_STRATEGY"
            ;;
        *)
            log_error "Invalid deployment strategy: $DEPLOYMENT_STRATEGY"
            exit 1
            ;;
    esac
    
    # Check image availability
    log_info "Validating image availability..."
    local image_base="ghcr.io/sightedit/sightedit"
    if ! docker manifest inspect "$image_base:$VERSION" >/dev/null 2>&1; then
        log_warning "Image $image_base:$VERSION may not exist or is not accessible"
    fi
    
    log "Prerequisites validation completed"
}

# Function to run pre-deployment tests
run_pre_deployment_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "Skipping pre-deployment tests"
        return 0
    fi
    
    log_info "Running pre-deployment tests..."
    
    # Run smoke tests
    log_info "Running smoke tests..."
    if ! ./scripts/test/smoke-tests.sh --environment "$ENVIRONMENT"; then
        log_error "Smoke tests failed"
        return 1
    fi
    
    # Run integration tests
    log_info "Running integration tests..."
    if ! ./scripts/test/integration-tests.sh --quick; then
        log_error "Integration tests failed"
        return 1
    fi
    
    # Validate configuration
    log_info "Validating Kubernetes manifests..."
    if ! kubectl apply --dry-run=client -f k8s/production/ >/dev/null 2>&1; then
        log_error "Kubernetes manifest validation failed"
        return 1
    fi
    
    log "Pre-deployment tests completed successfully"
}

# Function to backup current deployment
backup_current_deployment() {
    log_info "Creating backup of current deployment..."
    
    local backup_dir="/tmp/sightedit-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup current deployments
    kubectl get deployments -n "$NAMESPACE" -o yaml > "$backup_dir/deployments.yaml"
    kubectl get services -n "$NAMESPACE" -o yaml > "$backup_dir/services.yaml"
    kubectl get configmaps -n "$NAMESPACE" -o yaml > "$backup_dir/configmaps.yaml"
    kubectl get secrets -n "$NAMESPACE" -o yaml > "$backup_dir/secrets.yaml"
    
    # Store backup location
    echo "$backup_dir" > "/tmp/sightedit-backup-location"
    
    log "Backup created at: $backup_dir"
}

# Function to deploy with blue-green strategy
deploy_blue_green() {
    log_info "Starting Blue-Green deployment..."
    
    # Determine current and new slots
    local current_slot
    local new_slot
    
    if kubectl get deployment sightedit-backend-blue -n "$NAMESPACE" >/dev/null 2>&1 && \
       kubectl get deployment sightedit-backend-blue -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' | grep -v "^0$" >/dev/null; then
        current_slot="blue"
        new_slot="green"
    else
        current_slot="green"  
        new_slot="blue"
    fi
    
    log_info "Current slot: $current_slot, Target slot: $new_slot"
    
    # Deploy to new slot
    log_info "Deploying to $new_slot slot..."
    
    # Update image versions in manifests
    update_image_versions "$new_slot"
    
    # Apply new deployment
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would deploy to $new_slot slot with version $VERSION"
    else
        kubectl apply -f k8s/production/deployment-$new_slot.yaml
        
        # Wait for new deployment to be ready
        if ! wait_for_deployment_ready "sightedit-backend-$new_slot"; then
            log_error "New deployment failed to become ready"
            return 1
        fi
        
        # Run health checks on new slot
        if ! run_health_checks "$new_slot"; then
            log_error "Health checks failed for new deployment"
            return 1
        fi
        
        # Switch traffic to new slot
        log_info "Switching traffic to $new_slot slot..."
        switch_traffic_blue_green "$new_slot"
        
        # Scale down old slot
        log_info "Scaling down $current_slot slot..."
        kubectl scale deployment "sightedit-backend-$current_slot" -n "$NAMESPACE" --replicas=0
    fi
    
    DEPLOYMENT_STATUS["blue-green"]="success"
    log "Blue-Green deployment completed successfully"
}

# Function to deploy with rolling update strategy
deploy_rolling() {
    log_info "Starting Rolling deployment..."
    
    # Update image versions
    update_image_versions ""
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would perform rolling update with version $VERSION"
    else
        # Apply rolling update
        kubectl set image deployment/sightedit-backend \
            backend="ghcr.io/sightedit/sightedit:$VERSION" \
            -n "$NAMESPACE"
        
        kubectl set image deployment/sightedit-cdn \
            nginx="ghcr.io/sightedit/cdn:$VERSION" \
            -n "$NAMESPACE"
            
        # Wait for rollout to complete
        if ! kubectl rollout status deployment/sightedit-backend -n "$NAMESPACE" --timeout="$KUBECTL_TIMEOUT"; then
            log_error "Backend rollout failed"
            return 1
        fi
        
        if ! kubectl rollout status deployment/sightedit-cdn -n "$NAMESPACE" --timeout="$KUBECTL_TIMEOUT"; then
            log_error "CDN rollout failed"
            return 1
        fi
        
        # Run health checks
        if ! run_health_checks ""; then
            log_error "Health checks failed after rolling update"
            return 1
        fi
    fi
    
    DEPLOYMENT_STATUS["rolling"]="success"
    log "Rolling deployment completed successfully"
}

# Function to deploy with canary strategy
deploy_canary() {
    log_info "Starting Canary deployment..."
    
    local canary_percentage="${CANARY_PERCENTAGE:-10}"
    local canary_steps="${CANARY_STEPS:-3}"
    local step_duration="${CANARY_STEP_DURATION:-300}"
    
    log_info "Canary configuration: $canary_percentage% traffic, $canary_steps steps, ${step_duration}s per step"
    
    # Deploy canary version
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY RUN: Would deploy canary with $canary_percentage% traffic"
    else
        # Apply canary deployment
        deploy_canary_version "$canary_percentage"
        
        # Progressive canary rollout
        for ((step=1; step<=canary_steps; step++)); do
            local traffic_percent=$((canary_percentage * step))
            
            log_info "Canary step $step/$canary_steps: Routing $traffic_percent% traffic to new version"
            
            # Update traffic split
            update_canary_traffic "$traffic_percent"
            
            # Wait and monitor
            log_info "Monitoring for ${step_duration}s..."
            sleep "$step_duration"
            
            # Check metrics and health
            if ! monitor_canary_metrics "$traffic_percent"; then
                log_error "Canary metrics indicate issues, rolling back..."
                rollback_canary
                return 1
            fi
        done
        
        # Complete canary rollout
        log_info "Canary validation successful, completing rollout..."
        complete_canary_rollout
    fi
    
    DEPLOYMENT_STATUS["canary"]="success"
    log "Canary deployment completed successfully"
}

# Function to update image versions in manifests
update_image_versions() {
    local slot_suffix="$1"
    local manifest_pattern="k8s/production/deployment"
    
    if [[ -n "$slot_suffix" ]]; then
        manifest_pattern="${manifest_pattern}-${slot_suffix}"
    fi
    
    # Update backend image
    yq eval ".spec.template.spec.containers[0].image = \"ghcr.io/sightedit/sightedit:${VERSION}\"" -i "${manifest_pattern}.yaml"
    
    # Update CDN image
    yq eval ".spec.template.spec.containers[0].image = \"ghcr.io/sightedit/cdn:${VERSION}\"" -i "k8s/production/cdn${slot_suffix:+-$slot_suffix}.yaml" 2>/dev/null || true
}

# Function to wait for deployment to be ready
wait_for_deployment_ready() {
    local deployment_name="$1"
    local timeout="$KUBECTL_TIMEOUT"
    
    log_info "Waiting for deployment $deployment_name to be ready..."
    
    if kubectl rollout status deployment/"$deployment_name" -n "$NAMESPACE" --timeout="$timeout"; then
        log "Deployment $deployment_name is ready"
        return 0
    else
        log_error "Deployment $deployment_name failed to become ready within $timeout"
        return 1
    fi
}

# Function to run health checks
run_health_checks() {
    local slot="$1"
    local service_suffix=""
    
    if [[ -n "$slot" ]]; then
        service_suffix="-$slot"
    fi
    
    log_info "Running health checks for deployed services..."
    
    local services=("backend" "cdn" "website")
    local failed_checks=()
    
    for service in "${services[@]}"; do
        log_info "Checking health of $service service..."
        
        local service_name="sightedit-${service}${service_suffix}"
        local health_endpoint
        local port
        
        case "$service" in
            backend)
                health_endpoint="/health"
                port="3000"
                ;;
            cdn)
                health_endpoint="/health"
                port="8080"
                ;;
            website)
                health_endpoint="/health"
                port="8080"
                ;;
        esac
        
        # Port forward for health check
        local local_port=$((8000 + RANDOM % 1000))
        kubectl port-forward "service/$service_name" "$local_port:$port" -n "$NAMESPACE" &
        local port_forward_pid=$!
        
        # Wait for port forward to establish
        sleep 5
        
        # Perform health check
        local health_status="unhealthy"
        local attempts=0
        local max_attempts=$((HEALTH_CHECK_TIMEOUT / HEALTH_CHECK_INTERVAL))
        
        while [[ $attempts -lt $max_attempts ]]; do
            if curl -f -s "http://localhost:$local_port$health_endpoint" >/dev/null 2>&1; then
                health_status="healthy"
                break
            fi
            
            ((attempts++))
            sleep "$HEALTH_CHECK_INTERVAL"
        done
        
        # Clean up port forward
        kill $port_forward_pid 2>/dev/null || true
        
        SERVICE_HEALTH["$service"]="$health_status"
        
        if [[ "$health_status" == "healthy" ]]; then
            log "$service service is healthy"
        else
            log_error "$service service health check failed"
            failed_checks+=("$service")
        fi
    done
    
    if [[ ${#failed_checks[@]} -gt 0 ]]; then
        log_error "Health checks failed for: ${failed_checks[*]}"
        return 1
    fi
    
    log "All health checks passed"
    return 0
}

# Function to switch traffic in blue-green deployment
switch_traffic_blue_green() {
    local target_slot="$1"
    
    log_info "Switching traffic to $target_slot slot..."
    
    # Update service selectors to point to new slot
    kubectl patch service sightedit-backend -n "$NAMESPACE" \
        -p "{\"spec\":{\"selector\":{\"slot\":\"$target_slot\"}}}"
        
    kubectl patch service sightedit-cdn -n "$NAMESPACE" \
        -p "{\"spec\":{\"selector\":{\"slot\":\"$target_slot\"}}}"
    
    log "Traffic switched to $target_slot slot"
}

# Function to rollback deployment
rollback_deployment() {
    log_error "Initiating deployment rollback..."
    
    case "$DEPLOYMENT_STRATEGY" in
        blue-green)
            rollback_blue_green
            ;;
        rolling)
            rollback_rolling
            ;;
        canary)
            rollback_canary
            ;;
    esac
}

# Function to rollback blue-green deployment
rollback_blue_green() {
    log_info "Rolling back Blue-Green deployment..."
    
    # Switch traffic back to previous slot
    local previous_slot
    if kubectl get service sightedit-backend -n "$NAMESPACE" -o jsonpath='{.spec.selector.slot}' | grep -q "blue"; then
        previous_slot="green"
    else
        previous_slot="blue"
    fi
    
    switch_traffic_blue_green "$previous_slot"
    
    log "Blue-Green rollback completed"
}

# Function to rollback rolling deployment
rollback_rolling() {
    log_info "Rolling back Rolling deployment..."
    
    kubectl rollout undo deployment/sightedit-backend -n "$NAMESPACE"
    kubectl rollout undo deployment/sightedit-cdn -n "$NAMESPACE"
    
    # Wait for rollback to complete
    kubectl rollout status deployment/sightedit-backend -n "$NAMESPACE" --timeout="$ROLLBACK_TIMEOUT"
    kubectl rollout status deployment/sightedit-cdn -n "$NAMESPACE" --timeout="$ROLLBACK_TIMEOUT"
    
    log "Rolling deployment rollback completed"
}

# Function to send deployment notifications
send_notifications() {
    local status="$1"
    local message="$2"
    
    log_info "Sending deployment notifications..."
    
    # Slack notification
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local emoji
        local color
        
        case "$status" in
            success)
                emoji=":white_check_mark:"
                color="good"
                ;;
            failure)
                emoji=":x:"
                color="danger"
                ;;
            warning)
                emoji=":warning:"
                color="warning"
                ;;
        esac
        
        local payload=$(cat << EOF
{
    "attachments": [
        {
            "color": "$color",
            "title": "$emoji SightEdit Production Deployment",
            "fields": [
                {
                    "title": "Environment",
                    "value": "$ENVIRONMENT",
                    "short": true
                },
                {
                    "title": "Strategy",
                    "value": "$DEPLOYMENT_STRATEGY",
                    "short": true
                },
                {
                    "title": "Version",
                    "value": "$VERSION",
                    "short": true
                },
                {
                    "title": "Status",
                    "value": "$status",
                    "short": true
                },
                {
                    "title": "Message",
                    "value": "$message",
                    "short": false
                }
            ],
            "footer": "SightEdit Deployment Bot",
            "ts": $(date +%s)
        }
    ]
}
EOF
        )
        
        curl -X POST -H 'Content-type: application/json' \
            --data "$payload" \
            "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
    fi
    
    # Email notification (if configured)
    if [[ -n "${NOTIFICATION_EMAIL:-}" ]]; then
        echo "$message" | mail -s "SightEdit Deployment $status" "$NOTIFICATION_EMAIL" 2>/dev/null || true
    fi
}

# Function to generate deployment report
generate_deployment_report() {
    local status="$1"
    local end_time=$(date -Iseconds)
    local duration=$(($(date +%s) - $(date -d "$DEPLOYMENT_START_TIME" +%s)))
    
    log_info "Generating deployment report..."
    
    local report_file="/tmp/sightedit-deployment-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
    "deployment_info": {
        "deployment_id": "$DEPLOYMENT_ID",
        "environment": "$ENVIRONMENT",
        "strategy": "$DEPLOYMENT_STRATEGY",
        "version": "$VERSION",
        "namespace": "$NAMESPACE",
        "start_time": "$DEPLOYMENT_START_TIME",
        "end_time": "$end_time",
        "duration_seconds": $duration,
        "status": "$status",
        "dry_run": $DRY_RUN
    },
    "deployment_status": $(printf '%s\n' "${DEPLOYMENT_STATUS[@]}" | jq -R . | jq -s 'add'),
    "service_health": $(printf '%s\n' "${SERVICE_HEALTH[@]}" | jq -R . | jq -s 'add'),
    "configuration": {
        "auto_rollback": $AUTO_ROLLBACK,
        "skip_tests": $SKIP_TESTS,
        "health_check_timeout": $HEALTH_CHECK_TIMEOUT,
        "kubectl_timeout": "$KUBECTL_TIMEOUT"
    },
    "cluster_info": {
        "context": "$(kubectl config current-context)",
        "cluster": "$(kubectl config view --minify -o jsonpath='{.clusters[0].name}')"
    }
}
EOF
    
    log "Deployment report generated: $report_file"
    echo "$report_file"
}

# Function to cleanup deployment resources
cleanup_deployment() {
    log_info "Cleaning up deployment resources..."
    
    # Remove temporary files
    rm -f /tmp/sightedit-deploy-* 2>/dev/null || true
    
    # Clean up any port forwards
    pkill -f "kubectl port-forward" 2>/dev/null || true
    
    log "Cleanup completed"
}

# Function to monitor deployment
monitor_deployment() {
    local deployment_name="$1"
    local duration="${2:-300}"
    
    log_info "Monitoring deployment $deployment_name for ${duration}s..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + duration))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # Check deployment status
        local ready_replicas
        ready_replicas=$(kubectl get deployment "$deployment_name" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo "0")
        local desired_replicas
        desired_replicas=$(kubectl get deployment "$deployment_name" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}' 2>/dev/null || echo "1")
        
        log_info "Deployment $deployment_name: $ready_replicas/$desired_replicas replicas ready"
        
        # Check for any pod failures
        local failed_pods
        failed_pods=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=sightedit --field-selector=status.phase=Failed --no-headers 2>/dev/null | wc -l || echo "0")
        
        if [[ "$failed_pods" -gt 0 ]]; then
            log_warning "Found $failed_pods failed pods"
            kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=sightedit --field-selector=status.phase=Failed
        fi
        
        sleep 30
    done
    
    log "Monitoring completed for $deployment_name"
}

# Main execution function
main() {
    # Initialize deployment tracking
    DEPLOYMENT_START_TIME=$(date -Iseconds)
    DEPLOYMENT_ID="deploy-$(date +%Y%m%d-%H%M%S)-$$"
    
    log_info "Starting SightEdit production deployment orchestration..."
    log_info "Deployment ID: $DEPLOYMENT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Strategy: $DEPLOYMENT_STRATEGY"
    log_info "Version: $VERSION"
    log_info "Dry Run: $DRY_RUN"
    
    # Set up cleanup trap
    trap cleanup_deployment EXIT
    
    # Main deployment flow
    if validate_prerequisites && \
       run_pre_deployment_tests && \
       backup_current_deployment; then
        
        case "$DEPLOYMENT_STRATEGY" in
            blue-green)
                deploy_blue_green
                ;;
            rolling)
                deploy_rolling
                ;;
            canary)
                deploy_canary
                ;;
        esac
        
        if [[ "${DEPLOYMENT_STATUS[${DEPLOYMENT_STRATEGY}]:-}" == "success" ]]; then
            local message="Deployment completed successfully with $DEPLOYMENT_STRATEGY strategy"
            log "$message"
            send_notifications "success" "$message"
            
            # Monitor deployment for stability
            if [[ "$DRY_RUN" != "true" ]]; then
                monitor_deployment "sightedit-backend" 600
            fi
        else
            local message="Deployment failed during $DEPLOYMENT_STRATEGY strategy execution"
            log_error "$message"
            
            if [[ "$AUTO_ROLLBACK" == "true" && "$DRY_RUN" != "true" ]]; then
                rollback_deployment
            fi
            
            send_notifications "failure" "$message"
            exit 1
        fi
    else
        local message="Deployment failed during preparation phase"
        log_error "$message"
        send_notifications "failure" "$message"
        exit 1
    fi
    
    # Generate final report
    local report_file
    report_file=$(generate_deployment_report "success")
    
    log "Production deployment orchestration completed successfully!"
    log "Deployment report: $report_file"
}

# Parse arguments and execute
parse_arguments "$@"
main