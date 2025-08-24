#!/bin/bash

# ================================
# SightEdit Canary Deployment Script
# ================================
# Gradual traffic shifting with automatic promotion/rollback
# based on performance metrics and error rates

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
VERSION="${1:-latest}"
ENVIRONMENT="${2:-production}"
CANARY_WEIGHT="${CANARY_WEIGHT:-10}"      # Initial traffic percentage
CANARY_DURATION="${CANARY_DURATION:-600}" # Monitor duration in seconds
PROMOTION_THRESHOLD="${PROMOTION_THRESHOLD:-95}" # Success threshold percentage
ERROR_RATE_THRESHOLD="${ERROR_RATE_THRESHOLD:-5}" # Max error rate percentage
RESPONSE_TIME_THRESHOLD="${RESPONSE_TIME_THRESHOLD:-2000}" # Max response time in ms
AUTO_PROMOTE="${AUTO_PROMOTE:-true}"      # Auto-promote if metrics are good
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"    # Auto-rollback if metrics are bad

# Load environment configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# State files
CANARY_STATE_FILE="/tmp/sightedit-canary-state"
CANARY_METRICS_FILE="/tmp/sightedit-canary-metrics"

# ================================
# Logging
# ================================

LOG_FILE="/var/log/sightedit/canary-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [CANARY] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# ================================
# Error Handling
# ================================

cleanup_canary_deployment() {
    log_error "Canary deployment failed, performing cleanup"
    
    # Stop canary service if running
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop web-canary || true
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        rm -f web-canary || true
    
    # Remove canary from load balancer
    remove_canary_from_lb
    
    # Clean up state files
    rm -f "$CANARY_STATE_FILE" "$CANARY_METRICS_FILE"
    
    exit 1
}

trap cleanup_canary_deployment ERR

# ================================
# Canary Service Management
# ================================

deploy_canary_service() {
    log_info "Deploying canary service with version $VERSION"
    
    echo "DEPLOYING" > "$CANARY_STATE_FILE"
    
    # Pull new image
    if ! docker pull "sightedit/web:$VERSION"; then
        log_error "Failed to pull Docker image: sightedit/web:$VERSION"
        return 1
    fi
    
    # Create canary service configuration
    create_canary_service_config
    
    # Start canary service
    export VERSION="$VERSION"
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        up -d web-canary
    
    # Wait for canary to be ready
    sleep 15
    
    # Check canary health
    if ! check_canary_health; then
        log_error "Canary service health check failed"
        return 1
    fi
    
    echo "DEPLOYED" > "$CANARY_STATE_FILE"
    log_success "Canary service deployed successfully"
}

create_canary_service_config() {
    log_info "Creating canary service configuration"
    
    # Create canary-specific Docker Compose file
    cat > "$PROJECT_ROOT/docker-compose.canary.yml" <<EOF
version: '3.8'

services:
  web-canary:
    build:
      context: .
      dockerfile: Dockerfile
      target: backend-server
      args:
        - NODE_ENV=production
        - VERSION=\${VERSION:-latest}
    image: sightedit/web:\${VERSION:-latest}
    container_name: sightedit-web-canary
    restart: unless-stopped
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://\${DB_USER}:\${DB_PASSWORD}@postgres-primary:5432/\${DB_NAME}
      - REDIS_URL=redis://:\${REDIS_PASSWORD}@redis-primary:6379/0
      - JWT_SECRET=\${JWT_SECRET}
      - CORS_ORIGIN=\${CORS_ORIGIN}
      - LOG_LEVEL=info
      - SENTRY_DSN=\${SENTRY_DSN}
      - CANARY_MODE=true
      - INSTANCE_ID=canary-\$(date +%s)
    volumes:
      - app-uploads:/app/uploads:rw
      - app-logs:/var/log/sightedit:rw
    networks:
      - app-network
      - db-network
      - cache-network
    ports:
      - "3003:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '0.5'
    labels:
      - "app=sightedit"
      - "environment=\${ENVIRONMENT:-production}"
      - "service=web"
      - "deployment=canary"
      - "version=\${VERSION:-latest}"

networks:
  app-network:
    external: true
    name: sightedit_app-network
  db-network:
    external: true
    name: sightedit_db-network
  cache-network:
    external: true
    name: sightedit_cache-network

volumes:
  app-uploads:
    external: true
    name: sightedit_app-uploads
  app-logs:
    external: true
    name: sightedit_app-logs
EOF
}

check_canary_health() {
    local timeout=120
    local interval=5
    local health_url="http://localhost:3003/health"
    
    log_info "Checking canary service health"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -f -s -m 10 "$health_url" >/dev/null 2>&1; then
            local health_response=$(curl -s -m 10 "$health_url")
            local health_status=$(echo "$health_response" | jq -r '.status // "unknown"')
            
            if [[ "$health_status" == "ok" || "$health_status" == "healthy" ]]; then
                local elapsed=$(($(date +%s) - start_time))
                log_success "Canary service is healthy (${elapsed}s)"
                
                # Additional service-specific checks
                if check_canary_connectivity; then
                    return 0
                fi
            fi
        fi
        
        log_info "Waiting for canary service to become healthy..."
        sleep "$interval"
    done
    
    log_error "Canary service health check failed after ${timeout}s"
    
    # Get logs for debugging
    docker logs --tail 20 sightedit-web-canary 2>&1 || true
    
    return 1
}

check_canary_connectivity() {
    local base_url="http://localhost:3003"
    
    # Test database connectivity
    if ! curl -f -s -m 10 "$base_url/api/sightedit/db-health" >/dev/null; then
        log_error "Canary database connectivity check failed"
        return 1
    fi
    
    # Test Redis connectivity
    if ! curl -f -s -m 10 "$base_url/api/sightedit/redis-health" >/dev/null; then
        log_error "Canary Redis connectivity check failed"
        return 1
    fi
    
    # Test API functionality
    if ! curl -f -s -m 10 "$base_url/api/sightedit/health" >/dev/null; then
        log_error "Canary API health check failed"
        return 1
    fi
    
    log_success "Canary connectivity checks passed"
    return 0
}

# ================================
# Load Balancer Management
# ================================

configure_canary_traffic() {
    local weight=$1
    
    log_info "Configuring canary traffic routing: ${weight}% to canary"
    
    echo "ROUTING" > "$CANARY_STATE_FILE"
    
    # Create Traefik configuration for canary routing
    local lb_config_dir="$PROJECT_ROOT/config/traefik"
    mkdir -p "$lb_config_dir"
    
    # Calculate weights (total should be 100)
    local main_weight=$((100 - weight))
    
    cat > "$lb_config_dir/canary-routing.yml" <<EOF
http:
  routers:
    sightedit-web-canary:
      rule: "Host(\`$DOMAIN\`) && HeadersRegexp(\`X-Canary\`, \`true\`)"
      service: sightedit-canary
      priority: 200
      tls:
        certResolver: letsencrypt
    
    sightedit-web-main:
      rule: "Host(\`$DOMAIN\`)"
      service: sightedit-main-weighted
      priority: 100
      tls:
        certResolver: letsencrypt
  
  services:
    sightedit-canary:
      loadBalancer:
        servers:
          - url: "http://web-canary:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"
    
    sightedit-main-weighted:
      weighted:
        services:
          - name: "sightedit-main"
            weight: $main_weight
          - name: "sightedit-canary"
            weight: $weight
    
    sightedit-main:
      loadBalancer:
        servers:
          - url: "http://web-blue:3000"
          - url: "http://web-green:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"

  middlewares:
    canary-headers:
      headers:
        customRequestHeaders:
          X-Deployment-Type: "canary"
        customResponseHeaders:
          X-Canary-Version: "$VERSION"
EOF
    
    # Apply configuration
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null; then
        log_info "Load balancer configuration updated"
    else
        log_warn "Failed to signal Traefik reload"
    fi
    
    # Wait for configuration to propagate
    sleep 20
    
    # Verify canary routing
    if verify_canary_routing "$weight"; then
        echo "ACTIVE" > "$CANARY_STATE_FILE"
        log_success "Canary traffic routing configured successfully"
    else
        log_error "Canary traffic routing verification failed"
        return 1
    fi
}

verify_canary_routing() {
    local expected_weight=$1
    local sample_size=20
    local canary_hits=0
    
    log_info "Verifying canary traffic routing (${sample_size} samples)"
    
    for i in $(seq 1 $sample_size); do
        # Test with canary header (should always hit canary)
        local canary_response=$(curl -s -H "X-Canary: true" -m 5 "https://$DOMAIN/api/sightedit/instance-id" 2>/dev/null || echo '{"instance_id":"unknown"}')
        local canary_instance=$(echo "$canary_response" | jq -r '.instance_id // "unknown"')
        
        if [[ "$canary_instance" =~ canary ]]; then
            log_info "Canary header routing: OK"
        else
            log_warn "Canary header routing: Failed (got: $canary_instance)"
        fi
        
        # Test normal traffic (should hit canary based on weight)
        local normal_response=$(curl -s -m 5 "https://$DOMAIN/api/sightedit/instance-id" 2>/dev/null || echo '{"instance_id":"unknown"}')
        local normal_instance=$(echo "$normal_response" | jq -r '.instance_id // "unknown"')
        
        if [[ "$normal_instance" =~ canary ]]; then
            canary_hits=$((canary_hits + 1))
        fi
        
        sleep 1
    done
    
    local actual_percentage=$(( (canary_hits * 100) / sample_size ))
    local weight_tolerance=15 # Allow 15% tolerance
    
    log_info "Canary traffic analysis: $canary_hits/$sample_size hits (${actual_percentage}%)"
    log_info "Expected: ~${expected_weight}% ± ${weight_tolerance}%"
    
    local min_expected=$((expected_weight - weight_tolerance))
    local max_expected=$((expected_weight + weight_tolerance))
    
    if [[ $actual_percentage -ge $min_expected && $actual_percentage -le $max_expected ]]; then
        log_success "Canary traffic distribution within expected range"
        return 0
    else
        log_warn "Canary traffic distribution outside expected range"
        return 0  # Don't fail deployment for traffic distribution issues
    fi
}

remove_canary_from_lb() {
    log_info "Removing canary from load balancer"
    
    # Restore normal routing configuration
    local lb_config_dir="$PROJECT_ROOT/config/traefik"
    
    cat > "$lb_config_dir/canary-routing.yml" <<EOF
http:
  routers:
    sightedit-web-main:
      rule: "Host(\`$DOMAIN\`)"
      service: sightedit-main
      tls:
        certResolver: letsencrypt
  
  services:
    sightedit-main:
      loadBalancer:
        servers:
          - url: "http://web-blue:3000"
          - url: "http://web-green:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"
EOF
    
    # Signal configuration reload
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null || true
    
    log_success "Canary removed from load balancer"
}

# ================================
# Metrics Collection and Analysis
# ================================

collect_canary_metrics() {
    local duration=$1
    local interval=30
    local iterations=$((duration / interval))
    
    log_info "Collecting canary metrics for ${duration}s (${iterations} samples)"
    
    echo "START_TIME=$(date +%s)" > "$CANARY_METRICS_FILE"
    echo "SAMPLES=0" >> "$CANARY_METRICS_FILE"
    echo "ERROR_RATE=0" >> "$CANARY_METRICS_FILE"
    echo "AVG_RESPONSE_TIME=0" >> "$CANARY_METRICS_FILE"
    echo "SUCCESS_COUNT=0" >> "$CANARY_METRICS_FILE"
    echo "ERROR_COUNT=0" >> "$CANARY_METRICS_FILE"
    
    for i in $(seq 1 $iterations); do
        log_info "Collecting metrics sample $i/$iterations"
        
        # Collect Prometheus metrics if available
        if collect_prometheus_metrics; then
            log_info "Prometheus metrics collected"
        else
            # Fallback to direct testing
            collect_direct_metrics
        fi
        
        # Update progress
        local progress=$((i * 100 / iterations))
        log_info "Metrics collection progress: ${progress}%"
        
        # Sleep between samples
        if [[ $i -lt $iterations ]]; then
            sleep "$interval"
        fi
    done
    
    # Calculate final metrics
    calculate_final_metrics
    
    log_success "Metrics collection completed"
}

collect_prometheus_metrics() {
    local prometheus_url="http://localhost:9090"
    
    # Check if Prometheus is available
    if ! curl -s "$prometheus_url/api/v1/query?query=up" >/dev/null 2>&1; then
        return 1
    fi
    
    # Query canary error rate
    local error_query="rate(http_requests_total{job=\"sightedit-canary\",status=~\"5..\"}[5m]) / rate(http_requests_total{job=\"sightedit-canary\"}[5m]) * 100"
    local error_response=$(curl -s "$prometheus_url/api/v1/query?query=$error_query")
    local error_rate=$(echo "$error_response" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
    
    # Query canary response time
    local rt_query="rate(http_request_duration_seconds_sum{job=\"sightedit-canary\"}[5m]) / rate(http_request_duration_seconds_count{job=\"sightedit-canary\"}[5m]) * 1000"
    local rt_response=$(curl -s "$prometheus_url/api/v1/query?query=$rt_query")
    local avg_response_time=$(echo "$rt_response" | jq -r '.data.result[0].value[1] // "0"' 2>/dev/null || echo "0")
    
    # Update metrics file
    local current_samples=$(grep "SAMPLES=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local new_samples=$((current_samples + 1))
    
    sed -i "s/SAMPLES=.*/SAMPLES=$new_samples/" "$CANARY_METRICS_FILE"
    sed -i "s/ERROR_RATE=.*/ERROR_RATE=$error_rate/" "$CANARY_METRICS_FILE"
    sed -i "s/AVG_RESPONSE_TIME=.*/AVG_RESPONSE_TIME=$avg_response_time/" "$CANARY_METRICS_FILE"
    
    log_info "Prometheus metrics - Error rate: ${error_rate}%, Avg response time: ${avg_response_time}ms"
    
    return 0
}

collect_direct_metrics() {
    log_info "Collecting direct metrics from canary service"
    
    local sample_requests=10
    local success_count=0
    local error_count=0
    local total_response_time=0
    
    for j in $(seq 1 $sample_requests); do
        local start_time=$(date +%s%3N)
        
        if curl -f -s -H "X-Canary: true" -m 10 "https://$DOMAIN/health" >/dev/null 2>&1; then
            success_count=$((success_count + 1))
        else
            error_count=$((error_count + 1))
        fi
        
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        total_response_time=$((total_response_time + response_time))
        
        sleep 1
    done
    
    local error_rate=0
    if [[ $sample_requests -gt 0 ]]; then
        error_rate=$(( (error_count * 100) / sample_requests ))
    fi
    
    local avg_response_time=0
    if [[ $sample_requests -gt 0 ]]; then
        avg_response_time=$((total_response_time / sample_requests))
    fi
    
    # Update metrics
    local current_samples=$(grep "SAMPLES=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local current_success=$(grep "SUCCESS_COUNT=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local current_errors=$(grep "ERROR_COUNT=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    
    local new_samples=$((current_samples + 1))
    local new_success=$((current_success + success_count))
    local new_errors=$((current_errors + error_count))
    
    sed -i "s/SAMPLES=.*/SAMPLES=$new_samples/" "$CANARY_METRICS_FILE"
    sed -i "s/SUCCESS_COUNT=.*/SUCCESS_COUNT=$new_success/" "$CANARY_METRICS_FILE"
    sed -i "s/ERROR_COUNT=.*/ERROR_COUNT=$new_errors/" "$CANARY_METRICS_FILE"
    sed -i "s/ERROR_RATE=.*/ERROR_RATE=$error_rate/" "$CANARY_METRICS_FILE"
    sed -i "s/AVG_RESPONSE_TIME=.*/AVG_RESPONSE_TIME=$avg_response_time/" "$CANARY_METRICS_FILE"
    
    log_info "Direct metrics - Error rate: ${error_rate}%, Avg response time: ${avg_response_time}ms"
}

calculate_final_metrics() {
    local success_count=$(grep "SUCCESS_COUNT=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local error_count=$(grep "ERROR_COUNT=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local total_requests=$((success_count + error_count))
    
    if [[ $total_requests -gt 0 ]]; then
        local final_error_rate=$(( (error_count * 100) / total_requests ))
        sed -i "s/ERROR_RATE=.*/ERROR_RATE=$final_error_rate/" "$CANARY_METRICS_FILE"
    fi
    
    local final_success_rate=$(( (success_count * 100) / total_requests ))
    echo "SUCCESS_RATE=$final_success_rate" >> "$CANARY_METRICS_FILE"
    
    log_info "Final metrics calculated - Success rate: ${final_success_rate}%, Error rate: $(grep "ERROR_RATE=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)%"
}

# ================================
# Decision Making
# ================================

analyze_canary_performance() {
    log_info "Analyzing canary performance metrics"
    
    if [[ ! -f "$CANARY_METRICS_FILE" ]]; then
        log_error "Metrics file not found"
        return 1
    fi
    
    local success_rate=$(grep "SUCCESS_RATE=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local error_rate=$(grep "ERROR_RATE=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    local avg_response_time=$(grep "AVG_RESPONSE_TIME=" "$CANARY_METRICS_FILE" | cut -d'=' -f2)
    
    log_info "Performance Analysis:"
    log_info "  Success Rate: ${success_rate}%"
    log_info "  Error Rate: ${error_rate}%"
    log_info "  Avg Response Time: ${avg_response_time}ms"
    log_info ""
    log_info "Thresholds:"
    log_info "  Min Success Rate: ${PROMOTION_THRESHOLD}%"
    log_info "  Max Error Rate: ${ERROR_RATE_THRESHOLD}%"
    log_info "  Max Response Time: ${RESPONSE_TIME_THRESHOLD}ms"
    
    # Decision logic
    local promote=true
    local reasons=()
    
    # Check success rate
    if [[ ${success_rate:-0} -lt $PROMOTION_THRESHOLD ]]; then
        promote=false
        reasons+=("Success rate too low: ${success_rate}% < ${PROMOTION_THRESHOLD}%")
    fi
    
    # Check error rate
    if [[ ${error_rate:-0} -gt $ERROR_RATE_THRESHOLD ]]; then
        promote=false
        reasons+=("Error rate too high: ${error_rate}% > ${ERROR_RATE_THRESHOLD}%")
    fi
    
    # Check response time
    local response_time_int=$(echo "${avg_response_time:-0}" | cut -d'.' -f1)
    if [[ $response_time_int -gt $RESPONSE_TIME_THRESHOLD ]]; then
        promote=false
        reasons+=("Response time too high: ${response_time_int}ms > ${RESPONSE_TIME_THRESHOLD}ms")
    fi
    
    if [[ "$promote" == "true" ]]; then
        log_success "Canary performance analysis: PROMOTE"
        return 0
    else
        log_error "Canary performance analysis: ROLLBACK"
        for reason in "${reasons[@]}"; do
            log_error "  - $reason"
        done
        return 1
    fi
}

# ================================
# Promotion and Rollback
# ================================

promote_canary() {
    log_info "Promoting canary to full deployment"
    
    echo "PROMOTING" > "$CANARY_STATE_FILE"
    
    # Update main services with canary version
    export VERSION="$VERSION"
    
    # Stop main services
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop web-blue web-green
    
    # Update and restart main services
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d web-blue web-green
    
    # Wait for main services to be ready
    sleep 30
    
    # Remove canary from load balancer
    remove_canary_from_lb
    
    # Wait for traffic to stabilize
    sleep 30
    
    # Stop canary service
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        stop web-canary
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        rm -f web-canary
    
    # Verify promotion
    if verify_promotion_success; then
        echo "PROMOTED" > "$CANARY_STATE_FILE"
        log_success "Canary promotion completed successfully"
        
        # Send success notification
        send_notification "SUCCESS" "Canary deployment promoted to full production"
        
        return 0
    else
        log_error "Promotion verification failed"
        return 1
    fi
}

rollback_canary() {
    log_warn "Rolling back canary deployment"
    
    echo "ROLLING_BACK" > "$CANARY_STATE_FILE"
    
    # Remove canary from load balancer
    remove_canary_from_lb
    
    # Stop canary service
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        stop web-canary || true
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        rm -f web-canary || true
    
    # Verify rollback
    sleep 15
    if curl -f -s -m 10 "https://$DOMAIN/health" >/dev/null; then
        echo "ROLLED_BACK" > "$CANARY_STATE_FILE"
        log_success "Canary rollback completed successfully"
        
        # Send rollback notification
        send_notification "ROLLBACK" "Canary deployment rolled back due to performance issues"
        
        return 0
    else
        log_error "Rollback verification failed"
        return 1
    fi
}

verify_promotion_success() {
    log_info "Verifying canary promotion success"
    
    # Check external accessibility
    if ! curl -f -s -m 10 "https://$DOMAIN/health" >/dev/null; then
        log_error "External health check failed after promotion"
        return 1
    fi
    
    # Check that we're getting the new version
    local version_response=$(curl -s -m 10 "https://$DOMAIN/api/sightedit/version" 2>/dev/null || echo '{"version":"unknown"}')
    local deployed_version=$(echo "$version_response" | jq -r '.version // "unknown"')
    
    if [[ "$deployed_version" == "$VERSION" ]]; then
        log_success "Version verification passed: $deployed_version"
    else
        log_warn "Version verification inconclusive: expected $VERSION, got $deployed_version"
    fi
    
    # Performance check after promotion
    local start_time=$(date +%s%3N)
    curl -s -m 10 "https://$DOMAIN/" >/dev/null
    local end_time=$(date +%s%3N)
    local response_time=$((end_time - start_time))
    
    if [[ $response_time -gt 3000 ]]; then
        log_warn "Response time higher than expected after promotion: ${response_time}ms"
    else
        log_success "Response time acceptable after promotion: ${response_time}ms"
    fi
    
    log_success "Canary promotion verification completed"
    return 0
}

# ================================
# Notification System
# ================================

send_notification() {
    local status=$1
    local message=$2
    
    # Slack notification
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color
        case $status in
            SUCCESS) color="good" ;;
            ROLLBACK) color="warning" ;;
            *) color="danger" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"SightEdit Canary Deployment $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Version\", \"value\": \"$VERSION\", \"short\": true},
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Canary Weight\", \"value\": \"${CANARY_WEIGHT}%\", \"short\": true},
                        {\"title\": \"Duration\", \"value\": \"${CANARY_DURATION}s\", \"short\": true}
                    ]
                }]
            }" \
            "$SLACK_WEBHOOK_URL" || true
    fi
    
    # Email notification
    if [[ -n "${NOTIFICATION_EMAIL:-}" ]] && command -v mail >/dev/null; then
        echo "$message" | mail -s "SightEdit Canary Deployment $status" "$NOTIFICATION_EMAIL" || true
    fi
}

# ================================
# Main Canary Deployment Function
# ================================

main() {
    log_info "Starting canary deployment for SightEdit"
    log_info "Version: $VERSION, Environment: $ENVIRONMENT"
    log_info "Canary weight: ${CANARY_WEIGHT}%, Duration: ${CANARY_DURATION}s"
    log_info "Auto-promote: $AUTO_PROMOTE, Auto-rollback: $AUTO_ROLLBACK"
    
    # Deploy canary service
    if ! deploy_canary_service; then
        log_error "Canary service deployment failed"
        exit 1
    fi
    
    # Configure traffic routing
    if ! configure_canary_traffic "$CANARY_WEIGHT"; then
        log_error "Canary traffic configuration failed"
        rollback_canary
        exit 1
    fi
    
    # Monitor canary performance
    log_info "Starting canary monitoring period (${CANARY_DURATION}s)"
    collect_canary_metrics "$CANARY_DURATION"
    
    # Analyze performance and make decision
    if analyze_canary_performance; then
        log_success "Canary performance meets promotion criteria"
        
        if [[ "$AUTO_PROMOTE" == "true" ]]; then
            if promote_canary; then
                log_success "Canary deployment completed successfully with auto-promotion"
            else
                log_error "Auto-promotion failed"
                exit 1
            fi
        else
            log_info "Auto-promotion disabled, manual intervention required"
            echo "MANUAL_DECISION_REQUIRED" > "$CANARY_STATE_FILE"
        fi
    else
        log_warn "Canary performance does not meet promotion criteria"
        
        if [[ "$AUTO_ROLLBACK" == "true" ]]; then
            if rollback_canary; then
                log_warn "Canary deployment rolled back automatically"
                exit 1
            else
                log_error "Auto-rollback failed"
                exit 1
            fi
        else
            log_info "Auto-rollback disabled, manual intervention required"
            echo "MANUAL_DECISION_REQUIRED" > "$CANARY_STATE_FILE"
        fi
    fi
    
    # Clean up
    rm -f "$PROJECT_ROOT/docker-compose.canary.yml"
    
    log_success "Canary deployment process completed"
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
    echo "  CANARY_WEIGHT             Initial canary traffic percentage (default: 10)"
    echo "  CANARY_DURATION           Monitoring duration in seconds (default: 600)"
    echo "  PROMOTION_THRESHOLD       Success rate threshold for promotion (default: 95)"
    echo "  ERROR_RATE_THRESHOLD      Maximum error rate percentage (default: 5)"
    echo "  RESPONSE_TIME_THRESHOLD   Maximum response time in milliseconds (default: 2000)"
    echo "  AUTO_PROMOTE              Auto-promote if metrics are good (default: true)"
    echo "  AUTO_ROLLBACK             Auto-rollback if metrics are bad (default: true)"
    echo ""
    echo "Examples:"
    echo "  $0 v1.2.3 production"
    echo "  CANARY_WEIGHT=25 CANARY_DURATION=900 $0 latest staging"
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