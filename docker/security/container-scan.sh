#!/bin/bash
# ================================================================================
# Container Security Scanning Script
# Comprehensive security analysis using multiple scanners
# ================================================================================

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="$(basename "${0}")"
readonly LOG_FILE="/tmp/container-security-scan.log"
readonly RESULTS_DIR="/tmp/security-scan-results"
readonly CONFIG_FILE="${CONFIG_FILE:-docker/security/security-scan.yml}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Default values
DEFAULT_TARGET=""
DEFAULT_OUTPUT_FORMAT="json,sarif,html"
DEFAULT_SCANNERS="trivy,grype,snyk"
DEFAULT_SEVERITY="CRITICAL,HIGH,MEDIUM"

# Parse command line arguments
TARGET="${1:-$DEFAULT_TARGET}"
OUTPUT_FORMAT="${OUTPUT_FORMAT:-$DEFAULT_OUTPUT_FORMAT}"
SCANNERS="${SCANNERS:-$DEFAULT_SCANNERS}"
SEVERITY="${SEVERITY:-$DEFAULT_SEVERITY}"
EXIT_CODE="${EXIT_CODE:-1}"
PARALLEL="${PARALLEL:-true}"
UPLOAD_RESULTS="${UPLOAD_RESULTS:-false}"

# Scan results tracking
declare -A SCAN_RESULTS=()
TOTAL_CRITICAL=0
TOTAL_HIGH=0
TOTAL_MEDIUM=0
TOTAL_LOW=0

# Logging functions
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

# Function to show usage
usage() {
    cat << EOF
Usage: $SCRIPT_NAME <IMAGE_NAME>

Scan container images for security vulnerabilities using multiple scanners.

Arguments:
  IMAGE_NAME        Container image to scan (required)

Environment Variables:
  OUTPUT_FORMAT     Output formats: json,sarif,html (default: json,sarif,html)
  SCANNERS          Scanners to use: trivy,grype,snyk,clair (default: trivy,grype,snyk)
  SEVERITY          Severity levels: CRITICAL,HIGH,MEDIUM,LOW (default: CRITICAL,HIGH,MEDIUM)
  EXIT_CODE         Exit code on vulnerabilities found (default: 1)
  PARALLEL          Run scanners in parallel (default: true)
  UPLOAD_RESULTS    Upload results to security dashboard (default: false)

Examples:
  $SCRIPT_NAME sightedit/core:latest
  SCANNERS=trivy,grype $SCRIPT_NAME sightedit/cdn:v1.0.0
  OUTPUT_FORMAT=sarif EXIT_CODE=0 $SCRIPT_NAME sightedit/website:staging
EOF
}

# Function to setup results directory
setup_results_dir() {
    log_info "Setting up results directory..."
    
    mkdir -p "$RESULTS_DIR"
    chmod 755 "$RESULTS_DIR"
    
    # Create subdirectories for each scanner
    IFS=',' read -ra SCANNER_ARRAY <<< "$SCANNERS"
    for scanner in "${SCANNER_ARRAY[@]}"; do
        mkdir -p "$RESULTS_DIR/$scanner"
    done
    
    log "Results directory created: $RESULTS_DIR"
}

# Function to check scanner availability
check_scanner_availability() {
    local scanner="$1"
    
    case "$scanner" in
        trivy)
            if ! command -v trivy >/dev/null 2>&1; then
                log_warning "Trivy not found, installing..."
                install_trivy
            fi
            ;;
        grype)
            if ! command -v grype >/dev/null 2>&1; then
                log_warning "Grype not found, installing..."
                install_grype
            fi
            ;;
        snyk)
            if ! command -v snyk >/dev/null 2>&1; then
                log_warning "Snyk not found, installing..."
                install_snyk
            fi
            ;;
        clair)
            if ! command -v clair-scanner >/dev/null 2>&1; then
                log_warning "Clair scanner not available, skipping..."
                return 1
            fi
            ;;
        *)
            log_error "Unknown scanner: $scanner"
            return 1
            ;;
    esac
    
    return 0
}

# Function to install Trivy
install_trivy() {
    log_info "Installing Trivy..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew install trivy
    else
        log_error "Unsupported OS for automatic Trivy installation"
        return 1
    fi
    
    log "Trivy installed successfully"
}

# Function to install Grype
install_grype() {
    log_info "Installing Grype..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        brew tap anchore/grype
        brew install grype
    else
        log_error "Unsupported OS for automatic Grype installation"
        return 1
    fi
    
    log "Grype installed successfully"
}

# Function to install Snyk
install_snyk() {
    log_info "Installing Snyk..."
    
    if command -v npm >/dev/null 2>&1; then
        npm install -g snyk
    elif command -v yarn >/dev/null 2>&1; then
        yarn global add snyk
    else
        log_error "Node.js/npm required for Snyk installation"
        return 1
    fi
    
    log "Snyk installed successfully"
}

# Function to run Trivy scan
scan_with_trivy() {
    local target="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    
    log_info "Running Trivy scan on $target..."
    
    local base_name=$(echo "$target" | tr '/:' '--')
    local output_prefix="$RESULTS_DIR/trivy/trivy-$base_name-$timestamp"
    
    # JSON output
    if [[ "$OUTPUT_FORMAT" == *"json"* ]]; then
        trivy image \
            --format json \
            --output "$output_prefix.json" \
            --severity "$SEVERITY" \
            --quiet \
            "$target"
    fi
    
    # SARIF output
    if [[ "$OUTPUT_FORMAT" == *"sarif"* ]]; then
        trivy image \
            --format sarif \
            --output "$output_prefix.sarif" \
            --severity "$SEVERITY" \
            --quiet \
            "$target"
    fi
    
    # HTML output
    if [[ "$OUTPUT_FORMAT" == *"html"* ]]; then
        trivy image \
            --format template \
            --template '@contrib/html.tpl' \
            --output "$output_prefix.html" \
            --severity "$SEVERITY" \
            --quiet \
            "$target"
    fi
    
    # Parse results for summary
    if [[ -f "$output_prefix.json" ]]; then
        parse_trivy_results "$output_prefix.json"
    fi
    
    SCAN_RESULTS["trivy"]="completed"
    log "Trivy scan completed: $output_prefix.*"
}

# Function to run Grype scan
scan_with_grype() {
    local target="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    
    log_info "Running Grype scan on $target..."
    
    local base_name=$(echo "$target" | tr '/:' '--')
    local output_prefix="$RESULTS_DIR/grype/grype-$base_name-$timestamp"
    
    # JSON output
    if [[ "$OUTPUT_FORMAT" == *"json"* ]]; then
        grype "$target" \
            --output json \
            --file "$output_prefix.json" \
            --quiet 2>/dev/null || true
    fi
    
    # SARIF output (if supported)
    if [[ "$OUTPUT_FORMAT" == *"sarif"* ]]; then
        grype "$target" \
            --output sarif \
            --file "$output_prefix.sarif" \
            --quiet 2>/dev/null || true
    fi
    
    # Table output for HTML conversion
    if [[ "$OUTPUT_FORMAT" == *"html"* ]]; then
        grype "$target" \
            --output table \
            --file "$output_prefix.txt" \
            --quiet 2>/dev/null || true
        
        # Convert to HTML (basic conversion)
        if [[ -f "$output_prefix.txt" ]]; then
            convert_text_to_html "$output_prefix.txt" "$output_prefix.html" "Grype Scan Results"
        fi
    fi
    
    # Parse results for summary
    if [[ -f "$output_prefix.json" ]]; then
        parse_grype_results "$output_prefix.json"
    fi
    
    SCAN_RESULTS["grype"]="completed"
    log "Grype scan completed: $output_prefix.*"
}

# Function to run Snyk scan
scan_with_snyk() {
    local target="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    
    log_info "Running Snyk scan on $target..."
    
    if [[ -z "${SNYK_TOKEN:-}" ]]; then
        log_warning "SNYK_TOKEN not set, skipping Snyk scan"
        SCAN_RESULTS["snyk"]="skipped"
        return 0
    fi
    
    local base_name=$(echo "$target" | tr '/:' '--')
    local output_prefix="$RESULTS_DIR/snyk/snyk-$base_name-$timestamp"
    
    # Authenticate with Snyk
    snyk auth "$SNYK_TOKEN" >/dev/null 2>&1 || true
    
    # JSON output
    if [[ "$OUTPUT_FORMAT" == *"json"* ]]; then
        snyk container test "$target" \
            --json > "$output_prefix.json" 2>/dev/null || true
    fi
    
    # SARIF output
    if [[ "$OUTPUT_FORMAT" == *"sarif"* ]]; then
        snyk container test "$target" \
            --sarif > "$output_prefix.sarif" 2>/dev/null || true
    fi
    
    # HTML output
    if [[ "$OUTPUT_FORMAT" == *"html"* ]]; then
        snyk container test "$target" \
            --json > "$output_prefix.temp.json" 2>/dev/null || true
        
        if [[ -f "$output_prefix.temp.json" ]]; then
            convert_snyk_json_to_html "$output_prefix.temp.json" "$output_prefix.html"
            rm -f "$output_prefix.temp.json"
        fi
    fi
    
    # Parse results for summary
    if [[ -f "$output_prefix.json" ]]; then
        parse_snyk_results "$output_prefix.json"
    fi
    
    SCAN_RESULTS["snyk"]="completed"
    log "Snyk scan completed: $output_prefix.*"
}

# Function to parse Trivy results
parse_trivy_results() {
    local json_file="$1"
    
    if ! command -v jq >/dev/null 2>&1; then
        log_warning "jq not available, skipping result parsing"
        return 0
    fi
    
    local critical high medium low
    critical=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL") | .VulnerabilityID' "$json_file" 2>/dev/null | wc -l || echo 0)
    high=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity=="HIGH") | .VulnerabilityID' "$json_file" 2>/dev/null | wc -l || echo 0)
    medium=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity=="MEDIUM") | .VulnerabilityID' "$json_file" 2>/dev/null | wc -l || echo 0)
    low=$(jq -r '.Results[]?.Vulnerabilities[]? | select(.Severity=="LOW") | .VulnerabilityID' "$json_file" 2>/dev/null | wc -l || echo 0)
    
    TOTAL_CRITICAL=$((TOTAL_CRITICAL + critical))
    TOTAL_HIGH=$((TOTAL_HIGH + high))
    TOTAL_MEDIUM=$((TOTAL_MEDIUM + medium))
    TOTAL_LOW=$((TOTAL_LOW + low))
    
    log_info "Trivy results: Critical: $critical, High: $high, Medium: $medium, Low: $low"
}

# Function to parse Grype results
parse_grype_results() {
    local json_file="$1"
    
    if ! command -v jq >/dev/null 2>&1; then
        return 0
    fi
    
    local critical high medium low
    critical=$(jq -r '.matches[]? | select(.vulnerability.severity=="Critical") | .vulnerability.id' "$json_file" 2>/dev/null | wc -l || echo 0)
    high=$(jq -r '.matches[]? | select(.vulnerability.severity=="High") | .vulnerability.id' "$json_file" 2>/dev/null | wc -l || echo 0)
    medium=$(jq -r '.matches[]? | select(.vulnerability.severity=="Medium") | .vulnerability.id' "$json_file" 2>/dev/null | wc -l || echo 0)
    low=$(jq -r '.matches[]? | select(.vulnerability.severity=="Low") | .vulnerability.id' "$json_file" 2>/dev/null | wc -l || echo 0)
    
    TOTAL_CRITICAL=$((TOTAL_CRITICAL + critical))
    TOTAL_HIGH=$((TOTAL_HIGH + high))
    TOTAL_MEDIUM=$((TOTAL_MEDIUM + medium))
    TOTAL_LOW=$((TOTAL_LOW + low))
    
    log_info "Grype results: Critical: $critical, High: $high, Medium: $medium, Low: $low"
}

# Function to parse Snyk results
parse_snyk_results() {
    local json_file="$1"
    
    if ! command -v jq >/dev/null 2>&1; then
        return 0
    fi
    
    local critical high medium low
    critical=$(jq -r '.vulnerabilities[]? | select(.severity=="critical") | .id' "$json_file" 2>/dev/null | wc -l || echo 0)
    high=$(jq -r '.vulnerabilities[]? | select(.severity=="high") | .id' "$json_file" 2>/dev/null | wc -l || echo 0)
    medium=$(jq -r '.vulnerabilities[]? | select(.severity=="medium") | .id' "$json_file" 2>/dev/null | wc -l || echo 0)
    low=$(jq -r '.vulnerabilities[]? | select(.severity=="low") | .id' "$json_file" 2>/dev/null | wc -l || echo 0)
    
    TOTAL_CRITICAL=$((TOTAL_CRITICAL + critical))
    TOTAL_HIGH=$((TOTAL_HIGH + high))
    TOTAL_MEDIUM=$((TOTAL_MEDIUM + medium))
    TOTAL_LOW=$((TOTAL_LOW + low))
    
    log_info "Snyk results: Critical: $critical, High: $high, Medium: $medium, Low: $low"
}

# Function to convert text to HTML
convert_text_to_html() {
    local text_file="$1"
    local html_file="$2"
    local title="$3"
    
    cat > "$html_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>$title</title>
    <style>
        body { font-family: monospace; background: #1e1e1e; color: #d4d4d4; }
        pre { white-space: pre-wrap; }
    </style>
</head>
<body>
    <h1>$title</h1>
    <pre>$(cat "$text_file" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</pre>
</body>
</html>
EOF
}

# Function to convert Snyk JSON to HTML
convert_snyk_json_to_html() {
    local json_file="$1"
    local html_file="$2"
    
    if ! command -v jq >/dev/null 2>&1; then
        cp "$json_file" "$html_file"
        return 0
    fi
    
    local vulnerabilities
    vulnerabilities=$(jq -r '.vulnerabilities[] | "\(.severity | ascii_upcase): \(.title) (\(.id))"' "$json_file" 2>/dev/null || echo "No vulnerabilities parsed")
    
    cat > "$html_file" << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Snyk Container Scan Results</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .critical { color: #d73a49; font-weight: bold; }
        .high { color: #e36209; font-weight: bold; }
        .medium { color: #f9c513; }
        .low { color: #28a745; }
    </style>
</head>
<body>
    <h1>Snyk Container Scan Results</h1>
    <pre>$vulnerabilities</pre>
</body>
</html>
EOF
}

# Function to run all scanners
run_all_scanners() {
    local target="$1"
    local pids=()
    
    IFS=',' read -ra SCANNER_ARRAY <<< "$SCANNERS"
    
    for scanner in "${SCANNER_ARRAY[@]}"; do
        if check_scanner_availability "$scanner"; then
            if [[ "$PARALLEL" == "true" ]]; then
                case "$scanner" in
                    trivy)
                        scan_with_trivy "$target" &
                        pids+=($!)
                        ;;
                    grype)
                        scan_with_grype "$target" &
                        pids+=($!)
                        ;;
                    snyk)
                        scan_with_snyk "$target" &
                        pids+=($!)
                        ;;
                esac
            else
                case "$scanner" in
                    trivy)
                        scan_with_trivy "$target"
                        ;;
                    grype)
                        scan_with_grype "$target"
                        ;;
                    snyk)
                        scan_with_snyk "$target"
                        ;;
                esac
            fi
        else
            log_warning "Scanner $scanner not available, skipping..."
            SCAN_RESULTS["$scanner"]="unavailable"
        fi
    done
    
    # Wait for parallel jobs to complete
    if [[ "$PARALLEL" == "true" && ${#pids[@]} -gt 0 ]]; then
        log_info "Waiting for parallel scans to complete..."
        for pid in "${pids[@]}"; do
            wait "$pid" || log_warning "Scanner process $pid failed"
        done
    fi
}

# Function to generate consolidated report
generate_report() {
    local target="$1"
    local timestamp=$(date +%Y%m%d-%H%M%S)
    local report_file="$RESULTS_DIR/security-report-$timestamp.json"
    
    log_info "Generating consolidated security report..."
    
    cat > "$report_file" << EOF
{
  "scan_info": {
    "target": "$target",
    "timestamp": "$(date -Iseconds)",
    "scanners_used": ["$(echo "$SCANNERS" | tr ',' '"',"'" | sed 's/,$//')"],
    "severity_levels": ["$(echo "$SEVERITY" | tr ',' '"',"'" | sed 's/,$//')"],
    "output_formats": ["$(echo "$OUTPUT_FORMAT" | tr ',' '"',"'" | sed 's/,$//')"]
  },
  "summary": {
    "total_critical": $TOTAL_CRITICAL,
    "total_high": $TOTAL_HIGH,
    "total_medium": $TOTAL_MEDIUM,
    "total_low": $TOTAL_LOW,
    "total_vulnerabilities": $((TOTAL_CRITICAL + TOTAL_HIGH + TOTAL_MEDIUM + TOTAL_LOW))
  },
  "scanner_results": {
$(
    local first=true
    for scanner in "${!SCAN_RESULTS[@]}"; do
        if [[ "$first" == true ]]; then
            first=false
        else
            echo ","
        fi
        echo -n "    \"$scanner\": \"${SCAN_RESULTS[$scanner]}\""
    done
)
  },
  "risk_assessment": "$(assess_risk)",
  "recommendations": $(generate_recommendations)
}
EOF
    
    log "Consolidated report generated: $report_file"
    
    # Upload results if requested
    if [[ "$UPLOAD_RESULTS" == "true" ]]; then
        upload_results "$report_file"
    fi
    
    echo "$report_file"
}

# Function to assess risk level
assess_risk() {
    if [[ $TOTAL_CRITICAL -gt 0 ]]; then
        echo "CRITICAL"
    elif [[ $TOTAL_HIGH -gt 5 ]]; then
        echo "HIGH"
    elif [[ $TOTAL_HIGH -gt 0 || $TOTAL_MEDIUM -gt 10 ]]; then
        echo "MEDIUM"
    else
        echo "LOW"
    fi
}

# Function to generate recommendations
generate_recommendations() {
    local recommendations=()
    
    if [[ $TOTAL_CRITICAL -gt 0 ]]; then
        recommendations+=("\"Immediately address critical vulnerabilities before deploying to production\"")
    fi
    
    if [[ $TOTAL_HIGH -gt 5 ]]; then
        recommendations+=("\"Consider addressing high-severity vulnerabilities as they pose significant risk\"")
    fi
    
    if [[ $TOTAL_MEDIUM -gt 20 ]]; then
        recommendations+=("\"Review and plan remediation for medium-severity vulnerabilities\"")
    fi
    
    recommendations+=("\"Keep base images updated to latest security patches\"")
    recommendations+=("\"Implement vulnerability monitoring in production\"")
    recommendations+=("\"Consider using distroless or minimal base images\"")
    
    printf '[%s]' "$(IFS=,; echo "${recommendations[*]}")"
}

# Function to upload results
upload_results() {
    local report_file="$1"
    
    if [[ -z "${SECURITY_DASHBOARD_URL:-}" ]]; then
        log_warning "SECURITY_DASHBOARD_URL not set, skipping upload"
        return 0
    fi
    
    log_info "Uploading results to security dashboard..."
    
    if command -v curl >/dev/null 2>&1; then
        curl -X POST \
             -H "Content-Type: application/json" \
             -H "Authorization: Bearer ${SECURITY_DASHBOARD_TOKEN:-}" \
             -d "@$report_file" \
             "$SECURITY_DASHBOARD_URL/api/scan-results" \
             >/dev/null 2>&1 || log_warning "Failed to upload results"
    fi
}

# Function to print summary
print_summary() {
    log_info "=== Security Scan Summary ==="
    log_info "Target: $TARGET"
    log_info "Critical: $TOTAL_CRITICAL"
    log_info "High: $TOTAL_HIGH"
    log_info "Medium: $TOTAL_MEDIUM"
    log_info "Low: $TOTAL_LOW"
    log_info "Total: $((TOTAL_CRITICAL + TOTAL_HIGH + TOTAL_MEDIUM + TOTAL_LOW))"
    log_info "Risk Level: $(assess_risk)"
    log_info "Results Directory: $RESULTS_DIR"
}

# Function to determine exit code
determine_exit_code() {
    if [[ "$EXIT_CODE" == "0" ]]; then
        return 0
    fi
    
    # Exit with error if critical vulnerabilities found
    if [[ $TOTAL_CRITICAL -gt 0 ]]; then
        return 1
    fi
    
    # Exit with error if too many high vulnerabilities
    if [[ $TOTAL_HIGH -gt 10 ]]; then
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    log_info "Starting container security scan..."
    log_info "Target: $TARGET"
    log_info "Scanners: $SCANNERS"
    log_info "Severity: $SEVERITY"
    
    # Setup
    setup_results_dir
    
    # Run scanners
    run_all_scanners "$TARGET"
    
    # Generate report
    local report_file
    report_file=$(generate_report "$TARGET")
    
    # Print summary
    print_summary
    
    # Show report location
    log "Detailed results available in: $RESULTS_DIR"
    log "Consolidated report: $report_file"
    
    # Determine exit code
    determine_exit_code
}

# Handle help flag
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]] || [[ -z "${1:-}" ]]; then
    usage
    exit 0
fi

# Execute main function
main "$@"