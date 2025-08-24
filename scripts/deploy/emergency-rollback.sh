#!/bin/bash

# ================================
# SightEdit Emergency Rollback Script
# ================================
# Fast emergency rollback system for critical production issues
# Supports immediate rollback without validation delays

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${1:-production}"
ROLLBACK_TARGET="${2:-previous}" # previous, version, backup
ROLLBACK_VALUE="${3:-}"          # version number or backup file
FORCE_ROLLBACK="${FORCE_ROLLBACK:-false}"
EMERGENCY_MODE="${EMERGENCY_MODE:-true}"
SKIP_VALIDATION="${SKIP_VALIDATION:-true}"
NOTIFICATION_PRIORITY="${NOTIFICATION_PRIORITY:-critical}"

# Emergency settings for faster rollback
if [[ "$EMERGENCY_MODE" == "true" ]]; then
    HEALTH_CHECK_TIMEOUT=60
    TRAFFIC_SWITCH_DELAY=5
    VERIFICATION_TIMEOUT=30
else
    HEALTH_CHECK_TIMEOUT=120
    TRAFFIC_SWITCH_DELAY=30
    VERIFICATION_TIMEOUT=60
fi

# Load environment configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# State tracking
ROLLBACK_STATE_FILE="/tmp/sightedit-emergency-rollback-state"
ROLLBACK_LOG_FILE="/var/log/sightedit/emergency-rollback-$(date +%Y%m%d-%H%M%S).log"
INCIDENT_ID="INC-$(date +%Y%m%d%H%M%S)"

# ================================
# Logging and Notifications
# ================================

mkdir -p "$(dirname "$ROLLBACK_LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [EMERGENCY-ROLLBACK] [$level] $*" | tee -a "$ROLLBACK_LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }
log_critical() { log "CRITICAL" "$@"; }

send_emergency_notification() {
    local status=$1
    local message=$2
    local details="${3:-}"
    
    log_critical "EMERGENCY: $status - $message"
    
    # Immediate console alert
    echo ""
    echo "================================"
    echo "🚨 EMERGENCY ROLLBACK ALERT 🚨"
    echo "================================"
    echo "Incident ID: $INCIDENT_ID"
    echo "Status: $status"
    echo "Message: $message"
    echo "Environment: $ENVIRONMENT"
    echo "Timestamp: $(date)"
    if [[ -n "$details" ]]; then
        echo "Details: $details"
    fi
    echo "================================"
    echo ""
    
    # Slack critical notification
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"username\": \"SightEdit Emergency Rollback\",
                \"icon_emoji\": \":rotating_light:\",
                \"attachments\": [{
                    \"color\": \"danger\",
                    \"title\": \"🚨 EMERGENCY ROLLBACK: $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Incident ID\", \"value\": \"$INCIDENT_ID\", \"short\": true},
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Target\", \"value\": \"$ROLLBACK_TARGET\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date)\", \"short\": true}
                    ],
                    \"footer\": \"$details\"
                }]
            }" \
            "$SLACK_WEBHOOK_URL" &
    fi
    
    # PagerDuty critical alert
    if [[ -n "${PAGERDUTY_INTEGRATION_KEY:-}" ]]; then
        curl -X POST -H "Content-Type: application/json" \
            -d "{
                \"routing_key\": \"$PAGERDUTY_INTEGRATION_KEY\",
                \"event_action\": \"trigger\",
                \"dedup_key\": \"$INCIDENT_ID\",
                \"payload\": {
                    \"summary\": \"SightEdit Emergency Rollback: $status\",
                    \"severity\": \"critical\",
                    \"source\": \"emergency-rollback-system\",
                    \"component\": \"deployment\",
                    \"group\": \"sightedit-$ENVIRONMENT\",
                    \"class\": \"deployment-failure\",
                    \"custom_details\": {
                        \"incident_id\": \"$INCIDENT_ID\",
                        \"environment\": \"$ENVIRONMENT\",
                        \"rollback_target\": \"$ROLLBACK_TARGET\",
                        \"message\": \"$message\",
                        \"details\": \"$details\"
                    }
                }
            }" \
            "https://events.pagerduty.com/v2/enqueue" &
    fi
    
    # Email notification to emergency contacts
    if [[ -n "${EMERGENCY_CONTACTS:-}" ]] && command -v mail >/dev/null; then
        echo -e "EMERGENCY ROLLBACK ALERT\\n\\nIncident ID: $INCIDENT_ID\\nStatus: $status\\nMessage: $message\\nEnvironment: $ENVIRONMENT\\nTimestamp: $(date)\\n\\nDetails: $details\\n\\nLog file: $ROLLBACK_LOG_FILE" | \
            mail -s "🚨 EMERGENCY: SightEdit Rollback - $status" "$EMERGENCY_CONTACTS" &
    fi
    
    # SMS alerts if configured (via Twilio or similar)
    if [[ -n "${SMS_ALERT_URL:-}" && "$NOTIFICATION_PRIORITY" == "critical" ]]; then
        curl -X POST "$SMS_ALERT_URL" \
            -d "message=EMERGENCY: SightEdit $ENVIRONMENT rollback $status - $INCIDENT_ID" &
    fi
}

# ================================
# Error Handling
# ================================

handle_rollback_failure() {
    local exit_code=$?
    local line_number=$1
    
    log_critical "Emergency rollback failed at line $line_number with exit code $exit_code"
    echo "FAILED" > "$ROLLBACK_STATE_FILE"
    
    send_emergency_notification "ROLLBACK FAILED" \
        "Emergency rollback procedure failed" \
        "Failed at line $line_number with exit code $exit_code. Manual intervention required immediately."
    
    # Try to collect diagnostic information
    collect_failure_diagnostics
    
    exit $exit_code
}

trap 'handle_rollback_failure ${LINENO}' ERR

collect_failure_diagnostics() {
    log_info "Collecting failure diagnostics"
    
    local diag_file="/tmp/sightedit-rollback-diagnostics-$(date +%s).txt"
    
    {
        echo "=== Emergency Rollback Failure Diagnostics ==="
        echo "Incident ID: $INCIDENT_ID"
        echo "Timestamp: $(date)"
        echo "Environment: $ENVIRONMENT"
        echo ""
        
        echo "=== Docker Container Status ==="
        docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep sightedit || true
        echo ""
        
        echo "=== Recent Container Logs (last 50 lines) ==="
        for container in $(docker ps --format "{{.Names}}" | grep sightedit | head -3); do
            echo "--- $container ---"
            docker logs --tail 50 "$container" 2>&1 || true
            echo ""
        done
        
        echo "=== Load Balancer Status ==="
        curl -s "http://localhost:8080/api/http/routers" | jq . 2>/dev/null || echo "Load balancer API not accessible"
        echo ""
        
        echo "=== System Resources ==="
        df -h | grep -E "(Filesystem|/var|/tmp)" || true
        echo ""
        free -h || true
        echo ""
        
        echo "=== Network Connectivity ==="
        nc -zv localhost 3000 2>&1 || true
        nc -zv localhost 5432 2>&1 || true
        nc -zv localhost 6379 2>&1 || true
        
    } > "$diag_file" 2>&1
    
    log_info "Diagnostics collected in: $diag_file"
    
    # Send diagnostics if possible
    if [[ -n "${EMERGENCY_CONTACTS:-}" ]] && command -v mail >/dev/null; then
        mail -s "SightEdit Rollback Failure Diagnostics - $INCIDENT_ID" -a "$diag_file" "$EMERGENCY_CONTACTS" < /dev/null || true
    fi
}

# ================================
# Rollback Decision Logic
# ================================

determine_rollback_strategy() {
    log_info "Determining optimal rollback strategy for target: $ROLLBACK_TARGET"
    
    case "$ROLLBACK_TARGET" in
        previous)
            rollback_to_previous_version
            ;;
        version)
            if [[ -z "$ROLLBACK_VALUE" ]]; then
                log_error "Version rollback requires ROLLBACK_VALUE to be specified"
                exit 1
            fi
            rollback_to_specific_version "$ROLLBACK_VALUE"
            ;;
        backup)
            if [[ -z "$ROLLBACK_VALUE" ]]; then
                log_error "Backup rollback requires ROLLBACK_VALUE (backup file path)"
                exit 1
            fi
            rollback_from_backup "$ROLLBACK_VALUE"
            ;;
        *)
            log_error "Unknown rollback target: $ROLLBACK_TARGET"
            exit 1
            ;;
    esac
}

# ================================
# Version Rollback Functions
# ================================

rollback_to_previous_version() {
    log_info "Initiating rollback to previous version"
    
    # Find previous version
    local previous_version=""
    if [[ -f "/tmp/sightedit-previous-version" ]]; then
        previous_version=$(cat "/tmp/sightedit-previous-version")
    else
        # Try to determine from Docker images
        previous_version=$(docker images sightedit/web --format "{{.Tag}}" | grep -v "latest" | head -2 | tail -1 || echo "")
    fi
    
    if [[ -z "$previous_version" ]]; then
        log_error "Cannot determine previous version for rollback"
        return 1
    fi
    
    log_info "Rolling back to previous version: $previous_version"
    rollback_to_specific_version "$previous_version"
}

rollback_to_specific_version() {
    local target_version="$1"
    
    log_info "Rolling back to specific version: $target_version"
    echo "ROLLING_BACK_TO_VERSION:$target_version" > "$ROLLBACK_STATE_FILE"
    
    # Verify target image exists
    if ! docker pull "sightedit/web:$target_version"; then
        log_error "Cannot pull target version image: $target_version"
        return 1
    fi
    
    # Determine current deployment strategy and rollback accordingly
    local deployment_strategy=$(determine_current_deployment_strategy)
    
    case "$deployment_strategy" in
        blue-green)
            emergency_blue_green_rollback "$target_version"
            ;;
        rolling)
            emergency_rolling_rollback "$target_version"
            ;;
        canary)
            emergency_canary_rollback "$target_version"
            ;;
        *)
            emergency_direct_rollback "$target_version"
            ;;
    esac
}

determine_current_deployment_strategy() {
    # Check if blue-green setup exists
    if docker ps --format "{{.Names}}" | grep -q "sightedit-web-blue\|sightedit-web-green"; then
        echo "blue-green"
        return
    fi
    
    # Check if canary setup exists
    if docker ps --format "{{.Names}}" | grep -q "sightedit-web-canary"; then
        echo "canary"
        return
    fi
    
    # Check if multiple web instances exist (rolling)
    local web_instances=$(docker ps --format "{{.Names}}" | grep "sightedit-web" | wc -l)
    if [[ $web_instances -gt 1 ]]; then
        echo "rolling"
        return
    fi
    
    echo "direct"
}

# ================================
# Emergency Rollback Implementations
# ================================

emergency_blue_green_rollback() {
    local target_version="$1"
    
    log_info "Executing emergency blue-green rollback to version: $target_version"
    
    # Determine current active slot
    local active_slot=""
    if [[ -f "/tmp/sightedit-active-slot" ]]; then
        active_slot=$(cat "/tmp/sightedit-active-slot")
    else
        # Determine by checking traffic routing
        if curl -s "http://localhost:8080/api/http/routers" | grep -q "web-green"; then
            active_slot="green"
        else
            active_slot="blue"
        fi
    fi
    
    local rollback_slot="blue"
    if [[ "$active_slot" == "blue" ]]; then
        rollback_slot="green"
    fi
    
    log_info "Active slot: $active_slot, Rollback slot: $rollback_slot"
    
    # Prepare rollback slot with target version
    export VERSION="$target_version"
    
    # Stop rollback slot
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop "web-$rollback_slot" || true
    
    # Start rollback slot with target version
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d "web-$rollback_slot"
    
    # Quick health check on rollback slot
    local rollback_port=$(if [[ "$rollback_slot" == "blue" ]]; then echo "3002"; else echo "3001"; fi)
    if ! wait_for_service_health "$rollback_slot" "http://localhost:$rollback_port/health" 60; then
        log_error "Rollback slot health check failed"
        return 1
    fi
    
    # Switch traffic immediately
    log_info "Switching traffic to rollback slot: $rollback_slot"
    switch_traffic_immediately "$rollback_slot"
    
    # Stop previous active slot
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop "web-$active_slot"
    
    # Update active slot tracking
    echo "$rollback_slot" > "/tmp/sightedit-active-slot"
    
    log_success "Emergency blue-green rollback completed"
}

emergency_rolling_rollback() {
    local target_version="$1"
    
    log_info "Executing emergency rolling rollback to version: $target_version"
    
    export VERSION="$target_version"
    
    # Get list of web services
    local services=("web-blue" "web-green")
    
    # Update all services simultaneously for emergency rollback
    for service in "${services[@]}"; do
        log_info "Emergency updating service: $service"
        
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            stop "$service" || true
        
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            up -d "$service" &
    done
    
    # Wait for all services to start
    wait
    sleep 10
    
    # Quick health check on services
    for service in "${services[@]}"; do
        local port=$(if [[ "$service" == "web-blue" ]]; then echo "3002"; else echo "3001"; fi)
        if ! wait_for_service_health "$service" "http://localhost:$port/health" 30; then
            log_warn "Service $service health check failed during rollback"
        fi
    done
    
    log_success "Emergency rolling rollback completed"
}

emergency_canary_rollback() {
    local target_version="$1"
    
    log_info "Executing emergency canary rollback to version: $target_version"
    
    # Remove canary from load balancer immediately
    remove_canary_from_load_balancer
    
    # Stop canary service
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        stop web-canary || true
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.canary.yml" \
        rm -f web-canary || true
    
    # Update main services to target version
    export VERSION="$target_version"
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d web-blue web-green
    
    log_success "Emergency canary rollback completed"
}

emergency_direct_rollback() {
    local target_version="$1"
    
    log_info "Executing emergency direct rollback to version: $target_version"
    
    export VERSION="$target_version"
    
    # Find running web services
    local web_services=$(docker ps --format "{{.Names}}" | grep "sightedit-web" || echo "")
    
    if [[ -z "$web_services" ]]; then
        log_error "No running web services found"
        return 1
    fi
    
    # Update services with target version
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d
    
    log_success "Emergency direct rollback completed"
}

# ================================
# Database Rollback
# ================================

rollback_from_backup() {
    local backup_file="$1"
    
    log_info "Initiating database rollback from backup: $backup_file"
    echo "ROLLING_BACK_FROM_BACKUP:$backup_file" > "$ROLLBACK_STATE_FILE"
    
    if [[ ! -f "$backup_file" ]]; then
        log_error "Backup file not found: $backup_file"
        return 1
    fi
    
    # This is a destructive operation, require confirmation unless forced
    if [[ "$FORCE_ROLLBACK" != "true" && "$EMERGENCY_MODE" != "true" ]]; then
        echo "WARNING: Database rollback is destructive and will lose all data since backup."
        read -p "Are you sure you want to proceed? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_info "Database rollback cancelled by user"
            return 1
        fi
    fi
    
    send_emergency_notification "DATABASE ROLLBACK STARTING" \
        "Critical: Starting database rollback from backup" \
        "Backup file: $backup_file"
    
    # Create emergency backup before rollback
    local emergency_backup="/var/backups/postgresql/emergency-pre-rollback-$(date +%Y%m%d-%H%M%S).sql"
    mkdir -p "$(dirname "$emergency_backup")"
    
    log_info "Creating emergency backup before database rollback"
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        pg_dump -U "$DB_USER" -d "$DB_NAME" > "$emergency_backup"; then
        log_warn "Failed to create emergency backup, proceeding with rollback"
    else
        log_info "Emergency backup created: $emergency_backup"
    fi
    
    # Stop application services to prevent new database connections
    log_info "Stopping application services"
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        stop web-blue web-green || true
    
    # Terminate active database connections
    log_info "Terminating active database connections"
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "postgres" -c "
            SELECT pg_terminate_backend(pid) 
            FROM pg_stat_activity 
            WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" || true
    
    # Restore from backup
    log_info "Restoring database from backup"
    if [[ "$backup_file" == *.gz ]]; then
        gunzip -c "$backup_file" | docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            exec -T postgres-primary \
            psql -U "$DB_USER" -d "$DB_NAME"
    else
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            exec -T postgres-primary \
            psql -U "$DB_USER" -d "$DB_NAME" < "$backup_file"
    fi
    
    # Restart application services
    log_info "Restarting application services"
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        up -d web-blue web-green
    
    send_emergency_notification "DATABASE ROLLBACK COMPLETED" \
        "Database rollback from backup completed successfully" \
        "Backup file: $backup_file. Emergency backup: $emergency_backup"
    
    log_success "Database rollback from backup completed"
}

# ================================
# Traffic Management
# ================================

switch_traffic_immediately() {
    local target_slot="$1"
    
    log_info "Switching traffic immediately to slot: $target_slot"
    
    # Create immediate traffic switch configuration
    local lb_config_dir="$PROJECT_ROOT/config/traefik"
    mkdir -p "$lb_config_dir"
    
    cat > "$lb_config_dir/emergency-routing.yml" <<EOF
http:
  routers:
    sightedit-emergency:
      rule: "Host(\`$DOMAIN\`)"
      service: sightedit-emergency-$target_slot
      priority: 1000
      tls:
        certResolver: letsencrypt
  
  services:
    sightedit-emergency-$target_slot:
      loadBalancer:
        servers:
          - url: "http://web-$target_slot:3000"
        healthCheck:
          path: "/health"
          interval: "5s"
          timeout: "3s"
EOF
    
    # Signal Traefik to reload configuration
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null || true
    
    # Wait minimal time for traffic switch
    sleep "$TRAFFIC_SWITCH_DELAY"
    
    log_success "Traffic switch completed"
}

remove_canary_from_load_balancer() {
    log_info "Removing canary from load balancer"
    
    local lb_config_dir="$PROJECT_ROOT/config/traefik"
    
    cat > "$lb_config_dir/emergency-routing.yml" <<EOF
http:
  routers:
    sightedit-main:
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
    
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec traefik sh -c "kill -USR1 1" 2>/dev/null || true
    
    sleep 5
    log_success "Canary removed from load balancer"
}

# ================================
# Health Validation
# ================================

wait_for_service_health() {
    local service_name="$1"
    local health_url="$2"
    local timeout="${3:-$HEALTH_CHECK_TIMEOUT}"
    
    log_info "Waiting for service health: $service_name"
    
    local start_time=$(date +%s)
    local end_time=$((start_time + timeout))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -f -s -m 5 "$health_url" >/dev/null 2>&1; then
            local elapsed=$(($(date +%s) - start_time))
            log_success "Service $service_name is healthy (${elapsed}s)"
            return 0
        fi
        
        sleep 2
    done
    
    log_error "Service $service_name health check timed out after ${timeout}s"
    return 1
}

verify_rollback_success() {
    log_info "Verifying rollback success"
    
    if [[ "$SKIP_VALIDATION" == "true" ]]; then
        log_info "Skipping detailed validation (SKIP_VALIDATION=true)"
        return 0
    fi
    
    # Quick external health check
    if curl -f -s -m "$VERIFICATION_TIMEOUT" "https://$DOMAIN/health" >/dev/null 2>&1; then
        log_success "External health check passed"
    else
        log_error "External health check failed"
        return 1
    fi
    
    # Quick API check
    if curl -f -s -m 10 "https://$DOMAIN/api/sightedit/health" >/dev/null 2>&1; then
        log_success "API health check passed"
    else
        log_warn "API health check failed (non-critical in emergency mode)"
    fi
    
    return 0
}

# ================================
# Main Emergency Rollback Function
# ================================

main() {
    log_info "=== EMERGENCY ROLLBACK INITIATED ==="
    log_info "Incident ID: $INCIDENT_ID"
    log_info "Environment: $ENVIRONMENT"
    log_info "Target: $ROLLBACK_TARGET ($ROLLBACK_VALUE)"
    log_info "Emergency Mode: $EMERGENCY_MODE"
    log_info "Force: $FORCE_ROLLBACK"
    
    echo "INITIATED" > "$ROLLBACK_STATE_FILE"
    
    send_emergency_notification "ROLLBACK INITIATED" \
        "Emergency rollback procedure started" \
        "Target: $ROLLBACK_TARGET, Emergency Mode: $EMERGENCY_MODE"
    
    # Record rollback start time
    local start_time=$(date +%s)
    
    # Execute rollback strategy
    echo "IN_PROGRESS" > "$ROLLBACK_STATE_FILE"
    
    if determine_rollback_strategy; then
        echo "COMPLETED" > "$ROLLBACK_STATE_FILE"
        
        # Verify rollback success
        if verify_rollback_success; then
            local end_time=$(date +%s)
            local duration=$((end_time - start_time))
            
            send_emergency_notification "ROLLBACK SUCCESS" \
                "Emergency rollback completed successfully in ${duration}s" \
                "Services are now running the rollback target. Incident resolved."
            
            log_success "=== EMERGENCY ROLLBACK COMPLETED SUCCESSFULLY ==="
            log_success "Duration: ${duration} seconds"
            log_success "Incident ID: $INCIDENT_ID"
            
        else
            echo "VERIFICATION_FAILED" > "$ROLLBACK_STATE_FILE"
            
            send_emergency_notification "ROLLBACK VERIFICATION FAILED" \
                "Rollback completed but verification failed" \
                "Manual verification required. Check system status immediately."
            
            log_error "Rollback completed but verification failed"
            exit 1
        fi
    else
        echo "FAILED" > "$ROLLBACK_STATE_FILE"
        
        send_emergency_notification "ROLLBACK FAILED" \
            "Emergency rollback procedure failed" \
            "Critical: Manual intervention required immediately."
        
        log_critical "Emergency rollback failed"
        exit 1
    fi
}

# ================================
# Command Line Interface
# ================================

show_usage() {
    echo "Usage: $0 [ENVIRONMENT] [ROLLBACK_TARGET] [ROLLBACK_VALUE]"
    echo ""
    echo "Arguments:"
    echo "  ENVIRONMENT      Target environment (default: production)"
    echo "  ROLLBACK_TARGET  Rollback target type: previous, version, backup (default: previous)"
    echo "  ROLLBACK_VALUE   Version number for 'version' target, backup file for 'backup' target"
    echo ""
    echo "Environment Variables:"
    echo "  FORCE_ROLLBACK         Force rollback without confirmation (default: false)"
    echo "  EMERGENCY_MODE         Enable emergency mode for faster rollback (default: true)"
    echo "  SKIP_VALIDATION        Skip detailed validation checks (default: true)"
    echo "  NOTIFICATION_PRIORITY  Notification priority: normal, critical (default: critical)"
    echo ""
    echo "Examples:"
    echo "  $0 production previous"
    echo "  $0 production version v1.2.0"
    echo "  $0 production backup /var/backups/db-backup.sql.gz"
    echo "  FORCE_ROLLBACK=true $0 production previous"
    echo ""
    echo "Emergency Contacts Configuration:"
    echo "  EMERGENCY_CONTACTS     Emergency email contacts"
    echo "  SLACK_WEBHOOK_URL      Slack webhook for notifications"
    echo "  PAGERDUTY_INTEGRATION_KEY  PagerDuty integration key"
    echo "  SMS_ALERT_URL          SMS alert webhook URL"
}

# Validate environment for production
if [[ "$ENVIRONMENT" == "production" && "$FORCE_ROLLBACK" != "true" ]]; then
    echo "WARNING: This is an emergency rollback for PRODUCTION environment."
    echo "This action is irreversible and will immediately affect live traffic."
    echo ""
    echo "Incident ID: $INCIDENT_ID"
    echo "Target: $ROLLBACK_TARGET ($ROLLBACK_VALUE)"
    echo ""
    read -p "Are you absolutely sure you want to proceed? (type 'EMERGENCY' to confirm): " -r
    if [[ "$REPLY" != "EMERGENCY" ]]; then
        echo "Emergency rollback cancelled."
        exit 1
    fi
fi

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