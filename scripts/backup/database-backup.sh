#!/bin/bash

# ================================
# Database Backup Script for SightEdit Production
# ================================
# Automated PostgreSQL backup with compression, encryption,
# and cloud storage integration

set -euo pipefail

# Configuration
BACKUP_TYPE=${BACKUP_TYPE:-"full"}
ENVIRONMENT=${ENVIRONMENT:-"production"}
RETENTION_DAYS=${RETENTION_DAYS:-30}
BACKUP_DIR=${BACKUP_DIR:-"/var/backups/sightedit"}
ENCRYPTION_KEY=${BACKUP_ENCRYPTION_KEY:-""}
S3_BUCKET=${BACKUP_S3_BUCKET:-""}
NOTIFICATION_EMAIL=${BACKUP_NOTIFICATION_EMAIL:-""}

# Database configuration
DB_HOST=${DATABASE_HOST:-"localhost"}
DB_PORT=${DATABASE_PORT:-5432}
DB_NAME=${DATABASE_NAME:-"sightedit_production"}
DB_USER=${DATABASE_USER:-"sightedit_backup"}
DB_PASSWORD=${DATABASE_PASSWORD:-""}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if PostgreSQL client is installed
    if ! command -v pg_dump &> /dev/null; then
        error "pg_dump not found. Please install PostgreSQL client tools."
        exit 1
    fi
    
    # Check if AWS CLI is installed (if S3 backup is enabled)
    if [[ -n "$S3_BUCKET" ]] && ! command -v aws &> /dev/null; then
        error "AWS CLI not found but S3 backup is configured."
        exit 1
    fi
    
    # Check if GPG is available for encryption
    if [[ -n "$ENCRYPTION_KEY" ]] && ! command -v gpg &> /dev/null; then
        error "GPG not found but encryption is configured."
        exit 1
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    success "Prerequisites check passed"
}

# Test database connection
test_connection() {
    log "Testing database connection..."
    
    export PGPASSWORD="$DB_PASSWORD"
    
    if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        error "Cannot connect to database $DB_NAME on $DB_HOST:$DB_PORT"
        exit 1
    fi
    
    success "Database connection successful"
}

# Create database backup
create_backup() {
    local backup_filename
    local backup_path
    local timestamp
    
    timestamp=$(date +%Y%m%d_%H%M%S)
    backup_filename="sightedit_${ENVIRONMENT}_${BACKUP_TYPE}_${timestamp}.sql"
    backup_path="$BACKUP_DIR/$backup_filename"
    
    log "Creating $BACKUP_TYPE backup: $backup_filename"
    
    export PGPASSWORD="$DB_PASSWORD"
    
    case "$BACKUP_TYPE" in
        "full")
            # Full database backup with all data
            pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                --verbose --no-password --format=plain --no-privileges --no-owner \
                --compress=9 > "$backup_path"
            ;;
        "schema")
            # Schema-only backup
            pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                --verbose --no-password --schema-only --format=plain \
                --no-privileges --no-owner > "$backup_path"
            ;;
        "data")
            # Data-only backup
            pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                --verbose --no-password --data-only --format=plain \
                --no-privileges --no-owner --compress=9 > "$backup_path"
            ;;
        "custom")
            # Custom format backup (recommended for large databases)
            backup_filename="sightedit_${ENVIRONMENT}_${BACKUP_TYPE}_${timestamp}.dump"
            backup_path="$BACKUP_DIR/$backup_filename"
            pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
                --verbose --no-password --format=custom --compress=9 \
                --no-privileges --no-owner > "$backup_path"
            ;;
        *)
            error "Unknown backup type: $BACKUP_TYPE"
            exit 1
            ;;
    esac
    
    if [[ $? -eq 0 ]]; then
        success "Backup created successfully: $backup_path"
        echo "$backup_path"
    else
        error "Backup creation failed"
        exit 1
    fi
}

# Compress backup
compress_backup() {
    local backup_path="$1"
    local compressed_path="${backup_path}.gz"
    
    log "Compressing backup..."
    
    if gzip -9 "$backup_path"; then
        success "Backup compressed: $compressed_path"
        echo "$compressed_path"
    else
        error "Backup compression failed"
        exit 1
    fi
}

# Encrypt backup
encrypt_backup() {
    local backup_path="$1"
    local encrypted_path="${backup_path}.gpg"
    
    log "Encrypting backup..."
    
    if gpg --batch --yes --cipher-algo AES256 --compress-algo 1 \
           --symmetric --passphrase "$ENCRYPTION_KEY" \
           --output "$encrypted_path" "$backup_path"; then
        
        # Remove unencrypted file
        rm -f "$backup_path"
        success "Backup encrypted: $encrypted_path"
        echo "$encrypted_path"
    else
        error "Backup encryption failed"
        exit 1
    fi
}

# Calculate backup checksum
calculate_checksum() {
    local backup_path="$1"
    local checksum_path="${backup_path}.sha256"
    
    log "Calculating backup checksum..."
    
    if sha256sum "$backup_path" > "$checksum_path"; then
        success "Checksum calculated: $checksum_path"
        echo "$checksum_path"
    else
        error "Checksum calculation failed"
        exit 1
    fi
}

# Upload to S3
upload_to_s3() {
    local backup_path="$1"
    local checksum_path="$2"
    local s3_key
    local filename
    
    filename=$(basename "$backup_path")
    s3_key="database-backups/${ENVIRONMENT}/${filename}"
    
    log "Uploading backup to S3: s3://$S3_BUCKET/$s3_key"
    
    # Upload backup file
    if aws s3 cp "$backup_path" "s3://$S3_BUCKET/$s3_key" \
           --server-side-encryption AES256 \
           --metadata "environment=$ENVIRONMENT,backup_type=$BACKUP_TYPE,timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; then
        success "Backup uploaded to S3"
    else
        error "Failed to upload backup to S3"
        return 1
    fi
    
    # Upload checksum file
    if [[ -f "$checksum_path" ]]; then
        local checksum_s3_key="${s3_key}.sha256"
        aws s3 cp "$checksum_path" "s3://$S3_BUCKET/$checksum_s3_key" \
            --server-side-encryption AES256
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_path="$1"
    local checksum_path="$2"
    
    log "Verifying backup integrity..."
    
    # Verify checksum
    if [[ -f "$checksum_path" ]]; then
        if sha256sum -c "$checksum_path"; then
            success "Backup integrity verified"
        else
            error "Backup integrity check failed"
            return 1
        fi
    fi
    
    # For SQL backups, try to parse the file
    if [[ "$backup_path" == *.sql || "$backup_path" == *.sql.gz ]]; then
        local test_file="$backup_path"
        
        if [[ "$backup_path" == *.gz ]]; then
            # Test gzip file
            if gzip -t "$backup_path"; then
                success "Compressed backup file is valid"
            else
                error "Compressed backup file is corrupted"
                return 1
            fi
        fi
    fi
    
    # For custom format backups, use pg_restore to verify
    if [[ "$backup_path" == *.dump ]]; then
        if pg_restore --list "$backup_path" >/dev/null 2>&1; then
            success "Custom format backup is valid"
        else
            error "Custom format backup is corrupted"
            return 1
        fi
    fi
}

# Clean old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    local deleted_count=0
    
    # Clean local backups
    if find "$BACKUP_DIR" -name "sightedit_${ENVIRONMENT}_*" -type f -mtime +$RETENTION_DAYS -print0 | while IFS= read -r -d '' file; do
        rm -f "$file"
        deleted_count=$((deleted_count + 1))
        log "Deleted old backup: $(basename "$file")"
    done; then
        success "Local cleanup completed. Deleted $deleted_count files."
    fi
    
    # Clean S3 backups
    if [[ -n "$S3_BUCKET" ]]; then
        local cutoff_date
        cutoff_date=$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)
        
        aws s3 ls "s3://$S3_BUCKET/database-backups/${ENVIRONMENT}/" | \
        awk -v cutoff="$cutoff_date" '$1 < cutoff {print $4}' | \
        while read -r file; do
            if [[ -n "$file" ]]; then
                aws s3 rm "s3://$S3_BUCKET/database-backups/${ENVIRONMENT}/$file"
                log "Deleted old S3 backup: $file"
            fi
        done
    fi
}

# Send notification
send_notification() {
    local status="$1"
    local details="$2"
    local backup_size="$3"
    
    if [[ -z "$NOTIFICATION_EMAIL" ]]; then
        return 0
    fi
    
    local subject
    local body
    
    if [[ "$status" == "success" ]]; then
        subject="[SUCCESS] Database Backup Completed - $ENVIRONMENT"
        body="Database backup completed successfully.

Environment: $ENVIRONMENT
Backup Type: $BACKUP_TYPE
Database: $DB_NAME
Backup Size: $backup_size
Timestamp: $(date)
Location: $details

Backup verification passed.
"
    else
        subject="[FAILURE] Database Backup Failed - $ENVIRONMENT"
        body="Database backup failed!

Environment: $ENVIRONMENT
Backup Type: $BACKUP_TYPE
Database: $DB_NAME
Timestamp: $(date)
Error: $details

Please check the logs and take immediate action.
"
    fi
    
    # Send email using mail command (if available)
    if command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$NOTIFICATION_EMAIL"
    elif command -v sendmail &> /dev/null; then
        {
            echo "To: $NOTIFICATION_EMAIL"
            echo "Subject: $subject"
            echo "Date: $(date -R)"
            echo ""
            echo "$body"
        } | sendmail "$NOTIFICATION_EMAIL"
    fi
}

# Get backup size in human readable format
get_backup_size() {
    local file_path="$1"
    
    if [[ -f "$file_path" ]]; then
        if command -v numfmt &> /dev/null; then
            numfmt --to=iec-i --suffix=B "$(stat -c%s "$file_path")"
        else
            du -h "$file_path" | cut -f1
        fi
    else
        echo "Unknown"
    fi
}

# Create backup report
create_report() {
    local backup_path="$1"
    local backup_size="$2"
    local duration="$3"
    
    local report_file="${BACKUP_DIR}/backup_report_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "backup": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "backup_type": "$BACKUP_TYPE",
    "database_name": "$DB_NAME",
    "database_host": "$DB_HOST",
    "backup_path": "$backup_path",
    "backup_size": "$backup_size",
    "duration_seconds": $duration,
    "retention_days": $RETENTION_DAYS,
    "encrypted": $([ -n "$ENCRYPTION_KEY" ] && echo "true" || echo "false"),
    "uploaded_to_s3": $([ -n "$S3_BUCKET" ] && echo "true" || echo "false"),
    "s3_bucket": "$S3_BUCKET"
  },
  "verification": {
    "integrity_check": "passed",
    "checksum_verified": true
  }
}
EOF
    
    success "Backup report created: $report_file"
}

# Show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE          Backup type (full|schema|data|custom) [default: full]"
    echo "  -e, --environment ENV    Environment name [default: production]"
    echo "  -r, --retention DAYS     Retention period in days [default: 30]"
    echo "  -d, --directory DIR      Backup directory [default: /var/backups/sightedit]"
    echo "  --encrypt KEY           Encryption key for backup"
    echo "  --s3-bucket BUCKET      S3 bucket for backup storage"
    echo "  --notify EMAIL          Email address for notifications"
    echo "  -h, --help              Show this help message"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            BACKUP_TYPE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        -d|--directory)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --encrypt)
            ENCRYPTION_KEY="$2"
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

# Main execution
main() {
    local start_time
    local end_time
    local duration
    local backup_path
    local checksum_path
    local backup_size
    
    start_time=$(date +%s)
    
    log "Starting database backup for $ENVIRONMENT environment"
    
    # Trap errors and cleanup
    trap 'error "Backup failed"; send_notification "failure" "Script execution failed"; exit 1' ERR
    
    check_prerequisites
    test_connection
    
    # Create the backup
    backup_path=$(create_backup)
    
    # Compress the backup
    if [[ "$BACKUP_TYPE" != "custom" ]]; then
        backup_path=$(compress_backup "$backup_path")
    fi
    
    # Calculate checksum
    checksum_path=$(calculate_checksum "$backup_path")
    
    # Encrypt if requested
    if [[ -n "$ENCRYPTION_KEY" ]]; then
        backup_path=$(encrypt_backup "$backup_path")
        checksum_path=$(calculate_checksum "$backup_path")
    fi
    
    # Verify backup
    verify_backup "$backup_path" "$checksum_path"
    
    # Upload to S3 if configured
    if [[ -n "$S3_BUCKET" ]]; then
        upload_to_s3 "$backup_path" "$checksum_path"
    fi
    
    # Get backup size and duration
    backup_size=$(get_backup_size "$backup_path")
    end_time=$(date +%s)
    duration=$((end_time - start_time))
    
    # Create report
    create_report "$backup_path" "$backup_size" "$duration"
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Send success notification
    send_notification "success" "$backup_path" "$backup_size"
    
    success "Database backup completed successfully!"
    log "Backup path: $backup_path"
    log "Backup size: $backup_size"
    log "Duration: ${duration}s"
}

# Execute main function
main "$@"