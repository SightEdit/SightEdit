#!/bin/bash

# ================================
# SightEdit Comprehensive Health Check System
# ================================
# Multi-layer health validation for deployment verification
# Supports application, database, cache, and infrastructure checks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${1:-production}"
CHECK_TYPE="${2:-all}" # all, basic, deep, critical, custom
TARGET_URL="${3:-}" # Optional specific URL to check
TIMEOUT="${TIMEOUT:-300}"
MAX_RETRIES="${MAX_RETRIES:-3}"
RETRY_DELAY="${RETRY_DELAY:-10}"
PARALLEL_CHECKS="${PARALLEL_CHECKS:-true}"

# Load environment configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# Health check configuration
DOMAIN="${DOMAIN:-localhost}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

# Results tracking
HEALTH_RESULTS_FILE="/tmp/sightedit-health-results-$(date +%s)"
FAILED_CHECKS=()
WARNING_CHECKS=()
PASSED_CHECKS=()

# ================================
# Logging and Output
# ================================

LOG_FILE="/var/log/sightedit/health-check-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [HEALTH] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Colored output for terminal
print_status() {
    local status=$1
    local message=$2
    local color=""
    
    case $status in
        "PASS") color="\033[32m" ;;      # Green
        "FAIL") color="\033[31m" ;;      # Red
        "WARN") color="\033[33m" ;;      # Yellow
        "INFO") color="\033[36m" ;;      # Cyan
        *) color="\033[0m" ;;            # Default
    esac
    
    echo -e "${color}[$status] $message\033[0m"
}

# ================================
# Health Check Framework
# ================================

run_check() {
    local check_name="$1"
    local check_function="$2"
    local check_timeout="${3:-60}"
    local check_critical="${4:-true}"
    
    local start_time=$(date +%s)
    local result=""
    local message=""
    local status="UNKNOWN"
    
    print_status "INFO" "Running check: $check_name"
    
    # Run check with timeout
    if timeout "$check_timeout" bash -c "$check_function" 2>&1; then
        status="PASS"
        message="$check_name completed successfully"
        PASSED_CHECKS+=("$check_name")
        print_status "PASS" "$message"
    else
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            status="FAIL"
            message="$check_name timed out after ${check_timeout}s"
        else
            status="FAIL"
            message="$check_name failed with exit code $exit_code"
        fi
        
        if [[ "$check_critical" == "true" ]]; then
            FAILED_CHECKS+=("$check_name")
            print_status "FAIL" "$message"
        else
            WARNING_CHECKS+=("$check_name")
            print_status "WARN" "$message (non-critical)"
            status="WARN"
        fi
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Record result
    echo "$check_name|$status|$duration|$message" >> "$HEALTH_RESULTS_FILE"
    
    log_info "Check completed: $check_name - $status (${duration}s)"
}

# ================================
# Basic Health Checks
# ================================

check_application_health() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local health_endpoint="$base_url/health"
    
    log_info "Checking application health endpoint: $health_endpoint"
    
    local response=$(curl -s -w "%{http_code}" -m 30 "$health_endpoint")
    local http_code="${response: -3}"
    local body="${response%???}"
    
    if [[ "$http_code" == "200" ]]; then
        local status=$(echo "$body" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")
        if [[ "$status" == "ok" || "$status" == "healthy" ]]; then
            log_success "Application health check passed"
            return 0
        else
            log_error "Application health status: $status"
            return 1
        fi
    else
        log_error "Application health endpoint returned HTTP $http_code"
        return 1
    fi
}

check_application_ready() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local ready_endpoint="$base_url/ready"
    
    log_info "Checking application readiness"
    
    if curl -f -s -m 30 "$ready_endpoint" >/dev/null 2>&1; then
        log_success "Application readiness check passed"
        return 0
    else
        # Fallback to health endpoint if ready endpoint doesn't exist
        check_application_health
    fi
}

check_application_version() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local version_endpoint="$base_url/api/sightedit/version"
    
    log_info "Checking application version endpoint"
    
    local response=$(curl -s -m 10 "$version_endpoint" 2>/dev/null || echo '{"version":"unknown"}')
    local version=$(echo "$response" | jq -r '.version // "unknown"')
    
    if [[ "$version" != "unknown" ]]; then
        log_success "Application version: $version"
        return 0
    else
        log_warn "Could not determine application version"
        return 1
    fi
}

# ================================
# Database Health Checks
# ================================

check_database_connectivity() {
    log_info "Checking database connectivity"
    
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        log_success "Database connectivity check passed"
        return 0
    else
        log_error "Database connectivity check failed"
        return 1
    fi
}

check_database_queries() {
    log_info "Checking database query performance"
    
    local start_time=$(date +%s%3N)
    
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM information_schema.tables;" >/dev/null 2>&1; then
        
        local end_time=$(date +%s%3N)
        local query_time=$((end_time - start_time))
        
        if [[ $query_time -lt 1000 ]]; then
            log_success "Database query performance acceptable: ${query_time}ms"
            return 0
        else
            log_warn "Database query performance slow: ${query_time}ms"
            return 1
        fi
    else
        log_error "Database query test failed"
        return 1
    fi
}

check_database_replication() {
    log_info "Checking database replication status"
    
    # Check if replica is configured
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        ps postgres-replica >/dev/null 2>&1; then
        log_info "Database replica not configured, skipping replication check"
        return 0
    fi
    
    # Check replication lag
    local lag=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT EXTRACT(SECONDS FROM (now() - pg_last_xact_replay_timestamp()));" 2>/dev/null | xargs || echo "unknown")
    
    if [[ "$lag" == "unknown" ]]; then
        log_warn "Could not determine replication lag"
        return 1
    elif [[ $(echo "$lag < 60" | bc -l 2>/dev/null || echo 0) -eq 1 ]]; then
        log_success "Database replication lag acceptable: ${lag}s"
        return 0
    else
        log_warn "Database replication lag high: ${lag}s"
        return 1
    fi
}

check_database_connections() {
    log_info "Checking database connection count"
    
    local active_connections=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null | xargs || echo "0")
    
    local max_connections=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW max_connections;" 2>/dev/null | xargs || echo "100")
    
    local connection_percentage=$((active_connections * 100 / max_connections))
    
    log_info "Database connections: $active_connections/$max_connections (${connection_percentage}%)"
    
    if [[ $connection_percentage -lt 80 ]]; then
        log_success "Database connection usage acceptable"
        return 0
    elif [[ $connection_percentage -lt 90 ]]; then
        log_warn "Database connection usage high: ${connection_percentage}%"
        return 1
    else
        log_error "Database connection usage critical: ${connection_percentage}%"
        return 1
    fi
}

# ================================
# Redis Health Checks
# ================================

check_redis_connectivity() {
    log_info "Checking Redis connectivity"
    
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T redis-primary redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q PONG; then
        log_success "Redis connectivity check passed"
        return 0
    else
        log_error "Redis connectivity check failed"
        return 1
    fi
}

check_redis_memory() {
    log_info "Checking Redis memory usage"
    
    local memory_info=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T redis-primary redis-cli --no-auth-warning -a "$REDIS_PASSWORD" info memory 2>/dev/null || echo "")
    
    if [[ -z "$memory_info" ]]; then
        log_error "Could not retrieve Redis memory info"
        return 1
    fi
    
    local used_memory=$(echo "$memory_info" | grep "used_memory:" | cut -d: -f2 | tr -d '\r')
    local max_memory=$(echo "$memory_info" | grep "maxmemory:" | cut -d: -f2 | tr -d '\r')
    
    if [[ "$max_memory" == "0" ]]; then
        log_info "Redis max memory not configured (unlimited)"
        log_info "Redis used memory: $used_memory bytes"
        return 0
    fi
    
    local memory_percentage=$((used_memory * 100 / max_memory))
    log_info "Redis memory usage: $used_memory/$max_memory (${memory_percentage}%)"
    
    if [[ $memory_percentage -lt 80 ]]; then
        log_success "Redis memory usage acceptable"
        return 0
    elif [[ $memory_percentage -lt 90 ]]; then
        log_warn "Redis memory usage high: ${memory_percentage}%"
        return 1
    else
        log_error "Redis memory usage critical: ${memory_percentage}%"
        return 1
    fi
}

check_redis_sentinel() {
    log_info "Checking Redis Sentinel status"
    
    # Check if sentinel is configured
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        ps redis-sentinel >/dev/null 2>&1; then
        log_info "Redis Sentinel not configured, skipping check"
        return 0
    fi
    
    local sentinel_info=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T redis-sentinel redis-cli -p 26379 sentinel masters 2>/dev/null || echo "")
    
    if [[ -n "$sentinel_info" ]]; then
        log_success "Redis Sentinel is responding"
        return 0
    else
        log_error "Redis Sentinel check failed"
        return 1
    fi
}

# ================================
# API Health Checks
# ================================

check_api_endpoints() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local endpoints=(
        "/api/sightedit/health"
        "/api/sightedit/version"
        "/api/sightedit/db-health"
        "/api/sightedit/redis-health"
    )
    
    log_info "Checking critical API endpoints"
    
    for endpoint in "${endpoints[@]}"; do
        local full_url="$base_url$endpoint"
        local start_time=$(date +%s%3N)
        
        if curl -f -s -m 10 "$full_url" >/dev/null 2>&1; then
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            log_success "API endpoint $endpoint: OK (${response_time}ms)"
        else
            log_error "API endpoint $endpoint: FAILED"
            return 1
        fi
    done
    
    return 0
}

check_api_authentication() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local auth_endpoint="$base_url/api/sightedit/auth/status"
    
    log_info "Checking API authentication system"
    
    # Test unauthenticated request (should return 401 or proper error)
    local response_code=$(curl -s -w "%{http_code}" -m 10 "$auth_endpoint" | tail -c 3)
    
    if [[ "$response_code" == "401" || "$response_code" == "403" || "$response_code" == "200" ]]; then
        log_success "API authentication system responding correctly"
        return 0
    else
        log_warn "API authentication system response unexpected: $response_code"
        return 1
    fi
}

check_api_rate_limiting() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local test_endpoint="$base_url/api/sightedit/health"
    
    log_info "Checking API rate limiting"
    
    # Make rapid requests to test rate limiting
    local rate_limit_hit=false
    for i in {1..20}; do
        local response_code=$(curl -s -w "%{http_code}" -m 5 "$test_endpoint" | tail -c 3)
        
        if [[ "$response_code" == "429" ]]; then
            rate_limit_hit=true
            break
        fi
        
        sleep 0.1
    done
    
    if [[ "$rate_limit_hit" == true ]]; then
        log_success "API rate limiting is active"
        return 0
    else
        log_warn "API rate limiting may not be configured"
        return 1
    fi
}

# ================================
# Performance Health Checks
# ================================

check_response_times() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    local pages=("/" "/health" "/api/sightedit/health")
    local total_time=0
    local requests=0
    
    log_info "Checking application response times"
    
    for page in "${pages[@]}"; do
        local full_url="$base_url$page"
        local start_time=$(date +%s%3N)
        
        if curl -f -s -m 10 "$full_url" >/dev/null 2>&1; then
            local end_time=$(date +%s%3N)
            local response_time=$((end_time - start_time))
            total_time=$((total_time + response_time))
            requests=$((requests + 1))
            
            log_info "Response time for $page: ${response_time}ms"
            
            if [[ $response_time -gt 5000 ]]; then
                log_warn "Slow response time for $page: ${response_time}ms"
            fi
        else
            log_error "Failed to get response time for $page"
            return 1
        fi
    done
    
    if [[ $requests -gt 0 ]]; then
        local avg_time=$((total_time / requests))
        log_info "Average response time: ${avg_time}ms"
        
        if [[ $avg_time -lt 2000 ]]; then
            log_success "Application response times acceptable"
            return 0
        else
            log_warn "Application response times high: ${avg_time}ms"
            return 1
        fi
    else
        log_error "No successful response time measurements"
        return 1
    fi
}

check_memory_usage() {
    log_info "Checking container memory usage"
    
    local services=("web-blue" "web-green" "postgres-primary" "redis-primary")
    local memory_issues=false
    
    for service in "${services[@]}"; do
        local container_name="sightedit-$service"
        
        if docker ps --format "{{.Names}}" | grep -q "^$container_name$"; then
            local memory_stats=$(docker stats --no-stream --format "table {{.Container}}\t{{.MemUsage}}\t{{.MemPerc}}" "$container_name" | tail -1)
            local memory_perc=$(echo "$memory_stats" | awk '{print $3}' | sed 's/%//')
            
            log_info "Memory usage for $service: $memory_stats"
            
            if [[ $(echo "$memory_perc > 90" | bc -l 2>/dev/null || echo 0) -eq 1 ]]; then
                log_warn "High memory usage for $service: ${memory_perc}%"
                memory_issues=true
            fi
        else
            log_info "Container $service not running, skipping memory check"
        fi
    done
    
    if [[ "$memory_issues" == false ]]; then
        log_success "Container memory usage acceptable"
        return 0
    else
        log_warn "Some containers have high memory usage"
        return 1
    fi
}

check_disk_usage() {
    log_info "Checking disk usage for critical paths"
    
    local paths=(
        "/var/lib/docker"
        "/var/lib/postgresql"
        "/var/log/sightedit"
        "/var/backups"
    )
    
    local disk_issues=false
    
    for path in "${paths[@]}"; do
        if [[ -d "$path" ]]; then
            local usage=$(df "$path" | tail -1 | awk '{print $5}' | sed 's/%//')
            log_info "Disk usage for $path: ${usage}%"
            
            if [[ $usage -gt 90 ]]; then
                log_error "Critical disk usage for $path: ${usage}%"
                disk_issues=true
            elif [[ $usage -gt 80 ]]; then
                log_warn "High disk usage for $path: ${usage}%"
                disk_issues=true
            fi
        else
            log_info "Path $path does not exist, skipping"
        fi
    done
    
    if [[ "$disk_issues" == false ]]; then
        log_success "Disk usage acceptable"
        return 0
    else
        log_warn "Some paths have high disk usage"
        return 1
    fi
}

# ================================
# Security Health Checks
# ================================

check_ssl_certificate() {
    local domain="$DOMAIN"
    
    log_info "Checking SSL certificate for $domain"
    
    local cert_info=$(echo | openssl s_client -servername "$domain" -connect "$domain:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
    
    if [[ -z "$cert_info" ]]; then
        log_error "Could not retrieve SSL certificate information"
        return 1
    fi
    
    local not_after=$(echo "$cert_info" | grep "notAfter=" | cut -d= -f2)
    local expiry_date=$(date -d "$not_after" +%s 2>/dev/null || echo "0")
    local current_date=$(date +%s)
    local days_until_expiry=$(( (expiry_date - current_date) / 86400 ))
    
    log_info "SSL certificate expires in $days_until_expiry days"
    
    if [[ $days_until_expiry -gt 30 ]]; then
        log_success "SSL certificate validity acceptable"
        return 0
    elif [[ $days_until_expiry -gt 7 ]]; then
        log_warn "SSL certificate expires soon: $days_until_expiry days"
        return 1
    else
        log_error "SSL certificate expires very soon: $days_until_expiry days"
        return 1
    fi
}

check_security_headers() {
    local base_url="${TARGET_URL:-https://$DOMAIN}"
    
    log_info "Checking security headers"
    
    local headers=$(curl -s -I "$base_url/" 2>/dev/null || echo "")
    local missing_headers=()
    
    local required_headers=(
        "Content-Security-Policy"
        "X-Frame-Options"
        "X-Content-Type-Options"
        "Strict-Transport-Security"
    )
    
    for header in "${required_headers[@]}"; do
        if ! echo "$headers" | grep -qi "$header"; then
            missing_headers+=("$header")
        fi
    done
    
    if [[ ${#missing_headers[@]} -eq 0 ]]; then
        log_success "All required security headers present"
        return 0
    else
        log_warn "Missing security headers: ${missing_headers[*]}"
        return 1
    fi
}

# ================================
# Load Balancer Health Checks
# ================================

check_load_balancer() {
    log_info "Checking load balancer status"
    
    # Check if Traefik is running
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        ps traefik >/dev/null 2>&1; then
        log_error "Load balancer (Traefik) is not running"
        return 1
    fi
    
    # Check Traefik API
    local traefik_api="http://localhost:8080/api/http/routers"
    if curl -f -s -m 10 "$traefik_api" >/dev/null 2>&1; then
        log_success "Load balancer API responding"
    else
        log_warn "Load balancer API not accessible"
        return 1
    fi
    
    # Check routing configuration
    local router_count=$(curl -s -m 10 "$traefik_api" | jq length 2>/dev/null || echo "0")
    log_info "Active routes: $router_count"
    
    if [[ $router_count -gt 0 ]]; then
        log_success "Load balancer routing configured"
        return 0
    else
        log_warn "No routes configured in load balancer"
        return 1
    fi
}

# ================================
# Monitoring System Checks
# ================================

check_monitoring_stack() {
    log_info "Checking monitoring stack components"
    
    local components=("prometheus" "grafana" "alertmanager")
    local failed_components=()
    
    for component in "${components[@]}"; do
        if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            ps "$component" >/dev/null 2>&1; then
            
            # Check component health
            local port=""
            case $component in
                prometheus) port="9090" ;;
                grafana) port="3001" ;;
                alertmanager) port="9093" ;;
            esac
            
            if [[ -n "$port" ]] && curl -f -s -m 10 "http://localhost:$port" >/dev/null 2>&1; then
                log_success "Monitoring component $component: OK"
            else
                log_warn "Monitoring component $component: API not responding"
                failed_components+=("$component")
            fi
        else
            log_warn "Monitoring component $component: not running"
            failed_components+=("$component")
        fi
    done
    
    if [[ ${#failed_components[@]} -eq 0 ]]; then
        log_success "All monitoring components healthy"
        return 0
    else
        log_warn "Some monitoring components have issues: ${failed_components[*]}"
        return 1
    fi
}

# ================================
# Check Orchestration
# ================================

run_basic_checks() {
    log_info "Running basic health checks"
    
    run_check "application_health" "check_application_health" 60 true
    run_check "application_ready" "check_application_ready" 60 true
    run_check "database_connectivity" "check_database_connectivity" 30 true
    run_check "redis_connectivity" "check_redis_connectivity" 30 true
    run_check "api_endpoints" "check_api_endpoints" 60 true
}

run_deep_checks() {
    log_info "Running deep health checks"
    
    run_check "application_version" "check_application_version" 30 false
    run_check "database_queries" "check_database_queries" 60 true
    run_check "database_connections" "check_database_connections" 30 false
    run_check "redis_memory" "check_redis_memory" 30 false
    run_check "api_authentication" "check_api_authentication" 30 false
    run_check "response_times" "check_response_times" 120 false
    run_check "memory_usage" "check_memory_usage" 30 false
    run_check "disk_usage" "check_disk_usage" 30 false
}

run_critical_checks() {
    log_info "Running critical health checks"
    
    run_check "application_health" "check_application_health" 60 true
    run_check "database_connectivity" "check_database_connectivity" 30 true
    run_check "redis_connectivity" "check_redis_connectivity" 30 true
    run_check "ssl_certificate" "check_ssl_certificate" 30 true
    run_check "load_balancer" "check_load_balancer" 30 true
}

run_security_checks() {
    log_info "Running security health checks"
    
    run_check "ssl_certificate" "check_ssl_certificate" 60 true
    run_check "security_headers" "check_security_headers" 30 false
    run_check "api_rate_limiting" "check_api_rate_limiting" 60 false
}

run_infrastructure_checks() {
    log_info "Running infrastructure health checks"
    
    run_check "database_replication" "check_database_replication" 60 false
    run_check "redis_sentinel" "check_redis_sentinel" 30 false
    run_check "load_balancer" "check_load_balancer" 60 false
    run_check "monitoring_stack" "check_monitoring_stack" 60 false
}

run_all_checks() {
    log_info "Running comprehensive health checks"
    
    if [[ "$PARALLEL_CHECKS" == "true" ]]; then
        log_info "Running checks in parallel where possible"
        
        # Run basic checks first (these are dependencies)
        run_basic_checks
        
        # If basic checks pass, run other checks in parallel
        if [[ ${#FAILED_CHECKS[@]} -eq 0 ]]; then
            {
                run_deep_checks
            } &
            
            {
                run_security_checks
            } &
            
            {
                run_infrastructure_checks
            } &
            
            wait # Wait for all background jobs to complete
        fi
    else
        run_basic_checks
        run_deep_checks
        run_security_checks
        run_infrastructure_checks
    fi
}

# ================================
# Results Analysis and Reporting
# ================================

generate_health_report() {
    local report_file="/tmp/sightedit-health-report-$(date +%Y%m%d-%H%M%S).json"
    local summary_file="/tmp/sightedit-health-summary.txt"
    
    log_info "Generating health check report"
    
    # Create JSON report
    cat > "$report_file" <<EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "check_type": "$CHECK_TYPE",
    "target_url": "${TARGET_URL:-https://$DOMAIN}",
    "summary": {
        "total_checks": $((${#PASSED_CHECKS[@]} + ${#FAILED_CHECKS[@]} + ${#WARNING_CHECKS[@]})),
        "passed": ${#PASSED_CHECKS[@]},
        "failed": ${#FAILED_CHECKS[@]},
        "warnings": ${#WARNING_CHECKS[@]},
        "overall_status": "$(if [[ ${#FAILED_CHECKS[@]} -eq 0 ]]; then echo "HEALTHY"; else echo "UNHEALTHY"; fi)"
    },
    "results": {
        "passed": [$(printf '"%s",' "${PASSED_CHECKS[@]}" | sed 's/,$//')],
        "failed": [$(printf '"%s",' "${FAILED_CHECKS[@]}" | sed 's/,$//')],
        "warnings": [$(printf '"%s",' "${WARNING_CHECKS[@]}" | sed 's/,$//')]
    }
}
EOF
    
    # Create human-readable summary
    cat > "$summary_file" <<EOF
=====================================
SightEdit Health Check Summary
=====================================
Environment: $ENVIRONMENT
Check Type: $CHECK_TYPE
Timestamp: $(date)
Target: ${TARGET_URL:-https://$DOMAIN}

Results:
  Total Checks: $((${#PASSED_CHECKS[@]} + ${#FAILED_CHECKS[@]} + ${#WARNING_CHECKS[@]}))
  ✓ Passed: ${#PASSED_CHECKS[@]}
  ✗ Failed: ${#FAILED_CHECKS[@]}
  ⚠ Warnings: ${#WARNING_CHECKS[@]}

Overall Status: $(if [[ ${#FAILED_CHECKS[@]} -eq 0 ]]; then echo "HEALTHY ✓"; else echo "UNHEALTHY ✗"; fi)

EOF
    
    if [[ ${#FAILED_CHECKS[@]} -gt 0 ]]; then
        echo "Failed Checks:" >> "$summary_file"
        for check in "${FAILED_CHECKS[@]}"; do
            echo "  ✗ $check" >> "$summary_file"
        done
        echo "" >> "$summary_file"
    fi
    
    if [[ ${#WARNING_CHECKS[@]} -gt 0 ]]; then
        echo "Warning Checks:" >> "$summary_file"
        for check in "${WARNING_CHECKS[@]}"; do
            echo "  ⚠ $check" >> "$summary_file"
        done
        echo "" >> "$summary_file"
    fi
    
    if [[ ${#PASSED_CHECKS[@]} -gt 0 ]]; then
        echo "Passed Checks:" >> "$summary_file"
        for check in "${PASSED_CHECKS[@]}"; do
            echo "  ✓ $check" >> "$summary_file"
        done
    fi
    
    # Display summary
    cat "$summary_file"
    
    log_info "Health check report saved to: $report_file"
    log_info "Health check summary saved to: $summary_file"
    
    # Return appropriate exit code
    if [[ ${#FAILED_CHECKS[@]} -eq 0 ]]; then
        return 0
    else
        return 1
    fi
}

# ================================
# Main Function
# ================================

main() {
    log_info "Starting SightEdit health check system"
    log_info "Environment: $ENVIRONMENT, Check type: $CHECK_TYPE"
    log_info "Target: ${TARGET_URL:-https://$DOMAIN}"
    log_info "Timeout: ${TIMEOUT}s, Max retries: $MAX_RETRIES"
    
    # Initialize results file
    echo "# SightEdit Health Check Results" > "$HEALTH_RESULTS_FILE"
    echo "# Format: check_name|status|duration|message" >> "$HEALTH_RESULTS_FILE"
    
    # Run appropriate checks based on type
    case "$CHECK_TYPE" in
        basic)
            run_basic_checks
            ;;
        deep)
            run_basic_checks
            run_deep_checks
            ;;
        critical)
            run_critical_checks
            ;;
        security)
            run_security_checks
            ;;
        infrastructure)
            run_infrastructure_checks
            ;;
        all)
            run_all_checks
            ;;
        *)
            log_error "Unknown check type: $CHECK_TYPE"
            echo "Valid types: basic, deep, critical, security, infrastructure, all"
            exit 1
            ;;
    esac
    
    # Generate and display report
    if generate_health_report; then
        log_success "All health checks completed successfully"
        exit 0
    else
        log_error "Some health checks failed"
        exit 1
    fi
}

# ================================
# Command Line Interface
# ================================

show_usage() {
    echo "Usage: $0 [ENVIRONMENT] [CHECK_TYPE] [TARGET_URL]"
    echo ""
    echo "Arguments:"
    echo "  ENVIRONMENT    Target environment (default: production)"
    echo "  CHECK_TYPE     Type of checks to run (default: all)"
    echo "                 Options: basic, deep, critical, security, infrastructure, all"
    echo "  TARGET_URL     Specific URL to check (optional)"
    echo ""
    echo "Environment Variables:"
    echo "  TIMEOUT           Overall timeout in seconds (default: 300)"
    echo "  MAX_RETRIES       Maximum retry attempts (default: 3)"
    echo "  RETRY_DELAY       Delay between retries in seconds (default: 10)"
    echo "  PARALLEL_CHECKS   Run checks in parallel where possible (default: true)"
    echo ""
    echo "Examples:"
    echo "  $0 production all"
    echo "  $0 staging basic https://staging.example.com"
    echo "  $0 production critical"
    echo "  TIMEOUT=600 $0 production deep"
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