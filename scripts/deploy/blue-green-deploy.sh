#!/bin/bash

# ================================
# SightEdit Blue-Green Deployment Script
# ================================
# Zero-downtime deployment using blue-green strategy
# Manages traffic switching between two identical environments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
VERSION="${1:-latest}"
ENVIRONMENT="${2:-production}"
HEALTH_CHECK_TIMEOUT=300
HEALTH_CHECK_INTERVAL=10
TRAFFIC_SWITCH_DELAY=30

# State files
ACTIVE_SLOT_FILE="/tmp/sightedit-active-slot"
PREVIOUS_SLOT_FILE="/tmp/sightedit-previous-slot"
DEPLOYMENT_STATE_FILE="/tmp/sightedit-bg-deployment-state"

# Load environment configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# ================================
# Logging
# ================================

LOG_FILE="/var/log/sightedit/blue-green-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [BG-DEPLOY] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# ================================
# Error Handling
# ================================

cleanup_failed_deployment() {
    log_error "Blue-green deployment failed, performing cleanup"
    
    # Remove deployment state
    rm -f "$DEPLOYMENT_STATE_FILE"
    
    # If target slot was started, stop it
    if [[ -n "${TARGET_SLOT:-}" ]]; then
        log_info "Stopping failed target slot: $TARGET_SLOT"
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            stop "web-$TARGET_SLOT" || true
    fi
    
    exit 1
}

trap cleanup_failed_deployment ERR

# ================================
# Slot Management
# ================================

determine_slots() {
    log_info "Determining current active and target slots"
    
    # Check if there's a stored active slot
    if [[ -f "$ACTIVE_SLOT_FILE" ]]; then
        CURRENT_SLOT=$(cat "$ACTIVE_SLOT_FILE")
        log_info "Found stored active slot: $CURRENT_SLOT"
    else
        # Determine by checking running services
        if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            ps --format json web-green 2>/dev/null | jq -r '.[] | select(.State == "running")' | grep -q .; then
            CURRENT_SLOT="green"
        elif docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            ps --format json web-blue 2>/dev/null | jq -r '.[] | select(.State == "running")' | grep -q .; then
            CURRENT_SLOT="blue"
        else
            # No active slot, default to green as current (will deploy to blue)
            CURRENT_SLOT="green"
            log_info "No active slot found, defaulting current to: $CURRENT_SLOT"
        fi
    fi
    
    # Set target slot as opposite of current
    if [[ "$CURRENT_SLOT" == "blue" ]]; then
        TARGET_SLOT="green"
    else
        TARGET_SLOT="blue"
    fi
    
    # Store previous slot info for rollback
    echo "$CURRENT_SLOT" > "$PREVIOUS_SLOT_FILE"
    
    log_info "Current active slot: $CURRENT_SLOT"
    log_info "Target deployment slot: $TARGET_SLOT"
    
    export CURRENT_SLOT TARGET_SLOT
}

get_slot_port() {
    local slot=$1
    case $slot in
        blue)
            echo "3002"
            ;;
        green)
            echo "3001"
            ;;
        *)
            echo "3000"
            ;;
    esac
}

get_slot_container_name() {
    local slot=$1
    echo "sightedit-web-$slot"
}

# ================================
# Health Checks
# ================================

check_slot_health() {
    local slot=$1
    local timeout=${2:-$HEALTH_CHECK_TIMEOUT}
    local interval=${3:-$HEALTH_CHECK_INTERVAL}
    
    local port=$(get_slot_port "$slot")
    local health_url="http://localhost:$port/health"
    local container_name=$(get_slot_container_name "$slot")
    
    log_info "Checking health for $slot slot at $health_url"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # First check if container is running
        if ! docker ps --format "{{.Names}}" | grep -q "^$container_name$"; then
            log_info "Container $container_name not yet running, waiting..."
            sleep "$interval"
            continue
        fi
        
        # Check application health
        if curl -f -s -m 10 "$health_url" >/dev/null 2>&1; then
            # Additional health checks
            local health_response=$(curl -s -m 10 "$health_url")
            local health_status=$(echo "$health_response" | jq -r '.status // "unknown"')
            
            if [[ "$health_status" == "ok" || "$health_status" == "healthy" ]]; then
                local elapsed=$(($(date +%s) - start_time))
                log_success "$slot slot is healthy (${elapsed}s)"
                return 0
            fi
        fi
        
        log_info "Waiting for $slot slot to become healthy..."
        sleep "$interval"
    done
    
    log_error "$slot slot health check failed after ${timeout}s"
    
    # Get container logs for debugging
    log_error "Container logs for debugging:"
    docker logs --tail 50 "$container_name" 2>&1 | head -20 || true
    
    return 1
}

check_database_connectivity() {
    local slot=$1
    local container_name=$(get_slot_container_name "$slot")
    
    log_info "Checking database connectivity for $slot slot"
    
    # Test database connection through the application container
    if docker exec "$container_name" \
        sh -c "curl -f -s http://localhost:3000/api/sightedit/db-health" >/dev/null 2>&1; then
        log_success "Database connectivity verified for $slot slot"
        return 0
    else
        log_error "Database connectivity failed for $slot slot"
        return 1
    fi
}

# ================================
# Deployment Steps
# ================================

deploy_target_slot() {
    log_info "Deploying version $VERSION to $TARGET_SLOT slot"
    
    # Record deployment state
    echo "DEPLOYING" > "$DEPLOYMENT_STATE_FILE"
    
    # Stop target slot if running
    log_info "Stopping target slot: $TARGET_SLOT"
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop "web-$TARGET_SLOT" || true
    
    # Remove existing container
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        rm -f "web-$TARGET_SLOT" || true
    
    # Pull new image
    log_info "Pulling Docker image: sightedit/web:$VERSION"
    if ! docker pull "sightedit/web:$VERSION"; then
        log_error "Failed to pull Docker image"
        return 1
    fi
    
    # Start target slot with new version
    export VERSION="$VERSION"
    log_info "Starting $TARGET_SLOT slot with version $VERSION"
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d "web-$TARGET_SLOT"
    
    # Wait for container to start
    sleep 10
    
    # Check deployment health
    if ! check_slot_health "$TARGET_SLOT"; then
        log_error "Target slot health check failed"
        return 1
    fi
    
    # Verify database connectivity
    if ! check_database_connectivity "$TARGET_SLOT"; then
        log_error "Database connectivity check failed for target slot"
        return 1
    fi
    
    log_success "Target slot deployment completed successfully"
    echo "DEPLOYED" > "$DEPLOYMENT_STATE_FILE"
}

run_target_slot_tests() {
    log_info "Running tests against target slot: $TARGET_SLOT"
    
    local port=$(get_slot_port "$TARGET_SLOT")
    local base_url="http://localhost:$port"
    
    # Basic functionality tests
    log_info "Testing basic API endpoints"
    
    # Health endpoint
    local health_response=$(curl -s -m 10 "$base_url/health")
    local health_status=$(echo "$health_response" | jq -r '.status // "unknown"')
    
    if [[ "$health_status" != "ok" && "$health_status" != "healthy" ]]; then
        log_error "Health endpoint test failed: $health_status"
        return 1
    fi
    
    # API endpoints
    if ! curl -f -s -m 10 "$base_url/api/sightedit/health" >/dev/null; then
        log_error "API health endpoint test failed"
        return 1
    fi
    
    # Database test
    local db_response=$(curl -s -m 10 "$base_url/api/sightedit/db-health")
    local db_status=$(echo "$db_response" | jq -r '.status // "unknown"')
    
    if [[ "$db_status" != "ok" ]]; then
        log_error "Database test failed: $db_status"
        return 1
    fi
    
    # Redis test
    local redis_response=$(curl -s -m 10 "$base_url/api/sightedit/redis-health")
    local redis_status=$(echo "$redis_response" | jq -r '.status // "unknown"')
    
    if [[ "$redis_status" != "ok" ]]; then
        log_error "Redis test failed: $redis_status"
        return 1
    fi
    
    # Performance test
    log_info "Running performance test"
    local start_time=$(date +%s%3N)
    curl -s -m 10 "$base_url/" >/dev/null
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ $response_time -gt 2000 ]]; then
        log_warn "Response time higher than expected: ${response_time}ms"
    else
        log_success "Response time acceptable: ${response_time}ms"
    fi
    
    log_success "All target slot tests passed"
}

# ================================
# Traffic Management
# ================================

switch_traffic_to_target() {
    log_info "Switching traffic from $CURRENT_SLOT to $TARGET_SLOT"
    
    echo "SWITCHING" > "$DEPLOYMENT_STATE_FILE"
    
    # Create load balancer configuration for traffic switch
    local lb_config_dir="$PROJECT_ROOT/config/traefik"
    mkdir -p "$lb_config_dir"
    
    # Update Traefik configuration
    cat > "$lb_config_dir/dynamic-routing.yml" <<EOF
http:
  routers:
    sightedit-web:
      rule: "Host(\`$DOMAIN\`)"
      service: sightedit-web-$TARGET_SLOT
      tls:
        certResolver: letsencrypt
    
  services:
    sightedit-web-$TARGET_SLOT:
      loadBalancer:
        servers:
          - url: "http://web-$TARGET_SLOT:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"
EOF
    
    # Signal Traefik to reload configuration
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null; then
        log_info "Traefik configuration reloaded"
    else
        log_warn "Failed to signal Traefik reload, configuration will be picked up automatically"
    fi
    
    # Wait for traffic switch to propagate
    log_info "Waiting ${TRAFFIC_SWITCH_DELAY}s for traffic switch to complete"
    sleep "$TRAFFIC_SWITCH_DELAY"
    
    # Verify traffic is going to target slot
    log_info "Verifying traffic routing to target slot"
    
    local external_health_checks=0
    local max_external_checks=5
    
    for i in $(seq 1 $max_external_checks); do
        if curl -f -s -m 10 "https://$DOMAIN/health" >/dev/null; then
            external_health_checks=$((external_health_checks + 1))
        fi
        sleep 2
    done
    
    if [[ $external_health_checks -ge 3 ]]; then
        log_success "Traffic successfully routed to target slot"
    else
        log_error "Traffic routing verification failed ($external_health_checks/$max_external_checks successful)"
        return 1
    fi
    
    # Update active slot tracking
    echo "$TARGET_SLOT" > "$ACTIVE_SLOT_FILE"
    echo "ACTIVE" > "$DEPLOYMENT_STATE_FILE"
}

stop_previous_slot() {
    log_info "Stopping previous slot: $CURRENT_SLOT"
    
    # Give some time for any remaining connections to complete
    sleep 10
    
    # Stop the previous slot
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop "web-$CURRENT_SLOT"
    
    log_success "Previous slot stopped successfully"
}

# ================================
# Verification
# ================================

verify_deployment_success() {
    log_info "Verifying deployment success"
    
    # Test external access
    if ! curl -f -s -m 10 "https://$DOMAIN/health" >/dev/null; then
        log_error "External health check failed"
        return 1
    fi
    
    # Check application metrics
    local metrics_url="http://localhost:9090/api/v1/query"
    if command -v curl >/dev/null && curl -s "$metrics_url" >/dev/null 2>&1; then
        # Query for error rate
        local error_rate=$(curl -s "$metrics_url?query=rate(http_requests_total{status=~\"5..\"}[5m])" | \
            jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
        
        log_info "Current error rate: $error_rate"
        
        # Query for response time
        local avg_response_time=$(curl -s "$metrics_url?query=rate(http_request_duration_seconds_sum[5m])/rate(http_request_duration_seconds_count[5m])" | \
            jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
        
        log_info "Average response time: ${avg_response_time}s"
    fi
    
    # Final smoke test
    log_info "Running final smoke tests"
    local smoke_tests=(
        "https://$DOMAIN/"
        "https://$DOMAIN/health"
        "https://$DOMAIN/api/sightedit/health"
    )
    
    for url in "${smoke_tests[@]}"; do
        if ! curl -f -s -m 10 "$url" >/dev/null; then
            log_error "Smoke test failed for: $url"
            return 1
        fi
    done
    
    log_success "All deployment verification tests passed"
}

# ================================
# Rollback Function
# ================================

rollback_traffic() {
    log_error "Rolling back traffic to previous slot: $CURRENT_SLOT"
    
    # Restart current slot if needed
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d "web-$CURRENT_SLOT"
    
    # Wait for it to be healthy
    if ! check_slot_health "$CURRENT_SLOT" 60; then
        log_error "Failed to restore previous slot health"
        return 1
    fi
    
    # Switch traffic back
    cat > "$PROJECT_ROOT/config/traefik/dynamic-routing.yml" <<EOF
http:
  routers:
    sightedit-web:
      rule: "Host(\`$DOMAIN\`)"
      service: sightedit-web-$CURRENT_SLOT
      tls:
        certResolver: letsencrypt
    
  services:
    sightedit-web-$CURRENT_SLOT:
      loadBalancer:
        servers:
          - url: "http://web-$CURRENT_SLOT:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"
EOF
    
    # Signal configuration reload
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null || true
    
    # Wait and verify
    sleep 20
    
    if curl -f -s -m 10 "https://$DOMAIN/health" >/dev/null; then
        log_success "Rollback completed successfully"
        echo "$CURRENT_SLOT" > "$ACTIVE_SLOT_FILE"
    else
        log_error "Rollback verification failed"
        return 1
    fi
}

# ================================
# Main Deployment Function
# ================================

main() {
    log_info "Starting Blue-Green deployment for SightEdit"
    log_info "Version: $VERSION, Environment: $ENVIRONMENT"
    
    # Determine deployment slots
    determine_slots
    
    # Deploy to target slot
    if ! deploy_target_slot; then
        log_error "Target slot deployment failed"
        exit 1
    fi
    
    # Run tests against target slot
    if ! run_target_slot_tests; then
        log_error "Target slot tests failed"
        exit 1
    fi
    
    # Switch traffic to target slot
    if ! switch_traffic_to_target; then
        log_error "Traffic switch failed, attempting rollback"
        rollback_traffic || log_error "Rollback also failed!"
        exit 1
    fi
    
    # Verify deployment
    if ! verify_deployment_success; then
        log_error "Deployment verification failed, attempting rollback"
        rollback_traffic || log_error "Rollback also failed!"
        exit 1
    fi
    
    # Stop previous slot
    stop_previous_slot
    
    # Final cleanup
    echo "COMPLETED" > "$DEPLOYMENT_STATE_FILE"
    
    log_success "Blue-Green deployment completed successfully!"
    log_success "Active slot: $TARGET_SLOT (version: $VERSION)"
    
    # Send success notification
    if command -v mail >/dev/null && [[ -n "${NOTIFICATION_EMAIL:-}" ]]; then
        echo "Blue-Green deployment completed successfully. Version $VERSION is now active." | \
            mail -s "SightEdit Deployment Success" "$NOTIFICATION_EMAIL" || true
    fi
}

# ================================
# Command Line Interface
# ================================

show_usage() {
    echo "Usage: $0 [VERSION] [ENVIRONMENT]"
    echo ""
    echo "Arguments:"
    echo "  VERSION      Docker image tag (default: latest)"
    echo "  ENVIRONMENT  Target environment (default: production)"
    echo ""
    echo "Examples:"
    echo "  $0 v1.2.3 production"
    echo "  $0 latest staging"
    echo ""
    echo "Environment Variables:"
    echo "  HEALTH_CHECK_TIMEOUT  Health check timeout in seconds (default: 300)"
    echo "  TRAFFIC_SWITCH_DELAY  Delay before traffic switch in seconds (default: 30)"
    echo "  NOTIFICATION_EMAIL    Email for deployment notifications"
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        show_usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac