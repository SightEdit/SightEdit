#!/bin/bash

# ================================
# SightEdit Production Deployment Orchestrator
# ================================
# Comprehensive deployment automation with health checks,
# traffic management, and rollback capabilities
#
# Usage:
#   ./deploy-orchestrator.sh [strategy] [environment] [version]
#
# Strategies: blue-green, rolling, canary
# Environments: staging, production
# Version: Docker image tag (e.g., v1.2.3, latest)

set -euo pipefail

# ================================
# Configuration and Variables
# ================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Default values
DEPLOYMENT_STRATEGY="${1:-blue-green}"
ENVIRONMENT="${2:-staging}"
VERSION="${3:-latest}"
FORCE_DEPLOY="${FORCE_DEPLOY:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Deployment configuration
HEALTH_CHECK_TIMEOUT=300
HEALTH_CHECK_INTERVAL=10
ROLLBACK_TIMEOUT=180
MIGRATION_TIMEOUT=600
SMOKE_TEST_TIMEOUT=120

# Load environment-specific configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# Required environment variables validation
REQUIRED_VARS=(
    "DOMAIN"
    "DB_NAME"
    "DB_USER" 
    "DB_PASSWORD"
    "REDIS_PASSWORD"
    "JWT_SECRET"
)

# ================================
# Logging and Utilities
# ================================

LOG_FILE="/var/log/sightedit/deployment-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Error handling
handle_error() {
    local exit_code=$?
    local line_number=$1
    log_error "Deployment failed at line $line_number with exit code $exit_code"
    
    # Auto-rollback on critical failures
    if [[ "$ENVIRONMENT" == "production" && "$FORCE_DEPLOY" != "true" ]]; then
        log_warn "Initiating automatic rollback for production environment"
        rollback_deployment
    fi
    
    cleanup_deployment
    exit $exit_code
}

trap 'handle_error ${LINENO}' ERR

# ================================
# Validation Functions
# ================================

validate_environment() {
    log_info "Validating deployment environment and prerequisites"
    
    # Check required environment variables
    for var in "${REQUIRED_VARS[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    # Check Docker and Docker Compose
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check if deployment strategy is supported
    case "$DEPLOYMENT_STRATEGY" in
        blue-green|rolling|canary)
            log_info "Using $DEPLOYMENT_STRATEGY deployment strategy"
            ;;
        *)
            log_error "Unsupported deployment strategy: $DEPLOYMENT_STRATEGY"
            exit 1
            ;;
    esac
    
    # Verify Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check available disk space
    local available_space=$(df /var/lib/docker | awk 'NR==2 {print $4}')
    local required_space=5242880 # 5GB in KB
    
    if [[ "$available_space" -lt "$required_space" ]]; then
        log_error "Insufficient disk space. Required: 5GB, Available: $(($available_space / 1024 / 1024))GB"
        exit 1
    fi
    
    log_success "Environment validation completed successfully"
}

validate_image() {
    log_info "Validating Docker image: sightedit/web:$VERSION"
    
    # Pull latest image
    if ! docker pull "sightedit/web:$VERSION"; then
        log_error "Failed to pull Docker image: sightedit/web:$VERSION"
        exit 1
    fi
    
    # Verify image integrity
    local image_id=$(docker images --format "{{.ID}}" "sightedit/web:$VERSION")
    if [[ -z "$image_id" ]]; then
        log_error "Docker image validation failed"
        exit 1
    fi
    
    # Security scan (if available)
    if command -v trivy &> /dev/null; then
        log_info "Running security scan on Docker image"
        trivy image --exit-code 0 --severity HIGH,CRITICAL "sightedit/web:$VERSION"
    fi
    
    log_success "Docker image validation completed"
}

# ================================
# Pre-deployment Tests
# ================================

run_pre_deployment_tests() {
    log_info "Running pre-deployment validation tests"
    
    cd "$PROJECT_ROOT"
    
    # Unit tests
    log_info "Running unit tests"
    if ! npm run test:unit; then
        log_error "Unit tests failed"
        exit 1
    fi
    
    # Linting and type checking
    log_info "Running code quality checks"
    if ! npm run lint; then
        log_error "Linting failed"
        exit 1
    fi
    
    if ! npm run typecheck; then
        log_error "Type checking failed"
        exit 1
    fi
    
    # Security audit
    log_info "Running security audit"
    if ! npm audit --audit-level high; then
        log_error "Security audit failed"
        exit 1
    fi
    
    # Integration tests against staging
    if [[ "$ENVIRONMENT" == "production" ]]; then
        log_info "Running integration tests against staging"
        INTEGRATION_TEST_URL="https://staging.$DOMAIN" npm run test:integration
    fi
    
    log_success "Pre-deployment tests completed successfully"
}

# ================================
# Database Migration
# ================================

run_database_migrations() {
    log_info "Executing database migrations"
    
    # Create migration backup
    local backup_file="/var/backups/postgresql/pre-migration-$(date +%Y%m%d-%H%M%S).sql"
    mkdir -p "$(dirname "$backup_file")"
    
    log_info "Creating pre-migration database backup"
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" exec -T postgres-primary \
        pg_dump -U "$DB_USER" -d "$DB_NAME" > "$backup_file"; then
        log_error "Failed to create database backup"
        exit 1
    fi
    
    # Run migrations with timeout
    log_info "Running database migrations (timeout: ${MIGRATION_TIMEOUT}s)"
    
    timeout "$MIGRATION_TIMEOUT" docker-compose \
        -f "$PROJECT_ROOT/docker-compose.production.yml" \
        run --rm \
        -e DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@postgres-primary:5432/$DB_NAME" \
        web-migration npm run db:migrate
    
    if [[ $? -ne 0 ]]; then
        log_error "Database migration failed or timed out"
        log_info "Restoring database from backup: $backup_file"
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" exec -T postgres-primary \
            psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"
        exit 1
    fi
    
    log_success "Database migrations completed successfully"
}

# ================================
# Health Check Functions
# ================================

check_service_health() {
    local service_name=$1
    local health_url=$2
    local timeout=${3:-$HEALTH_CHECK_TIMEOUT}
    local interval=${4:-$HEALTH_CHECK_INTERVAL}
    
    log_info "Checking health for $service_name at $health_url (timeout: ${timeout}s)"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -f -s -m 10 "$health_url" > /dev/null 2>&1; then
            local current_time=$(date +%s)
            local elapsed=$((current_time - start_time))
            log_success "$service_name is healthy (${elapsed}s)"
            return 0
        fi
        
        log_info "Waiting for $service_name to become healthy..."
        sleep "$interval"
    done
    
    log_error "$service_name health check failed after ${timeout}s"
    return 1
}

check_database_health() {
    log_info "Checking database connectivity"
    
    local retries=30
    for i in $(seq 1 $retries); do
        if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            exec -T postgres-primary pg_isready -U "$DB_USER" -d "$DB_NAME"; then
            log_success "Database is healthy"
            return 0
        fi
        
        log_info "Database not ready, attempt $i/$retries"
        sleep 2
    done
    
    log_error "Database health check failed"
    return 1
}

check_redis_health() {
    log_info "Checking Redis connectivity"
    
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T redis-primary redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping | grep -q PONG; then
        log_success "Redis is healthy"
        return 0
    fi
    
    log_error "Redis health check failed"
    return 1
}

# ================================
# Deployment Strategies
# ================================

deploy_blue_green() {
    log_info "Starting Blue-Green deployment"
    
    # Determine current active slot
    local current_slot
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        ps --format json | jq -r '.[] | select(.Service == "web-green" and .State == "running")' | grep -q .; then
        current_slot="green"
        target_slot="blue"
    else
        current_slot="blue" 
        target_slot="green"
    fi
    
    log_info "Current active slot: $current_slot, Target slot: $target_slot"
    
    # Update target slot with new version
    export VERSION="$VERSION"
    
    log_info "Stopping and updating $target_slot slot"
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop "web-$target_slot" || true
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d "web-$target_slot"
    
    # Wait for target slot to be healthy
    local target_url="http://localhost:300$(if [[ "$target_slot" == "blue" ]]; then echo "2"; else echo "1"; fi)/health"
    if ! check_service_health "web-$target_slot" "$target_url"; then
        log_error "Target slot health check failed"
        return 1
    fi
    
    # Run smoke tests on target slot
    if ! run_smoke_tests "$target_url"; then
        log_error "Smoke tests failed on target slot"
        return 1
    fi
    
    # Switch traffic to target slot
    log_info "Switching traffic from $current_slot to $target_slot"
    
    # Update load balancer configuration
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik \
        sh -c "echo 'traefik.enable=true' > /tmp/web-$target_slot.labels && echo 'traefik.enable=false' > /tmp/web-$current_slot.labels"
    
    # Wait for traffic switch to complete
    sleep 10
    
    # Verify new slot is receiving traffic
    if ! check_service_health "web-$target_slot" "https://$DOMAIN/health"; then
        log_error "Traffic switch verification failed"
        # Rollback traffic
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            exec traefik \
            sh -c "echo 'traefik.enable=true' > /tmp/web-$current_slot.labels && echo 'traefik.enable=false' > /tmp/web-$target_slot.labels"
        return 1
    fi
    
    # Stop old slot after successful switch
    log_info "Stopping old slot: $current_slot"
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop "web-$current_slot"
    
    log_success "Blue-Green deployment completed successfully"
    echo "$target_slot" > /tmp/sightedit-active-slot
}

deploy_rolling() {
    log_info "Starting Rolling deployment"
    
    # For Docker Compose, we simulate rolling by updating services one by one
    local services=("web-blue" "web-green")
    
    for service in "${services[@]}"; do
        log_info "Updating service: $service"
        
        # Update service with new version
        export VERSION="$VERSION"
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            up -d "$service"
        
        # Wait for service to be healthy
        local service_port=$(if [[ "$service" == "web-blue" ]]; then echo "3002"; else echo "3001"; fi)
        if ! check_service_health "$service" "http://localhost:$service_port/health"; then
            log_error "Rolling deployment failed for $service"
            return 1
        fi
        
        # Brief pause between services
        sleep 5
    done
    
    log_success "Rolling deployment completed successfully"
}

deploy_canary() {
    log_info "Starting Canary deployment"
    
    # Deploy canary version alongside current version
    export VERSION="$VERSION"
    export CANARY_WEIGHT="${CANARY_WEIGHT:-10}" # 10% traffic by default
    
    # Start canary instance
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d web-canary
    
    # Wait for canary to be healthy
    if ! check_service_health "web-canary" "http://localhost:3003/health"; then
        log_error "Canary deployment health check failed"
        return 1
    fi
    
    # Configure load balancer for canary traffic
    log_info "Configuring canary traffic routing ($CANARY_WEIGHT% to canary)"
    
    # Monitor canary metrics for specified duration
    local canary_duration="${CANARY_DURATION:-300}" # 5 minutes default
    log_info "Monitoring canary deployment for ${canary_duration}s"
    
    sleep "$canary_duration"
    
    # Check canary metrics (error rate, response time, etc.)
    if check_canary_metrics; then
        log_info "Canary metrics look good, promoting to full deployment"
        
        # Promote canary to main deployment
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            stop web-blue web-green
        
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            up -d web-blue web-green
        
        # Stop canary
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            stop web-canary
        
        log_success "Canary deployment promoted successfully"
    else
        log_error "Canary metrics indicate issues, rolling back"
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            stop web-canary
        return 1
    fi
}

check_canary_metrics() {
    # Query Prometheus for canary metrics
    local prometheus_url="http://localhost:9090"
    local error_rate_threshold=5 # 5% error rate threshold
    local response_time_threshold=1000 # 1 second threshold
    
    # Check error rate
    local error_rate=$(curl -s "$prometheus_url/api/v1/query?query=rate(http_requests_total{status=~\"5..\",service=\"web-canary\"}[5m])" | \
        jq -r '.data.result[0].value[1] // "0"')
    
    if [[ $(echo "$error_rate > $error_rate_threshold" | bc -l) -eq 1 ]]; then
        log_error "Canary error rate too high: $error_rate%"
        return 1
    fi
    
    # Check response time
    local avg_response_time=$(curl -s "$prometheus_url/api/v1/query?query=rate(http_request_duration_seconds_sum{service=\"web-canary\"}[5m])/rate(http_request_duration_seconds_count{service=\"web-canary\"}[5m])" | \
        jq -r '.data.result[0].value[1] // "0"')
    
    if [[ $(echo "$avg_response_time > $response_time_threshold" | bc -l) -eq 1 ]]; then
        log_error "Canary response time too high: ${avg_response_time}ms"
        return 1
    fi
    
    log_success "Canary metrics within acceptable thresholds"
    return 0
}

# ================================
# Smoke Tests
# ================================

run_smoke_tests() {
    local base_url=${1:-"https://$DOMAIN"}
    
    log_info "Running smoke tests against $base_url"
    
    # Basic health check
    if ! curl -f -s -m 10 "$base_url/health" > /dev/null; then
        log_error "Health endpoint failed"
        return 1
    fi
    
    # API functionality test
    if ! curl -f -s -m 10 "$base_url/api/sightedit/health" > /dev/null; then
        log_error "API health endpoint failed"
        return 1
    fi
    
    # Database connectivity test
    local db_check=$(curl -s -m 10 "$base_url/api/sightedit/db-health" | jq -r '.status')
    if [[ "$db_check" != "ok" ]]; then
        log_error "Database connectivity test failed"
        return 1
    fi
    
    # Redis connectivity test
    local redis_check=$(curl -s -m 10 "$base_url/api/sightedit/redis-health" | jq -r '.status')
    if [[ "$redis_check" != "ok" ]]; then
        log_error "Redis connectivity test failed"
        return 1
    fi
    
    # Critical page loads
    local pages=("/" "/api" "/health")
    for page in "${pages[@]}"; do
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$base_url$page")
        if [[ "$status_code" -lt 200 || "$status_code" -ge 400 ]]; then
            log_error "Page $page returned status code: $status_code"
            return 1
        fi
    done
    
    log_success "All smoke tests passed"
    return 0
}

# ================================
# Post-deployment Verification
# ================================

run_post_deployment_verification() {
    log_info "Running post-deployment verification"
    
    # Extended smoke tests
    if ! run_smoke_tests; then
        log_error "Post-deployment smoke tests failed"
        return 1
    fi
    
    # Performance verification
    log_info "Running performance verification"
    local response_time=$(curl -w "@$PROJECT_ROOT/scripts/curl-format.txt" -s -o /dev/null "https://$DOMAIN/")
    local response_time_ms=$(echo "$response_time * 1000" | bc -l)
    
    if [[ $(echo "$response_time_ms > 2000" | bc -l) -eq 1 ]]; then
        log_warn "Response time higher than expected: ${response_time_ms}ms"
    else
        log_success "Response time acceptable: ${response_time_ms}ms"
    fi
    
    # Security headers check
    log_info "Verifying security headers"
    local security_headers=("Content-Security-Policy" "X-Frame-Options" "X-Content-Type-Options")
    for header in "${security_headers[@]}"; do
        if ! curl -s -I "https://$DOMAIN/" | grep -qi "$header"; then
            log_warn "Missing security header: $header"
        fi
    done
    
    # SSL/TLS verification
    log_info "Verifying SSL/TLS configuration"
    if command -v openssl &> /dev/null; then
        local ssl_info=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates)
        log_info "SSL certificate info: $ssl_info"
    fi
    
    log_success "Post-deployment verification completed"
}

# ================================
# Rollback Functions
# ================================

rollback_deployment() {
    log_warn "Starting deployment rollback"
    
    # Get previous version info
    local rollback_version
    if [[ -f "/tmp/sightedit-previous-version" ]]; then
        rollback_version=$(cat /tmp/sightedit-previous-version)
    else
        log_error "No previous version information found"
        return 1
    fi
    
    log_info "Rolling back to version: $rollback_version"
    
    # Quick rollback using previous configuration
    export VERSION="$rollback_version"
    
    case "$DEPLOYMENT_STRATEGY" in
        blue-green)
            # Switch back to previous slot
            local previous_slot
            if [[ -f "/tmp/sightedit-previous-slot" ]]; then
                previous_slot=$(cat /tmp/sightedit-previous-slot)
            else
                previous_slot="blue" # Default fallback
            fi
            
            docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
                up -d "web-$previous_slot"
            
            # Switch traffic back
            docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
                exec traefik \
                sh -c "echo 'traefik.enable=true' > /tmp/web-$previous_slot.labels"
            ;;
        rolling|canary)
            # Restart with previous version
            docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
                up -d web-blue web-green
            ;;
    esac
    
    # Wait for rollback to complete
    sleep 30
    
    # Verify rollback success
    if check_service_health "rollback" "https://$DOMAIN/health"; then
        log_success "Rollback completed successfully"
        
        # Send rollback notification
        send_notification "ROLLBACK" "Deployment rolled back to version $rollback_version"
    else
        log_error "Rollback verification failed"
        return 1
    fi
}

# ================================
# Notification and Monitoring
# ================================

send_notification() {
    local status=$1
    local message=$2
    
    # Slack notification (if configured)
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"SightEdit Deployment $status: $message\"}" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    # Email notification (if configured)
    if [[ -n "${NOTIFICATION_EMAIL:-}" ]] && command -v mail &> /dev/null; then
        echo "$message" | mail -s "SightEdit Deployment $status" "$NOTIFICATION_EMAIL" || true
    fi
    
    # PagerDuty integration (if configured)
    if [[ -n "${PAGERDUTY_INTEGRATION_KEY:-}" && "$status" == "FAILED" ]]; then
        curl -X POST -H "Content-Type: application/json" \
            -d "{
                \"routing_key\": \"$PAGERDUTY_INTEGRATION_KEY\",
                \"event_action\": \"trigger\",
                \"payload\": {
                    \"summary\": \"SightEdit Deployment Failed\",
                    \"severity\": \"critical\",
                    \"source\": \"deployment-orchestrator\"
                }
            }" \
            "https://events.pagerduty.com/v2/enqueue" || true
    fi
}

# ================================
# Cleanup Functions
# ================================

cleanup_deployment() {
    log_info "Performing deployment cleanup"
    
    # Remove old Docker images
    docker image prune -f --filter "label=app=sightedit" --filter "until=168h" || true
    
    # Clean up temporary files
    rm -f /tmp/sightedit-deployment-*
    
    # Rotate logs
    if [[ -f "$LOG_FILE" ]]; then
        find "$(dirname "$LOG_FILE")" -name "deployment-*.log" -mtime +7 -delete || true
    fi
    
    log_info "Cleanup completed"
}

# ================================
# Main Deployment Function
# ================================

main() {
    log_info "Starting SightEdit deployment"
    log_info "Strategy: $DEPLOYMENT_STRATEGY, Environment: $ENVIRONMENT, Version: $VERSION"
    
    # Save current version for rollback
    local current_version
    if docker images --format "table {{.Tag}}" sightedit/web | grep -v TAG | head -n 1; then
        current_version=$(docker images --format "table {{.Tag}}" sightedit/web | grep -v TAG | head -n 1)
        echo "$current_version" > /tmp/sightedit-previous-version
    fi
    
    # Pre-deployment phase
    if [[ "$DRY_RUN" != "true" ]]; then
        validate_environment
        validate_image
        run_pre_deployment_tests
        
        # Database migrations (if needed)
        if [[ -f "$PROJECT_ROOT/migrations/pending" ]]; then
            run_database_migrations
        fi
        
        # Infrastructure health checks
        check_database_health
        check_redis_health
    fi
    
    # Deployment phase
    case "$DEPLOYMENT_STRATEGY" in
        blue-green)
            if [[ "$DRY_RUN" != "true" ]]; then
                deploy_blue_green
            else
                log_info "[DRY RUN] Would execute blue-green deployment"
            fi
            ;;
        rolling)
            if [[ "$DRY_RUN" != "true" ]]; then
                deploy_rolling
            else
                log_info "[DRY RUN] Would execute rolling deployment"
            fi
            ;;
        canary)
            if [[ "$DRY_RUN" != "true" ]]; then
                deploy_canary
            else
                log_info "[DRY RUN] Would execute canary deployment"
            fi
            ;;
    esac
    
    # Post-deployment phase
    if [[ "$DRY_RUN" != "true" ]]; then
        run_post_deployment_verification
        
        # Success notification
        send_notification "SUCCESS" "Deployment completed successfully for version $VERSION"
        
        # Cleanup
        cleanup_deployment
    fi
    
    log_success "Deployment orchestration completed successfully"
}

# ================================
# Script Entry Point
# ================================

# Handle command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --force)
            FORCE_DEPLOY="true"
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [strategy] [environment] [version] [options]"
            echo ""
            echo "Strategies:"
            echo "  blue-green    Zero-downtime blue-green deployment (default)"
            echo "  rolling       Rolling update deployment"
            echo "  canary        Canary deployment with traffic shifting"
            echo ""
            echo "Environments:"
            echo "  staging       Staging environment"
            echo "  production    Production environment (default)"
            echo ""
            echo "Options:"
            echo "  --dry-run     Show what would be deployed without executing"
            echo "  --force       Force deployment even on production"
            echo "  --help        Show this help message"
            exit 0
            ;;
        *)
            break
            ;;
    esac
done

# Run main deployment function
main "$@"