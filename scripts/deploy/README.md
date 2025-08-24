# SightEdit Production Deployment Automation

This directory contains comprehensive production deployment automation scripts for SightEdit, providing zero-downtime deployments with multiple strategies, automated rollback procedures, and extensive validation.

## 🚀 Quick Start

```bash
# Basic blue-green deployment
./deploy-orchestrator.sh blue-green production v1.2.3

# Rolling deployment with validation
./pre-deployment-validation.sh production rolling v1.2.3 full
./deploy-orchestrator.sh rolling production v1.2.3

# Canary deployment with monitoring
./deploy-orchestrator.sh canary production v1.2.3

# Emergency rollback
./emergency-rollback.sh production previous
```

## 📁 Script Overview

### Core Deployment Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `deploy-orchestrator.sh` | Main deployment orchestrator | `./deploy-orchestrator.sh [strategy] [env] [version]` |
| `blue-green-deploy.sh` | Blue-green deployment | `./blue-green-deploy.sh [version] [env]` |
| `rolling-deploy.sh` | Rolling update deployment | `./rolling-deploy.sh [version] [env]` |
| `canary-deploy.sh` | Canary deployment with metrics | `./canary-deploy.sh [version] [env]` |

### Support Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `pre-deployment-validation.sh` | Pre-deployment validation | `./pre-deployment-validation.sh [env] [type] [version] [level]` |
| `health-check.sh` | Comprehensive health checks | `./health-check.sh [env] [type] [url]` |
| `db-migration.sh` | Database migration execution | `./db-migration.sh [env] [action] [steps]` |
| `emergency-rollback.sh` | Emergency rollback procedures | `./emergency-rollback.sh [env] [target] [value]` |

## 🔄 Deployment Strategies

### 1. Blue-Green Deployment

Zero-downtime deployment using two identical environments (blue/green).

**Features:**
- Instant traffic switching
- Complete rollback capability
- Full environment isolation
- Health validation before traffic switch

**Usage:**
```bash
# Deploy to blue-green
./blue-green-deploy.sh v1.2.3 production

# With orchestrator
./deploy-orchestrator.sh blue-green production v1.2.3
```

**Process:**
1. Deploy new version to inactive slot
2. Run health checks and validation
3. Switch traffic to new slot
4. Stop old slot after verification

### 2. Rolling Deployment

Updates services incrementally while maintaining availability.

**Features:**
- Configurable batch sizes
- Gradual service updates
- Automatic rollback on failure
- Load balancer integration

**Usage:**
```bash
# Basic rolling deployment
./rolling-deploy.sh v1.2.3 production

# With custom batch size
BATCH_SIZE=2 UPDATE_DELAY=60 ./rolling-deploy.sh v1.2.3 production
```

**Process:**
1. Update services in batches
2. Validate each batch before proceeding
3. Update load balancer configuration
4. Verify overall health

### 3. Canary Deployment

Gradual traffic shifting with automated promotion/rollback based on metrics.

**Features:**
- Configurable traffic percentage
- Automated metrics analysis
- Performance-based decisions
- Gradual rollout capability

**Usage:**
```bash
# Basic canary deployment (10% traffic)
./canary-deploy.sh v1.2.3 production

# Custom canary configuration
CANARY_WEIGHT=25 CANARY_DURATION=900 ./canary-deploy.sh v1.2.3 production
```

**Process:**
1. Deploy canary version alongside current
2. Route percentage of traffic to canary
3. Monitor metrics and performance
4. Auto-promote or rollback based on thresholds

## 🔍 Pre-Deployment Validation

Comprehensive validation framework to ensure deployment readiness.

### Validation Levels

- **Basic**: Essential infrastructure and connectivity checks
- **Standard**: Code quality, tests, and deployment readiness
- **Full**: Complete validation including security and performance
- **Custom**: User-defined validation configuration

### Validation Categories

- **Code Quality**: Compilation, linting, formatting
- **Testing**: Unit, integration, and E2E tests
- **Security**: Vulnerability scanning, secrets management
- **Infrastructure**: Resources, database, Redis readiness
- **Performance**: Baseline performance validation

### Usage Examples

```bash
# Full validation before deployment
./pre-deployment-validation.sh production blue-green v1.2.3 full

# Quick basic validation
./pre-deployment-validation.sh staging rolling latest basic

# Parallel validation with fail-fast
PARALLEL_VALIDATION=true FAIL_FAST=true ./pre-deployment-validation.sh production canary v1.2.3 standard
```

## 🏥 Health Checks

Multi-layer health validation system for deployment verification.

### Check Types

- **Basic**: Application health, database, Redis connectivity
- **Deep**: Performance, memory usage, API functionality
- **Critical**: Essential services only (fast validation)
- **Security**: SSL certificates, security headers
- **Infrastructure**: Monitoring, load balancer, replication

### Usage Examples

```bash
# Comprehensive health check
./health-check.sh production all

# Quick critical checks
./health-check.sh production critical

# Security-focused checks
./health-check.sh production security https://myapp.com
```

## 🗃️ Database Migrations

Safe database migration execution with rollback capabilities.

### Features

- Pre-migration backups
- Transaction-based execution
- Rollback procedures
- Migration locking
- Validation queries

### Usage Examples

```bash
# Run all pending migrations
./db-migration.sh production migrate all

# Check migration status
./db-migration.sh production status

# Rollback specific migration
./db-migration.sh production rollback 20231201_001

# Dry run migrations
DRY_RUN=true ./db-migration.sh production migrate all
```

## 🚨 Emergency Rollback

Fast emergency rollback system for critical production issues.

### Rollback Targets

- **Previous**: Rollback to previous version
- **Version**: Rollback to specific version
- **Backup**: Restore from database backup

### Features

- Immediate notifications (Slack, PagerDuty, Email, SMS)
- Minimal validation delays
- Automatic diagnostics collection
- Incident tracking

### Usage Examples

```bash
# Emergency rollback to previous version
./emergency-rollback.sh production previous

# Rollback to specific version
./emergency-rollback.sh production version v1.1.9

# Database restoration from backup
./emergency-rollback.sh production backup /var/backups/db-backup.sql.gz

# Force rollback without confirmation
FORCE_ROLLBACK=true ./emergency-rollback.sh production previous
```

## ⚙️ Configuration

### Environment Configuration

Create environment-specific configuration files:

```bash
# config/environments/production.env
DOMAIN=myapp.com
DB_NAME=sightedit_prod
DB_USER=sightedit
DB_PASSWORD=secure_password
REDIS_PASSWORD=redis_password
JWT_SECRET=jwt_secret
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
PAGERDUTY_INTEGRATION_KEY=your_key
```

### Deployment Configuration

Environment variables for deployment behavior:

```bash
# Deployment timing
HEALTH_CHECK_TIMEOUT=300
MIGRATION_TIMEOUT=1800
CANARY_DURATION=600

# Deployment behavior
FORCE_DEPLOY=false
DRY_RUN=false
PARALLEL_CHECKS=true
AUTO_PROMOTE=true
AUTO_ROLLBACK=true

# Notification settings
NOTIFICATION_EMAIL=admin@company.com
EMERGENCY_CONTACTS=oncall@company.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Load Balancer Configuration

Traefik configuration for traffic management:

```yaml
# config/traefik/dynamic-routing.yml
http:
  routers:
    sightedit-web:
      rule: "Host(`myapp.com`)"
      service: sightedit-web-service
      tls:
        certResolver: letsencrypt
  
  services:
    sightedit-web-service:
      loadBalancer:
        servers:
          - url: "http://web-blue:3000"
          - url: "http://web-green:3000"
        healthCheck:
          path: "/health"
          interval: "10s"
          timeout: "5s"
```

## 📊 Monitoring and Alerting

### Deployment Monitoring

Integration with monitoring stack:

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Deployment dashboards
- **AlertManager**: Alert routing and management
- **Loki**: Log aggregation

### Key Metrics

- Deployment duration and success rate
- Error rates and response times
- Resource utilization
- Health check status
- Rollback frequency

### Alert Rules

```yaml
groups:
  - name: deployment-alerts
    rules:
      - alert: DeploymentFailed
        expr: sightedit_deployment_status != 1
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "SightEdit deployment failed"
          description: "Deployment failed for {{ $labels.environment }}"
      
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} for {{ $labels.service }}"
```

## 🔒 Security Considerations

### Secrets Management

- Use environment variables for secrets
- Avoid hardcoding credentials
- Implement proper secret rotation
- Use encrypted storage for sensitive data

### Access Control

- Limit deployment script execution permissions
- Use service accounts for automation
- Implement proper logging and auditing
- Secure notification channels

### Network Security

- Use TLS for all communications
- Implement proper firewall rules
- Secure inter-service communication
- Regular security scanning

## 🧪 Testing

### Testing Strategies

1. **Pre-deployment Testing**
   - Unit tests with coverage requirements
   - Integration tests against staging
   - Security vulnerability scanning
   - Performance baseline validation

2. **Deployment Testing**
   - Health checks during deployment
   - Smoke tests on new versions
   - Load balancer verification
   - Database migration validation

3. **Post-deployment Testing**
   - End-to-end functionality tests
   - Performance regression testing
   - Security compliance checks
   - Monitoring alert verification

### Test Automation

```bash
# Complete test pipeline
./pre-deployment-validation.sh production blue-green v1.2.3 full
./deploy-orchestrator.sh blue-green production v1.2.3
./health-check.sh production all https://myapp.com
```

## 📝 Logging and Troubleshooting

### Log Locations

- Deployment logs: `/var/log/sightedit/deployment-*.log`
- Health check logs: `/var/log/sightedit/health-check-*.log`
- Migration logs: `/var/log/sightedit/migration-*.log`
- Rollback logs: `/var/log/sightedit/emergency-rollback-*.log`

### Common Issues and Solutions

1. **Deployment Timeout**
   ```bash
   # Increase timeout values
   HEALTH_CHECK_TIMEOUT=600 ./deploy-orchestrator.sh
   ```

2. **Database Migration Fails**
   ```bash
   # Check migration status
   ./db-migration.sh production status
   
   # Manual rollback if needed
   ./db-migration.sh production rollback migration_name
   ```

3. **Health Check Failures**
   ```bash
   # Run detailed health checks
   ./health-check.sh production deep
   
   # Check specific components
   ./health-check.sh production infrastructure
   ```

4. **Emergency Situations**
   ```bash
   # Immediate rollback
   EMERGENCY_MODE=true ./emergency-rollback.sh production previous
   
   # Check system status
   ./health-check.sh production critical
   ```

## 🔧 Maintenance

### Regular Maintenance Tasks

1. **Log Rotation**: Implement log rotation for deployment logs
2. **Backup Cleanup**: Clean old database backups regularly
3. **Metric Retention**: Manage monitoring data retention
4. **Security Updates**: Keep deployment tools updated
5. **Documentation**: Keep deployment procedures current

### Performance Optimization

- Monitor deployment times and optimize bottlenecks
- Implement caching for build artifacts
- Optimize Docker image sizes
- Use parallel processing where appropriate

## 📚 Best Practices

### Deployment Best Practices

1. **Always validate before deployment**: Use pre-deployment validation
2. **Monitor deployment progress**: Watch metrics and logs
3. **Have rollback plan ready**: Test rollback procedures regularly
4. **Use appropriate strategy**: Choose deployment strategy based on requirements
5. **Communicate changes**: Notify stakeholders of deployments

### Operational Best Practices

1. **Regular testing**: Test deployment procedures in staging
2. **Documentation updates**: Keep procedures documented
3. **Team training**: Ensure team knows deployment procedures
4. **Incident response**: Have clear incident response procedures
5. **Continuous improvement**: Learn from deployment issues

## 🤝 Contributing

When adding new deployment features:

1. Follow existing script structure and conventions
2. Add comprehensive error handling and logging
3. Include help documentation and usage examples
4. Test in staging environment first
5. Update this README with new functionality

## 📞 Support

For deployment issues or questions:

- Check logs in `/var/log/sightedit/`
- Review health check output
- Consult monitoring dashboards
- Contact DevOps team for emergency situations

## 📋 Deployment Checklist

### Pre-Deployment

- [ ] Run pre-deployment validation
- [ ] Check system resources and capacity
- [ ] Verify database backup is recent
- [ ] Confirm rollback procedures are ready
- [ ] Notify stakeholders of deployment window

### During Deployment

- [ ] Monitor deployment progress
- [ ] Watch for error alerts
- [ ] Verify health checks pass
- [ ] Confirm traffic routing is correct
- [ ] Validate application functionality

### Post-Deployment

- [ ] Run post-deployment verification
- [ ] Monitor application metrics
- [ ] Check error rates and performance
- [ ] Validate all features work correctly
- [ ] Document any issues or lessons learned