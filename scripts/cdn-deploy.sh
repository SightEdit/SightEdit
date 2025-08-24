#!/bin/bash

# ================================
# CDN Deployment Script for SightEdit
# ================================
# Deploys static assets to S3 and invalidates CloudFront cache

set -euo pipefail

# Configuration
ENVIRONMENT=${ENVIRONMENT:-"production"}
AWS_PROFILE=${AWS_PROFILE:-"default"}
S3_BUCKET=${S3_BUCKET:-""}
CLOUDFRONT_DISTRIBUTION_ID=${CLOUDFRONT_DISTRIBUTION_ID:-""}
BUILD_DIR=${BUILD_DIR:-"dist"}
CACHE_CONTROL_DEFAULT="public, max-age=31536000, immutable"
CACHE_CONTROL_HTML="public, max-age=300, must-revalidate"
CACHE_CONTROL_UPLOADS="public, max-age=86400"

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

# Check dependencies
check_dependencies() {
    log "Checking dependencies..."
    
    if ! command -v aws &> /dev/null; then
        error "AWS CLI not found. Please install it first."
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        error "jq not found. Please install it first."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" >/dev/null 2>&1; then
        error "AWS credentials not configured properly for profile: $AWS_PROFILE"
        exit 1
    fi
    
    success "Dependencies check passed"
}

# Validate configuration
validate_config() {
    log "Validating configuration..."
    
    if [[ -z "$S3_BUCKET" ]]; then
        error "S3_BUCKET environment variable is required"
        exit 1
    fi
    
    if [[ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]]; then
        error "CLOUDFRONT_DISTRIBUTION_ID environment variable is required"
        exit 1
    fi
    
    if [[ ! -d "$BUILD_DIR" ]]; then
        error "Build directory not found: $BUILD_DIR"
        exit 1
    fi
    
    # Check if S3 bucket exists and is accessible
    if ! aws s3 ls "s3://$S3_BUCKET" --profile "$AWS_PROFILE" >/dev/null 2>&1; then
        error "Cannot access S3 bucket: $S3_BUCKET"
        exit 1
    fi
    
    # Check CloudFront distribution
    if ! aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION_ID" --profile "$AWS_PROFILE" >/dev/null 2>&1; then
        error "Cannot access CloudFront distribution: $CLOUDFRONT_DISTRIBUTION_ID"
        exit 1
    fi
    
    success "Configuration validated"
}

# Build assets
build_assets() {
    log "Building assets..."
    
    # Check if build script exists
    if [[ -f "package.json" ]] && jq -e '.scripts.build' package.json >/dev/null; then
        log "Running npm build..."
        npm run build
    else
        warning "No build script found in package.json, assuming assets are already built"
    fi
    
    # Verify build output
    if [[ ! -d "$BUILD_DIR" ]]; then
        error "Build directory not created: $BUILD_DIR"
        exit 1
    fi
    
    success "Assets built successfully"
}

# Optimize assets
optimize_assets() {
    log "Optimizing assets..."
    
    # Gzip compression for text files
    find "$BUILD_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.xml" -o -name "*.txt" \) -exec gzip -9 -k {} \;
    
    # Brotli compression if available
    if command -v brotli &> /dev/null; then
        find "$BUILD_DIR" -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.xml" -o -name "*.txt" \) -exec brotli -q 11 -k {} \;
    fi
    
    success "Assets optimized"
}

# Sync assets to S3
sync_to_s3() {
    log "Syncing assets to S3..."
    
    # Sync JavaScript files with long cache
    aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --exclude "*" \
        --include "*.js" \
        --include "*.js.gz" \
        --include "*.js.br" \
        --cache-control "$CACHE_CONTROL_DEFAULT" \
        --content-encoding "gzip" \
        --delete
    
    # Sync CSS files with long cache
    aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --exclude "*" \
        --include "*.css" \
        --include "*.css.gz" \
        --include "*.css.br" \
        --cache-control "$CACHE_CONTROL_DEFAULT" \
        --content-encoding "gzip" \
        --delete
    
    # Sync image files with medium cache
    aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --exclude "*" \
        --include "*.jpg" \
        --include "*.jpeg" \
        --include "*.png" \
        --include "*.gif" \
        --include "*.webp" \
        --include "*.svg" \
        --include "*.ico" \
        --cache-control "public, max-age=2592000" \
        --delete
    
    # Sync HTML files with short cache
    aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --exclude "*" \
        --include "*.html" \
        --include "*.html.gz" \
        --include "*.html.br" \
        --cache-control "$CACHE_CONTROL_HTML" \
        --content-encoding "gzip" \
        --delete
    
    # Sync font files with long cache
    aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --exclude "*" \
        --include "*.woff" \
        --include "*.woff2" \
        --include "*.ttf" \
        --include "*.eot" \
        --cache-control "$CACHE_CONTROL_DEFAULT" \
        --delete
    
    # Sync other files with default cache
    aws s3 sync "$BUILD_DIR" "s3://$S3_BUCKET/" \
        --profile "$AWS_PROFILE" \
        --exclude "*.js" \
        --exclude "*.js.gz" \
        --exclude "*.js.br" \
        --exclude "*.css" \
        --exclude "*.css.gz" \
        --exclude "*.css.br" \
        --exclude "*.html" \
        --exclude "*.html.gz" \
        --exclude "*.html.br" \
        --exclude "*.jpg" \
        --exclude "*.jpeg" \
        --exclude "*.png" \
        --exclude "*.gif" \
        --exclude "*.webp" \
        --exclude "*.svg" \
        --exclude "*.ico" \
        --exclude "*.woff" \
        --exclude "*.woff2" \
        --exclude "*.ttf" \
        --exclude "*.eot" \
        --cache-control "public, max-age=86400" \
        --delete
    
    success "Assets synced to S3"
}

# Set proper content types
set_content_types() {
    log "Setting proper content types..."
    
    # JavaScript files
    aws s3 cp "s3://$S3_BUCKET/" "s3://$S3_BUCKET/" \
        --recursive \
        --exclude "*" \
        --include "*.js" \
        --content-type "application/javascript" \
        --metadata-directive REPLACE \
        --profile "$AWS_PROFILE"
    
    # CSS files
    aws s3 cp "s3://$S3_BUCKET/" "s3://$S3_BUCKET/" \
        --recursive \
        --exclude "*" \
        --include "*.css" \
        --content-type "text/css" \
        --metadata-directive REPLACE \
        --profile "$AWS_PROFILE"
    
    # JSON files
    aws s3 cp "s3://$S3_BUCKET/" "s3://$S3_BUCKET/" \
        --recursive \
        --exclude "*" \
        --include "*.json" \
        --content-type "application/json" \
        --metadata-directive REPLACE \
        --profile "$AWS_PROFILE"
    
    # SVG files
    aws s3 cp "s3://$S3_BUCKET/" "s3://$S3_BUCKET/" \
        --recursive \
        --exclude "*" \
        --include "*.svg" \
        --content-type "image/svg+xml" \
        --metadata-directive REPLACE \
        --profile "$AWS_PROFILE"
    
    success "Content types set"
}

# Create CloudFront invalidation
invalidate_cloudfront() {
    log "Creating CloudFront invalidation..."
    
    # Create invalidation for all files
    local invalidation_id
    invalidation_id=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
        --paths "/*" \
        --profile "$AWS_PROFILE" \
        --query 'Invalidation.Id' \
        --output text)
    
    log "Invalidation created with ID: $invalidation_id"
    
    # Wait for invalidation to complete (optional)
    if [[ "${WAIT_FOR_INVALIDATION:-false}" == "true" ]]; then
        log "Waiting for invalidation to complete..."
        aws cloudfront wait invalidation-completed \
            --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
            --id "$invalidation_id" \
            --profile "$AWS_PROFILE"
        success "Invalidation completed"
    else
        log "Invalidation created, not waiting for completion"
    fi
}

# Generate deployment report
generate_report() {
    log "Generating deployment report..."
    
    local report_file="deployment-report-$(date +%Y%m%d-%H%M%S).json"
    
    # Get S3 bucket info
    local bucket_size
    bucket_size=$(aws s3 ls "s3://$S3_BUCKET/" --recursive --human-readable --summarize --profile "$AWS_PROFILE" | tail -1 | awk '{print $3 " " $4}')
    
    # Get CloudFront distribution info
    local distribution_status
    distribution_status=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION_ID" --profile "$AWS_PROFILE" --query 'Distribution.Status' --output text)
    
    # Create report
    cat > "$report_file" << EOF
{
  "deployment": {
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "environment": "$ENVIRONMENT",
    "s3_bucket": "$S3_BUCKET",
    "cloudfront_distribution_id": "$CLOUDFRONT_DISTRIBUTION_ID",
    "bucket_size": "$bucket_size",
    "distribution_status": "$distribution_status",
    "build_directory": "$BUILD_DIR",
    "aws_profile": "$AWS_PROFILE"
  },
  "files": {
    "total_files": $(find "$BUILD_DIR" -type f | wc -l),
    "js_files": $(find "$BUILD_DIR" -name "*.js" | wc -l),
    "css_files": $(find "$BUILD_DIR" -name "*.css" | wc -l),
    "image_files": $(find "$BUILD_DIR" \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" -o -name "*.svg" \) | wc -l),
    "html_files": $(find "$BUILD_DIR" -name "*.html" | wc -l)
  }
}
EOF
    
    success "Deployment report saved to: $report_file"
}

# Show usage information
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -e, --environment ENV     Set environment (default: production)"
    echo "  -p, --profile PROFILE     Set AWS profile (default: default)"
    echo "  -b, --bucket BUCKET       Set S3 bucket name"
    echo "  -d, --distribution ID     Set CloudFront distribution ID"
    echo "  -w, --wait               Wait for CloudFront invalidation to complete"
    echo "  --build-dir DIR          Set build directory (default: dist)"
    echo "  --skip-build             Skip building assets"
    echo "  --skip-optimize          Skip asset optimization"
    echo "  --skip-invalidation      Skip CloudFront invalidation"
    echo "  -h, --help               Show this help message"
}

# Parse command line arguments
SKIP_BUILD=false
SKIP_OPTIMIZE=false
SKIP_INVALIDATION=false
WAIT_FOR_INVALIDATION=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -p|--profile)
            AWS_PROFILE="$2"
            shift 2
            ;;
        -b|--bucket)
            S3_BUCKET="$2"
            shift 2
            ;;
        -d|--distribution)
            CLOUDFRONT_DISTRIBUTION_ID="$2"
            shift 2
            ;;
        -w|--wait)
            WAIT_FOR_INVALIDATION=true
            shift
            ;;
        --build-dir)
            BUILD_DIR="$2"
            shift 2
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-optimize)
            SKIP_OPTIMIZE=true
            shift
            ;;
        --skip-invalidation)
            SKIP_INVALIDATION=true
            shift
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
log "Starting CDN deployment for environment: $ENVIRONMENT"

check_dependencies
validate_config

# Build assets unless skipped
if [[ "$SKIP_BUILD" != "true" ]]; then
    build_assets
fi

# Optimize assets unless skipped
if [[ "$SKIP_OPTIMIZE" != "true" ]]; then
    optimize_assets
fi

sync_to_s3
set_content_types

# Invalidate CloudFront unless skipped
if [[ "$SKIP_INVALIDATION" != "true" ]]; then
    invalidate_cloudfront
fi

generate_report

success "CDN deployment completed successfully!"
log "Assets are now available via CloudFront distribution: $CLOUDFRONT_DISTRIBUTION_ID"