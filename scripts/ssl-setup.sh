#!/bin/bash

# ================================
# SSL Certificate Setup Script
# ================================
# This script sets up SSL certificates for SightEdit production deployment
# Supports both Let's Encrypt and custom certificate installation

set -euo pipefail

# Configuration
DOMAIN=${DOMAIN:-"yourdomain.com"}
EMAIL=${EMAIL:-"admin@yourdomain.com"}
CERT_DIR="/etc/ssl/certs"
PRIVATE_DIR="/etc/ssl/private"
ACME_CHALLENGE_DIR="/var/www/html/.well-known/acme-challenge"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi
}

# Create necessary directories
create_directories() {
    log "Creating certificate directories..."
    mkdir -p "$CERT_DIR" "$PRIVATE_DIR" "$ACME_CHALLENGE_DIR"
    chmod 755 "$CERT_DIR"
    chmod 700 "$PRIVATE_DIR"
    chmod 755 "$ACME_CHALLENGE_DIR"
}

# Install certbot
install_certbot() {
    log "Installing certbot..."
    
    if command -v apt-get &> /dev/null; then
        # Ubuntu/Debian
        apt-get update
        apt-get install -y snapd
        snap install core; snap refresh core
        snap install --classic certbot
        ln -sf /snap/bin/certbot /usr/bin/certbot
    elif command -v yum &> /dev/null; then
        # RHEL/CentOS
        yum install -y epel-release
        yum install -y certbot
    elif command -v apk &> /dev/null; then
        # Alpine Linux
        apk add --no-cache certbot
    else
        error "Unsupported package manager. Please install certbot manually."
        exit 1
    fi
    
    success "Certbot installed successfully"
}

# Generate self-signed certificate (for testing)
generate_self_signed() {
    log "Generating self-signed certificate for testing..."
    
    # Generate private key
    openssl genrsa -out "$PRIVATE_DIR/$DOMAIN.key" 2048
    chmod 600 "$PRIVATE_DIR/$DOMAIN.key"
    
    # Generate certificate signing request
    openssl req -new -key "$PRIVATE_DIR/$DOMAIN.key" -out "/tmp/$DOMAIN.csr" -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
    
    # Generate self-signed certificate
    openssl x509 -req -in "/tmp/$DOMAIN.csr" -signkey "$PRIVATE_DIR/$DOMAIN.key" -out "$CERT_DIR/$DOMAIN.pem" -days 365 \
        -extensions v3_req -extfile <(cat <<EOF
[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = www.$DOMAIN
DNS.3 = api.$DOMAIN
DNS.4 = cdn.$DOMAIN
EOF
)
    
    chmod 644 "$CERT_DIR/$DOMAIN.pem"
    rm -f "/tmp/$DOMAIN.csr"
    
    success "Self-signed certificate generated"
}

# Obtain Let's Encrypt certificate
obtain_letsencrypt() {
    log "Obtaining Let's Encrypt certificate..."
    
    # Stop nginx temporarily
    systemctl stop nginx 2>/dev/null || true
    
    # Obtain certificate using standalone mode
    certbot certonly --standalone \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --domains "$DOMAIN,www.$DOMAIN,api.$DOMAIN,cdn.$DOMAIN" \
        --cert-name "$DOMAIN"
    
    # Copy certificates to our directory structure
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/$DOMAIN.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$PRIVATE_DIR/$DOMAIN.key"
    cp "/etc/letsencrypt/live/$DOMAIN/chain.pem" "$CERT_DIR/$DOMAIN-chain.pem"
    
    # Set proper permissions
    chmod 644 "$CERT_DIR/$DOMAIN.pem" "$CERT_DIR/$DOMAIN-chain.pem"
    chmod 600 "$PRIVATE_DIR/$DOMAIN.key"
    
    # Start nginx
    systemctl start nginx 2>/dev/null || true
    
    success "Let's Encrypt certificate obtained"
}

# Install custom certificate
install_custom_cert() {
    local cert_file="$1"
    local key_file="$2"
    local chain_file="$3"
    
    log "Installing custom certificate..."
    
    if [[ ! -f "$cert_file" ]]; then
        error "Certificate file not found: $cert_file"
        exit 1
    fi
    
    if [[ ! -f "$key_file" ]]; then
        error "Private key file not found: $key_file"
        exit 1
    fi
    
    # Copy certificate files
    cp "$cert_file" "$CERT_DIR/$DOMAIN.pem"
    cp "$key_file" "$PRIVATE_DIR/$DOMAIN.key"
    
    if [[ -n "$chain_file" && -f "$chain_file" ]]; then
        cp "$chain_file" "$CERT_DIR/$DOMAIN-chain.pem"
    fi
    
    # Set proper permissions
    chmod 644 "$CERT_DIR/$DOMAIN.pem"
    chmod 600 "$PRIVATE_DIR/$DOMAIN.key"
    [[ -f "$CERT_DIR/$DOMAIN-chain.pem" ]] && chmod 644 "$CERT_DIR/$DOMAIN-chain.pem"
    
    success "Custom certificate installed"
}

# Verify certificate
verify_certificate() {
    log "Verifying certificate..."
    
    if [[ ! -f "$CERT_DIR/$DOMAIN.pem" || ! -f "$PRIVATE_DIR/$DOMAIN.key" ]]; then
        error "Certificate files not found"
        exit 1
    fi
    
    # Check certificate validity
    openssl x509 -in "$CERT_DIR/$DOMAIN.pem" -text -noout > /dev/null
    if [[ $? -eq 0 ]]; then
        success "Certificate is valid"
        
        # Show certificate info
        log "Certificate information:"
        openssl x509 -in "$CERT_DIR/$DOMAIN.pem" -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:)"
    else
        error "Certificate is invalid"
        exit 1
    fi
    
    # Verify private key matches certificate
    cert_modulus=$(openssl x509 -noout -modulus -in "$CERT_DIR/$DOMAIN.pem" | openssl md5)
    key_modulus=$(openssl rsa -noout -modulus -in "$PRIVATE_DIR/$DOMAIN.key" | openssl md5)
    
    if [[ "$cert_modulus" == "$key_modulus" ]]; then
        success "Private key matches certificate"
    else
        error "Private key does not match certificate"
        exit 1
    fi
}

# Setup certificate renewal (for Let's Encrypt)
setup_renewal() {
    log "Setting up automatic certificate renewal..."
    
    # Create renewal script
    cat > /etc/cron.daily/certbot-renew << 'EOF'
#!/bin/bash
# Automatic certificate renewal script

/usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"

# Update our certificate copies
DOMAIN=$(hostname -d)
if [[ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "/etc/ssl/certs/$DOMAIN.pem"
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "/etc/ssl/private/$DOMAIN.key"
    cp "/etc/letsencrypt/live/$DOMAIN/chain.pem" "/etc/ssl/certs/$DOMAIN-chain.pem"
    
    # Set proper permissions
    chmod 644 "/etc/ssl/certs/$DOMAIN.pem" "/etc/ssl/certs/$DOMAIN-chain.pem"
    chmod 600 "/etc/ssl/private/$DOMAIN.key"
    
    systemctl reload nginx
fi
EOF
    
    chmod +x /etc/cron.daily/certbot-renew
    
    success "Automatic renewal configured"
}

# Test nginx configuration
test_nginx_config() {
    log "Testing nginx configuration..."
    
    if nginx -t 2>/dev/null; then
        success "Nginx configuration is valid"
        systemctl reload nginx
    else
        error "Nginx configuration is invalid"
        nginx -t
        exit 1
    fi
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS] COMMAND"
    echo ""
    echo "Commands:"
    echo "  self-signed    Generate self-signed certificate (for testing)"
    echo "  letsencrypt    Obtain Let's Encrypt certificate"
    echo "  custom         Install custom certificate"
    echo "  verify         Verify existing certificate"
    echo "  renew          Manually renew Let's Encrypt certificate"
    echo ""
    echo "Options:"
    echo "  -d, --domain DOMAIN    Set domain name (default: yourdomain.com)"
    echo "  -e, --email EMAIL      Set email address for Let's Encrypt"
    echo "  -c, --cert FILE        Certificate file path (for custom command)"
    echo "  -k, --key FILE         Private key file path (for custom command)"
    echo "  -i, --chain FILE       Certificate chain file path (for custom command)"
    echo "  -h, --help             Show this help message"
}

# Parse command line arguments
CERT_FILE=""
KEY_FILE=""
CHAIN_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--domain)
            DOMAIN="$2"
            shift 2
            ;;
        -e|--email)
            EMAIL="$2"
            shift 2
            ;;
        -c|--cert)
            CERT_FILE="$2"
            shift 2
            ;;
        -k|--key)
            KEY_FILE="$2"
            shift 2
            ;;
        -i|--chain)
            CHAIN_FILE="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            COMMAND="$1"
            shift
            ;;
    esac
done

# Check if command is provided
if [[ -z "${COMMAND:-}" ]]; then
    error "No command specified"
    usage
    exit 1
fi

# Main execution
log "Starting SSL certificate setup for domain: $DOMAIN"

check_root
create_directories

case "$COMMAND" in
    self-signed)
        generate_self_signed
        verify_certificate
        test_nginx_config
        ;;
    letsencrypt)
        install_certbot
        obtain_letsencrypt
        setup_renewal
        verify_certificate
        test_nginx_config
        ;;
    custom)
        if [[ -z "$CERT_FILE" || -z "$KEY_FILE" ]]; then
            error "Certificate and key files must be specified for custom installation"
            usage
            exit 1
        fi
        install_custom_cert "$CERT_FILE" "$KEY_FILE" "$CHAIN_FILE"
        verify_certificate
        test_nginx_config
        ;;
    verify)
        verify_certificate
        ;;
    renew)
        /usr/bin/certbot renew --force-renewal
        obtain_letsencrypt
        test_nginx_config
        ;;
    *)
        error "Unknown command: $COMMAND"
        usage
        exit 1
        ;;
esac

success "SSL certificate setup completed successfully!"
log "Certificate location: $CERT_DIR/$DOMAIN.pem"
log "Private key location: $PRIVATE_DIR/$DOMAIN.key"
[[ -f "$CERT_DIR/$DOMAIN-chain.pem" ]] && log "Chain certificate location: $CERT_DIR/$DOMAIN-chain.pem"