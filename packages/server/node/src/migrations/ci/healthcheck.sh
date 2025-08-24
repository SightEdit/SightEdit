#!/bin/bash

# Health check script for SightEdit migration container

set -euo pipefail

# Configuration
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-5}"
DATABASE_URL="${DATABASE_URL:-}"
DATABASE_TYPE="${DATABASE_TYPE:-postgresql}"

# Logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] HEALTH: $*" >&2
}

# Check if migration engine is responsive
check_migration_engine() {
    local timeout="$HEALTH_CHECK_TIMEOUT"
    
    log "Checking migration engine responsiveness..."
    
    # Test basic migration command with timeout
    if timeout "$timeout" npx sightedit-migrate --help > /dev/null 2>&1; then
        log "Migration engine is responsive"
        return 0
    else
        log "Migration engine is not responsive"
        return 1
    fi
}

# Check database connectivity
check_database_connection() {
    if [[ -z "$DATABASE_URL" ]]; then
        log "No DATABASE_URL provided, skipping database connectivity check"
        return 0
    fi
    
    log "Checking database connectivity..."
    
    case "$DATABASE_TYPE" in
        postgresql|postgres)
            if command -v pg_isready > /dev/null 2>&1; then
                # Extract host and port from DATABASE_URL
                if [[ "$DATABASE_URL" =~ postgres://([^:]+):([^@]+)@([^:]+):([0-9]+)/ ]]; then
                    local host="${BASH_REMATCH[3]}"
                    local port="${BASH_REMATCH[4]}"
                    
                    if timeout "$HEALTH_CHECK_TIMEOUT" pg_isready -h "$host" -p "$port" > /dev/null 2>&1; then
                        log "PostgreSQL database is ready"
                        return 0
                    else
                        log "PostgreSQL database is not ready"
                        return 1
                    fi
                else
                    log "Invalid PostgreSQL connection string format"
                    return 1
                fi
            else
                log "pg_isready not available, using basic connection test"
                if timeout "$HEALTH_CHECK_TIMEOUT" npx sightedit-migrate \
                   --connection "$DATABASE_URL" \
                   --database-type "$DATABASE_TYPE" \
                   status > /dev/null 2>&1; then
                    log "PostgreSQL database connection successful"
                    return 0
                else
                    log "PostgreSQL database connection failed"
                    return 1
                fi
            fi
            ;;
        mysql)
            if [[ "$DATABASE_URL" =~ mysql://([^:]+):([^@]+)@([^:]+):([0-9]+)/ ]]; then
                local username="${BASH_REMATCH[1]}"
                local password="${BASH_REMATCH[2]}"
                local host="${BASH_REMATCH[3]}"
                local port="${BASH_REMATCH[4]}"
                
                if timeout "$HEALTH_CHECK_TIMEOUT" mysqladmin ping \
                   -h "$host" -P "$port" -u "$username" -p"$password" > /dev/null 2>&1; then
                    log "MySQL database is ready"
                    return 0
                else
                    log "MySQL database is not ready"
                    return 1
                fi
            else
                log "Invalid MySQL connection string format"
                return 1
            fi
            ;;
        mongodb)
            if command -v mongosh > /dev/null 2>&1; then
                if timeout "$HEALTH_CHECK_TIMEOUT" mongosh "$DATABASE_URL" \
                   --eval "db.runCommand('ping')" > /dev/null 2>&1; then
                    log "MongoDB database is ready"
                    return 0
                else
                    log "MongoDB database is not ready"
                    return 1
                fi
            else
                log "mongosh not available, using basic connection test"
                if timeout "$HEALTH_CHECK_TIMEOUT" npx sightedit-migrate \
                   --connection "$DATABASE_URL" \
                   --database-type "$DATABASE_TYPE" \
                   status > /dev/null 2>&1; then
                    log "MongoDB database connection successful"
                    return 0
                else
                    log "MongoDB database connection failed"
                    return 1
                fi
            fi
            ;;
        sqlite)
            # For SQLite, check if the file exists and is accessible
            if [[ "$DATABASE_URL" =~ ^(sqlite://)?(.+)$ ]]; then
                local db_file="${BASH_REMATCH[2]}"
                if [[ -f "$db_file" && -r "$db_file" ]]; then
                    log "SQLite database file is accessible"
                    return 0
                else
                    log "SQLite database file is not accessible: $db_file"
                    return 1
                fi
            else
                log "Invalid SQLite connection string format"
                return 1
            fi
            ;;
        *)
            log "Unsupported database type for health check: $DATABASE_TYPE"
            return 1
            ;;
    esac
}

# Check if migration lock is not stuck
check_migration_lock() {
    log "Checking for stuck migration locks..."
    
    # This is a basic check - in a real scenario you might want to
    # check the migration lock table directly
    if [[ -n "$DATABASE_URL" ]]; then
        if timeout "$HEALTH_CHECK_TIMEOUT" npx sightedit-migrate \
           --connection "$DATABASE_URL" \
           --database-type "$DATABASE_TYPE" \
           status > /dev/null 2>&1; then
            log "Migration system is not locked"
            return 0
        else
            log "Migration system might be locked or inaccessible"
            return 1
        fi
    else
        log "No DATABASE_URL provided, skipping lock check"
        return 0
    fi
}

# Check system resources
check_system_resources() {
    log "Checking system resources..."
    
    # Check available disk space
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [[ "$disk_usage" -gt 90 ]]; then
        log "WARNING: Disk usage is at ${disk_usage}%"
        return 1
    fi
    
    # Check available memory
    if [[ -f /proc/meminfo ]]; then
        local mem_available=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
        local mem_total=$(grep MemTotal /proc/meminfo | awk '{print $2}')
        local mem_usage_percent=$((100 - (mem_available * 100 / mem_total)))
        
        if [[ "$mem_usage_percent" -gt 90 ]]; then
            log "WARNING: Memory usage is at ${mem_usage_percent}%"
            return 1
        fi
    fi
    
    log "System resources are healthy"
    return 0
}

# Check if required files exist
check_required_files() {
    log "Checking required files..."
    
    local required_files=(
        "/app/packages/server/node/dist/migrations/core/migration-engine.js"
        "/app/packages/server/node/node_modules/.bin/sightedit-migrate"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log "Required file missing: $file"
            return 1
        fi
    done
    
    log "All required files are present"
    return 0
}

# Main health check function
main() {
    log "Starting health check..."
    
    local exit_code=0
    
    # Run all health checks
    check_required_files || exit_code=1
    check_migration_engine || exit_code=1
    check_system_resources || exit_code=1
    check_database_connection || exit_code=1
    check_migration_lock || exit_code=1
    
    if [[ $exit_code -eq 0 ]]; then
        log "Health check passed"
        echo "OK"
    else
        log "Health check failed"
        echo "FAIL"
    fi
    
    exit $exit_code
}

# Execute main function
main "$@"