#!/bin/bash
# ================================================================================
# SightEdit Container Health Check Script
# Comprehensive health monitoring for containerized applications
# ================================================================================

set -euo pipefail

# Configuration
readonly SERVICE_TYPE="${SERVICE_TYPE:-backend}"
readonly PORT="${PORT:-3000}"
readonly NGINX_PORT="${NGINX_PORT:-8080}"
readonly HEALTH_ENDPOINT="${HEALTH_ENDPOINT:-/health}"
readonly TIMEOUT="${HEALTH_TIMEOUT:-10}"
readonly MAX_RETRIES="${HEALTH_MAX_RETRIES:-3}"

# Health check results
declare -A HEALTH_RESULTS=()
OVERALL_HEALTH="healthy"

# Logging function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >&2
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local url="$1"
    local service_name="$2"
    local expected_status="${3:-200}"
    
    log "Checking HTTP endpoint: $url"
    
    local response
    local http_status
    
    if response=$(curl -s -f --max-time "$TIMEOUT" -w "%{http_code}" "$url" 2>/dev/null); then
        http_status="${response: -3}"
        response_body="${response%???}"
        
        if [[ "$http_status" == "$expected_status" ]]; then
            HEALTH_RESULTS["$service_name"]="healthy"
            log "$service_name: HTTP $http_status - OK"
            return 0
        else
            HEALTH_RESULTS["$service_name"]="unhealthy"
            log "$service_name: HTTP $http_status - FAIL"
            return 1
        fi
    else
        HEALTH_RESULTS["$service_name"]="unhealthy"
        log "$service_name: Connection failed - FAIL"
        return 1
    fi
}

# Function to check Node.js backend health
check_backend_health() {
    log "Checking backend service health..."
    
    local retries=0
    while [[ $retries -lt $MAX_RETRIES ]]; do
        if check_http_endpoint "http://localhost:$PORT$HEALTH_ENDPOINT" "backend"; then
            return 0
        fi
        
        ((retries++))
        if [[ $retries -lt $MAX_RETRIES ]]; then
            log "Backend health check failed, retry $retries/$MAX_RETRIES..."
            sleep 2
        fi
    done
    
    OVERALL_HEALTH="unhealthy"
    return 1
}

# Function to check Nginx CDN health
check_cdn_health() {
    log "Checking CDN service health..."
    
    local retries=0
    while [[ $retries -lt $MAX_RETRIES ]]; do
        # Check main health endpoint
        if check_http_endpoint "http://localhost:$NGINX_PORT/health" "cdn"; then
            # Additional check for core assets
            if check_http_endpoint "http://localhost:$NGINX_PORT/core/index.js" "cdn-assets" "200"; then
                return 0
            fi
        fi
        
        ((retries++))
        if [[ $retries -lt $MAX_RETRIES ]]; then
            log "CDN health check failed, retry $retries/$MAX_RETRIES..."
            sleep 2
        fi
    done
    
    OVERALL_HEALTH="unhealthy"
    return 1
}

# Function to check website health
check_website_health() {
    log "Checking website service health..."
    
    local retries=0
    while [[ $retries -lt $MAX_RETRIES ]]; do
        if check_http_endpoint "http://localhost:$NGINX_PORT/" "website" "200"; then
            return 0
        fi
        
        ((retries++))
        if [[ $retries -lt $MAX_RETRIES ]]; then
            log "Website health check failed, retry $retries/$MAX_RETRIES..."
            sleep 2
        fi
    done
    
    OVERALL_HEALTH="unhealthy"
    return 1
}

# Function to check database connectivity (if applicable)
check_database_health() {
    if [[ -n "${DATABASE_URL:-}" ]]; then
        log "Checking database connectivity..."
        
        # This would need to be implemented based on the specific database type
        # For now, we'll check if the database connection can be established
        # through the backend service's health endpoint
        
        if curl -s -f --max-time "$TIMEOUT" "http://localhost:$PORT/health/db" >/dev/null 2>&1; then
            HEALTH_RESULTS["database"]="healthy"
            log "Database: Connection OK"
            return 0
        else
            HEALTH_RESULTS["database"]="unhealthy"
            log "Database: Connection FAIL"
            OVERALL_HEALTH="unhealthy"
            return 1
        fi
    else
        log "No database configured, skipping database health check"
        return 0
    fi
}

# Function to check memory usage
check_memory_usage() {
    log "Checking memory usage..."
    
    local memory_threshold="${MEMORY_THRESHOLD:-80}"  # 80% threshold
    
    if [[ -f /proc/meminfo ]]; then
        local mem_total mem_available mem_usage_percent
        
        mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
        
        if [[ -n "$mem_total" && -n "$mem_available" ]]; then
            mem_usage_percent=$(( (mem_total - mem_available) * 100 / mem_total ))
            
            log "Memory usage: ${mem_usage_percent}%"
            
            if [[ $mem_usage_percent -lt $memory_threshold ]]; then
                HEALTH_RESULTS["memory"]="healthy"
                return 0
            else
                HEALTH_RESULTS["memory"]="warning"
                log "Memory usage is high: ${mem_usage_percent}% (threshold: ${memory_threshold}%)"
                return 0  # Warning, but not fatal
            fi
        fi
    fi
    
    HEALTH_RESULTS["memory"]="unknown"
    return 0
}

# Function to check disk usage
check_disk_usage() {
    log "Checking disk usage..."
    
    local disk_threshold="${DISK_THRESHOLD:-85}"  # 85% threshold
    
    local disk_usage_percent
    disk_usage_percent=$(df / | tail -1 | awk '{print int($5)}')
    
    log "Disk usage: ${disk_usage_percent}%"
    
    if [[ $disk_usage_percent -lt $disk_threshold ]]; then
        HEALTH_RESULTS["disk"]="healthy"
        return 0
    else
        HEALTH_RESULTS["disk"]="warning"
        log "Disk usage is high: ${disk_usage_percent}% (threshold: ${disk_threshold}%)"
        return 0  # Warning, but not fatal
    fi
}

# Function to check process health
check_process_health() {
    log "Checking process health..."
    
    case "$SERVICE_TYPE" in
        "backend")
            if pgrep -x "node" >/dev/null; then
                HEALTH_RESULTS["process"]="healthy"
                log "Node.js process: Running"
                return 0
            else
                HEALTH_RESULTS["process"]="unhealthy"
                log "Node.js process: Not found"
                OVERALL_HEALTH="unhealthy"
                return 1
            fi
            ;;
        "cdn-server"|"website")
            if pgrep -x "nginx" >/dev/null; then
                HEALTH_RESULTS["process"]="healthy"
                log "Nginx process: Running"
                return 0
            else
                HEALTH_RESULTS["process"]="unhealthy"
                log "Nginx process: Not found"
                OVERALL_HEALTH="unhealthy"
                return 1
            fi
            ;;
        *)
            HEALTH_RESULTS["process"]="unknown"
            return 0
            ;;
    esac
}

# Function to generate health report
generate_health_report() {
    local timestamp
    timestamp=$(date -Iseconds)
    
    cat << EOF
{
  "timestamp": "$timestamp",
  "service_type": "$SERVICE_TYPE",
  "overall_status": "$OVERALL_HEALTH",
  "checks": {
$(
    local first=true
    for check in "${!HEALTH_RESULTS[@]}"; do
        if [[ "$first" == true ]]; then
            first=false
        else
            echo ","
        fi
        echo -n "    \"$check\": \"${HEALTH_RESULTS[$check]}\""
    done
)
  },
  "metadata": {
    "container_id": "${HOSTNAME}",
    "port": "$PORT",
    "nginx_port": "$NGINX_PORT",
    "timeout": "$TIMEOUT",
    "max_retries": "$MAX_RETRIES"
  }
}
EOF
}

# Function to send health metrics (if monitoring is configured)
send_metrics() {
    if [[ -n "${METRICS_ENDPOINT:-}" ]]; then
        log "Sending health metrics to monitoring system..."
        
        local health_report
        health_report=$(generate_health_report)
        
        if curl -s -X POST \
               -H "Content-Type: application/json" \
               -d "$health_report" \
               --max-time 5 \
               "$METRICS_ENDPOINT" >/dev/null 2>&1; then
            log "Health metrics sent successfully"
        else
            log "Failed to send health metrics"
        fi
    fi
}

# Main health check function
main() {
    log "Starting health check for service type: $SERVICE_TYPE"
    
    # System-level checks
    check_process_health
    check_memory_usage
    check_disk_usage
    check_database_health
    
    # Service-specific checks
    case "$SERVICE_TYPE" in
        "backend")
            check_backend_health
            ;;
        "cdn-server")
            check_cdn_health
            ;;
        "website")
            check_website_health
            ;;
        "fullstack")
            check_backend_health
            check_cdn_health
            ;;
        *)
            log "Unknown service type: $SERVICE_TYPE"
            OVERALL_HEALTH="unknown"
            ;;
    esac
    
    # Generate and optionally send health report
    local health_report
    health_report=$(generate_health_report)
    
    log "Health check completed"
    log "Overall health status: $OVERALL_HEALTH"
    
    # Output health report for logging/monitoring
    echo "$health_report"
    
    # Send metrics to monitoring system if configured
    send_metrics
    
    # Exit with appropriate code
    if [[ "$OVERALL_HEALTH" == "healthy" ]]; then
        exit 0
    else
        log "Health check failed"
        exit 1
    fi
}

# Execute main function
main "$@"