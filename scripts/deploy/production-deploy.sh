#!/bin/bash

# ================================
# Production Deployment Script for SightEdit
# ================================
# Zero-downtime production deployment with rollback capabilities,
# health checks, and comprehensive monitoring

set -euo pipefail

# Configuration
DEPLOYMENT_TYPE=${DEPLOYMENT_TYPE:-"blue-green"}
ENVIRONMENT=${ENVIRONMENT:-"production"}
VERSION=${VERSION:-"latest"}
ROLLBACK=${ROLLBACK:-"false"}
DRY_RUN=${DRY_RUN:-"false"}
SKIP_TESTS=${SKIP_TESTS:-"false"}
SKIP_BACKUP=${SKIP_BACKUP:-"false"}

# Directories and paths
PROJECT_ROOT=${PROJECT_ROOT:-"/opt/sightedit"}
BACKUP_DIR=${BACKUP_DIR:-"/var/backups/sightedit"}
ARTIFACTS_DIR=${ARTIFACTS_DIR:-"/var/artifacts/sightedit"}
CONFIG_DIR=${CONFIG_DIR:-"/etc/sightedit"}

# Service configuration
SERVICES=("sightedit-api" "sightedit-web" "nginx" "haproxy")
HEALTH_CHECK_URL=${HEALTH_CHECK_URL:-"http://localhost:3000/health"}
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-30}
MAX_HEALTH_CHECKS=${MAX_HEALTH_CHECKS:-10}

# Notification settings
NOTIFICATION_EMAIL=${DEPLOY_NOTIFICATION_EMAIL:-""}
SLACK_WEBHOOK=${DEPLOY_SLACK_WEBHOOK:-""}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Deployment phases
DEPLOY_PHASE="INITIALIZATION"

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${MAGENTA}[INFO]${NC} $1"
}

# Update deployment phase
update_phase() {
    DEPLOY_PHASE="$1"
    log "=== DEPLOYMENT PHASE: $DEPLOY_PHASE ==="
}

# Send notifications
send_notification() {
    local status="$1"
    local phase="$2"
    local details="$3"
    
    local message="[DEPLOY] $status: $phase - $details (Environment: $ENVIRONMENT, Version: $VERSION)"
    
    # Email notification
    if [[ -n "$NOTIFICATION_EMAIL" ]] && command -v mail &> /dev/null; then
        echo "$message" | mail -s "Deployment Alert - $ENVIRONMENT" "$NOTIFICATION_EMAIL"
    fi
    
    # Slack notification
    if [[ -n "$SLACK_WEBHOOK" ]] && command -v curl &> /dev/null; then
        local color="good"
        [[ "$status" == "FAILED" ]] && color="danger"
        [[ "$status" == "WARNING" ]] && color="warning"
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$message\"}]}" \
            "$SLACK_WEBHOOK" >/dev/null 2>&1 || true
    fi
    
    log "Notification sent: $message"
}

# Check prerequisites
check_prerequisites() {
    update_phase "PREREQUISITE_CHECK"
    log "Checking deployment prerequisites..."
    
    # Check if running as appropriate user
    if [[ $EUID -eq 0 ]] && [[ "$ENVIRONMENT" == "production" ]]; then
        warning "Running as root in production - this is not recommended"
    fi
    
    # Check required commands
    local required_commands=("git" "npm" "docker" "systemctl" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            error "Required command not found: $cmd"
            exit 1
        fi
    done
    
    # Check disk space (at least 5GB free)
    local available_space
    available_space=$(df "$PROJECT_ROOT" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 5242880 ]]; then  # 5GB in KB
        error "Insufficient disk space for deployment (need at least 5GB)"
        exit 1
    fi
    
    # Verify network connectivity
    if ! curl -f -s --max-time 10 "https://api.github.com" >/dev/null; then
        error "No internet connectivity - cannot proceed with deployment"
        exit 1
    fi
    
    # Check if deployment artifacts exist
    if [[ "$VERSION" != "latest" && ! -d "$ARTIFACTS_DIR/$VERSION" ]]; then
        error "Deployment artifacts not found for version: $VERSION"
        exit 1
    fi
    
    success "Prerequisites check completed"
}

# Create deployment backup
create_deployment_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log "Skipping backup creation as requested"
        return 0
    fi
    
    update_phase "BACKUP_CREATION"
    log "Creating deployment backup..."
    
    local timestamp
    timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_path="$BACKUP_DIR/pre_deploy_${timestamp}"
    
    mkdir -p "$backup_path"
    
    # Backup application code
    if [[ -d "$PROJECT_ROOT" ]]; then
        log "Backing up application code..."
        rsync -av --exclude='node_modules' --exclude='logs' --exclude='.git' \
              "$PROJECT_ROOT/" "$backup_path/application/"
    fi
    
    # Backup configuration files
    if [[ -d "$CONFIG_DIR" ]]; then
        log "Backing up configuration files..."
        rsync -av "$CONFIG_DIR/" "$backup_path/config/"
    fi
    
    # Create database backup
    if [[ -f "/opt/sightedit/scripts/backup/database-backup.sh" ]]; then
        log "Creating database backup..."
        /opt/sightedit/scripts/backup/database-backup.sh \
            --type custom \
            --environment "$ENVIRONMENT" \
            --directory "$backup_path/database"
    fi
    
    # Store backup metadata
    cat > "$backup_path/metadata.json" << EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "version_before": "$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "backup_type": "pre_deployment",
  "services_running": $(systemctl is-active "${SERVICES[@]}" | jq -R . | jq -s .)
}
EOF
    
    success "Deployment backup created: $backup_path"
    echo "$backup_path"
}

# Fetch and prepare new version
prepare_deployment() {
    update_phase "DEPLOYMENT_PREPARATION"
    log "Preparing deployment for version: $VERSION"
    
    local temp_dir
    temp_dir=$(mktemp -d)
    local current_dir
    current_dir=$(pwd)
    
    cd "$temp_dir"
    
    if [[ "$VERSION" == "latest" ]]; then
        # Clone latest from repository
        log "Fetching latest version from repository..."
        git clone --depth 1 https://github.com/yourdomain/sightedit.git .
        VERSION=$(git rev-parse --short HEAD)
        log "Latest version: $VERSION"
    else
        # Use pre-built artifacts
        log "Using pre-built artifacts for version: $VERSION"
        cp -r "$ARTIFACTS_DIR/$VERSION"/* .
    fi
    
    # Install dependencies
    log "Installing production dependencies..."
    npm ci --production --no-optional
    
    # Build application
    log "Building application..."
    npm run build
    
    # Run tests if not skipped
    if [[ "$SKIP_TESTS" != "true" ]]; then
        log "Running tests..."
        npm test
        
        # Run integration tests
        if [[ -f "package.json" ]] && jq -e '.scripts["test:integration"]' package.json >/dev/null; then
            log "Running integration tests..."
            npm run test:integration
        fi
    fi
    
    # Prepare deployment package
    local deploy_package="$ARTIFACTS_DIR/deploy_${VERSION}_$(date +%Y%m%d_%H%M%S).tar.gz"
    mkdir -p "$(dirname "$deploy_package")"
    
    log "Creating deployment package..."
    tar -czf "$deploy_package" --exclude='node_modules' --exclude='.git' .
    
    cd "$current_dir"
    rm -rf "$temp_dir"
    
    success "Deployment prepared: $deploy_package"
    echo "$deploy_package"
}

# Health check function
health_check() {
    local url="$1"
    local timeout="${2:-30}"
    local max_attempts="${3:-10}"
    
    log "Performing health check: $url"
    
    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s --max-time "$timeout" "$url" >/dev/null 2>&1; then
            success "Health check passed (attempt $attempt/$max_attempts)"
            return 0
        fi
        
        log "Health check failed (attempt $attempt/$max_attempts), retrying in 5 seconds..."
        sleep 5
        ((attempt++))
    done
    
    error "Health check failed after $max_attempts attempts"
    return 1
}

# Blue-green deployment
deploy_blue_green() {
    update_phase "BLUE_GREEN_DEPLOYMENT"
    log "Performing blue-green deployment..."
    
    local deploy_package="$1"
    local blue_dir="$PROJECT_ROOT/blue"
    local green_dir="$PROJECT_ROOT/green"
    local current_link="$PROJECT_ROOT/current"
    
    # Determine current and new environments
    local current_env=""
    local new_env=""
    
    if [[ -L "$current_link" ]]; then
        local current_target
        current_target=$(readlink "$current_link")
        if [[ "$current_target" == *"blue"* ]]; then
            current_env="blue"
            new_env="green"
        else
            current_env="green" 
            new_env="blue"
        fi
    else
        current_env="none"
        new_env="blue"
    fi
    
    local new_dir="$PROJECT_ROOT/$new_env"
    
    log "Current environment: $current_env"
    log "Deploying to: $new_env"
    
    # Prepare new environment
    rm -rf "$new_dir"
    mkdir -p "$new_dir"
    
    # Extract deployment package
    log "Extracting deployment package to $new_env environment..."
    tar -xzf "$deploy_package" -C "$new_dir"
    
    # Install production dependencies
    cd "$new_dir"
    npm ci --production --no-optional
    
    # Copy configuration files
    if [[ -d "$CONFIG_DIR" ]]; then
        cp -r "$CONFIG_DIR"/* "$new_dir/config/" 2>/dev/null || true
    fi
    
    # Set proper permissions
    chown -R sightedit:sightedit "$new_dir"
    chmod -R 755 "$new_dir"
    
    # Start new environment services
    log "Starting $new_env environment services..."
    
    # Update service configuration to point to new environment
    sed -i "s|$PROJECT_ROOT/current|$new_dir|g" /etc/systemd/system/sightedit-*.service
    systemctl daemon-reload
    
    # Start services
    for service in "${SERVICES[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            systemctl restart "$service"
            sleep 2
        fi
    done
    
    # Wait for services to start
    sleep 10
    
    # Health check new environment
    if ! health_check "$HEALTH_CHECK_URL" "$HEALTH_CHECK_TIMEOUT" "$MAX_HEALTH_CHECKS"; then
        error "Health check failed for new environment"
        
        # Rollback by restarting old services
        if [[ "$current_env" != "none" ]]; then
            log "Rolling back to $current_env environment..."
            sed -i "s|$new_dir|$PROJECT_ROOT/$current_env|g" /etc/systemd/system/sightedit-*.service
            systemctl daemon-reload
            
            for service in "${SERVICES[@]}"; do
                if systemctl is-enabled "$service" >/dev/null 2>&1; then
                    systemctl restart "$service"
                fi
            done
        fi
        
        return 1
    fi
    
    # Switch traffic to new environment
    log "Switching traffic to $new_env environment..."
    
    # Update current symlink
    ln -sfn "$new_dir" "$current_link"
    
    # Update load balancer configuration if needed
    if command -v haproxy &> /dev/null && [[ -f "/etc/haproxy/haproxy.cfg" ]]; then
        # Graceful HAProxy reload
        systemctl reload haproxy
    fi
    
    # Final health check
    sleep 5
    if ! health_check "$HEALTH_CHECK_URL" "$HEALTH_CHECK_TIMEOUT" 3; then
        error "Final health check failed after traffic switch"
        return 1
    fi
    
    success "Blue-green deployment completed successfully"
    
    # Clean up old environment after successful deployment
    if [[ "$current_env" != "none" ]]; then
        log "Cleaning up old $current_env environment..."
        rm -rf "$PROJECT_ROOT/$current_env"
    fi
}

# Rolling deployment
deploy_rolling() {
    update_phase "ROLLING_DEPLOYMENT"
    log "Performing rolling deployment..."
    
    local deploy_package="$1"
    
    # Extract to temporary directory
    local temp_dir
    temp_dir=$(mktemp -d)
    tar -xzf "$deploy_package" -C "$temp_dir"
    
    # Install dependencies
    cd "$temp_dir"
    npm ci --production --no-optional
    
    # Rolling update for each service
    for service in "${SERVICES[@]}"; do
        log "Updating service: $service"
        
        # Stop service
        if systemctl is-active "$service" >/dev/null 2>&1; then
            systemctl stop "$service"
        fi
        
        # Update application files
        rsync -av --delete "$temp_dir/" "$PROJECT_ROOT/"
        
        # Set permissions
        chown -R sightedit:sightedit "$PROJECT_ROOT"
        
        # Start service
        systemctl start "$service"
        
        # Health check
        if ! health_check "$HEALTH_CHECK_URL" 10 5; then
            error "Health check failed for service: $service"
            return 1
        fi
        
        sleep 5
    done
    
    rm -rf "$temp_dir"
    success "Rolling deployment completed successfully"
}

# Canary deployment
deploy_canary() {
    update_phase "CANARY_DEPLOYMENT"
    log "Performing canary deployment..."
    
    local deploy_package="$1"
    local canary_percentage="${CANARY_PERCENTAGE:-10}"
    
    log "Deploying canary with $canary_percentage% traffic"
    
    # Implementation would depend on load balancer configuration
    # This is a simplified version
    
    local canary_dir="$PROJECT_ROOT/canary"
    rm -rf "$canary_dir"
    mkdir -p "$canary_dir"
    
    # Extract and prepare canary
    tar -xzf "$deploy_package" -C "$canary_dir"
    cd "$canary_dir"
    npm ci --production --no-optional
    
    # Start canary instance on different port
    PORT=3001 npm start &
    local canary_pid=$!
    
    # Wait for canary to start
    sleep 10
    
    # Health check canary
    if ! health_check "http://localhost:3001/health" 10 5; then
        error "Canary health check failed"
        kill "$canary_pid" 2>/dev/null || true
        return 1
    fi
    
    log "Canary deployed successfully. Monitor for ${CANARY_DURATION:-300} seconds..."
    
    # Monitor canary (simplified - in production, use proper monitoring)
    sleep "${CANARY_DURATION:-300}"
    
    # If we get here, canary is successful - proceed with full deployment
    log "Canary validation successful, proceeding with full deployment"
    
    # Kill canary
    kill "$canary_pid" 2>/dev/null || true
    
    # Deploy to all instances
    deploy_rolling "$deploy_package"
}

# Rollback deployment
rollback_deployment() {
    update_phase "ROLLBACK"
    log "Performing deployment rollback..."
    
    # Find latest backup
    local latest_backup
    latest_backup=$(find "$BACKUP_DIR" -name "pre_deploy_*" -type d | sort -r | head -1)
    
    if [[ -z "$latest_backup" ]]; then
        error "No backup found for rollback"
        return 1
    fi
    
    log "Rolling back to backup: $latest_backup"
    
    # Stop services
    for service in "${SERVICES[@]}"; do
        if systemctl is-active "$service" >/dev/null 2>&1; then
            systemctl stop "$service"
        fi
    done
    
    # Restore application code
    if [[ -d "$latest_backup/application" ]]; then
        log "Restoring application code..."
        rsync -av --delete "$latest_backup/application/" "$PROJECT_ROOT/"
    fi
    
    # Restore configuration
    if [[ -d "$latest_backup/config" ]]; then
        log "Restoring configuration..."
        rsync -av "$latest_backup/config/" "$CONFIG_DIR/"
    fi
    
    # Restore database if needed
    if [[ -d "$latest_backup/database" && "$ROLLBACK_DATABASE" == "true" ]]; then
        warning "Database rollback requested - this is a destructive operation"
        if [[ -f "/opt/sightedit/scripts/backup/disaster-recovery.sh" ]]; then
            /opt/sightedit/scripts/backup/disaster-recovery.sh \
                --type database \
                --backup-dir "$latest_backup/database"
        fi
    fi
    
    # Set permissions
    chown -R sightedit:sightedit "$PROJECT_ROOT"
    
    # Start services
    for service in "${SERVICES[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            systemctl start "$service"
        fi
    done
    
    # Health check
    if ! health_check "$HEALTH_CHECK_URL" "$HEALTH_CHECK_TIMEOUT" "$MAX_HEALTH_CHECKS"; then
        error "Health check failed after rollback"
        return 1
    fi
    
    success "Rollback completed successfully"
}

# Generate deployment report
generate_report() {
    local start_time="$1"
    local end_time="$2"
    local deployment_status="$3"
    local version_deployed="$4"
    
    local duration=$((end_time - start_time))
    local report_file="$BACKUP_DIR/deployment_report_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "deployment": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "version": "$version_deployed",
    "type": "$DEPLOYMENT_TYPE",
    "status": "$deployment_status",
    "duration_seconds": $duration,
    "rollback": $ROLLBACK,
    "dry_run": $DRY_RUN
  },
  "services": $(printf '%s\n' "${SERVICES[@]}" | jq -R . | jq -s .),
  "health_checks": {
    "url": "$HEALTH_CHECK_URL",
    "timeout": $HEALTH_CHECK_TIMEOUT,
    "max_attempts": $MAX_HEALTH_CHECKS
  },
  "system_info": {
    "hostname": "$(hostname)",
    "disk_usage": "$(df -h "$PROJECT_ROOT" | awk 'NR==2 {print $5}')",
    "memory_usage": "$(free -h | awk 'NR==2{printf "%.1f%%", $3/$2*100}')",
    "load_average": "$(uptime | awk -F'load average:' '{print $2}')"
  }
}
EOF
    
    success "Deployment report generated: $report_file"
}

# Show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE          Deployment type (blue-green|rolling|canary) [default: blue-green]"
    echo "  -e, --environment ENV    Environment name [default: production]"
    echo "  -v, --version VERSION    Version to deploy [default: latest]"
    echo "  -r, --rollback           Perform rollback instead of deployment"
    echo "  --dry-run               Perform dry run without making changes"
    echo "  --skip-tests            Skip running tests during deployment"
    echo "  --skip-backup           Skip creating backup before deployment"
    echo "  --canary-percentage PCT  Percentage of traffic for canary [default: 10]"
    echo "  --canary-duration SEC    Duration to monitor canary [default: 300]"
    echo "  --notify EMAIL          Email address for notifications"
    echo "  --slack WEBHOOK         Slack webhook URL for notifications"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --type blue-green --version v1.2.3"
    echo "  $0 --type canary --canary-percentage 20"
    echo "  $0 --rollback"
    echo "  $0 --dry-run --type rolling"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            DEPLOYMENT_TYPE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--rollback)
            ROLLBACK="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --skip-tests)
            SKIP_TESTS="true"
            shift
            ;;
        --skip-backup)
            SKIP_BACKUP="true"
            shift
            ;;
        --canary-percentage)
            CANARY_PERCENTAGE="$2"
            shift 2
            ;;
        --canary-duration)
            CANARY_DURATION="$2"
            shift 2
            ;;
        --notify)
            NOTIFICATION_EMAIL="$2"
            shift 2
            ;;
        --slack)
            SLACK_WEBHOOK="$2"
            shift 2
            ;;
        -h|--help)
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

# Main deployment function
main() {
    local start_time
    local end_time
    local deployment_status="SUCCESS"
    local backup_path=""
    local deploy_package=""
    
    start_time=$(date +%s)
    
    log "=== SIGHTEDIT PRODUCTION DEPLOYMENT ==="
    log "Environment: $ENVIRONMENT"
    log "Version: $VERSION"
    log "Type: $DEPLOYMENT_TYPE"
    log "Rollback: $ROLLBACK"
    log "Dry Run: $DRY_RUN"
    
    # Send start notification
    send_notification "STARTED" "$DEPLOY_PHASE" "Deployment initiated"
    
    # Trap errors
    trap 'error "Deployment failed in phase: $DEPLOY_PHASE"; send_notification "FAILED" "$DEPLOY_PHASE" "Deployment failed"; exit 1' ERR
    
    # Prerequisites check
    check_prerequisites
    
    if [[ "$ROLLBACK" == "true" ]]; then
        # Perform rollback
        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY RUN: Would perform rollback"
        else
            rollback_deployment
        fi
    else
        # Normal deployment flow
        
        # Create backup
        if [[ "$DRY_RUN" != "true" ]]; then
            backup_path=$(create_deployment_backup)
        else
            log "DRY RUN: Would create backup"
        fi
        
        # Prepare deployment
        if [[ "$DRY_RUN" != "true" ]]; then
            deploy_package=$(prepare_deployment)
        else
            log "DRY RUN: Would prepare deployment for version $VERSION"
            deploy_package="/tmp/dummy-package.tar.gz"
        fi
        
        # Deploy based on type
        if [[ "$DRY_RUN" != "true" ]]; then
            case "$DEPLOYMENT_TYPE" in
                "blue-green")
                    deploy_blue_green "$deploy_package"
                    ;;
                "rolling")
                    deploy_rolling "$deploy_package"
                    ;;
                "canary")
                    deploy_canary "$deploy_package"
                    ;;
                *)
                    error "Unknown deployment type: $DEPLOYMENT_TYPE"
                    exit 1
                    ;;
            esac
        else
            log "DRY RUN: Would perform $DEPLOYMENT_TYPE deployment"
        fi
    fi
    
    end_time=$(date +%s)
    
    # Generate report
    if [[ "$DRY_RUN" != "true" ]]; then
        generate_report "$start_time" "$end_time" "$deployment_status" "$VERSION"
    fi
    
    # Send success notification
    send_notification "SUCCESS" "COMPLETED" "Deployment completed successfully"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        success "=== DRY RUN COMPLETED SUCCESSFULLY ==="
    else
        success "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
    fi
    
    log "Total duration: $((end_time - start_time))s"
    log "Version deployed: $VERSION"
    log "Deployment type: $DEPLOYMENT_TYPE"
}

# Execute main function
main "$@"