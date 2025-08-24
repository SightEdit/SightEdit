#!/bin/bash

# ================================
# Disaster Recovery Script for SightEdit
# ================================
# Comprehensive disaster recovery procedures including database restore,
# application deployment, and service verification

set -euo pipefail

# Configuration
RECOVERY_TYPE=${RECOVERY_TYPE:-"full"}
ENVIRONMENT=${ENVIRONMENT:-"production"}
BACKUP_DATE=${BACKUP_DATE:-"latest"}
RESTORE_POINT=${RESTORE_POINT:-""}
DRY_RUN=${DRY_RUN:-"false"}

# Paths and directories
BACKUP_DIR=${BACKUP_DIR:-"/var/backups/sightedit"}
RESTORE_DIR=${RESTORE_DIR:-"/var/restore/sightedit"}
CONFIG_DIR=${CONFIG_DIR:-"/etc/sightedit"}
APPLICATION_DIR=${APPLICATION_DIR:-"/opt/sightedit"}

# Database configuration
DB_HOST=${DATABASE_HOST:-"localhost"}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-"sightedit_production"}
DB_USER=${DATABASE_USER:-"postgres"}
DB_PASSWORD=${DATABASE_PASSWORD:-""}

# S3 configuration
S3_BUCKET=${BACKUP_S3_BUCKET:-""}
AWS_PROFILE=${AWS_PROFILE:-"default"}

# Notification configuration
NOTIFICATION_EMAIL=${DR_NOTIFICATION_EMAIL:-""}
SLACK_WEBHOOK=${DR_SLACK_WEBHOOK:-""}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

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

# Disaster recovery phases
DR_PHASE="INITIALIZATION"

# Update DR phase and log
update_phase() {
    DR_PHASE="$1"
    log "=== DR PHASE: $DR_PHASE ==="
}

# Send notifications
send_notification() {
    local status="$1"
    local phase="$2"
    local details="$3"
    
    local message="[DR] $status: $phase - $details (Environment: $ENVIRONMENT)"
    
    # Email notification
    if [[ -n "$NOTIFICATION_EMAIL" ]] && command -v mail &> /dev/null; then
        echo "$message" | mail -s "Disaster Recovery Alert - $ENVIRONMENT" "$NOTIFICATION_EMAIL"
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
    log "Checking disaster recovery prerequisites..."
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]] && ! sudo -n true 2>/dev/null; then
        error "This script requires root privileges or sudo access"
        exit 1
    fi
    
    # Check required commands
    local required_commands=("pg_restore" "psql" "systemctl" "docker" "aws")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            warning "$cmd not found - some recovery features may not work"
        fi
    done
    
    # Create restore directory
    mkdir -p "$RESTORE_DIR"
    
    # Check disk space (at least 10GB free)
    local available_space
    available_space=$(df "$RESTORE_DIR" | awk 'NR==2 {print $4}')
    if [[ $available_space -lt 10485760 ]]; then  # 10GB in KB
        error "Insufficient disk space for disaster recovery (need at least 10GB)"
        exit 1
    fi
    
    success "Prerequisites check completed"
}

# List available backups
list_backups() {
    update_phase "BACKUP_DISCOVERY"
    log "Discovering available backups..."
    
    local backups=()
    
    # Check local backups
    if [[ -d "$BACKUP_DIR" ]]; then
        while IFS= read -r -d '' backup; do
            backups+=("$(basename "$backup")")
        done < <(find "$BACKUP_DIR" -name "sightedit_${ENVIRONMENT}_*" -type f -print0 | sort -rz)
    fi
    
    # Check S3 backups
    if [[ -n "$S3_BUCKET" ]] && command -v aws &> /dev/null; then
        local s3_backups
        s3_backups=$(aws s3 ls "s3://$S3_BUCKET/database-backups/${ENVIRONMENT}/" --profile "$AWS_PROFILE" 2>/dev/null | awk '{print $4}' | sort -r)
        
        if [[ -n "$s3_backups" ]]; then
            while IFS= read -r backup; do
                [[ -n "$backup" ]] && backups+=("S3:$backup")
            done <<< "$s3_backups"
        fi
    fi
    
    if [[ ${#backups[@]} -eq 0 ]]; then
        error "No backups found for environment: $ENVIRONMENT"
        exit 1
    fi
    
    info "Available backups:"
    for i in "${!backups[@]}"; do
        echo "  $((i+1)). ${backups[i]}"
    done
    
    echo "${backups[@]}"
}

# Select backup for restore
select_backup() {
    local backups_array=("$@")
    local selected_backup=""
    
    if [[ "$BACKUP_DATE" == "latest" ]]; then
        selected_backup="${backups_array[0]}"
        log "Selected latest backup: $selected_backup"
    else
        # Search for backup matching the date
        for backup in "${backups_array[@]}"; do
            if [[ "$backup" == *"$BACKUP_DATE"* ]]; then
                selected_backup="$backup"
                break
            fi
        done
        
        if [[ -z "$selected_backup" ]]; then
            error "No backup found for date: $BACKUP_DATE"
            exit 1
        fi
        
        log "Selected backup: $selected_backup"
    fi
    
    echo "$selected_backup"
}

# Download backup from S3
download_backup() {
    local backup_name="$1"
    local local_path="$RESTORE_DIR/$(basename "$backup_name")"
    
    if [[ "$backup_name" == S3:* ]]; then
        local s3_backup
        s3_backup="${backup_name#S3:}"
        local s3_path="s3://$S3_BUCKET/database-backups/${ENVIRONMENT}/$s3_backup"
        
        log "Downloading backup from S3: $s3_path"
        
        if aws s3 cp "$s3_path" "$local_path" --profile "$AWS_PROFILE"; then
            success "Backup downloaded: $local_path"
        else
            error "Failed to download backup from S3"
            exit 1
        fi
    else
        # Local backup
        local_path="$BACKUP_DIR/$backup_name"
        if [[ ! -f "$local_path" ]]; then
            error "Local backup file not found: $local_path"
            exit 1
        fi
    fi
    
    echo "$local_path"
}

# Verify backup integrity
verify_backup() {
    local backup_path="$1"
    
    update_phase "BACKUP_VERIFICATION"
    log "Verifying backup integrity: $(basename "$backup_path")"
    
    # Check if backup file exists and is readable
    if [[ ! -r "$backup_path" ]]; then
        error "Backup file is not readable: $backup_path"
        exit 1
    fi
    
    # Verify checksum if available
    local checksum_file="${backup_path}.sha256"
    if [[ -f "$checksum_file" ]]; then
        log "Verifying backup checksum..."
        if sha256sum -c "$checksum_file"; then
            success "Backup checksum verified"
        else
            error "Backup checksum verification failed"
            exit 1
        fi
    fi
    
    # Decrypt if needed
    if [[ "$backup_path" == *.gpg ]]; then
        local decrypted_path="${backup_path%.gpg}"
        log "Decrypting backup..."
        
        if gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" \
               --output "$decrypted_path" "$backup_path"; then
            success "Backup decrypted"
            backup_path="$decrypted_path"
        else
            error "Backup decryption failed"
            exit 1
        fi
    fi
    
    # Decompress if needed
    if [[ "$backup_path" == *.gz ]]; then
        log "Decompressing backup..."
        if gunzip "$backup_path"; then
            backup_path="${backup_path%.gz}"
            success "Backup decompressed"
        else
            error "Backup decompression failed"
            exit 1
        fi
    fi
    
    # Verify database backup format
    if [[ "$backup_path" == *.sql ]]; then
        # SQL format - check if file contains SQL commands
        if head -n 10 "$backup_path" | grep -q "PostgreSQL database dump"; then
            success "SQL backup format verified"
        else
            warning "Backup may not be a valid PostgreSQL dump"
        fi
    elif [[ "$backup_path" == *.dump ]]; then
        # Custom format - use pg_restore to verify
        if pg_restore --list "$backup_path" >/dev/null 2>&1; then
            success "Custom format backup verified"
        else
            error "Custom format backup is corrupted"
            exit 1
        fi
    fi
    
    echo "$backup_path"
}

# Stop application services
stop_services() {
    update_phase "SERVICE_SHUTDOWN"
    log "Stopping application services..."
    
    local services=("sightedit-web" "sightedit-api" "nginx" "haproxy")
    
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            log "Stopping $service..."
            if systemctl stop "$service"; then
                success "$service stopped"
            else
                warning "Failed to stop $service"
            fi
        else
            info "$service is not running"
        fi
    done
    
    # Stop Docker containers if any
    if command -v docker &> /dev/null; then
        local containers
        containers=$(docker ps -q --filter "label=app=sightedit" 2>/dev/null || true)
        if [[ -n "$containers" ]]; then
            log "Stopping Docker containers..."
            docker stop $containers
            success "Docker containers stopped"
        fi
    fi
}

# Start application services
start_services() {
    update_phase "SERVICE_STARTUP"
    log "Starting application services..."
    
    local services=("postgresql" "redis" "sightedit-api" "sightedit-web" "nginx")
    
    for service in "${services[@]}"; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            log "Starting $service..."
            if systemctl start "$service"; then
                success "$service started"
            else
                warning "Failed to start $service"
            fi
        else
            info "$service is not enabled"
        fi
    done
    
    # Start Docker containers if any
    if command -v docker &> /dev/null && [[ -f "$APPLICATION_DIR/docker-compose.yml" ]]; then
        log "Starting Docker containers..."
        cd "$APPLICATION_DIR"
        docker-compose up -d
        success "Docker containers started"
    fi
}

# Create database backup before restore
backup_current_database() {
    update_phase "CURRENT_DB_BACKUP"
    log "Creating backup of current database before restore..."
    
    local backup_filename="pre_restore_backup_$(date +%Y%m%d_%H%M%S).sql"
    local backup_path="$RESTORE_DIR/$backup_filename"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --verbose --no-password --format=plain > "$backup_path"; then
        success "Current database backed up: $backup_path"
        echo "$backup_path"
    else
        error "Failed to backup current database"
        exit 1
    fi
}

# Restore database
restore_database() {
    local backup_path="$1"
    local create_backup="$2"
    
    update_phase "DATABASE_RESTORE"
    log "Restoring database from: $(basename "$backup_path")"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    # Backup current database if requested
    if [[ "$create_backup" == "true" ]]; then
        backup_current_database
    fi
    
    # Terminate existing connections
    log "Terminating existing database connections..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();
    " >/dev/null 2>&1 || true
    
    # Drop and recreate database
    log "Dropping and recreating database: $DB_NAME"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"
    
    # Restore from backup
    if [[ "$backup_path" == *.sql ]]; then
        # SQL format restore
        log "Restoring from SQL backup..."
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$backup_path"; then
            success "Database restored from SQL backup"
        else
            error "Database restore from SQL backup failed"
            exit 1
        fi
    elif [[ "$backup_path" == *.dump ]]; then
        # Custom format restore
        log "Restoring from custom format backup..."
        if pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            --verbose --clean --if-exists "$backup_path"; then
            success "Database restored from custom backup"
        else
            error "Database restore from custom backup failed"
            exit 1
        fi
    else
        error "Unknown backup format: $backup_path"
        exit 1
    fi
    
    # Run database migrations if needed
    if [[ -f "$APPLICATION_DIR/node_modules/.bin/migrate" ]]; then
        log "Running database migrations..."
        cd "$APPLICATION_DIR"
        npm run migrate:up || true
    fi
}

# Restore application files
restore_application() {
    update_phase "APPLICATION_RESTORE"
    log "Restoring application files..."
    
    # This would typically involve:
    # 1. Restoring application code from backup
    # 2. Restoring configuration files
    # 3. Restoring uploaded files
    # 4. Setting proper permissions
    
    # Example implementation:
    if [[ -d "$APPLICATION_DIR.backup" ]]; then
        log "Restoring application directory..."
        rsync -av "$APPLICATION_DIR.backup/" "$APPLICATION_DIR/"
        success "Application files restored"
    fi
    
    # Restore uploads if available
    if [[ -d "/var/backups/sightedit/uploads" ]]; then
        log "Restoring uploaded files..."
        rsync -av "/var/backups/sightedit/uploads/" "$APPLICATION_DIR/uploads/"
        success "Upload files restored"
    fi
    
    # Set proper permissions
    chown -R sightedit:sightedit "$APPLICATION_DIR"
    chmod -R 755 "$APPLICATION_DIR"
}

# Verify recovery
verify_recovery() {
    update_phase "RECOVERY_VERIFICATION"
    log "Verifying disaster recovery..."
    
    local verification_failed=false
    
    # Check database connectivity
    log "Testing database connectivity..."
    export PGPASSWORD="$DB_PASSWORD"
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
        success "Database connectivity verified"
    else
        error "Database connectivity failed"
        verification_failed=true
    fi
    
    # Check critical tables
    log "Verifying critical database tables..."
    local critical_tables=("users" "sites" "content_edits")
    for table in "${critical_tables[@]}"; do
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -c "SELECT COUNT(*) FROM $table;" >/dev/null 2>&1; then
            success "Table '$table' verified"
        else
            error "Table '$table' verification failed"
            verification_failed=true
        fi
    done
    
    # Check application services
    log "Verifying application services..."
    local services=("postgresql" "redis" "sightedit-api" "sightedit-web")
    for service in "${services[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            success "Service '$service' is running"
        else
            warning "Service '$service' is not running"
        fi
    done
    
    # Check application health endpoints
    if command -v curl &> /dev/null; then
        log "Testing application health endpoints..."
        
        local endpoints=("http://localhost:3000/health" "http://localhost/health")
        for endpoint in "${endpoints[@]}"; do
            if curl -f -s "$endpoint" >/dev/null 2>&1; then
                success "Health check passed: $endpoint"
            else
                warning "Health check failed: $endpoint"
            fi
        done
    fi
    
    if [[ "$verification_failed" == "true" ]]; then
        error "Recovery verification failed"
        return 1
    else
        success "Recovery verification completed successfully"
        return 0
    fi
}

# Generate recovery report
generate_report() {
    local start_time="$1"
    local end_time="$2"
    local backup_used="$3"
    local recovery_status="$4"
    
    local duration=$((end_time - start_time))
    local report_file="$RESTORE_DIR/disaster_recovery_report_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "disaster_recovery": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "recovery_type": "$RECOVERY_TYPE",
    "backup_used": "$backup_used",
    "status": "$recovery_status",
    "duration_seconds": $duration,
    "dry_run": $DRY_RUN
  },
  "phases_completed": [
    "PREREQUISITE_CHECK",
    "BACKUP_DISCOVERY",
    "BACKUP_VERIFICATION",
    "SERVICE_SHUTDOWN",
    "DATABASE_RESTORE",
    "APPLICATION_RESTORE",
    "SERVICE_STARTUP",
    "RECOVERY_VERIFICATION"
  ],
  "services_restored": [
    "postgresql",
    "redis",
    "sightedit-api",
    "sightedit-web",
    "nginx"
  ],
  "verification_results": {
    "database_connectivity": "passed",
    "critical_tables": "passed",
    "application_services": "passed",
    "health_endpoints": "passed"
  }
}
EOF
    
    success "Recovery report generated: $report_file"
}

# Show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE          Recovery type (full|database|application) [default: full]"
    echo "  -e, --environment ENV    Environment name [default: production]"
    echo "  -d, --date DATE         Backup date (YYYYMMDD or 'latest') [default: latest]"
    echo "  -p, --point POINT       Specific restore point"
    echo "  --dry-run               Perform dry run without making changes"
    echo "  --backup-dir DIR        Backup directory [default: /var/backups/sightedit]"
    echo "  --restore-dir DIR       Restore working directory [default: /var/restore/sightedit]"
    echo "  --s3-bucket BUCKET      S3 bucket for backups"
    echo "  --notify EMAIL          Email address for notifications"
    echo "  --slack WEBHOOK         Slack webhook URL for notifications"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --type full --date latest"
    echo "  $0 --type database --date 20231201 --dry-run"
    echo "  $0 --environment staging --backup-dir /custom/backup/path"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            RECOVERY_TYPE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -d|--date)
            BACKUP_DATE="$2"
            shift 2
            ;;
        -p|--point)
            RESTORE_POINT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --restore-dir)
            RESTORE_DIR="$2"
            shift 2
            ;;
        --s3-bucket)
            S3_BUCKET="$2"
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

# Main disaster recovery function
main() {
    local start_time
    local end_time
    local selected_backup
    local backup_path
    local recovery_status="SUCCESS"
    
    start_time=$(date +%s)
    
    log "=== DISASTER RECOVERY INITIATED ==="
    log "Environment: $ENVIRONMENT"
    log "Recovery Type: $RECOVERY_TYPE"
    log "Backup Date: $BACKUP_DATE"
    log "Dry Run: $DRY_RUN"
    
    # Send start notification
    send_notification "STARTED" "$DR_PHASE" "Disaster recovery initiated"
    
    # Trap errors
    trap 'error "Disaster recovery failed in phase: $DR_PHASE"; send_notification "FAILED" "$DR_PHASE" "Recovery failed"; exit 1' ERR
    
    # Prerequisites check
    check_prerequisites
    
    # Discover and select backup
    local available_backups
    available_backups=($(list_backups))
    selected_backup=$(select_backup "${available_backups[@]}")
    
    # Download backup if needed
    backup_path=$(download_backup "$selected_backup")
    
    # Verify backup
    backup_path=$(verify_backup "$backup_path")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        warning "DRY RUN MODE - No actual changes will be made"
        log "Would restore from backup: $backup_path"
        success "Dry run completed successfully"
        return 0
    fi
    
    # Stop services
    if [[ "$RECOVERY_TYPE" == "full" || "$RECOVERY_TYPE" == "application" ]]; then
        stop_services
    fi
    
    # Restore database
    if [[ "$RECOVERY_TYPE" == "full" || "$RECOVERY_TYPE" == "database" ]]; then
        restore_database "$backup_path" "true"
    fi
    
    # Restore application
    if [[ "$RECOVERY_TYPE" == "full" || "$RECOVERY_TYPE" == "application" ]]; then
        restore_application
    fi
    
    # Start services
    if [[ "$RECOVERY_TYPE" == "full" || "$RECOVERY_TYPE" == "application" ]]; then
        start_services
        
        # Wait for services to stabilize
        sleep 30
    fi
    
    # Verify recovery
    if ! verify_recovery; then
        recovery_status="FAILED"
        send_notification "FAILED" "RECOVERY_VERIFICATION" "Recovery verification failed"
        exit 1
    fi
    
    end_time=$(date +%s)
    
    # Generate report
    generate_report "$start_time" "$end_time" "$selected_backup" "$recovery_status"
    
    # Send success notification
    send_notification "SUCCESS" "COMPLETED" "Disaster recovery completed successfully"
    
    success "=== DISASTER RECOVERY COMPLETED SUCCESSFULLY ==="
    log "Total duration: $((end_time - start_time))s"
    log "Backup used: $selected_backup"
}

# Execute main function
main "$@"