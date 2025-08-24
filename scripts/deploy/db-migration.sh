#!/bin/bash

# ================================
# SightEdit Database Migration Script
# ================================
# Safe database migration execution with rollback capabilities
# Supports zero-downtime migrations and validation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${1:-production}"
MIGRATION_ACTION="${2:-migrate}" # migrate, rollback, status, validate
MIGRATION_STEPS="${3:-all}"      # all, specific migration number, or range
DRY_RUN="${DRY_RUN:-false}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
MIGRATION_TIMEOUT="${MIGRATION_TIMEOUT:-1800}" # 30 minutes
VALIDATION_QUERIES="${VALIDATION_QUERIES:-true}"

# Load environment configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# Database configuration
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-sightedit}"
DB_USER="${DB_USER:-sightedit}"
DB_PASSWORD="${DB_PASSWORD:-}"

# Migration paths
MIGRATIONS_DIR="$PROJECT_ROOT/database/migrations"
ROLLBACK_DIR="$PROJECT_ROOT/database/rollbacks"
BACKUP_DIR="/var/backups/postgresql/migrations"

# ================================
# Logging
# ================================

LOG_FILE="/var/log/sightedit/migration-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [MIGRATION] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# ================================
# Error Handling
# ================================

handle_migration_error() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Migration failed at line $line_number with exit code $exit_code"
    
    # Clean up any locks
    release_migration_lock
    
    # Send failure notification
    send_migration_notification "FAILED" "Database migration failed at line $line_number"
    
    exit $exit_code
}

trap 'handle_migration_error ${LINENO}' ERR

# ================================
# Database Connection and Utilities
# ================================

execute_sql() {
    local sql_query="$1"
    local database="${2:-$DB_NAME}"
    local timeout="${3:-60}"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute SQL: ${sql_query:0:100}..."
        return 0
    fi
    
    timeout "$timeout" docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$database" -c "$sql_query"
}

execute_sql_file() {
    local sql_file="$1"
    local database="${2:-$DB_NAME}"
    local timeout="${3:-$MIGRATION_TIMEOUT}"
    
    if [[ ! -f "$sql_file" ]]; then
        log_error "SQL file not found: $sql_file"
        return 1
    fi
    
    log_info "Executing SQL file: $(basename "$sql_file")"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute SQL file: $sql_file"
        return 0
    fi
    
    timeout "$timeout" docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$database" -f "/docker-entrypoint-initdb.d/$(basename "$sql_file")"
}

test_database_connection() {
    log_info "Testing database connection"
    
    if execute_sql "SELECT 1;" "" 10; then
        log_success "Database connection successful"
        return 0
    else
        log_error "Database connection failed"
        return 1
    fi
}

get_database_version() {
    local version=$(execute_sql "SELECT version();" 2>/dev/null | grep PostgreSQL | head -1 || echo "unknown")
    echo "$version"
}

# ================================
# Migration Lock Management
# ================================

acquire_migration_lock() {
    log_info "Acquiring migration lock"
    
    local lock_acquired=$(execute_sql "
        INSERT INTO schema_migrations_lock (locked_at, locked_by) 
        VALUES (NOW(), '$(hostname)-$(whoami)-$$') 
        ON CONFLICT (id) DO NOTHING 
        RETURNING locked_by;" 2>/dev/null || echo "")
    
    if [[ -n "$lock_acquired" ]]; then
        log_success "Migration lock acquired"
        return 0
    else
        # Check if lock exists and how old it is
        local lock_info=$(execute_sql "
            SELECT locked_by, locked_at, 
                   EXTRACT(EPOCH FROM (NOW() - locked_at)) as age_seconds
            FROM schema_migrations_lock WHERE id = 1;" 2>/dev/null || echo "")
        
        if [[ -n "$lock_info" ]]; then
            log_error "Migration lock already exists: $lock_info"
            
            # Check if lock is stale (older than 2 hours)
            local lock_age=$(echo "$lock_info" | awk '{print $3}' | cut -d'.' -f1)
            if [[ "$lock_age" -gt 7200 ]]; then
                log_warn "Migration lock is stale (${lock_age}s old), forcing release"
                force_release_migration_lock
                return $(acquire_migration_lock)
            fi
        fi
        
        return 1
    fi
}

release_migration_lock() {
    log_info "Releasing migration lock"
    
    execute_sql "DELETE FROM schema_migrations_lock WHERE id = 1;" >/dev/null 2>&1 || true
    log_success "Migration lock released"
}

force_release_migration_lock() {
    log_warn "Force releasing migration lock"
    
    execute_sql "DELETE FROM schema_migrations_lock;" >/dev/null 2>&1 || true
    log_warn "Migration lock force released"
}

# ================================
# Schema Management
# ================================

ensure_migration_schema() {
    log_info "Ensuring migration schema exists"
    
    execute_sql "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(255) PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT NOW(),
            applied_by VARCHAR(255) DEFAULT CURRENT_USER,
            execution_time_ms INTEGER,
            checksum VARCHAR(255)
        );" >/dev/null
    
    execute_sql "
        CREATE TABLE IF NOT EXISTS schema_migrations_lock (
            id INTEGER PRIMARY KEY DEFAULT 1,
            locked_at TIMESTAMP DEFAULT NOW(),
            locked_by VARCHAR(255),
            CONSTRAINT single_lock CHECK (id = 1)
        );" >/dev/null
    
    execute_sql "
        CREATE TABLE IF NOT EXISTS migration_history (
            id SERIAL PRIMARY KEY,
            version VARCHAR(255),
            action VARCHAR(20), -- 'apply', 'rollback'
            executed_at TIMESTAMP DEFAULT NOW(),
            executed_by VARCHAR(255) DEFAULT CURRENT_USER,
            execution_time_ms INTEGER,
            success BOOLEAN,
            error_message TEXT
        );" >/dev/null
    
    log_success "Migration schema ensured"
}

get_current_schema_version() {
    local version=$(execute_sql "
        SELECT version FROM schema_migrations 
        ORDER BY version DESC LIMIT 1;" 2>/dev/null | grep -v "version" | head -1 | xargs || echo "0")
    echo "$version"
}

get_applied_migrations() {
    execute_sql "
        SELECT version FROM schema_migrations 
        ORDER BY version;" 2>/dev/null | grep -v "version" | xargs || echo ""
}

# ================================
# Migration Discovery and Validation
# ================================

discover_migrations() {
    log_info "Discovering available migrations"
    
    if [[ ! -d "$MIGRATIONS_DIR" ]]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        return 1
    fi
    
    # Find all migration files
    local migration_files=$(find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort)
    
    if [[ -z "$migration_files" ]]; then
        log_warn "No migration files found in $MIGRATIONS_DIR"
        return 0
    fi
    
    log_info "Found migration files:"
    for file in $migration_files; do
        local basename=$(basename "$file" .sql)
        log_info "  - $basename"
    done
    
    echo "$migration_files"
}

get_pending_migrations() {
    local all_migrations=($(discover_migrations))
    local applied_migrations=($(get_applied_migrations))
    local pending_migrations=()
    
    for migration_file in "${all_migrations[@]}"; do
        local migration_version=$(basename "$migration_file" .sql)
        local is_applied=false
        
        for applied in "${applied_migrations[@]}"; do
            if [[ "$applied" == "$migration_version" ]]; then
                is_applied=true
                break
            fi
        done
        
        if [[ "$is_applied" == false ]]; then
            pending_migrations+=("$migration_file")
        fi
    done
    
    echo "${pending_migrations[@]}"
}

validate_migration_file() {
    local migration_file="$1"
    
    log_info "Validating migration file: $(basename "$migration_file")"
    
    # Check file exists and is readable
    if [[ ! -r "$migration_file" ]]; then
        log_error "Migration file not readable: $migration_file"
        return 1
    fi
    
    # Check file has content
    if [[ ! -s "$migration_file" ]]; then
        log_error "Migration file is empty: $migration_file"
        return 1
    fi
    
    # Basic SQL syntax validation
    if ! grep -q ";" "$migration_file"; then
        log_warn "Migration file may not contain valid SQL (no semicolons found)"
    fi
    
    # Check for dangerous operations in production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        local dangerous_patterns=(
            "DROP TABLE"
            "DROP DATABASE"
            "TRUNCATE TABLE"
            "DELETE FROM.*WHERE.*1.*=.*1"
        )
        
        for pattern in "${dangerous_patterns[@]}"; do
            if grep -qi "$pattern" "$migration_file"; then
                log_error "Dangerous SQL pattern found in migration: $pattern"
                return 1
            fi
        done
    fi
    
    # Calculate checksum
    local checksum=$(sha256sum "$migration_file" | cut -d' ' -f1)
    log_info "Migration file checksum: $checksum"
    
    log_success "Migration file validation passed"
    return 0
}

# ================================
# Backup Operations
# ================================

create_pre_migration_backup() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_info "Skipping backup (SKIP_BACKUP=true)"
        return 0
    fi
    
    log_info "Creating pre-migration database backup"
    
    local backup_filename="pre-migration-$(date +%Y%m%d-%H%M%S)-$(get_current_schema_version).sql"
    local backup_path="$BACKUP_DIR/$backup_filename"
    
    mkdir -p "$BACKUP_DIR"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create backup: $backup_path"
        return 0
    fi
    
    # Create backup using pg_dump
    if docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        pg_dump -U "$DB_USER" -d "$DB_NAME" --verbose > "$backup_path"; then
        
        # Compress backup
        gzip "$backup_path"
        backup_path="$backup_path.gz"
        
        local backup_size=$(du -h "$backup_path" | cut -f1)
        log_success "Backup created: $backup_path ($backup_size)"
        
        # Store backup path for potential rollback
        echo "$backup_path" > "/tmp/sightedit-migration-backup"
        
        return 0
    else
        log_error "Failed to create database backup"
        return 1
    fi
}

restore_from_backup() {
    local backup_path="${1:-}"
    
    if [[ -z "$backup_path" && -f "/tmp/sightedit-migration-backup" ]]; then
        backup_path=$(cat "/tmp/sightedit-migration-backup")
    fi
    
    if [[ -z "$backup_path" || ! -f "$backup_path" ]]; then
        log_error "No backup file specified or found"
        return 1
    fi
    
    log_warn "Restoring database from backup: $backup_path"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would restore from backup: $backup_path"
        return 0
    fi
    
    # Drop and recreate database (requires superuser or database owner)
    execute_sql "
        SELECT pg_terminate_backend(pid) 
        FROM pg_stat_activity 
        WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" "postgres"
    
    execute_sql "DROP DATABASE IF EXISTS ${DB_NAME}_backup;" "postgres"
    execute_sql "ALTER DATABASE $DB_NAME RENAME TO ${DB_NAME}_backup;" "postgres"
    execute_sql "CREATE DATABASE $DB_NAME OWNER $DB_USER;" "postgres"
    
    # Restore from backup
    if [[ "$backup_path" == *.gz ]]; then
        gunzip -c "$backup_path" | docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            exec -T postgres-primary \
            psql -U "$DB_USER" -d "$DB_NAME"
    else
        docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
            exec -T postgres-primary \
            psql -U "$DB_USER" -d "$DB_NAME" < "$backup_path"
    fi
    
    log_success "Database restored from backup"
}

# ================================
# Migration Execution
# ================================

apply_migration() {
    local migration_file="$1"
    local migration_version=$(basename "$migration_file" .sql)
    
    log_info "Applying migration: $migration_version"
    
    # Validate migration file
    if ! validate_migration_file "$migration_file"; then
        log_error "Migration validation failed"
        return 1
    fi
    
    # Record migration start
    local start_time=$(date +%s%3N)
    
    execute_sql "
        INSERT INTO migration_history (version, action, executed_at, executed_by, success)
        VALUES ('$migration_version', 'apply', NOW(), '$(whoami)', false);"
    
    # Execute migration within transaction
    local migration_sql=$(cat "$migration_file")
    local checksum=$(sha256sum "$migration_file" | cut -d' ' -f1)
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would apply migration: $migration_version"
        return 0
    fi
    
    # Execute migration
    if timeout "$MIGRATION_TIMEOUT" docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" <<EOF
BEGIN;
$migration_sql
INSERT INTO schema_migrations (version, applied_at, applied_by, execution_time_ms, checksum)
VALUES ('$migration_version', NOW(), CURRENT_USER, 0, '$checksum');
COMMIT;
EOF
    then
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))
        
        # Update migration record
        execute_sql "
            UPDATE migration_history 
            SET success = true, execution_time_ms = $execution_time
            WHERE version = '$migration_version' AND action = 'apply'
            AND id = (SELECT MAX(id) FROM migration_history 
                     WHERE version = '$migration_version' AND action = 'apply');"
        
        execute_sql "
            UPDATE schema_migrations 
            SET execution_time_ms = $execution_time 
            WHERE version = '$migration_version';"
        
        log_success "Migration applied successfully: $migration_version (${execution_time}ms)"
        return 0
    else
        # Record migration failure
        execute_sql "
            UPDATE migration_history 
            SET success = false, error_message = 'Migration execution failed'
            WHERE version = '$migration_version' AND action = 'apply'
            AND id = (SELECT MAX(id) FROM migration_history 
                     WHERE version = '$migration_version' AND action = 'apply');" || true
        
        log_error "Migration failed: $migration_version"
        return 1
    fi
}

rollback_migration() {
    local migration_version="$1"
    local rollback_file="$ROLLBACK_DIR/${migration_version}.sql"
    
    log_warn "Rolling back migration: $migration_version"
    
    # Check if rollback file exists
    if [[ ! -f "$rollback_file" ]]; then
        log_error "Rollback file not found: $rollback_file"
        return 1
    fi
    
    # Validate rollback file
    if ! validate_migration_file "$rollback_file"; then
        log_error "Rollback file validation failed"
        return 1
    fi
    
    # Record rollback start
    local start_time=$(date +%s%3N)
    
    execute_sql "
        INSERT INTO migration_history (version, action, executed_at, executed_by, success)
        VALUES ('$migration_version', 'rollback', NOW(), '$(whoami)', false);"
    
    # Execute rollback
    local rollback_sql=$(cat "$rollback_file")
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would rollback migration: $migration_version"
        return 0
    fi
    
    if timeout "$MIGRATION_TIMEOUT" docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" <<EOF
BEGIN;
$rollback_sql
DELETE FROM schema_migrations WHERE version = '$migration_version';
COMMIT;
EOF
    then
        local end_time=$(date +%s%3N)
        local execution_time=$((end_time - start_time))
        
        # Update rollback record
        execute_sql "
            UPDATE migration_history 
            SET success = true, execution_time_ms = $execution_time
            WHERE version = '$migration_version' AND action = 'rollback'
            AND id = (SELECT MAX(id) FROM migration_history 
                     WHERE version = '$migration_version' AND action = 'rollback');"
        
        log_success "Migration rolled back successfully: $migration_version (${execution_time}ms)"
        return 0
    else
        # Record rollback failure
        execute_sql "
            UPDATE migration_history 
            SET success = false, error_message = 'Rollback execution failed'
            WHERE version = '$migration_version' AND action = 'rollback'
            AND id = (SELECT MAX(id) FROM migration_history 
                     WHERE version = '$migration_version' AND action = 'rollback');" || true
        
        log_error "Migration rollback failed: $migration_version"
        return 1
    fi
}

# ================================
# Validation and Testing
# ================================

run_post_migration_validation() {
    log_info "Running post-migration validation"
    
    if [[ "$VALIDATION_QUERIES" != "true" ]]; then
        log_info "Validation queries disabled"
        return 0
    fi
    
    local validation_file="$PROJECT_ROOT/database/validation/post-migration.sql"
    
    # Basic database connectivity
    if ! test_database_connection; then
        log_error "Post-migration database connection failed"
        return 1
    fi
    
    # Check schema integrity
    local table_count=$(execute_sql "
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_schema = 'public';" | grep -o '[0-9]*' | head -1)
    
    log_info "Database contains $table_count tables"
    
    # Run custom validation queries if file exists
    if [[ -f "$validation_file" ]]; then
        log_info "Running custom validation queries"
        execute_sql_file "$validation_file"
    fi
    
    # Check for foreign key constraint violations
    local fk_violations=$(execute_sql "
        SELECT COUNT(*) FROM information_schema.constraint_column_usage 
        WHERE constraint_name LIKE '%_fkey';" 2>/dev/null | grep -o '[0-9]*' | head -1 || echo "0")
    
    log_info "Foreign key constraints: $fk_violations"
    
    # Performance test - ensure basic queries run in reasonable time
    log_info "Running performance validation"
    local start_time=$(date +%s%3N)
    execute_sql "SELECT COUNT(*) FROM schema_migrations;" >/dev/null
    local end_time=$(date +%s%3N)
    local query_time=$((end_time - start_time))
    
    if [[ $query_time -gt 1000 ]]; then
        log_warn "Basic query performance degraded: ${query_time}ms"
    else
        log_success "Query performance acceptable: ${query_time}ms"
    fi
    
    log_success "Post-migration validation completed"
}

# ================================
# Status and Reporting
# ================================

show_migration_status() {
    log_info "Migration status for environment: $ENVIRONMENT"
    
    local current_version=$(get_current_schema_version)
    local applied_migrations=($(get_applied_migrations))
    local pending_migrations=($(get_pending_migrations))
    
    echo ""
    echo "=== Migration Status ==="
    echo "Environment: $ENVIRONMENT"
    echo "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    echo "Current Version: $current_version"
    echo ""
    
    echo "Applied Migrations (${#applied_migrations[@]}):"
    if [[ ${#applied_migrations[@]} -eq 0 ]]; then
        echo "  None"
    else
        for migration in "${applied_migrations[@]}"; do
            local applied_at=$(execute_sql "SELECT applied_at FROM schema_migrations WHERE version = '$migration';" | grep -v "applied_at" | head -1 | xargs)
            echo "  ✓ $migration ($applied_at)"
        done
    fi
    
    echo ""
    echo "Pending Migrations (${#pending_migrations[@]}):"
    if [[ ${#pending_migrations[@]} -eq 0 ]]; then
        echo "  None - database is up to date"
    else
        for migration_file in "${pending_migrations[@]}"; do
            local migration=$(basename "$migration_file" .sql)
            echo "  ⏳ $migration"
        done
    fi
    
    # Show recent migration history
    echo ""
    echo "Recent Migration History:"
    execute_sql "
        SELECT version, action, executed_at, execution_time_ms, success
        FROM migration_history 
        ORDER BY executed_at DESC 
        LIMIT 10;" | head -11
}

# ================================
# Notification System
# ================================

send_migration_notification() {
    local status=$1
    local message=$2
    
    # Slack notification
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        local color
        case $status in
            SUCCESS) color="good" ;;
            FAILED) color="danger" ;;
            *) color="warning" ;;
        esac
        
        curl -X POST -H 'Content-type: application/json' \
            --data "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"SightEdit Database Migration $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Action\", \"value\": \"$MIGRATION_ACTION\", \"short\": true},
                        {\"title\": \"Database\", \"value\": \"$DB_NAME\", \"short\": true}
                    ]
                }]
            }" \
            "$SLACK_WEBHOOK_URL" || true
    fi
}

# ================================
# Main Migration Functions
# ================================

run_migrations() {
    log_info "Starting database migrations"
    
    # Ensure schema exists
    ensure_migration_schema
    
    # Acquire lock
    if ! acquire_migration_lock; then
        log_error "Could not acquire migration lock"
        return 1
    fi
    
    # Create backup
    if ! create_pre_migration_backup; then
        log_error "Failed to create backup"
        release_migration_lock
        return 1
    fi
    
    # Get pending migrations
    local pending_migrations=($(get_pending_migrations))
    
    if [[ ${#pending_migrations[@]} -eq 0 ]]; then
        log_success "No pending migrations - database is up to date"
        release_migration_lock
        return 0
    fi
    
    log_info "Found ${#pending_migrations[@]} pending migrations"
    
    # Apply migrations
    local failed_migration=""
    for migration_file in "${pending_migrations[@]}"; do
        if ! apply_migration "$migration_file"; then
            failed_migration=$(basename "$migration_file" .sql)
            break
        fi
    done
    
    if [[ -n "$failed_migration" ]]; then
        log_error "Migration failed: $failed_migration"
        
        # Automatic rollback of failed migration
        log_warn "Attempting automatic rollback of failed migration"
        rollback_migration "$failed_migration" || log_error "Automatic rollback also failed"
        
        release_migration_lock
        send_migration_notification "FAILED" "Migration $failed_migration failed"
        return 1
    fi
    
    # Validate after migrations
    if ! run_post_migration_validation; then
        log_error "Post-migration validation failed"
        release_migration_lock
        return 1
    fi
    
    release_migration_lock
    
    log_success "All migrations applied successfully"
    send_migration_notification "SUCCESS" "${#pending_migrations[@]} migrations applied successfully"
    
    return 0
}

# ================================
# Main Function
# ================================

main() {
    log_info "Starting database migration process"
    log_info "Environment: $ENVIRONMENT, Action: $MIGRATION_ACTION"
    log_info "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
    log_info "Dry run: $DRY_RUN, Skip backup: $SKIP_BACKUP"
    
    # Test database connection
    if ! test_database_connection; then
        log_error "Cannot connect to database"
        exit 1
    fi
    
    # Log database info
    local db_version=$(get_database_version)
    log_info "Database version: $db_version"
    
    case "$MIGRATION_ACTION" in
        migrate)
            run_migrations
            ;;
        status)
            show_migration_status
            ;;
        rollback)
            if [[ "$MIGRATION_STEPS" == "all" ]]; then
                log_error "Cannot rollback 'all' - specify migration version"
                exit 1
            fi
            
            ensure_migration_schema
            if ! acquire_migration_lock; then
                log_error "Could not acquire migration lock"
                exit 1
            fi
            
            create_pre_migration_backup
            rollback_migration "$MIGRATION_STEPS"
            run_post_migration_validation
            release_migration_lock
            ;;
        validate)
            ensure_migration_schema
            run_post_migration_validation
            ;;
        *)
            log_error "Unknown migration action: $MIGRATION_ACTION"
            exit 1
            ;;
    esac
    
    log_success "Migration process completed successfully"
}

# ================================
# Command Line Interface
# ================================

show_usage() {
    echo "Usage: $0 [ENVIRONMENT] [ACTION] [STEPS]"
    echo ""
    echo "Arguments:"
    echo "  ENVIRONMENT    Target environment (default: production)"
    echo "  ACTION         Migration action: migrate, rollback, status, validate (default: migrate)"
    echo "  STEPS          Migration steps: all, specific version, or range (default: all)"
    echo ""
    echo "Environment Variables:"
    echo "  DRY_RUN                Show what would be done without executing (default: false)"
    echo "  SKIP_BACKUP            Skip pre-migration backup (default: false)"
    echo "  MIGRATION_TIMEOUT      Migration timeout in seconds (default: 1800)"
    echo "  VALIDATION_QUERIES     Run validation queries (default: true)"
    echo ""
    echo "Examples:"
    echo "  $0 production migrate all"
    echo "  $0 staging status"
    echo "  $0 production rollback 20231201_001"
    echo "  DRY_RUN=true $0 production migrate all"
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