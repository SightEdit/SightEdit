#!/bin/bash

# SightEdit Deployment Script
# Comprehensive deployment automation with health checks and rollback capabilities

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="/tmp/sightedit-deploy-$(date +%Y%m%d_%H%M%S).log"

# Default values
ENVIRONMENT=${ENVIRONMENT:-"staging"}
VERSION=${VERSION:-"latest"}
DEPLOYMENT_STRATEGY=${DEPLOYMENT_STRATEGY:-"rolling"}
DRY_RUN=${DRY_RUN:-"false"}
SKIP_TESTS=${SKIP_TESTS:-"false"}
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-300}
ROLLBACK_ON_FAILURE=${ROLLBACK_ON_FAILURE:-"true"}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $*${NC}" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARN: $*${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*${NC}" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $*${NC}" | tee -a "$LOG_FILE"
}

# Utility functions
usage() {
    cat << EOF
SightEdit Deployment Script

Usage: $0 [OPTIONS]

Options:
    -e, --environment       Target environment (dev|staging|prod) [default: staging]
    -v, --version          Version to deploy [default: latest]
    -s, --strategy         Deployment strategy (rolling|blue-green|canary) [default: rolling]
    -d, --dry-run          Perform a dry run without actual deployment [default: false]
    -t, --skip-tests       Skip pre-deployment tests [default: false]
    -h, --health-timeout   Health check timeout in seconds [default: 300]
    -r, --no-rollback      Disable automatic rollback on failure [default: false]
    --help                 Show this help message

Examples:
    $0 -e prod -v 1.2.3 -s blue-green
    $0 --environment staging --version latest --dry-run
    $0 -e prod -s canary --health-timeout 600

Environment Variables:
    KUBECONFIG            Path to kubectl configuration
    DOCKER_REGISTRY       Docker registry URL
    SLACK_WEBHOOK_URL     Slack notifications webhook
    SENTRY_DSN           Sentry DSN for error tracking
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -v|--version)
                VERSION="$2"
                shift 2
                ;;
            -s|--strategy)
                DEPLOYMENT_STRATEGY="$2"
                shift 2
                ;;
            -d|--dry-run)
                DRY_RUN="true"
                shift
                ;;
            -t|--skip-tests)
                SKIP_TESTS="true"
                shift
                ;;
            -h|--health-timeout)
                HEALTH_CHECK_TIMEOUT="$2"
                shift 2
                ;;
            -r|--no-rollback)
                ROLLBACK_ON_FAILURE="false"
                shift
                ;;
            --help)
                usage
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                usage
                exit 1
                ;;
        esac
    done
}

# Validation functions
validate_environment() {
    case $ENVIRONMENT in
        dev|staging|prod)
            log "Deploying to $ENVIRONMENT environment"
            ;;
        *)
            error "Invalid environment: $ENVIRONMENT. Must be one of: dev, staging, prod"
            exit 1
            ;;
    esac
}

validate_strategy() {
    case $DEPLOYMENT_STRATEGY in
        rolling|blue-green|canary)
            log "Using $DEPLOYMENT_STRATEGY deployment strategy"
            ;;
        *)
            error "Invalid deployment strategy: $DEPLOYMENT_STRATEGY. Must be one of: rolling, blue-green, canary"
            exit 1
            ;;
    esac
}

validate_prerequisites() {
    log "Validating prerequisites..."
    
    # Check required tools
    local required_tools=("kubectl" "docker" "helm" "jq")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check kubectl context
    if ! kubectl config current-context &> /dev/null; then
        error "kubectl context not set. Please configure kubectl"
        exit 1
    fi
    
    # Check Docker registry access
    if [[ -n "${DOCKER_REGISTRY:-}" ]]; then
        if ! docker info &> /dev/null; then
            error "Docker daemon is not running"
            exit 1
        fi
    fi
    
    # Check Helm
    if ! helm version &> /dev/null; then
        error "Helm is not properly configured"
        exit 1
    fi
    
    success "All prerequisites validated"
}

# Pre-deployment checks
run_pre_deployment_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        warn "Skipping pre-deployment tests"
        return 0
    fi
    
    log "Running pre-deployment tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run unit tests
    if ! npm run test:unit; then
        error "Unit tests failed"
        return 1
    fi
    
    # Run integration tests
    if ! npm run test:integration; then
        error "Integration tests failed"
        return 1
    fi
    
    # Run security checks
    if ! npm run security:check; then
        warn "Security checks failed, but continuing deployment"
    fi
    
    # Run linting
    if ! npm run lint; then
        error "Linting failed"
        return 1
    fi
    
    success "Pre-deployment tests passed"
}

# Build and push Docker images
build_and_push_images() {
    log "Building and pushing Docker images..."
    
    local registry="${DOCKER_REGISTRY:-ghcr.io}"
    local image_name="${registry}/sightedit/sightedit"
    local image_tag="${VERSION}"
    
    cd "$PROJECT_ROOT"
    
    # Build image
    if [[ "$DRY_RUN" == "false" ]]; then
        docker build \
            --build-arg VERSION="$VERSION" \
            --build-arg ENVIRONMENT="$ENVIRONMENT" \
            -t "${image_name}:${image_tag}" \
            -t "${image_name}:latest" \
            .
        
        # Push images
        docker push "${image_name}:${image_tag}"
        
        if [[ "$image_tag" != "latest" ]]; then
            docker push "${image_name}:latest"
        fi
    else
        log "DRY RUN: Would build and push ${image_name}:${image_tag}"
    fi
    
    success "Docker images built and pushed"
}

# Deploy based on strategy
deploy_application() {
    log "Deploying application using $DEPLOYMENT_STRATEGY strategy..."
    
    case $DEPLOYMENT_STRATEGY in
        rolling)
            deploy_rolling
            ;;
        blue-green)
            deploy_blue_green
            ;;
        canary)
            deploy_canary
            ;;
    esac
    
    success "Application deployment initiated"
}

# Rolling deployment
deploy_rolling() {
    log "Performing rolling deployment..."
    
    local namespace="sightedit"
    local deployment_name="sightedit-backend"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        # Update image in deployment
        kubectl set image \
            deployment/$deployment_name \
            backend="ghcr.io/sightedit/sightedit:$VERSION" \
            -n "$namespace"
        
        # Wait for rollout to complete
        kubectl rollout status \
            deployment/$deployment_name \
            -n "$namespace" \
            --timeout=600s
    else
        log "DRY RUN: Would perform rolling update on $deployment_name"
    fi
}

# Blue-Green deployment
deploy_blue_green() {
    log "Performing blue-green deployment..."
    
    if [[ "$DRY_RUN" == "false" ]]; then
        # Use Argo Rollouts for blue-green deployment
        kubectl argo rollouts set image \
            sightedit-backend-blue-green \
            backend="ghcr.io/sightedit/sightedit:$VERSION" \
            -n sightedit
        
        # Wait for analysis to complete
        kubectl argo rollouts get rollout \
            sightedit-backend-blue-green \
            -n sightedit \
            --watch
    else
        log "DRY RUN: Would perform blue-green deployment"
    fi
}

# Canary deployment
deploy_canary() {
    log "Performing canary deployment..."
    
    if [[ "$DRY_RUN" == "false" ]]; then
        # Use Argo Rollouts for canary deployment
        kubectl argo rollouts set image \
            sightedit-backend-canary \
            backend="ghcr.io/sightedit/sightedit:$VERSION" \
            -n sightedit
        
        # Monitor canary progress
        kubectl argo rollouts get rollout \
            sightedit-backend-canary \
            -n sightedit \
            --watch
    else
        log "DRY RUN: Would perform canary deployment"
    fi
}

# Health checks
perform_health_checks() {
    log "Performing health checks..."
    
    local namespace="sightedit"
    local service_name="sightedit-backend-service"
    local health_endpoint="/health"
    local timeout=$HEALTH_CHECK_TIMEOUT
    local interval=10
    local elapsed=0
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "DRY RUN: Would perform health checks"
        return 0
    fi
    
    # Port forward to access the service
    kubectl port-forward \
        "service/$service_name" 8080:3000 \
        -n "$namespace" &
    local port_forward_pid=$!
    
    # Wait for port forward to be ready
    sleep 5
    
    # Perform health checks
    while [[ $elapsed -lt $timeout ]]; do
        if curl -f "http://localhost:8080$health_endpoint" &> /dev/null; then
            success "Health check passed"
            kill $port_forward_pid 2>/dev/null || true
            return 0
        fi
        
        log "Health check failed, retrying in ${interval}s... (${elapsed}s/${timeout}s)"
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    kill $port_forward_pid 2>/dev/null || true
    error "Health checks failed after ${timeout}s"
    return 1
}

# Rollback function
rollback_deployment() {
    log "Rolling back deployment..."
    
    local namespace="sightedit"
    local deployment_name="sightedit-backend"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        case $DEPLOYMENT_STRATEGY in
            rolling)
                kubectl rollout undo deployment/$deployment_name -n "$namespace"
                kubectl rollout status deployment/$deployment_name -n "$namespace"
                ;;
            blue-green|canary)
                kubectl argo rollouts abort sightedit-backend-* -n "$namespace"
                kubectl argo rollouts undo sightedit-backend-* -n "$namespace"
                ;;
        esac
    else
        log "DRY RUN: Would rollback deployment"
    fi
    
    success "Rollback completed"
}

# Notification functions
send_notification() {
    local status=$1
    local message=$2
    
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color
        case $status in
            success) color="good" ;;
            warning) color="warning" ;;
            error) color="danger" ;;
            *) color="#000000" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"SightEdit Deployment\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Version\", \"value\": \"$VERSION\", \"short\": true},
                        {\"title\": \"Strategy\", \"value\": \"$DEPLOYMENT_STRATEGY\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date)\", \"short\": true}
                    ]
                }]
            }" \
            "$SLACK_WEBHOOK_URL" || warn "Failed to send Slack notification"
    fi
}

# Cleanup function
cleanup() {
    log "Performing cleanup..."
    
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
    
    # Clean up temporary files
    rm -f /tmp/sightedit-deploy-*.tmp || true
    
    log "Cleanup completed"
}

# Main deployment function
main() {
    log "Starting SightEdit deployment..."
    log "Environment: $ENVIRONMENT"
    log "Version: $VERSION"
    log "Strategy: $DEPLOYMENT_STRATEGY"
    log "Dry Run: $DRY_RUN"
    log "Log File: $LOG_FILE"
    
    # Trap for cleanup on exit
    trap cleanup EXIT
    
    # Start deployment
    local deployment_success=false
    
    if validate_prerequisites &&
       run_pre_deployment_tests &&
       build_and_push_images &&
       deploy_application &&
       perform_health_checks; then
        
        deployment_success=true
        success "Deployment completed successfully!"
        send_notification "success" "✅ Deployment to $ENVIRONMENT completed successfully"
    else
        error "Deployment failed"
        send_notification "error" "❌ Deployment to $ENVIRONMENT failed"
        
        if [[ "$ROLLBACK_ON_FAILURE" == "true" && "$DRY_RUN" == "false" ]]; then
            warn "Initiating automatic rollback..."
            if rollback_deployment; then
                send_notification "warning" "⚠️ Deployment failed but rollback completed successfully"
            else
                send_notification "error" "🚨 Deployment and rollback both failed - manual intervention required"
            fi
        fi
    fi
    
    # Exit with appropriate code
    if [[ "$deployment_success" == "true" ]]; then
        exit 0
    else
        exit 1
    fi
}

# Parse arguments and run main function
parse_args "$@"
validate_environment
validate_strategy

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main
fi