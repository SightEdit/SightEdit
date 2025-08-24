# SightEdit Production Monitoring System

This directory contains comprehensive monitoring and alerting configurations for the SightEdit production environment, implementing industry best practices for observability, security monitoring, and incident response.

## 🔍 Overview

The monitoring system provides:

- **Application Performance Monitoring (APM)** with OpenTelemetry
- **Real-time Error Tracking** with Sentry integration
- **Infrastructure Monitoring** with Prometheus and Grafana
- **Business Metrics Tracking** for user activity and conversion
- **Centralized Logging** with Loki and Promtail
- **Distributed Tracing** with Jaeger
- **Security Monitoring** and threat detection
- **Database Performance Monitoring** with PostgreSQL exporter
- **Automated Alerting** with multi-level severity
- **Incident Response Workflows** with auto-remediation

## 📁 Directory Structure

```
monitoring/
├── docker-compose.monitoring.yml    # Complete monitoring stack
├── prometheus/                      # Metrics collection
│   ├── prometheus.yml              # Main configuration
│   └── rules/                      # Alert rules
│       └── sightedit-alerts.yml   # Application-specific alerts
├── grafana/                        # Visualization
│   ├── values.yaml                 # Helm configuration
│   ├── provisioning/               # Auto-provisioning
│   └── dashboards/                 # Pre-built dashboards
├── alertmanager/                   # Alert routing
│   └── alertmanager.yml           # Notification configuration
├── loki/                          # Log aggregation
│   └── loki-config.yml            # Loki configuration
├── promtail/                      # Log collection
│   └── promtail-config.yml        # Log parsing rules
├── otel/                          # OpenTelemetry
│   └── otel-collector-config.yml  # OTEL collector setup
├── postgres-exporter/             # Database monitoring
│   └── postgres-exporter.yml      # Database metrics config
├── webhook/                       # Alert processing
│   └── server.js                  # Automated response handler
├── runbooks/                      # Incident response
│   └── sightedit-incident-response.md
└── README.md                      # This file
```

## 🚀 Quick Start

### 1. Environment Setup

Create `.env` file with required variables:

```bash
# Copy example environment file
cp monitoring/.env.example monitoring/.env

# Edit with your actual values
nano monitoring/.env
```

Required environment variables:
```env
# Grafana
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=your_secure_password

# Alerting
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_key

# External Services
DATADOG_API_KEY=your_datadog_api_key
NEW_RELIC_API_KEY=your_newrelic_api_key
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Database
POSTGRES_USER=sightedit_monitor
POSTGRES_PASSWORD=monitor_password
```

### 2. Deploy Monitoring Stack

Using Docker Compose (Development/Testing):
```bash
# Start all monitoring services
cd monitoring
docker-compose -f docker-compose.monitoring.yml up -d

# Check service status
docker-compose -f docker-compose.monitoring.yml ps
```

Using Kubernetes (Production):
```bash
# Create monitoring namespace
kubectl create namespace sightedit-monitoring

# Deploy using Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Prometheus
helm install prometheus prometheus-community/prometheus \
  -f monitoring/prometheus/values.yaml \
  -n sightedit-monitoring

# Install Grafana
helm install grafana grafana/grafana \
  -f monitoring/grafana/values.yaml \
  -n sightedit-monitoring

# Install other components...
```

### 3. Access Dashboards

Once deployed, access the monitoring interfaces:

| Service | URL | Default Credentials |
|---------|-----|-------------------|
| Grafana | http://localhost:3000 | admin/admin |
| Prometheus | http://localhost:9090 | N/A |
| Alertmanager | http://localhost:9093 | N/A |
| Jaeger | http://localhost:16686 | N/A |
| Loki | http://localhost:3100 | N/A |
| Kibana | http://localhost:5601 | N/A |

## 📊 Monitoring Components

### Application Performance Monitoring

**OpenTelemetry Integration**: Comprehensive tracing and metrics collection
- Automatic instrumentation for HTTP, database, and external calls
- Custom business metrics tracking
- Performance profiling and optimization insights
- Distributed tracing across microservices

**Key Files**:
- `packages/core/src/utils/opentelemetry.ts` - OpenTelemetry setup
- `monitoring/otel/otel-collector-config.yml` - Collector configuration

### Infrastructure Monitoring

**Prometheus + Grafana**: Complete infrastructure visibility
- System metrics (CPU, memory, disk, network)
- Container metrics with cAdvisor
- Kubernetes cluster monitoring
- Custom application metrics

**Key Metrics**:
- HTTP request rate, duration, and error rate
- Database connection pool usage
- Cache hit rates and performance
- Resource utilization trends

### Business Intelligence

**Custom Business Metrics**: Track key business indicators
- User engagement and session analytics
- Editor activation and usage patterns
- Save operation success rates
- Feature adoption tracking
- Revenue and conversion metrics

**Implementation**:
- `packages/core/src/utils/business-metrics.ts` - Business metrics collection
- Real-time dashboard with business KPIs
- Automated reports and insights

### Error Tracking

**Sentry Integration**: Comprehensive error monitoring
- Real-time error tracking and grouping
- Performance monitoring and profiling
- Release tracking and regression detection
- User feedback collection

**Features**:
- Automatic error capture and reporting
- Source map support for debugging
- Performance transaction tracking
- Custom error context and tags

### Security Monitoring

**Threat Detection**: Advanced security monitoring
- Authentication failure pattern detection
- SQL injection and XSS attempt monitoring
- Rate limiting and abuse detection
- Suspicious user activity tracking
- IP-based threat intelligence

**Implementation**:
- `packages/core/src/security/security-monitor.ts` - Security monitoring
- Real-time threat detection and response
- Automated security incident creation

### Database Monitoring

**PostgreSQL Exporter**: Comprehensive database metrics
- Query performance and slow query detection
- Connection pool monitoring
- Table and index usage statistics
- Lock contention and blocking queries
- Replication lag monitoring

**Custom Queries**: SightEdit-specific monitoring
- User activity tracking
- Editor session metrics
- Business transaction monitoring
- Data integrity checks

## 🚨 Alerting System

### Alert Hierarchy

**Critical Alerts** (Immediate Response):
- Service completely down
- Database connectivity lost
- High error rates (>15%)
- Security breaches detected
- Data corruption identified

**High Priority** (< 30 minutes):
- Performance degradation
- Partial service outage
- Failed backups
- Certificate expiration warnings

**Medium Priority** (< 2 hours):
- Resource utilization warnings
- Non-critical service issues
- Monitoring system problems

**Low Priority** (< 24 hours):
- Informational alerts
- Trend notifications
- Capacity planning warnings

### Notification Channels

**Multi-Channel Alerting**:
- **Slack**: Real-time team notifications
- **Email**: Detailed alert information
- **PagerDuty**: On-call engineer escalation
- **SMS**: Critical alerts only
- **Webhook**: Custom integrations

### Auto-Remediation

**Automated Response Actions**:
- Service restart for memory issues
- Connection pool reset for database issues
- Cache clearing for corruption
- Scaling up for high load
- IP blocking for security threats

## 📈 Key Dashboards

### 1. SightEdit Application Overview
- Request rate and response time
- Error rate and success metrics
- Active users and sessions
- Feature usage analytics

### 2. Infrastructure Health
- System resource utilization
- Container and pod status
- Network and storage metrics
- Service dependency health

### 3. Business Metrics
- Daily/weekly/monthly active users
- Editor activation rates
- Save operation success rates
- Revenue and conversion tracking

### 4. Security Dashboard
- Failed login attempts
- Suspicious activity patterns
- Security violation trends
- Threat intelligence insights

### 5. Database Performance
- Query performance metrics
- Connection pool status
- Table and index statistics
- Slow query analysis

## 🔧 Configuration

### Prometheus Configuration

Key configuration files:
- `prometheus/prometheus.yml`: Main configuration
- `prometheus/rules/sightedit-alerts.yml`: Alert rules

**Service Discovery**: Automatic discovery of services
**Retention**: 30 days of metrics data
**Scrape Interval**: 15 seconds for real-time monitoring

### Grafana Setup

**Data Sources**: Pre-configured connections to:
- Prometheus (metrics)
- Loki (logs)
- Jaeger (traces)
- Elasticsearch (advanced log analysis)

**Dashboards**: Automatically provisioned dashboards for:
- Application monitoring
- Infrastructure health
- Business metrics
- Security insights

### Alerting Rules

**SightEdit-Specific Rules**:
- Application availability monitoring
- Performance threshold alerts
- Business metric anomalies
- Security violation detection

**Infrastructure Rules**:
- Resource utilization alerts
- Service health monitoring
- Database performance alerts
- Network and storage alerts

## 🛠️ Customization

### Adding Custom Metrics

1. **Application Code**:
```typescript
import { businessMetrics } from './utils/business-metrics';

// Track custom business event
businessMetrics.trackCustomEvent('feature_used', {
  feature: 'advanced_editor',
  user_tier: 'premium'
});
```

2. **Prometheus Configuration**:
```yaml
# Add custom scrape target
- job_name: 'custom-metrics'
  static_configs:
    - targets: ['custom-service:9090']
```

3. **Grafana Dashboard**:
- Create custom panels using Prometheus queries
- Add business-specific visualizations
- Configure custom alerts and notifications

### Custom Alert Rules

Add new alert rules in `prometheus/rules/`:

```yaml
- alert: CustomBusinessMetric
  expr: business_metric_rate > 100
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Custom business metric threshold exceeded"
```

## 🔍 Troubleshooting

### Common Issues

**High Memory Usage**:
```bash
# Check container memory usage
docker stats

# Restart specific service
docker-compose restart prometheus
```

**Missing Metrics**:
```bash
# Check service discovery
curl http://localhost:9090/api/v1/targets

# Verify configuration
promtool check config prometheus.yml
```

**Dashboard Not Loading**:
```bash
# Check Grafana logs
docker-compose logs grafana

# Restart Grafana
docker-compose restart grafana
```

### Performance Optimization

**Prometheus**:
- Adjust scrape intervals for less critical metrics
- Use recording rules for expensive queries
- Configure appropriate retention policies

**Grafana**:
- Use query caching for frequently accessed dashboards
- Optimize dashboard queries
- Configure proper refresh intervals

## 🔒 Security Considerations

### Authentication & Authorization
- Strong admin passwords for all services
- Role-based access control in Grafana
- API key management for external integrations

### Network Security
- Internal network communication only
- TLS encryption for external connections
- Firewall rules for service access

### Data Privacy
- No sensitive data in metrics labels
- Log sanitization for PII
- Retention policies for compliance

## 📚 Documentation

### Additional Resources
- [Incident Response Runbook](runbooks/sightedit-incident-response.md)
- [Alert Playbooks](runbooks/) - Specific procedures for each alert type
- [Architecture Decisions](docs/architecture.md) - Monitoring system design
- [Performance Tuning Guide](docs/performance.md) - Optimization tips

### External Documentation
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/alertmanager/)

## 🤝 Contributing

When adding new monitoring components:

1. Follow naming conventions for metrics and labels
2. Add appropriate documentation and runbooks
3. Test alerting rules thoroughly
4. Update dashboards and visualizations
5. Consider performance impact of new metrics

## 📞 Support

For monitoring system issues:
- **Slack**: #monitoring-support
- **Email**: monitoring@sightedit.com
- **On-call**: PagerDuty integration

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Network security rules applied
- [ ] Backup procedures tested

### Post-Deployment
- [ ] All services healthy
- [ ] Dashboards accessible
- [ ] Alerts configured and tested
- [ ] Documentation updated
- [ ] Team trained on new procedures

### Monitoring Verification
- [ ] Metrics being collected
- [ ] Logs being aggregated
- [ ] Traces being captured
- [ ] Alerts firing correctly
- [ ] Auto-remediation working

This monitoring system provides comprehensive observability for SightEdit, enabling proactive issue detection, rapid incident response, and data-driven decision making. The system is designed to scale with the application and provide insights at both technical and business levels.