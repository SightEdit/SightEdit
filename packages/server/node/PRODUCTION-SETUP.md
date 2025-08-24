# SightEdit Production Server Setup Guide

This guide provides comprehensive instructions for setting up and deploying the SightEdit server in a production environment with all security, performance, and monitoring features enabled.

## Overview

The production SightEdit server includes:
- ✅ **JWT Authentication** with secure token handling
- ✅ **CSRF Protection** with token-based validation
- ✅ **Rate Limiting** to prevent abuse
- ✅ **HTTPS/TLS** encryption
- ✅ **Security Headers** (CSP, HSTS, etc.)
- ✅ **Database Integration** (PostgreSQL, MySQL, SQLite, MongoDB)
- ✅ **File Upload Security** with type validation
- ✅ **Health Monitoring** and metrics
- ✅ **Error Handling** and logging
- ✅ **Docker Support** for containerized deployment
- ✅ **Load Balancing** with NGINX
- ✅ **Metrics Collection** with Prometheus/Grafana

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Set environment variables
cp .env.example .env.development
# Edit .env.development with your configuration

# Start development server
npm run dev

# Server will start at http://localhost:3001
```

## Production Deployment

### 1. Environment Setup

Create production environment file:

```bash
# .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sightedit_production
DB_USER=sightedit
DB_PASSWORD=your-secure-db-password

# JWT Secrets (generate strong secrets)
JWT_ACCESS_SECRET=your-512-bit-access-secret-key-here
JWT_REFRESH_SECRET=your-512-bit-refresh-secret-key-here

# CSRF Protection
CSRF_SECRET=your-256-bit-csrf-secret-key-here

# HTTPS Configuration
HTTPS_CERT_PATH=/path/to/cert.pem
HTTPS_KEY_PATH=/path/to/key.pem

# Email Configuration (for password reset)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourdomain.com

# CORS Origins
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# File Upload
UPLOAD_PATH=/var/lib/sightedit/uploads

# Logging
LOG_FILE=/var/log/sightedit/app.log

# External Services (optional)
ANALYTICS_ENDPOINT=https://api.analytics.com
ANALYTICS_API_KEY=your-analytics-key
MONITORING_WEBHOOK=https://hooks.slack.com/your-webhook
```

### 2. SSL Certificate Setup

#### Option A: Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be in /etc/letsencrypt/live/yourdomain.com/
```

#### Option B: Self-signed (Development/Testing)

```bash
# Generate self-signed certificate
mkdir certs
openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
```

### 3. Database Setup

#### PostgreSQL Setup

```bash
# Install PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE sightedit_production;
CREATE USER sightedit WITH PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE sightedit_production TO sightedit;
\q
```

#### MongoDB Setup

```bash
# Install MongoDB
sudo apt-get install mongodb

# Create database and user
mongo
use sightedit_production
db.createUser({
  user: "sightedit",
  pwd: "your-secure-password",
  roles: ["readWrite"]
})
```

### 4. Build and Deploy

```bash
# Build the application
npm run build

# Start production server
npm run start:production

# Or use PM2 for process management
npm install -g pm2
pm2 start dist/examples/production-server-example.js --name sightedit-server
pm2 startup
pm2 save
```

## Docker Deployment

### 1. Create Docker Secrets

```bash
# Create Docker secrets for sensitive data
echo "your-db-password" | docker secret create db_password -
echo "your-jwt-access-secret" | docker secret create jwt_access_secret -
echo "your-jwt-refresh-secret" | docker secret create jwt_refresh_secret -
echo "your-csrf-secret" | docker secret create csrf_secret -
echo "your-smtp-password" | docker secret create smtp_password -
echo "your-analytics-key" | docker secret create analytics_api_key -
echo "your-redis-password" | docker secret create redis_password -
echo "your-grafana-password" | docker secret create grafana_password -
```

### 2. Configure Environment

```bash
# .env for Docker Compose
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_FROM=noreply@yourdomain.com
CORS_ORIGINS=https://yourdomain.com
ANALYTICS_ENDPOINT=https://api.analytics.com
MONITORING_WEBHOOK=https://hooks.slack.com/your-webhook
REDIS_PASSWORD=your-redis-password
```

### 3. Deploy with Docker Compose

```bash
# Build and start all services
docker-compose -f docker-compose.production.yml up -d

# Check service status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f sightedit-server
```

### 4. Service URLs

- **Application**: https://yourdomain.com
- **Health Check**: https://yourdomain.com/health
- **Metrics**: https://yourdomain.com/metrics (internal only)
- **Prometheus**: http://yourdomain.com:9090
- **Grafana**: http://yourdomain.com:3001

## Configuration Reference

### JWT Configuration

```typescript
jwt: {
  accessTokenSecret: string;     // Min 64 characters
  refreshTokenSecret: string;    // Min 64 characters, different from access
  accessTokenExpiry: string;     // '15m', '1h', etc.
  refreshTokenExpiry: string;    // '7d', '30d', etc.
  issuer: string;               // Your application identifier
  audience: string[];           // Allowed token audiences
  clockTolerance: number;       // Clock skew tolerance (seconds)
  enableRateLimiting: boolean;  // Enable auth-specific rate limiting
  maxLoginAttempts: number;     // Max failed attempts before lockout
  lockoutDuration: number;      // Lockout duration in seconds
}
```

### Security Configuration

```typescript
security: {
  maxLoginAttempts: number;           // Max login attempts before lockout
  lockoutDuration: number;            // Lockout duration in minutes
  passwordResetExpiry: number;        // Password reset token expiry (minutes)
  emailVerificationExpiry: number;    // Email verification expiry (hours)
  maxSessions: number;                // Max concurrent sessions per user
  requireEmailVerification: boolean;  // Require email verification
  enableTwoFactor: boolean;           // Enable 2FA (requires setup)
  enableAccountLockout: boolean;      // Enable account lockout
  passwordHistory: number;            // Number of previous passwords to remember
}
```

### CORS Configuration

```typescript
cors: {
  enabled: boolean;          // Enable CORS
  origins: string[];         // Allowed origins
  credentials: boolean;      // Allow credentials
  methods: string[];         // Allowed HTTP methods
  allowedHeaders: string[];  // Allowed headers
}
```

### Rate Limiting Configuration

```typescript
rateLimit: {
  enabled: boolean;                // Enable rate limiting
  windowMs: number;               // Time window in ms
  max: number;                    // Max requests per window
  message: string;                // Rate limit exceeded message
  skipSuccessfulRequests: boolean; // Don't count successful requests
}
```

## Security Best Practices

### 1. Environment Variables

- Never commit secrets to version control
- Use Docker secrets or environment variable files
- Rotate secrets regularly
- Use strong, randomly generated secrets

### 2. Database Security

- Use dedicated database user with minimal privileges
- Enable SSL/TLS for database connections
- Regular backups and disaster recovery testing
- Monitor database access logs

### 3. HTTPS/TLS

- Use strong TLS configurations (TLS 1.2+)
- Enable HSTS headers
- Use certificate pinning if possible
- Regular certificate renewal

### 4. File Upload Security

- Validate file types and sizes
- Scan uploaded files for malware
- Store uploads outside web root
- Use CDN for public file serving

### 5. Monitoring and Logging

- Monitor failed authentication attempts
- Log security events
- Set up alerting for suspicious activity
- Regular security audits

## Monitoring and Metrics

### Health Check Endpoints

- `GET /health` - Comprehensive health check
- `HEAD /health` - Lightweight health check
- `GET /metrics` - Prometheus metrics
- `GET /api/status` - Application status

### Prometheus Metrics

The server exposes metrics for:
- Request count and response times
- Error rates and types
- Memory and CPU usage
- Database connection health
- Cache performance
- Authentication events

### Grafana Dashboards

Pre-configured dashboards for:
- Application performance
- Security events
- Database metrics
- System resources
- Error tracking

## Troubleshooting

### Common Issues

1. **Certificate Errors**
   ```bash
   # Check certificate validity
   openssl x509 -in cert.pem -text -noout
   
   # Verify certificate chain
   openssl verify -CAfile ca.pem cert.pem
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connection
   psql -h localhost -U sightedit -d sightedit_production
   
   # Check database logs
   sudo tail -f /var/log/postgresql/postgresql-*.log
   ```

3. **Permission Issues**
   ```bash
   # Check file permissions
   ls -la /var/lib/sightedit/
   
   # Fix permissions
   sudo chown -R sightedit:sightedit /var/lib/sightedit/
   sudo chmod -R 755 /var/lib/sightedit/
   ```

4. **Memory Issues**
   ```bash
   # Monitor memory usage
   docker stats
   
   # Check for memory leaks
   node --inspect dist/server.js
   ```

### Log Analysis

```bash
# Application logs
tail -f /var/log/sightedit/app.log

# NGINX logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Database logs (PostgreSQL)
tail -f /var/log/postgresql/postgresql-*.log

# Container logs
docker logs -f sightedit-server
```

## Performance Optimization

### 1. Database Optimization

- Use connection pooling
- Add database indexes for frequently queried fields
- Enable query caching
- Regular database maintenance (VACUUM, ANALYZE)

### 2. Application Optimization

- Enable gzip compression
- Use CDN for static assets
- Implement caching strategies
- Optimize image uploads

### 3. Server Optimization

- Use PM2 for process management
- Enable HTTP/2
- Configure proper buffer sizes
- Monitor resource usage

## Backup and Recovery

### 1. Database Backup

```bash
# PostgreSQL backup
pg_dump -h localhost -U sightedit sightedit_production > backup.sql

# MongoDB backup
mongodump --host localhost --db sightedit_production --out /backup/
```

### 2. File Backup

```bash
# Backup uploaded files
tar -czf uploads-backup.tar.gz /var/lib/sightedit/uploads/

# Sync to remote storage
aws s3 sync /var/lib/sightedit/uploads/ s3://your-backup-bucket/uploads/
```

### 3. Configuration Backup

```bash
# Backup configuration files
cp -r /etc/sightedit/ /backup/config/
cp docker-compose.production.yml /backup/
```

## Support and Maintenance

### Regular Maintenance Tasks

- [ ] Update dependencies monthly
- [ ] Rotate secrets quarterly
- [ ] Review access logs weekly
- [ ] Test backup/recovery procedures monthly
- [ ] Security audit quarterly
- [ ] Performance review monthly

### Update Procedure

```bash
# 1. Backup current deployment
./scripts/backup.sh

# 2. Test updates in staging
git checkout staging
npm install
npm run test
npm run build

# 3. Deploy to production
git checkout main
git merge staging
docker-compose -f docker-compose.production.yml pull
docker-compose -f docker-compose.production.yml up -d

# 4. Verify deployment
curl -f https://yourdomain.com/health
```

## Contact and Support

For production support:
- Review logs first: `/var/log/sightedit/`
- Check health endpoints
- Monitor system resources
- Contact support with detailed error information

---

This production setup ensures enterprise-grade security, performance, and reliability for your SightEdit server deployment.