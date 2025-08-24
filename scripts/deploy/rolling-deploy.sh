#!/bin/bash

# ================================
# SightEdit Rolling Deployment Script
# ================================
# Performs rolling updates by updating services incrementally
# Maintains service availability during deployment

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
VERSION="${1:-latest}"
ENVIRONMENT="${2:-production}"
BATCH_SIZE="${BATCH_SIZE:-1}"
UPDATE_DELAY="${UPDATE_DELAY:-30}"
HEALTH_CHECK_TIMEOUT=180
HEALTH_CHECK_INTERVAL=10
MAX_UNAVAILABLE="${MAX_UNAVAILABLE:-0}"

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

LOG_FILE="/var/log/sightedit/rolling-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [ROLLING] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# ================================
# Error Handling
# ================================

rollback_failed_update() {
    log_error "Rolling deployment failed, initiating rollback"
    
    # Get the previous version
    local previous_version
    if [[ -f "/tmp/sightedit-previous-version" ]]; then
        previous_version=$(cat "/tmp/sightedit-previous-version")
        log_info "Rolling back to previous version: $previous_version"
        
        export VERSION="$previous_version"
        
        # Restart all services with previous version
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            up -d web-blue web-green
        
        # Wait for rollback to complete
        sleep 60
        
        # Verify rollback
        if verify_deployment_health; then
            log_success "Rollback completed successfully"
        else
            log_error "Rollback verification failed"
        fi
    else
        log_error "No previous version found for rollback"
    fi
    
    exit 1
}

trap rollback_failed_update ERR

# ================================
# Service Management
# ================================

get_service_list() {
    # Get list of web services to update
    echo "web-blue web-green"
}

get_service_port() {
    local service=$1
    case $service in
        web-blue)
            echo "3002"
            ;;
        web-green)
            echo "3001"
            ;;
        *)
            echo "3000"
            ;;
    esac
}

get_service_container_name() {
    local service=$1
    echo "sightedit-$service"
}

check_service_health() {
    local service=$1
    local timeout=${2:-$HEALTH_CHECK_TIMEOUT}
    local interval=${3:-$HEALTH_CHECK_INTERVAL}
    
    local port=$(get_service_port "$service")
    local health_url="http://localhost:$port/health"
    local container_name=$(get_service_container_name "$service")
    
    log_info "Checking health for service $service"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        # Check if container is running
        if ! docker ps --format "{{.Names}}" | grep -q "^$container_name$"; then
            log_info "Container $container_name not running, waiting..."
            sleep "$interval"
            continue
        fi
        
        # Check container health
        local container_status=$(docker inspect --format="{{.State.Health.Status}}" "$container_name" 2>/dev/null || echo "unknown")
        if [[ "$container_status" == "healthy" ]]; then
            log_success "Service $service is healthy via container health check"
            return 0
        fi
        
        # Check application health endpoint
        if curl -f -s -m 10 "$health_url" >/dev/null 2>&1; then
            local health_response=$(curl -s -m 10 "$health_url")
            local health_status=$(echo "$health_response" | jq -r '.status // "unknown"')
            
            if [[ "$health_status" == "ok" || "$health_status" == "healthy" ]]; then
                local elapsed=$(($(date +%s) - start_time))
                log_success "Service $service is healthy (${elapsed}s)"
                return 0
            fi
        fi
        
        log_info "Service $service not ready, waiting..."
        sleep "$interval"
    done
    
    log_error "Service $service health check failed after ${timeout}s"
    
    # Get logs for debugging
    log_error "Recent logs for $service:"
    docker logs --tail 20 "$container_name" 2>&1 || true
    
    return 1
}

get_running_services() {
    local services=()
    local service_list=$(get_service_list)
    
    for service in $service_list; do
        local container_name=$(get_service_container_name "$service")
        if docker ps --format "{{.Names}}" | grep -q "^$container_name$"; then
            services+=("$service")
        fi
    done
    
    echo "${services[@]}"
}

# ================================
# Pre-deployment Validation
# ================================

validate_rolling_deployment() {
    log_info "Validating rolling deployment prerequisites"
    
    # Check Docker image availability
    log_info "Pulling Docker image: sightedit/web:$VERSION"
    if ! docker pull "sightedit/web:$VERSION"; then
        log_error "Failed to pull Docker image"
        return 1
    fi
    
    # Verify current deployment health
    log_info "Verifying current deployment health"
    local running_services=($(get_running_services))
    
    if [[ ${#running_services[@]} -eq 0 ]]; then
        log_error "No running services found for rolling update"
        return 1
    fi
    
    log_info "Found ${#running_services[@]} running services: ${running_services[*]}"
    
    # Check that we have enough healthy services for rolling update
    local healthy_count=0
    for service in "${running_services[@]}"; do
        if check_service_health "$service" 30 5; then
            healthy_count=$((healthy_count + 1))
        fi
    done
    
    local required_healthy=$((${#running_services[@]} - MAX_UNAVAILABLE))
    if [[ $healthy_count -lt $required_healthy ]]; then
        log_error "Not enough healthy services for rolling update ($healthy_count < $required_healthy)"
        return 1
    fi
    
    # Store current version for rollback
    local current_image=$(docker inspect "$(get_service_container_name "web-blue")" \
        --format='{{.Config.Image}}' 2>/dev/null | cut -d':' -f2 || echo "unknown")
    if [[ "$current_image" != "unknown" ]]; then
        echo "$current_image" > "/tmp/sightedit-previous-version"
    fi
    
    log_success "Rolling deployment validation completed"
}

# ================================
# Rolling Update Implementation
# ================================

update_service_batch() {
    local services=("$@")
    
    log_info "Updating service batch: ${services[*]}"
    
    # Stop services in batch
    for service in "${services[@]}"; do
        log_info "Stopping service: $service"
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            stop "$service"
    done
    
    # Wait for graceful shutdown
    sleep 10
    
    # Start services with new version
    export VERSION="$VERSION"
    
    for service in "${services[@]}"; do
        log_info "Starting service $service with version $VERSION"
        
        # Remove old container
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            rm -f "$service"
        
        # Start with new version
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            up -d "$service"
    done
    
    # Wait for services to start
    sleep 15
    
    # Check health of updated services
    for service in "${services[@]}"; do
        if ! check_service_health "$service"; then
            log_error "Service $service failed health check after update"
            return 1
        fi
    done
    
    log_success "Service batch update completed: ${services[*]}"
}

perform_rolling_update() {
    log_info "Starting rolling update process"
    
    local services=($(get_service_list))
    local total_services=${#services[@]}
    local updated_services=0
    
    log_info "Total services to update: $total_services"
    log_info "Batch size: $BATCH_SIZE"
    log_info "Update delay: ${UPDATE_DELAY}s"
    
    # Process services in batches
    for ((i = 0; i < total_services; i += BATCH_SIZE)); do
        local batch=()
        local batch_end=$((i + BATCH_SIZE))
        if [[ $batch_end -gt $total_services ]]; then
            batch_end=$total_services
        fi
        
        # Build current batch
        for ((j = i; j < batch_end; j++)); do
            batch+=("${services[j]}")
        done
        
        local batch_num=$((i / BATCH_SIZE + 1))
        local total_batches=$(((total_services + BATCH_SIZE - 1) / BATCH_SIZE))
        
        log_info "Processing batch $batch_num/$total_batches: ${batch[*]}"
        
        # Verify we have enough healthy services before update
        if ! verify_minimum_healthy_services "${batch[@]}"; then
            log_error "Not enough healthy services to proceed with batch update"
            return 1
        fi
        
        # Update the batch
        if ! update_service_batch "${batch[@]}"; then
            log_error "Failed to update batch $batch_num"
            return 1
        fi
        
        updated_services=$((updated_services + ${#batch[@]}))
        log_success "Updated $updated_services/$total_services services"
        
        # Wait between batches (except for the last one)
        if [[ $batch_end -lt $total_services ]]; then
            log_info "Waiting ${UPDATE_DELAY}s before next batch"
            sleep "$UPDATE_DELAY"
        fi
    done
    
    log_success "Rolling update completed successfully"
}

verify_minimum_healthy_services() {
    local updating_services=("$@")
    
    # Get all services except the ones being updated
    local all_services=($(get_service_list))
    local remaining_services=()
    
    for service in "${all_services[@]}"; do
        local is_updating=false
        for updating_service in "${updating_services[@]}"; do
            if [[ "$service" == "$updating_service" ]]; then
                is_updating=true
                break
            fi
        done
        
        if [[ "$is_updating" == false ]]; then
            remaining_services+=("$service")
        fi
    done
    
    # Check health of remaining services
    local healthy_count=0
    for service in "${remaining_services[@]}"; do
        if check_service_health "$service" 30 5; then
            healthy_count=$((healthy_count + 1))
        fi
    done
    
    local required_healthy=$((${#all_services[@]} - ${#updating_services[@]} - MAX_UNAVAILABLE))
    
    if [[ $healthy_count -ge $required_healthy ]]; then
        log_info "Sufficient healthy services available ($healthy_count >= $required_healthy)"
        return 0
    else
        log_error "Insufficient healthy services ($healthy_count < $required_healthy)"
        return 1
    fi
}

# ================================
# Load Balancer Management
# ================================

update_load_balancer_config() {
    log_info "Updating load balancer configuration"
    
    # Create dynamic Traefik configuration
    local lb_config_dir="$PROJECT_ROOT/config/traefik"
    mkdir -p "$lb_config_dir"
    
    local services=($(get_service_list))
    local healthy_services=()
    
    # Find healthy services
    for service in "${services[@]}"; do
        if check_service_health "$service" 30 5; then
            healthy_services+=("$service")
        fi
    done
    
    if [[ ${#healthy_services[@]} -eq 0 ]]; then
        log_error "No healthy services found for load balancer"
        return 1
    fi
    
    # Generate load balancer configuration
    cat > "$lb_config_dir/rolling-update.yml" <<EOF
http:
  routers:
    sightedit-web:
      rule: "Host(\`$DOMAIN\`)"
      service: sightedit-web-pool
      tls:
        certResolver: letsencrypt
  
  services:
    sightedit-web-pool:
      loadBalancer:
        servers:
EOF
    
    for service in "${healthy_services[@]}"; do
        echo "          - url: \"http://$service:3000\"" >> "$lb_config_dir/rolling-update.yml"
    done
    
    cat >> "$lb_config_dir/rolling-update.yml" <<EOF
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"
        sticky:
          cookie:
            name: "sightedit-server"
            secure: true
            httpOnly: true
EOF
    
    # Reload Traefik configuration
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null; then
        log_success "Load balancer configuration updated"
    else
        log_warn "Failed to signal Traefik reload, configuration will be picked up automatically"
    fi
}

# ================================
# Deployment Health Verification
# ================================

verify_deployment_health() {
    log_info "Verifying overall deployment health"
    
    local services=($(get_service_list))
    local healthy_services=0
    local unhealthy_services=0
    
    # Check individual service health
    for service in "${services[@]}"; do
        if check_service_health "$service" 60 10; then
            healthy_services=$((healthy_services + 1))
        else
            unhealthy_services=$((unhealthy_services + 1))
            log_warn "Service $service is unhealthy"
        fi
    done
    
    log_info "Health summary: $healthy_services healthy, $unhealthy_services unhealthy"
    
    # Check external accessibility
    log_info "Checking external accessibility"
    if ! curl -f -s -m 10 "https://$DOMAIN/health" >/dev/null; then
        log_error "External health check failed"
        return 1
    fi
    
    # Check API functionality
    if ! curl -f -s -m 10 "https://$DOMAIN/api/sightedit/health" >/dev/null; then
        log_error "API health check failed"
        return 1
    fi
    
    # Performance check
    local start_time=$(date +%s%3N)
    curl -s -m 10 "https://$DOMAIN/" >/dev/null
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ $response_time -gt 3000 ]]; then
        log_warn "Response time higher than expected: ${response_time}ms"
    else
        log_success "Response time acceptable: ${response_time}ms"
    fi
    
    # Check service distribution
    if [[ $healthy_services -eq 0 ]]; then
        log_error "No healthy services found"
        return 1
    elif [[ $healthy_services -lt ${#services[@]} ]]; then
        local healthy_percentage=$((healthy_services * 100 / ${#services[@]}))
        if [[ $healthy_percentage -ge 75 ]]; then
            log_warn "Deployment partially healthy: $healthy_percentage% services healthy"
        else
            log_error "Deployment unhealthy: $healthy_percentage% services healthy"
            return 1
        fi
    fi
    
    log_success "Deployment health verification completed successfully"
    return 0
}

run_post_deployment_tests() {
    log_info "Running post-deployment functional tests"
    
    # Database connectivity test
    log_info "Testing database connectivity"
    local db_response=$(curl -s -m 10 "https://$DOMAIN/api/sightedit/db-health")
    local db_status=$(echo "$db_response" | jq -r '.status // "unknown"')
    
    if [[ "$db_status" != "ok" ]]; then
        log_error "Database connectivity test failed: $db_status"
        return 1
    fi
    
    # Redis connectivity test
    log_info "Testing Redis connectivity"
    local redis_response=$(curl -s -m 10 "https://$DOMAIN/api/sightedit/redis-health")
    local redis_status=$(echo "$redis_response" | jq -r '.status // "unknown"')
    
    if [[ "$redis_status" != "ok" ]]; then
        log_error "Redis connectivity test failed: $redis_status"
        return 1
    fi
    
    # API endpoint tests
    log_info "Testing critical API endpoints"
    local api_endpoints=(
        "/api/sightedit/health"
        "/api/sightedit/version"
    )
    
    for endpoint in "${api_endpoints[@]}"; do
        if ! curl -f -s -m 10 "https://$DOMAIN$endpoint" >/dev/null; then
            log_error "API endpoint test failed: $endpoint"
            return 1
        fi
    done
    
    # Load balancer test
    log_info "Testing load balancing"
    local unique_responses=0
    for i in {1..10}; do
        local response=$(curl -s -m 5 "https://$DOMAIN/api/sightedit/instance-id" 2>/dev/null | jq -r '.instance_id // "unknown"')
        if [[ "$response" != "unknown" ]]; then
            unique_responses=$((unique_responses + 1))
        fi
    done
    
    if [[ $unique_responses -ge 5 ]]; then
        log_success "Load balancing appears to be working"
    else
        log_warn "Load balancing test inconclusive"
    fi
    
    log_success "Post-deployment tests completed successfully"
}

# ================================
# Main Deployment Function
# ================================

main() {
    log_info "Starting rolling deployment for SightEdit"
    log_info "Version: $VERSION, Environment: $ENVIRONMENT"
    log_info "Configuration: Batch size=$BATCH_SIZE, Update delay=${UPDATE_DELAY}s, Max unavailable=$MAX_UNAVAILABLE"
    
    # Pre-deployment validation
    if ! validate_rolling_deployment; then
        log_error "Pre-deployment validation failed"
        exit 1
    fi
    
    # Perform rolling update
    if ! perform_rolling_update; then
        log_error "Rolling update failed"
        exit 1
    fi
    
    # Update load balancer configuration
    if ! update_load_balancer_config; then
        log_error "Load balancer configuration update failed"
        exit 1
    fi
    
    # Verify deployment health
    if ! verify_deployment_health; then
        log_error "Deployment health verification failed"
        exit 1
    fi
    
    # Run post-deployment tests
    if ! run_post_deployment_tests; then
        log_error "Post-deployment tests failed"
        exit 1
    fi
    
    log_success "Rolling deployment completed successfully!"
    log_success "All services updated to version: $VERSION"
    
    # Send success notification
    if command -v mail >/dev/null && [[ -n "${NOTIFICATION_EMAIL:-}" ]]; then
        echo "Rolling deployment completed successfully. Version $VERSION is now active on all services." | \
            mail -s "SightEdit Rolling Deployment Success" "$NOTIFICATION_EMAIL" || true
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
    echo "Environment Variables:"
    echo "  BATCH_SIZE       Number of services to update simultaneously (default: 1)"
    echo "  UPDATE_DELAY     Delay between batches in seconds (default: 30)"
    echo "  MAX_UNAVAILABLE  Maximum services that can be unavailable (default: 0)"
    echo ""
    echo "Examples:"
    echo "  $0 v1.2.3 production"
    echo "  BATCH_SIZE=2 UPDATE_DELAY=60 $0 latest staging"
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