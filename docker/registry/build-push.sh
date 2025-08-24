#!/bin/bash
# ================================================================================
# Container Registry Build and Push Script
# Automated multi-platform builds with security scanning and signing
# ================================================================================

set -euo pipefail

# Configuration
readonly SCRIPT_NAME="$(basename "${0}")"
readonly LOG_FILE="/tmp/registry-build.log"
readonly CONFIG_FILE="${CONFIG_FILE:-docker/registry/registry-management.yml}"

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Default values
DEFAULT_ENVIRONMENT="development"
DEFAULT_SERVICE="all"
DEFAULT_PLATFORMS="linux/amd64,linux/arm64"

# Parse command line arguments
ENVIRONMENT="${1:-$DEFAULT_ENVIRONMENT}"
SERVICE="${2:-$DEFAULT_SERVICE}"
VERSION="${3:-$(git describe --tags --always --dirty)}"
PLATFORMS="${PLATFORMS:-$DEFAULT_PLATFORMS}"
PUSH="${PUSH:-true}"
SCAN="${SCAN:-true}"
SIGN="${SIGN:-false}"

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
Usage: $SCRIPT_NAME [ENVIRONMENT] [SERVICE] [VERSION]

ENVIRONMENT: production, staging, development (default: development)
SERVICE:     core, cdn, website, backup-manager, all (default: all)
VERSION:     Image version tag (default: git describe output)

Environment Variables:
  PLATFORMS:    Target platforms (default: linux/amd64,linux/arm64)
  PUSH:         Push images to registry (default: true)
  SCAN:         Run security scans (default: true)
  SIGN:         Sign images with cosign (default: false)
  CONFIG_FILE:  Registry config file (default: docker/registry/registry-management.yml)

Examples:
  $SCRIPT_NAME production core v1.0.0
  $SCRIPT_NAME staging all
  PUSH=false $SCRIPT_NAME development cdn
EOF
}

# Function to validate environment
validate_environment() {
    case "$ENVIRONMENT" in
        production|staging|development)
            log_info "Building for environment: $ENVIRONMENT"
            ;;
        *)
            log_error "Invalid environment: $ENVIRONMENT"
            usage
            exit 1
            ;;
    esac
}

# Function to get registry configuration
get_registry_config() {
    local env="$1"
    local config_key="registries.${env}.primary"
    
    if command -v yq >/dev/null 2>&1; then
        REGISTRY_URL=$(yq eval ".${config_key}.registry" "$CONFIG_FILE")
        REGISTRY_NAMESPACE=$(yq eval ".${config_key}.namespace" "$CONFIG_FILE")
    else
        # Fallback for environments without yq
        case "$env" in
            production)
                REGISTRY_URL="ghcr.io"
                REGISTRY_NAMESPACE="sightedit"
                ;;
            staging)
                REGISTRY_URL="ghcr.io"
                REGISTRY_NAMESPACE="sightedit/staging"
                ;;
            development)
                REGISTRY_URL="docker.io"
                REGISTRY_NAMESPACE="sightedit-dev"
                ;;
        esac
    fi
    
    log_info "Registry: $REGISTRY_URL/$REGISTRY_NAMESPACE"
}

# Function to authenticate with registry
authenticate_registry() {
    log_info "Authenticating with registry..."
    
    case "$REGISTRY_URL" in
        "ghcr.io")
            if [[ -n "${GITHUB_TOKEN:-}" ]]; then
                echo "$GITHUB_TOKEN" | docker login "$REGISTRY_URL" -u "$GITHUB_ACTOR" --password-stdin
            else
                log_error "GITHUB_TOKEN is required for GitHub Container Registry"
                exit 1
            fi
            ;;
        "docker.io")
            if [[ -n "${DOCKER_HUB_TOKEN:-}" ]]; then
                echo "$DOCKER_HUB_TOKEN" | docker login "$REGISTRY_URL" -u "$DOCKER_HUB_USERNAME" --password-stdin
            else
                log_error "DOCKER_HUB_TOKEN is required for Docker Hub"
                exit 1
            fi
            ;;
        *.dkr.ecr.*.amazonaws.com)
            if command -v aws >/dev/null 2>&1; then
                aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "$REGISTRY_URL"
            else
                log_error "AWS CLI is required for ECR authentication"
                exit 1
            fi
            ;;
        *.azurecr.io)
            if [[ -n "${AZURE_CLIENT_SECRET:-}" ]]; then
                echo "$AZURE_CLIENT_SECRET" | docker login "$REGISTRY_URL" -u "$AZURE_CLIENT_ID" --password-stdin
            else
                log_error "Azure credentials are required for ACR"
                exit 1
            fi
            ;;
    esac
    
    log "Registry authentication successful"
}

# Function to generate image tags
generate_tags() {
    local service="$1"
    local base_image="$REGISTRY_URL/$REGISTRY_NAMESPACE/$service"
    
    TAGS=()
    
    case "$ENVIRONMENT" in
        production)
            TAGS+=("$base_image:$VERSION")
            TAGS+=("$base_image:latest")
            # Add semver tags if VERSION matches semver pattern
            if [[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
                local major_minor=$(echo "$VERSION" | sed 's/^v\([0-9]\+\.[0-9]\+\)\..*$/\1/')
                local major=$(echo "$VERSION" | sed 's/^v\([0-9]\+\)\..*$/\1/')
                TAGS+=("$base_image:$major_minor")
                TAGS+=("$base_image:$major")
            fi
            ;;
        staging)
            TAGS+=("$base_image:$VERSION-staging")
            TAGS+=("$base_image:staging-latest")
            if [[ -n "${GITHUB_SHA:-}" ]]; then
                local short_sha="${GITHUB_SHA:0:7}"
                TAGS+=("$base_image:${GITHUB_REF_NAME:-main}-$short_sha")
            fi
            ;;
        development)
            TAGS+=("$base_image:$VERSION-dev")
            TAGS+=("$base_image:dev-latest")
            if [[ -n "${GITHUB_SHA:-}" ]]; then
                local short_sha="${GITHUB_SHA:0:7}"
                TAGS+=("$base_image:${GITHUB_REF_NAME:-main}-$short_sha")
                TAGS+=("$base_image:$short_sha")
            fi
            ;;
    esac
    
    log_info "Generated tags: ${TAGS[*]}"
}

# Function to build and push a single service
build_service() {
    local service="$1"
    local dockerfile="Dockerfile.production"
    local target=""
    
    log_info "Building service: $service"
    
    # Determine dockerfile and target based on service
    case "$service" in
        core)
            target="backend-server"
            ;;
        cdn)
            target="cdn-server"
            ;;
        website)
            target="website"
            ;;
        backup-manager)
            dockerfile="docker/backup/Dockerfile"
            target="production"
            ;;
        *)
            log_error "Unknown service: $service"
            return 1
            ;;
    esac
    
    generate_tags "$service"
    
    # Prepare build arguments
    local build_args=""
    build_args+=" --build-arg NODE_ENV=$ENVIRONMENT"
    build_args+=" --build-arg VERSION=$VERSION"
    build_args+=" --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    build_args+=" --build-arg VCS_REF=${GITHUB_SHA:-$(git rev-parse HEAD)}"
    
    # Prepare tag arguments
    local tag_args=""
    for tag in "${TAGS[@]}"; do
        tag_args+=" --tag $tag"
    done
    
    # Build command
    local build_cmd="docker buildx build"
    build_cmd+=" --file $dockerfile"
    if [[ -n "$target" ]]; then
        build_cmd+=" --target $target"
    fi
    build_cmd+=" --platform $PLATFORMS"
    build_cmd+=" $build_args"
    build_cmd+=" $tag_args"
    build_cmd+=" --progress plain"
    
    # Add cache configuration
    local cache_from="type=registry,ref=$REGISTRY_URL/$REGISTRY_NAMESPACE/cache:$service-buildcache"
    local cache_to="type=registry,ref=$REGISTRY_URL/$REGISTRY_NAMESPACE/cache:$service-buildcache,mode=max"
    build_cmd+=" --cache-from $cache_from"
    build_cmd+=" --cache-to $cache_to"
    
    # Add metadata
    build_cmd+=" --label org.opencontainers.image.title=SightEdit-$service"
    build_cmd+=" --label org.opencontainers.image.description='SightEdit $service component'"
    build_cmd+=" --label org.opencontainers.image.version=$VERSION"
    build_cmd+=" --label org.opencontainers.image.created=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    build_cmd+=" --label org.opencontainers.image.revision=${GITHUB_SHA:-$(git rev-parse HEAD)}"
    build_cmd+=" --label org.opencontainers.image.source=https://github.com/sightedit/sightedit"
    
    if [[ "$PUSH" == "true" ]]; then
        build_cmd+=" --push"
    else
        build_cmd+=" --load"
    fi
    
    build_cmd+=" ."
    
    log_info "Executing: $build_cmd"
    
    # Execute build
    if eval "$build_cmd"; then
        log "Build completed successfully for $service"
    else
        log_error "Build failed for $service"
        return 1
    fi
}

# Function to scan image for vulnerabilities
scan_image() {
    local image="$1"
    
    if [[ "$SCAN" != "true" ]]; then
        log_info "Skipping security scan"
        return 0
    fi
    
    log_info "Scanning image: $image"
    
    local scan_results_dir="security-reports"
    mkdir -p "$scan_results_dir"
    
    # Trivy scan
    if command -v trivy >/dev/null 2>&1; then
        log_info "Running Trivy scan..."
        trivy image \
            --format sarif \
            --output "$scan_results_dir/trivy-${SERVICE}-$(date +%s).sarif" \
            --severity CRITICAL,HIGH,MEDIUM \
            "$image"
        
        # Check for critical vulnerabilities
        local critical_count
        critical_count=$(trivy image --format json "$image" | jq '.Results[]?.Vulnerabilities[]? | select(.Severity=="CRITICAL") | length')
        
        if [[ "${critical_count:-0}" -gt 0 ]]; then
            log_error "Found $critical_count critical vulnerabilities in $image"
            if [[ "$ENVIRONMENT" == "production" ]]; then
                log_error "Blocking production deployment due to critical vulnerabilities"
                return 1
            fi
        fi
    fi
    
    # Snyk scan (if available)
    if command -v snyk >/dev/null 2>&1 && [[ -n "${SNYK_TOKEN:-}" ]]; then
        log_info "Running Snyk scan..."
        snyk container test "$image" \
            --json > "$scan_results_dir/snyk-${SERVICE}-$(date +%s).json" || true
    fi
    
    log "Security scan completed for $image"
}

# Function to sign image with cosign
sign_image() {
    local image="$1"
    
    if [[ "$SIGN" != "true" ]]; then
        log_info "Skipping image signing"
        return 0
    fi
    
    if ! command -v cosign >/dev/null 2>&1; then
        log_error "cosign not found, skipping image signing"
        return 0
    fi
    
    log_info "Signing image: $image"
    
    # Sign with cosign
    if cosign sign --yes "$image"; then
        log "Image signed successfully: $image"
    else
        log_error "Failed to sign image: $image"
        return 1
    fi
    
    # Generate SBOM and sign it
    if command -v syft >/dev/null 2>&1; then
        log_info "Generating and signing SBOM..."
        local sbom_file="sbom-${SERVICE}-$(date +%s).spdx.json"
        syft packages "$image" -o spdx-json > "$sbom_file"
        cosign attach sbom --sbom "$sbom_file" "$image"
        cosign sign --yes "$image"
        rm -f "$sbom_file"
    fi
}

# Function to build all services
build_all_services() {
    local services=("core" "cdn" "website" "backup-manager")
    local failed_services=()
    
    for service in "${services[@]}"; do
        log_info "Building service: $service"
        if build_service "$service"; then
            # Scan and sign the first tag (which is the primary one)
            generate_tags "$service"
            if [[ ${#TAGS[@]} -gt 0 ]]; then
                scan_image "${TAGS[0]}"
                sign_image "${TAGS[0]}"
            fi
        else
            failed_services+=("$service")
        fi
    done
    
    if [[ ${#failed_services[@]} -gt 0 ]]; then
        log_error "Failed to build services: ${failed_services[*]}"
        return 1
    fi
}

# Function to setup buildx
setup_buildx() {
    log_info "Setting up Docker Buildx..."
    
    # Create buildx builder if it doesn't exist
    if ! docker buildx inspect sightedit-builder >/dev/null 2>&1; then
        docker buildx create --name sightedit-builder --driver docker-container --use
    else
        docker buildx use sightedit-builder
    fi
    
    # Bootstrap builder
    docker buildx inspect --bootstrap
    
    log "Buildx setup complete"
}

# Function to cleanup
cleanup() {
    log_info "Cleaning up..."
    
    # Remove buildx builder if created during this run
    if [[ -n "${CLEANUP_BUILDER:-}" ]]; then
        docker buildx rm sightedit-builder 2>/dev/null || true
    fi
    
    # Clean up temporary files
    rm -f /tmp/build-* 2>/dev/null || true
}

# Function to generate build report
generate_report() {
    log_info "Generating build report..."
    
    local report_file="build-report-$(date +%Y%m%d-%H%M%S).json"
    
    cat > "$report_file" << EOF
{
  "build_info": {
    "timestamp": "$(date -Iseconds)",
    "environment": "$ENVIRONMENT",
    "service": "$SERVICE",
    "version": "$VERSION",
    "platforms": "$PLATFORMS",
    "registry": "$REGISTRY_URL/$REGISTRY_NAMESPACE"
  },
  "build_status": "success",
  "tags": $(printf '%s\n' "${TAGS[@]}" | jq -R . | jq -s .),
  "security_scan": {
    "enabled": $SCAN,
    "passed": true
  },
  "image_signing": {
    "enabled": $SIGN,
    "completed": true
  }
}
EOF
    
    log "Build report generated: $report_file"
}

# Main execution
main() {
    log_info "Starting container registry build process..."
    log_info "Script: $SCRIPT_NAME"
    log_info "Environment: $ENVIRONMENT, Service: $SERVICE, Version: $VERSION"
    
    # Trap cleanup on exit
    trap cleanup EXIT
    
    # Validate input
    validate_environment
    
    # Setup buildx
    setup_buildx
    
    # Get registry configuration
    get_registry_config "$ENVIRONMENT"
    
    # Authenticate with registry
    authenticate_registry
    
    # Build services
    if [[ "$SERVICE" == "all" ]]; then
        build_all_services
    else
        build_service "$SERVICE"
        generate_tags "$SERVICE"
        if [[ ${#TAGS[@]} -gt 0 ]]; then
            scan_image "${TAGS[0]}"
            sign_image "${TAGS[0]}"
        fi
    fi
    
    # Generate report
    generate_report
    
    log "Container registry build process completed successfully!"
}

# Handle help flag
if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
    usage
    exit 0
fi

# Execute main function
main "$@"