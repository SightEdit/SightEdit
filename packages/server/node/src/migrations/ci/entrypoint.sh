#!/bin/bash

# SightEdit Migration Container Entrypoint
# Supports multiple database types and commands

set -euo pipefail

# Default configuration
MIGRATION_DIR="${MIGRATION_DIR:-/app/packages/server/node/src/migrations/migrations}"
CONFIG_FILE="${CONFIG_FILE:-}"
DATABASE_TYPE="${DATABASE_TYPE:-postgresql}"
DATABASE_URL="${DATABASE_URL:-}"
DRY_RUN="${DRY_RUN:-false}"
VERBOSE="${VERBOSE:-false}"
BACKUP_BEFORE_MIGRATION="${BACKUP_BEFORE_MIGRATION:-true}"
VALIDATE_AFTER_MIGRATION="${VALIDATE_AFTER_MIGRATION:-true}"
MAX_RETRY_ATTEMPTS="${MAX_RETRY_ATTEMPTS:-3}"
RETRY_DELAY="${RETRY_DELAY:-5}"

# Logging functions
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >&2
}

error() {
    log "ERROR: $*"
    exit 1
}

warn() {
    log "WARN: $*"
}

info() {
    log "INFO: $*"
}

debug() {
    if [[ "${VERBOSE}" == "true" ]]; then
        log "DEBUG: $*"
    fi
}

# Wait for database to be ready
wait_for_database() {
    local host="$1"
    local port="$2"
    local timeout="${3:-60}"
    local interval=2
    local elapsed=0

    info "Waiting for database at ${host}:${port} (timeout: ${timeout}s)"

    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [[ $elapsed -ge $timeout ]]; then
            error "Database connection timeout after ${timeout}s"
        fi
        
        debug "Database not ready, waiting ${interval}s..."
        sleep $interval
        elapsed=$((elapsed + interval))
    done

    info "Database connection established"
}

# Parse database connection details
parse_database_connection() {
    if [[ -z "$DATABASE_URL" ]]; then
        error "DATABASE_URL is required"
    fi

    # Extract connection details based on database type
    case "$DATABASE_TYPE" in
        postgresql|postgres)
            if [[ "$DATABASE_URL" =~ postgres://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
                DB_HOST="${BASH_REMATCH[3]}"
                DB_PORT="${BASH_REMATCH[4]}"
            else
                error "Invalid PostgreSQL connection string format"
            fi
            ;;
        mysql)
            if [[ "$DATABASE_URL" =~ mysql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+) ]]; then
                DB_HOST="${BASH_REMATCH[3]}"
                DB_PORT="${BASH_REMATCH[4]}"
            else
                error "Invalid MySQL connection string format"
            fi
            ;;
        mongodb)
            if [[ "$DATABASE_URL" =~ mongodb://([^:]*):?([^@]*)@?([^:]+):([0-9]+)/(.+) ]] || [[ "$DATABASE_URL" =~ mongodb\+srv://([^:]*):?([^@]*)@?([^/]+)/(.+) ]]; then
                if [[ "$DATABASE_URL" =~ srv ]]; then
                    DB_HOST="${BASH_REMATCH[3]}"
                    DB_PORT="27017"  # Default for MongoDB Atlas
                else
                    DB_HOST="${BASH_REMATCH[3]}"
                    DB_PORT="${BASH_REMATCH[4]:-27017}"
                fi
            else
                error "Invalid MongoDB connection string format"
            fi
            ;;
        sqlite)
            DB_HOST="localhost"
            DB_PORT="0"
            ;;
        *)
            error "Unsupported database type: $DATABASE_TYPE"
            ;;
    esac
}

# Check database connectivity
check_database_connectivity() {
    info "Checking database connectivity..."
    
    parse_database_connection
    
    if [[ "$DATABASE_TYPE" != "sqlite" ]]; then
        wait_for_database "$DB_HOST" "$DB_PORT" 60
        
        # Additional database-specific connectivity checks
        case "$DATABASE_TYPE" in
            postgresql|postgres)
                PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p') \
                psql "$DATABASE_URL" -c "SELECT 1;" > /dev/null 2>&1 || error "PostgreSQL connection failed"
                ;;
            mysql)
                mysql --defaults-extra-file=<(printf "[client]\npassword=%s" "$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')") \
                      -h "$DB_HOST" -P "$DB_PORT" -e "SELECT 1;" > /dev/null 2>&1 || error "MySQL connection failed"
                ;;
            mongodb)
                mongosh "$DATABASE_URL" --eval "db.runCommand('ping')" > /dev/null 2>&1 || error "MongoDB connection failed"
                ;;
        esac
    fi
    
    info "Database connectivity verified"
}

# Create backup before migration
create_backup() {
    if [[ "$BACKUP_BEFORE_MIGRATION" == "true" ]]; then
        info "Creating database backup before migration..."
        
        local backup_cmd="npx sightedit-migrate"
        [[ -n "$CONFIG_FILE" ]] && backup_cmd="$backup_cmd -c $CONFIG_FILE"
        [[ -n "$DATABASE_URL" ]] && backup_cmd="$backup_cmd --connection $DATABASE_URL"
        backup_cmd="$backup_cmd --database-type $DATABASE_TYPE"
        backup_cmd="$backup_cmd --migrations-dir $MIGRATION_DIR"
        backup_cmd="$backup_cmd backup"
        
        if eval "$backup_cmd"; then
            info "Backup created successfully"
        else
            error "Failed to create backup"
        fi
    else
        debug "Backup creation skipped"
    fi
}

# Validate schema after migration
validate_schema() {
    if [[ "$VALIDATE_AFTER_MIGRATION" == "true" ]]; then
        info "Validating database schema after migration..."
        
        local validate_cmd="node -e \"
            const { SchemaValidator } = require('./packages/server/node/dist/migrations/core/schema-validator');
            const { DatabaseAdapter } = require('./packages/server/node/dist/migrations/core/adapters/database-adapter');
            
            async function validate() {
                try {
                    const connection = await DatabaseAdapter.create({
                        type: '$DATABASE_TYPE',
                        connection: '$DATABASE_URL'
                    });
                    
                    const validator = new SchemaValidator(connection);
                    const result = await validator.validateSchema();
                    
                    if (result.isValid) {
                        console.log('✅ Schema validation passed');
                    } else {
                        console.error('❌ Schema validation failed:');
                        result.errors.forEach(error => {
                            console.error(\`  - \${error.table}.\${error.column || ''}: \${error.type}\`);
                        });
                        process.exit(1);
                    }
                    
                    await connection.close();
                } catch (error) {
                    console.error('Schema validation error:', error);
                    process.exit(1);
                }
            }
            
            validate();
        \""
        
        if eval "$validate_cmd"; then
            info "Schema validation passed"
        else
            error "Schema validation failed"
        fi
    else
        debug "Schema validation skipped"
    fi
}

# Execute migration command with retry logic
execute_migration_command() {
    local cmd="$1"
    local attempt=1
    
    while [[ $attempt -le $MAX_RETRY_ATTEMPTS ]]; do
        info "Executing migration command (attempt $attempt/$MAX_RETRY_ATTEMPTS): $cmd"
        
        if eval "$cmd"; then
            info "Migration command completed successfully"
            return 0
        else
            warn "Migration command failed on attempt $attempt"
            
            if [[ $attempt -lt $MAX_RETRY_ATTEMPTS ]]; then
                info "Retrying in ${RETRY_DELAY}s..."
                sleep "$RETRY_DELAY"
                attempt=$((attempt + 1))
            else
                error "Migration command failed after $MAX_RETRY_ATTEMPTS attempts"
            fi
        fi
    done
}

# Build migration command
build_migration_command() {
    local action="$1"
    local cmd="npx sightedit-migrate"
    
    # Add configuration file if provided
    [[ -n "$CONFIG_FILE" ]] && cmd="$cmd -c $CONFIG_FILE"
    
    # Add connection parameters
    [[ -n "$DATABASE_URL" ]] && cmd="$cmd --connection $DATABASE_URL"
    cmd="$cmd --database-type $DATABASE_TYPE"
    cmd="$cmd --migrations-dir $MIGRATION_DIR"
    
    # Add verbose flag if enabled
    [[ "$VERBOSE" == "true" ]] && cmd="$cmd --verbose"
    
    # Add action and any additional arguments
    cmd="$cmd $action"
    
    # Add remaining arguments from command line
    shift
    for arg in "$@"; do
        cmd="$cmd $arg"
    done
    
    echo "$cmd"
}

# Handle different commands
handle_command() {
    local action="$1"
    shift
    
    case "$action" in
        up|migrate)
            create_backup
            local migrate_cmd=$(build_migration_command "up" "$@")
            execute_migration_command "$migrate_cmd"
            validate_schema
            ;;
        down|rollback)
            create_backup
            local rollback_cmd=$(build_migration_command "down" "$@")
            execute_migration_command "$rollback_cmd"
            validate_schema
            ;;
        status)
            local status_cmd=$(build_migration_command "status" "$@")
            execute_migration_command "$status_cmd"
            ;;
        create)
            if [[ $# -eq 0 ]]; then
                error "Migration name is required for create command"
            fi
            local create_cmd=$(build_migration_command "create" "$@")
            execute_migration_command "$create_cmd"
            ;;
        backup)
            local backup_cmd=$(build_migration_command "backup" "$@")
            execute_migration_command "$backup_cmd"
            ;;
        restore)
            if [[ $# -eq 0 ]]; then
                error "Backup path is required for restore command"
            fi
            local restore_cmd=$(build_migration_command "restore" "$@")
            execute_migration_command "$restore_cmd"
            ;;
        test)
            info "Running migration tests..."
            cd /app/packages/server/node
            npm run test:migrations
            ;;
        shell)
            info "Starting interactive shell..."
            exec /bin/bash
            ;;
        *)
            error "Unknown command: $action. Available commands: up, down, status, create, backup, restore, test, shell"
            ;;
    esac
}

# Cleanup function
cleanup() {
    info "Cleaning up..."
    # Remove temporary files
    rm -rf /tmp/sightedit-migration-* 2>/dev/null || true
}

# Signal handlers
trap cleanup EXIT
trap 'error "Interrupted by user"' INT TERM

# Main execution
main() {
    info "SightEdit Migration Container Starting"
    info "Database Type: $DATABASE_TYPE"
    info "Migration Directory: $MIGRATION_DIR"
    info "Dry Run: $DRY_RUN"
    
    # Validate required environment variables
    if [[ -z "$DATABASE_URL" && -z "$CONFIG_FILE" ]]; then
        error "Either DATABASE_URL or CONFIG_FILE must be provided"
    fi
    
    # Check database connectivity (unless it's a local command like 'create')
    if [[ "$1" != "create" && "$1" != "shell" ]]; then
        check_database_connectivity
    fi
    
    # Handle the requested command
    if [[ $# -eq 0 ]]; then
        handle_command "status"
    else
        handle_command "$@"
    fi
    
    info "Migration container execution completed"
}

# Execute main function with all arguments
main "$@"