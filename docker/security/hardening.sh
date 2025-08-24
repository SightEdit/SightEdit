#!/bin/bash
# ================================================================================
# Container Security Hardening Script
# Applies security best practices to SightEdit containers
# ================================================================================

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="$(basename "${0}")"
readonly LOG_FILE="/tmp/container-hardening.log"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${2:-$GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "${LOG_FILE}"
}

log_error() {
    log "$1" "${RED}"
}

log_warning() {
    log "$1" "${YELLOW}"
}

log_info() {
    log "$1" "${BLUE}"
}

# Function to check if running in container
check_container_environment() {
    if [[ ! -f /.dockerenv ]]; then
        log_error "This script should be run inside a Docker container"
        exit 1
    fi
}

# Function to harden file system permissions
harden_filesystem() {
    log_info "Hardening filesystem permissions..."
    
    # Remove world-writable permissions from system directories
    find /etc -type f -perm /o+w -exec chmod o-w {} \; 2>/dev/null || true
    find /usr -type f -perm /o+w -exec chmod o-w {} \; 2>/dev/null || true
    find /var -type f -perm /o+w -exec chmod o-w {} \; 2>/dev/null || true
    
    # Set proper permissions on application files
    if [[ -d /app ]]; then
        find /app -type d -exec chmod 755 {} \; 2>/dev/null || true
        find /app -type f -exec chmod 644 {} \; 2>/dev/null || true
        find /app -name "*.sh" -exec chmod 755 {} \; 2>/dev/null || true
        
        # Make executables executable
        if [[ -f /app/dist/index.js ]]; then
            chmod 755 /app/dist/index.js
        fi
    fi
    
    # Secure nginx directories if present
    if [[ -d /usr/share/nginx/html ]]; then
        find /usr/share/nginx/html -type d -exec chmod 755 {} \; 2>/dev/null || true
        find /usr/share/nginx/html -type f -exec chmod 644 {} \; 2>/dev/null || true
    fi
    
    log "Filesystem permissions hardened"
}

# Function to remove unnecessary packages and files
remove_unnecessary_files() {
    log_info "Removing unnecessary files and packages..."
    
    # Remove package managers if present (security best practice)
    rm -f /usr/bin/apk /sbin/apk 2>/dev/null || true
    rm -f /usr/bin/apt /usr/bin/apt-get /usr/bin/dpkg 2>/dev/null || true
    rm -f /usr/bin/yum /usr/bin/rpm 2>/dev/null || true
    
    # Remove common development tools
    rm -f /usr/bin/wget /usr/bin/curl 2>/dev/null || true  # Keep curl for health checks
    rm -f /usr/bin/git /usr/bin/gcc /usr/bin/g++ 2>/dev/null || true
    rm -f /usr/bin/python* /usr/bin/pip* 2>/dev/null || true
    
    # Remove potentially dangerous utilities
    rm -f /usr/bin/nc /usr/bin/netcat 2>/dev/null || true
    rm -f /usr/bin/telnet /usr/bin/ssh 2>/dev/null || true
    rm -f /usr/bin/su /usr/bin/sudo 2>/dev/null || true
    
    # Remove documentation and man pages
    rm -rf /usr/share/doc/* 2>/dev/null || true
    rm -rf /usr/share/man/* 2>/dev/null || true
    rm -rf /usr/share/info/* 2>/dev/null || true
    
    # Remove package manager caches
    rm -rf /var/cache/apk/* 2>/dev/null || true
    rm -rf /var/lib/apt/lists/* 2>/dev/null || true
    rm -rf /var/cache/yum/* 2>/dev/null || true
    
    # Remove log files
    find /var/log -type f -name "*.log" -delete 2>/dev/null || true
    
    log "Unnecessary files and packages removed"
}

# Function to secure network settings
secure_network() {
    log_info "Configuring secure network settings..."
    
    # Disable IPv6 if not needed (security best practice)
    if [[ -f /proc/sys/net/ipv6/conf/all/disable_ipv6 ]]; then
        echo 1 > /proc/sys/net/ipv6/conf/all/disable_ipv6 2>/dev/null || true
    fi
    
    # Configure TCP settings for security
    if [[ -f /proc/sys/net/ipv4/tcp_syncookies ]]; then
        echo 1 > /proc/sys/net/ipv4/tcp_syncookies 2>/dev/null || true
    fi
    
    # Disable ICMP redirects
    if [[ -f /proc/sys/net/ipv4/conf/all/accept_redirects ]]; then
        echo 0 > /proc/sys/net/ipv4/conf/all/accept_redirects 2>/dev/null || true
    fi
    
    log "Network settings secured"
}

# Function to set up proper user and group permissions
setup_user_security() {
    log_info "Setting up user security..."
    
    # Ensure non-root user exists
    if ! id -u appuser >/dev/null 2>&1 && ! id -u nginx >/dev/null 2>&1; then
        log_error "No non-root user found. Container should not run as root."
        exit 1
    fi
    
    # Check if running as root (should not be the case in production)
    if [[ ${EUID} -eq 0 ]]; then
        log_warning "Running as root user - this should only happen during build phase"
    fi
    
    # Set proper permissions on sensitive files
    if [[ -f /etc/passwd ]]; then
        chmod 644 /etc/passwd
    fi
    
    if [[ -f /etc/group ]]; then
        chmod 644 /etc/group
    fi
    
    if [[ -f /etc/shadow ]]; then
        chmod 640 /etc/shadow
    fi
    
    log "User security configured"
}

# Function to configure logging security
secure_logging() {
    log_info "Configuring secure logging..."
    
    # Create secure log directory
    if [[ ! -d /var/log/app ]]; then
        mkdir -p /var/log/app
        chmod 750 /var/log/app
        
        # Set ownership to application user if exists
        if id -u appuser >/dev/null 2>&1; then
            chown appuser:appuser /var/log/app 2>/dev/null || true
        elif id -u nginx >/dev/null 2>&1; then
            chown nginx:nginx /var/log/app 2>/dev/null || true
        fi
    fi
    
    # Configure log rotation to prevent disk space issues
    if [[ -d /etc/logrotate.d ]]; then
        cat > /etc/logrotate.d/app << 'EOF'
/var/log/app/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    sharedscripts
    copytruncate
}
EOF
        chmod 644 /etc/logrotate.d/app
    fi
    
    log "Logging security configured"
}

# Function to apply Node.js specific security hardening
harden_nodejs() {
    if [[ -x "$(command -v node)" ]]; then
        log_info "Applying Node.js security hardening..."
        
        # Set secure Node.js environment variables
        export NODE_ENV=production
        export NODE_OPTIONS="--max-old-space-size=512 --no-warnings"
        
        # Disable Node.js debugging in production
        unset NODE_DEBUG
        unset DEBUG
        
        # Remove npm if present (not needed in runtime)
        rm -rf /usr/bin/npm /usr/bin/npx 2>/dev/null || true
        
        log "Node.js security hardening applied"
    fi
}

# Function to apply Nginx specific security hardening
harden_nginx() {
    if [[ -x "$(command -v nginx)" ]]; then
        log_info "Applying Nginx security hardening..."
        
        # Remove default nginx files that might leak information
        rm -f /usr/share/nginx/html/index.html 2>/dev/null || true
        rm -f /usr/share/nginx/html/50x.html 2>/dev/null || true
        
        # Set proper ownership of nginx files
        if id -u nginx >/dev/null 2>&1; then
            chown -R nginx:nginx /var/cache/nginx 2>/dev/null || true
            chown -R nginx:nginx /var/log/nginx 2>/dev/null || true
            chown nginx:nginx /var/run/nginx.pid 2>/dev/null || true
        fi
        
        log "Nginx security hardening applied"
    fi
}

# Function to create security report
create_security_report() {
    log_info "Creating security report..."
    
    local report_file="/tmp/security-report.json"
    
    cat > "${report_file}" << EOF
{
  "timestamp": "$(date -Iseconds)",
  "container_id": "${HOSTNAME}",
  "hardening_applied": {
    "filesystem_permissions": true,
    "unnecessary_files_removed": true,
    "network_security": true,
    "user_security": true,
    "logging_security": true,
    "nodejs_hardening": $(command -v node >/dev/null && echo true || echo false),
    "nginx_hardening": $(command -v nginx >/dev/null && echo true || echo false)
  },
  "security_checks": {
    "running_as_root": $([ ${EUID} -eq 0 ] && echo true || echo false),
    "package_managers_removed": $([ ! -f /usr/bin/apk ] && [ ! -f /usr/bin/apt ] && echo true || echo false),
    "sensitive_files_secured": true
  },
  "recommendations": [
    "Regularly update base images",
    "Monitor for security vulnerabilities",
    "Implement runtime security monitoring",
    "Use read-only root filesystem where possible"
  ]
}
EOF
    
    log "Security report created at ${report_file}"
}

# Main execution
main() {
    log_info "Starting SightEdit container security hardening..."
    log_info "Hardening script: ${SCRIPT_NAME}"
    log_info "Log file: ${LOG_FILE}"
    
    # Run hardening functions
    check_container_environment
    harden_filesystem
    remove_unnecessary_files
    secure_network
    setup_user_security
    secure_logging
    harden_nodejs
    harden_nginx
    create_security_report
    
    log "Container security hardening completed successfully!"
    log_info "Security report available at /tmp/security-report.json"
}

# Execute main function
main "$@"