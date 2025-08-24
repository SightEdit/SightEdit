#!/bin/bash

# ================================
# SightEdit Pre-Deployment Validation Framework
# ================================
# Comprehensive validation suite to run before deployments
# Ensures system readiness and reduces deployment failures

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Configuration
ENVIRONMENT="${1:-production}"
DEPLOYMENT_TYPE="${2:-blue-green}" # blue-green, rolling, canary
TARGET_VERSION="${3:-latest}"
VALIDATION_LEVEL="${4:-full}"      # basic, standard, full, custom
PARALLEL_VALIDATION="${PARALLEL_VALIDATION:-true}"
FAIL_FAST="${FAIL_FAST:-false}"
GENERATE_REPORT="${GENERATE_REPORT:-true}"

# Load environment configuration
ENV_CONFIG_FILE="$PROJECT_ROOT/config/environments/$ENVIRONMENT.env"
if [[ -f "$ENV_CONFIG_FILE" ]]; then
    set -o allexport
    source "$ENV_CONFIG_FILE"
    set +o allexport
fi

# Validation configuration
VALIDATION_TIMEOUT=1800  # 30 minutes
TEST_TIMEOUT=600        # 10 minutes per test suite
BUILD_TIMEOUT=900       # 15 minutes for builds
SECURITY_SCAN_TIMEOUT=300 # 5 minutes for security scans

# Results tracking
VALIDATION_RESULTS_FILE="/tmp/sightedit-validation-results-$(date +%s)"
VALIDATION_REPORT_FILE="/tmp/sightedit-validation-report-$(date +%Y%m%d-%H%M%S).json"
PASSED_VALIDATIONS=()
FAILED_VALIDATIONS=()
WARNING_VALIDATIONS=()
SKIPPED_VALIDATIONS=()

# ================================
# Logging and Reporting
# ================================

LOG_FILE="/var/log/sightedit/pre-deployment-validation-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local level=$1
    shift
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [PRE-VALIDATION] [$level] $*" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# Colored output for validation results
print_validation_result() {
    local status=$1
    local message=$2
    local color=""
    
    case $status in
        "PASS") color="\033[32m✓" ;;      # Green checkmark
        "FAIL") color="\033[31m✗" ;;      # Red X
        "WARN") color="\033[33m⚠" ;;      # Yellow warning
        "SKIP") color="\033[36m-" ;;      # Cyan dash
        *) color="\033[0m " ;;            # Default
    esac
    
    echo -e "${color} $message\033[0m"
}

# ================================
# Validation Framework
# ================================

run_validation() {
    local validation_name="$1"
    local validation_function="$2"
    local validation_timeout="${3:-300}"
    local validation_critical="${4:-true}"
    local validation_category="${5:-general}"
    
    local start_time=$(date +%s)
    local result=""
    local message=""
    local status="UNKNOWN"
    local details=""
    
    log_info "Running validation: $validation_name"
    print_validation_result "INFO" "Starting $validation_name..."
    
    # Capture output and run with timeout
    local temp_output=$(mktemp)
    if timeout "$validation_timeout" bash -c "$validation_function" > "$temp_output" 2>&1; then
        status="PASS"
        message="$validation_name completed successfully"
        PASSED_VALIDATIONS+=("$validation_name")
        print_validation_result "PASS" "$validation_name"
    else
        local exit_code=$?
        details=$(cat "$temp_output" | tail -20)
        
        if [[ $exit_code -eq 124 ]]; then
            status="FAIL"
            message="$validation_name timed out after ${validation_timeout}s"
        else
            status="FAIL"
            message="$validation_name failed with exit code $exit_code"
        fi
        
        if [[ "$validation_critical" == "true" ]]; then
            FAILED_VALIDATIONS+=("$validation_name")
            print_validation_result "FAIL" "$validation_name - $message"
            
            if [[ "$FAIL_FAST" == "true" ]]; then
                log_error "Fail-fast enabled, stopping validation due to critical failure: $validation_name"
                rm -f "$temp_output"
                exit 1
            fi
        else
            WARNING_VALIDATIONS+=("$validation_name")
            print_validation_result "WARN" "$validation_name - $message (non-critical)"
            status="WARN"
        fi
    fi
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Record result
    cat >> "$VALIDATION_RESULTS_FILE" <<EOF
{
  "name": "$validation_name",
  "category": "$validation_category",
  "status": "$status",
  "duration": $duration,
  "timeout": $validation_timeout,
  "critical": $validation_critical,
  "message": "$message",
  "details": "$(echo "$details" | sed 's/"/\\"/g' | tr '\n' ' ')",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
    
    rm -f "$temp_output"
    log_info "Validation completed: $validation_name - $status (${duration}s)"
}

# ================================
# Code Quality Validations
# ================================

validate_code_compilation() {
    log_info "Validating code compilation"
    
    cd "$PROJECT_ROOT"
    
    # TypeScript compilation
    if ! npm run typecheck; then
        log_error "TypeScript compilation failed"
        return 1
    fi
    
    # Build process
    if ! timeout "$BUILD_TIMEOUT" npm run build; then
        log_error "Build process failed or timed out"
        return 1
    fi
    
    log_success "Code compilation validation passed"
    return 0
}

validate_code_quality() {
    log_info "Validating code quality standards"
    
    cd "$PROJECT_ROOT"
    
    # Linting
    if ! npm run lint; then
        log_error "Code linting failed"
        return 1
    fi
    
    # Formatting check
    if ! npm run format:check; then
        log_error "Code formatting check failed"
        return 1
    fi
    
    log_success "Code quality validation passed"
    return 0
}

validate_dependencies() {
    log_info "Validating project dependencies"
    
    cd "$PROJECT_ROOT"
    
    # Check for outdated dependencies
    local outdated_deps=$(npm outdated --json 2>/dev/null | jq -r 'keys[]' 2>/dev/null || echo "")
    if [[ -n "$outdated_deps" ]]; then
        log_warn "Outdated dependencies found: $outdated_deps"
    fi
    
    # Security audit
    if ! npm audit --audit-level high; then
        log_error "Security audit found high/critical vulnerabilities"
        return 1
    fi
    
    # Check for unused dependencies
    if command -v depcheck >/dev/null; then
        local unused_deps=$(depcheck --json | jq -r '.dependencies[]' 2>/dev/null || echo "")
        if [[ -n "$unused_deps" ]]; then
            log_warn "Unused dependencies found: $unused_deps"
        fi
    fi
    
    log_success "Dependencies validation passed"
    return 0
}

# ================================
# Test Suite Validations
# ================================

validate_unit_tests() {
    log_info "Running unit test validation"
    
    cd "$PROJECT_ROOT"
    
    # Run unit tests with coverage
    if ! timeout "$TEST_TIMEOUT" npm run test:unit; then
        log_error "Unit tests failed or timed out"
        return 1
    fi
    
    # Check test coverage if available
    if [[ -f "coverage/lcov.info" ]]; then
        local coverage=$(grep -o 'LF:[0-9]*' coverage/lcov.info | cut -d: -f2 | awk '{s+=$1} END {print s}' || echo "0")
        local covered=$(grep -o 'LH:[0-9]*' coverage/lcov.info | cut -d: -f2 | awk '{s+=$1} END {print s}' || echo "0")
        
        if [[ $coverage -gt 0 ]]; then
            local coverage_percent=$((covered * 100 / coverage))
            log_info "Test coverage: ${coverage_percent}%"
            
            if [[ $coverage_percent -lt 70 ]]; then
                log_warn "Test coverage below recommended threshold: ${coverage_percent}%"
            fi
        fi
    fi
    
    log_success "Unit tests validation passed"
    return 0
}

validate_integration_tests() {
    log_info "Running integration test validation"
    
    cd "$PROJECT_ROOT"
    
    # Check if integration tests exist
    if [[ ! -d "integration-tests" && ! -f "jest.config.integration.js" ]]; then
        log_warn "No integration tests found, skipping"
        return 0
    fi
    
    # Run integration tests
    if ! timeout "$TEST_TIMEOUT" npm run test:integration 2>/dev/null; then
        log_error "Integration tests failed or timed out"
        return 1
    fi
    
    log_success "Integration tests validation passed"
    return 0
}

validate_e2e_tests() {
    log_info "Running E2E test validation (smoke tests only)"
    
    cd "$PROJECT_ROOT/e2e"
    
    # Run only critical E2E tests for pre-deployment validation
    local smoke_tests="tests/core-functionality.spec.ts"
    
    if [[ -f "$smoke_tests" ]]; then
        if ! timeout "$TEST_TIMEOUT" npm test -- "$smoke_tests"; then
            log_error "Critical E2E tests failed"
            return 1
        fi
    else
        log_warn "No smoke E2E tests found, skipping"
        return 0
    fi
    
    log_success "E2E smoke tests validation passed"
    return 0
}

# ================================
# Security Validations
# ================================

validate_docker_security() {
    log_info "Running Docker security validation"
    
    # Build target image for security scanning
    local image_tag="sightedit/web:$TARGET_VERSION"
    
    if ! docker build -t "$image_tag" "$PROJECT_ROOT"; then
        log_error "Failed to build Docker image for security scanning"
        return 1
    fi
    
    # Security scanning with Trivy if available
    if command -v trivy >/dev/null; then
        log_info "Running Trivy security scan"
        if ! timeout "$SECURITY_SCAN_TIMEOUT" trivy image --exit-code 0 --severity HIGH,CRITICAL "$image_tag"; then
            log_error "Docker image security scan found critical vulnerabilities"
            return 1
        fi
    else
        log_warn "Trivy not available, skipping Docker security scan"
    fi
    
    # Check for security best practices in Dockerfile
    if [[ -f "$PROJECT_ROOT/Dockerfile" ]]; then
        # Check for running as root
        if ! grep -q "USER" "$PROJECT_ROOT/Dockerfile"; then
            log_warn "Dockerfile does not specify non-root user"
        fi
        
        # Check for HEALTHCHECK
        if ! grep -q "HEALTHCHECK" "$PROJECT_ROOT/Dockerfile"; then
            log_warn "Dockerfile does not include HEALTHCHECK instruction"
        fi
    fi
    
    log_success "Docker security validation completed"
    return 0
}

validate_secrets_management() {
    log_info "Validating secrets management"
    
    # Check for hardcoded secrets in code
    local secret_patterns=(
        "password.*=.*['\"][^'\"]+['\"]"
        "secret.*=.*['\"][^'\"]+['\"]"
        "key.*=.*['\"][^'\"]+['\"]"
        "token.*=.*['\"][^'\"]+['\"]"
    )
    
    local secrets_found=false
    for pattern in "${secret_patterns[@]}"; do
        if grep -r -i "$pattern" "$PROJECT_ROOT/packages" 2>/dev/null | grep -v node_modules | grep -v ".git" | head -5; then
            secrets_found=true
        fi
    done
    
    if [[ "$secrets_found" == true ]]; then
        log_error "Potential hardcoded secrets found in code"
        return 1
    fi
    
    # Check environment variables are properly configured
    local required_secrets=("JWT_SECRET" "DB_PASSWORD" "REDIS_PASSWORD")
    for secret in "${required_secrets[@]}"; do
        if [[ -z "${!secret:-}" ]]; then
            log_error "Required secret not configured: $secret"
            return 1
        fi
    done
    
    log_success "Secrets management validation passed"
    return 0
}

validate_ssl_configuration() {
    log_info "Validating SSL/TLS configuration"
    
    # Check SSL certificate validity for domain
    if [[ -n "${DOMAIN:-}" ]]; then
        local cert_info=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
        
        if [[ -n "$cert_info" ]]; then
            local not_after=$(echo "$cert_info" | grep "notAfter=" | cut -d= -f2)
            local expiry_date=$(date -d "$not_after" +%s 2>/dev/null || echo "0")
            local current_date=$(date +%s)
            local days_until_expiry=$(( (expiry_date - current_date) / 86400 ))
            
            if [[ $days_until_expiry -lt 30 ]]; then
                log_error "SSL certificate expires soon: $days_until_expiry days"
                return 1
            else
                log_info "SSL certificate valid for $days_until_expiry days"
            fi
        else
            log_warn "Could not validate SSL certificate for $DOMAIN"
        fi
    fi
    
    log_success "SSL configuration validation passed"
    return 0
}

# ================================
# Infrastructure Validations
# ================================

validate_resource_requirements() {
    log_info "Validating system resource requirements"
    
    # Check available disk space
    local required_disk_gb=10
    local available_disk=$(df /var/lib/docker | awk 'NR==2 {print int($4/1024/1024)}')
    
    if [[ $available_disk -lt $required_disk_gb ]]; then
        log_error "Insufficient disk space: ${available_disk}GB available, ${required_disk_gb}GB required"
        return 1
    fi
    
    # Check available memory
    local required_memory_gb=4
    local available_memory=$(free -g | awk 'NR==2{print $7}')
    
    if [[ $available_memory -lt $required_memory_gb ]]; then
        log_error "Insufficient memory: ${available_memory}GB available, ${required_memory_gb}GB required"
        return 1
    fi
    
    # Check Docker daemon status
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon not running or accessible"
        return 1
    fi
    
    log_success "Resource requirements validation passed"
    return 0
}

validate_database_readiness() {
    log_info "Validating database readiness"
    
    # Check database connectivity
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary pg_isready -U "$DB_USER" -d "$DB_NAME"; then
        log_error "Database not ready or accessible"
        return 1
    fi
    
    # Check database performance
    local start_time=$(date +%s%3N)
    docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" >/dev/null
    local end_time=$(date +%s%3N)
    local query_time=$((end_time - start_time))
    
    if [[ $query_time -gt 5000 ]]; then
        log_error "Database performance degraded: ${query_time}ms for simple query"
        return 1
    fi
    
    # Check database connections
    local active_connections=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity;" | xargs)
    
    local max_connections=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T postgres-primary \
        psql -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW max_connections;" | xargs)
    
    local connection_usage=$((active_connections * 100 / max_connections))
    
    if [[ $connection_usage -gt 80 ]]; then
        log_error "Database connection usage too high: ${connection_usage}%"
        return 1
    fi
    
    log_success "Database readiness validation passed"
    return 0
}

validate_redis_readiness() {
    log_info "Validating Redis readiness"
    
    # Check Redis connectivity
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T redis-primary redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping | grep -q PONG; then
        log_error "Redis not ready or accessible"
        return 1
    fi
    
    # Check Redis memory usage
    local memory_info=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        exec -T redis-primary redis-cli --no-auth-warning -a "$REDIS_PASSWORD" info memory)
    
    local used_memory=$(echo "$memory_info" | grep "used_memory:" | cut -d: -f2 | tr -d '\r')
    local max_memory=$(echo "$memory_info" | grep "maxmemory:" | cut -d: -f2 | tr -d '\r')
    
    if [[ "$max_memory" != "0" ]]; then
        local memory_usage=$((used_memory * 100 / max_memory))
        if [[ $memory_usage -gt 80 ]]; then
            log_error "Redis memory usage too high: ${memory_usage}%"
            return 1
        fi
    fi
    
    log_success "Redis readiness validation passed"
    return 0
}

# ================================
# Deployment-Specific Validations
# ================================

validate_deployment_strategy() {
    log_info "Validating deployment strategy: $DEPLOYMENT_TYPE"
    
    case "$DEPLOYMENT_TYPE" in
        blue-green)
            validate_blue_green_readiness
            ;;
        rolling)
            validate_rolling_readiness
            ;;
        canary)
            validate_canary_readiness
            ;;
        *)
            log_error "Unknown deployment type: $DEPLOYMENT_TYPE"
            return 1
            ;;
    esac
}

validate_blue_green_readiness() {
    log_info "Validating blue-green deployment readiness"
    
    # Check that both slots can be created
    local slots=("blue" "green")
    for slot in "${slots[@]}"; do
        if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" config | grep -q "web-$slot"; then
            log_error "Blue-green configuration missing for slot: $slot"
            return 1
        fi
    done
    
    # Check load balancer configuration
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        ps traefik >/dev/null 2>&1; then
        log_error "Load balancer (Traefik) not running for blue-green deployment"
        return 1
    fi
    
    log_success "Blue-green deployment readiness validated"
    return 0
}

validate_rolling_readiness() {
    log_info "Validating rolling deployment readiness"
    
    # Check that multiple instances can be supported
    local required_instances=2
    local max_instances=$(docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" config | grep -c "web-" || echo "1")
    
    if [[ $max_instances -lt $required_instances ]]; then
        log_error "Insufficient service instances for rolling deployment: $max_instances < $required_instances"
        return 1
    fi
    
    log_success "Rolling deployment readiness validated"
    return 0
}

validate_canary_readiness() {
    log_info "Validating canary deployment readiness"
    
    # Check monitoring stack for metrics collection
    if ! docker-compose -f "$PROJECT_ROOT/docker-compose.production.yml" \
        ps prometheus >/dev/null 2>&1; then
        log_warn "Prometheus not running, canary metrics collection may be limited"
    fi
    
    # Check load balancer supports weighted routing
    if ! curl -s "http://localhost:8080/api/http/services" >/dev/null 2>&1; then
        log_error "Load balancer API not accessible for canary routing"
        return 1
    fi
    
    log_success "Canary deployment readiness validated"
    return 0
}

# ================================
# Network and Connectivity Validations
# ================================

validate_network_connectivity() {
    log_info "Validating network connectivity"
    
    # Check external connectivity
    if ! curl -s -m 10 "https://google.com" >/dev/null; then
        log_error "External network connectivity failed"
        return 1
    fi
    
    # Check internal service connectivity
    local services=("postgres-primary:5432" "redis-primary:6379")
    for service in "${services[@]}"; do
        local host=$(echo "$service" | cut -d: -f1)
        local port=$(echo "$service" | cut -d: -f2)
        
        if ! nc -z "$host" "$port" 2>/dev/null; then
            log_error "Cannot connect to internal service: $service"
            return 1
        fi
    done
    
    # Check DNS resolution
    if ! nslookup "$DOMAIN" >/dev/null 2>&1; then
        log_error "DNS resolution failed for domain: $DOMAIN"
        return 1
    fi
    
    log_success "Network connectivity validation passed"
    return 0
}

# ================================
# Performance Validations
# ================================

validate_performance_baseline() {
    log_info "Validating performance baseline"
    
    # Check current application performance
    if curl -s "https://$DOMAIN/health" >/dev/null 2>&1; then
        local start_time=$(date +%s%3N)
        curl -s -m 30 "https://$DOMAIN/" >/dev/null
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))
        
        if [[ $response_time -gt 5000 ]]; then
            log_error "Current application performance degraded: ${response_time}ms"
            return 1
        fi
        
        log_info "Current application response time: ${response_time}ms"
    else
        log_warn "Cannot access current application for performance baseline"
    fi
    
    log_success "Performance baseline validation completed"
    return 0
}

# ================================
# Validation Orchestration
# ================================

run_basic_validations() {
    log_info "Running basic pre-deployment validations"
    
    run_validation "resource_requirements" "validate_resource_requirements" 60 true "infrastructure"
    run_validation "network_connectivity" "validate_network_connectivity" 120 true "infrastructure"
    run_validation "database_readiness" "validate_database_readiness" 120 true "infrastructure"
    run_validation "redis_readiness" "validate_redis_readiness" 60 true "infrastructure"
}

run_standard_validations() {
    log_info "Running standard pre-deployment validations"
    
    run_basic_validations
    
    run_validation "code_compilation" "validate_code_compilation" "$BUILD_TIMEOUT" true "code"
    run_validation "code_quality" "validate_code_quality" 300 true "code"
    run_validation "unit_tests" "validate_unit_tests" "$TEST_TIMEOUT" true "testing"
    run_validation "deployment_strategy" "validate_deployment_strategy" 120 true "deployment"
    run_validation "secrets_management" "validate_secrets_management" 180 true "security"
}

run_full_validations() {
    log_info "Running full pre-deployment validations"
    
    if [[ "$PARALLEL_VALIDATION" == "true" ]]; then
        log_info "Running validations in parallel where possible"
        
        # Run infrastructure validations first (dependencies)
        run_basic_validations
        
        # Run other validations in parallel
        {
            run_validation "code_compilation" "validate_code_compilation" "$BUILD_TIMEOUT" true "code"
            run_validation "code_quality" "validate_code_quality" 300 true "code"
            run_validation "dependencies" "validate_dependencies" 300 false "code"
        } &
        
        {
            run_validation "unit_tests" "validate_unit_tests" "$TEST_TIMEOUT" true "testing"
            run_validation "integration_tests" "validate_integration_tests" "$TEST_TIMEOUT" false "testing"
            run_validation "e2e_tests" "validate_e2e_tests" "$TEST_TIMEOUT" false "testing"
        } &
        
        {
            run_validation "docker_security" "validate_docker_security" "$SECURITY_SCAN_TIMEOUT" false "security"
            run_validation "ssl_configuration" "validate_ssl_configuration" 120 false "security"
        } &
        
        {
            run_validation "deployment_strategy" "validate_deployment_strategy" 120 true "deployment"
            run_validation "performance_baseline" "validate_performance_baseline" 180 false "performance"
        } &
        
        wait # Wait for all background jobs to complete
        
    else
        # Sequential execution
        run_standard_validations
        run_validation "dependencies" "validate_dependencies" 300 false "code"
        run_validation "integration_tests" "validate_integration_tests" "$TEST_TIMEOUT" false "testing"
        run_validation "e2e_tests" "validate_e2e_tests" "$TEST_TIMEOUT" false "testing"
        run_validation "docker_security" "validate_docker_security" "$SECURITY_SCAN_TIMEOUT" false "security"
        run_validation "ssl_configuration" "validate_ssl_configuration" 120 false "security"
        run_validation "performance_baseline" "validate_performance_baseline" 180 false "performance"
    fi
}

# ================================
# Report Generation
# ================================

generate_validation_report() {
    if [[ "$GENERATE_REPORT" != "true" ]]; then
        return 0
    fi
    
    log_info "Generating pre-deployment validation report"
    
    local total_validations=$((${#PASSED_VALIDATIONS[@]} + ${#FAILED_VALIDATIONS[@]} + ${#WARNING_VALIDATIONS[@]} + ${#SKIPPED_VALIDATIONS[@]}))
    local overall_status="UNKNOWN"
    
    if [[ ${#FAILED_VALIDATIONS[@]} -eq 0 ]]; then
        if [[ ${#WARNING_VALIDATIONS[@]} -eq 0 ]]; then
            overall_status="READY"
        else
            overall_status="READY_WITH_WARNINGS"
        fi
    else
        overall_status="NOT_READY"
    fi
    
    # Generate JSON report
    cat > "$VALIDATION_REPORT_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "deployment_type": "$DEPLOYMENT_TYPE",
  "target_version": "$TARGET_VERSION",
  "validation_level": "$VALIDATION_LEVEL",
  "overall_status": "$overall_status",
  "summary": {
    "total": $total_validations,
    "passed": ${#PASSED_VALIDATIONS[@]},
    "failed": ${#FAILED_VALIDATIONS[@]},
    "warnings": ${#WARNING_VALIDATIONS[@]},
    "skipped": ${#SKIPPED_VALIDATIONS[@]}
  },
  "results": {
    "passed": [$(printf '"%s",' "${PASSED_VALIDATIONS[@]}" | sed 's/,$//')],
    "failed": [$(printf '"%s",' "${FAILED_VALIDATIONS[@]}" | sed 's/,$//')],
    "warnings": [$(printf '"%s",' "${WARNING_VALIDATIONS[@]}" | sed 's/,$//')],
    "skipped": [$(printf '"%s",' "${SKIPPED_VALIDATIONS[@]}" | sed 's/,$//')]
  },
  "validations": [
$(if [[ -f "$VALIDATION_RESULTS_FILE" ]]; then cat "$VALIDATION_RESULTS_FILE" | sed '$!s/$/,/'; fi)
  ]
}
EOF
    
    # Generate human-readable summary
    echo ""
    echo "======================================"
    echo "Pre-Deployment Validation Summary"
    echo "======================================"
    echo "Environment: $ENVIRONMENT"
    echo "Deployment Type: $DEPLOYMENT_TYPE"
    echo "Target Version: $TARGET_VERSION"
    echo "Validation Level: $VALIDATION_LEVEL"
    echo "Timestamp: $(date)"
    echo ""
    echo "Overall Status: $overall_status"
    echo ""
    echo "Results:"
    echo "  Total Validations: $total_validations"
    print_validation_result "PASS" "Passed: ${#PASSED_VALIDATIONS[@]}"
    print_validation_result "FAIL" "Failed: ${#FAILED_VALIDATIONS[@]}"
    print_validation_result "WARN" "Warnings: ${#WARNING_VALIDATIONS[@]}"
    print_validation_result "SKIP" "Skipped: ${#SKIPPED_VALIDATIONS[@]}"
    echo ""
    
    if [[ ${#FAILED_VALIDATIONS[@]} -gt 0 ]]; then
        echo "Failed Validations:"
        for validation in "${FAILED_VALIDATIONS[@]}"; do
            print_validation_result "FAIL" "$validation"
        done
        echo ""
    fi
    
    if [[ ${#WARNING_VALIDATIONS[@]} -gt 0 ]]; then
        echo "Warning Validations:"
        for validation in "${WARNING_VALIDATIONS[@]}"; do
            print_validation_result "WARN" "$validation"
        done
        echo ""
    fi
    
    echo "Detailed report: $VALIDATION_REPORT_FILE"
    echo "Validation log: $LOG_FILE"
    echo "======================================"
    
    # Return appropriate exit code
    if [[ ${#FAILED_VALIDATIONS[@]} -eq 0 ]]; then
        log_success "Pre-deployment validation completed successfully"
        return 0
    else
        log_error "Pre-deployment validation failed"
        return 1
    fi
}

# ================================
# Main Function
# ================================

main() {
    log_info "Starting pre-deployment validation framework"
    log_info "Environment: $ENVIRONMENT, Type: $DEPLOYMENT_TYPE, Version: $TARGET_VERSION"
    log_info "Validation level: $VALIDATION_LEVEL, Parallel: $PARALLEL_VALIDATION, Fail-fast: $FAIL_FAST"
    
    # Initialize results file
    echo "# Pre-deployment validation results" > "$VALIDATION_RESULTS_FILE"
    
    # Set validation timeout
    timeout "$VALIDATION_TIMEOUT" bash -c "
        case '$VALIDATION_LEVEL' in
            basic)
                run_basic_validations
                ;;
            standard)
                run_standard_validations
                ;;
            full)
                run_full_validations
                ;;
            custom)
                # Allow custom validation configuration
                if [[ -f '$PROJECT_ROOT/config/custom-validations.sh' ]]; then
                    source '$PROJECT_ROOT/config/custom-validations.sh'
                else
                    log_error 'Custom validation level specified but no custom configuration found'
                    exit 1
                fi
                ;;
            *)
                log_error 'Unknown validation level: $VALIDATION_LEVEL'
                exit 1
                ;;
        esac
    "
    
    # Generate and display report
    generate_validation_report
}

# ================================
# Command Line Interface
# ================================

show_usage() {
    echo "Usage: $0 [ENVIRONMENT] [DEPLOYMENT_TYPE] [TARGET_VERSION] [VALIDATION_LEVEL]"
    echo ""
    echo "Arguments:"
    echo "  ENVIRONMENT        Target environment (default: production)"
    echo "  DEPLOYMENT_TYPE    Type of deployment: blue-green, rolling, canary (default: blue-green)"
    echo "  TARGET_VERSION     Version being deployed (default: latest)"
    echo "  VALIDATION_LEVEL   Level of validation: basic, standard, full, custom (default: full)"
    echo ""
    echo "Environment Variables:"
    echo "  PARALLEL_VALIDATION  Run validations in parallel where possible (default: true)"
    echo "  FAIL_FAST           Stop on first critical failure (default: false)"
    echo "  GENERATE_REPORT     Generate detailed validation report (default: true)"
    echo ""
    echo "Examples:"
    echo "  $0 production blue-green v1.2.3 full"
    echo "  $0 staging rolling latest standard"
    echo "  FAIL_FAST=true $0 production canary v1.2.3 basic"
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