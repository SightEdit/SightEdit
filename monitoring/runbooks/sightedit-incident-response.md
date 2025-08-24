# SightEdit Incident Response Runbook

## Overview

This runbook provides step-by-step procedures for responding to incidents in the SightEdit production environment. It covers common scenarios, escalation procedures, and recovery steps.

## General Incident Response Process

### 1. Initial Assessment (0-5 minutes)

1. **Acknowledge the Alert**
   - Log into monitoring dashboard: https://monitoring.sightedit.com
   - Check alert details and severity level
   - Verify if this is a false positive

2. **Initial Impact Assessment**
   - Check service status dashboard
   - Verify user-facing functionality
   - Estimate number of affected users
   - Check recent deployments or changes

3. **Classification**
   - **P0 (Critical)**: Complete service outage, security breach, data loss
   - **P1 (High)**: Significant feature degradation, high error rates
   - **P2 (Medium)**: Limited functionality impact, performance issues
   - **P3 (Low)**: Minor issues, cosmetic problems

### 2. Communication (5-10 minutes)

1. **Internal Communication**
   ```
   #incident-response Slack channel
   
   🚨 INCIDENT DECLARED 🚨
   Incident ID: INC-YYYYMMDD-XXX
   Priority: P0/P1/P2/P3
   Summary: [Brief description]
   Impact: [User impact description]
   Incident Commander: @username
   ```

2. **Status Page Update** (P0/P1 only)
   - Update status.sightedit.com
   - Post initial incident notice
   - Set affected services to "investigating"

3. **Customer Communication** (P0 only)
   - Send initial notification within 15 minutes
   - Use pre-approved templates
   - Include estimated resolution time

### 3. Investigation and Resolution

#### High-Level Debugging Steps

1. **Check System Health**
   ```bash
   # Service status
   kubectl get pods -n sightedit
   kubectl get services -n sightedit
   
   # Database status
   kubectl exec -it postgres-pod -- psql -U sightedit -c "SELECT 1;"
   
   # Redis status
   kubectl exec -it redis-pod -- redis-cli ping
   ```

2. **Review Metrics**
   - Check Grafana dashboards
   - Review error rates and response times
   - Examine resource utilization (CPU, Memory, Disk)

3. **Check Recent Changes**
   - Review deployment history
   - Check recent configuration changes
   - Verify infrastructure modifications

## Specific Incident Scenarios

### Application Down / High Error Rate

#### Symptoms
- HTTP 5xx errors > 5%
- Response times > 5 seconds
- Health check failures

#### Investigation Steps

1. **Check Service Status**
   ```bash
   # Pod status
   kubectl get pods -l app=sightedit-backend
   
   # Recent events
   kubectl get events --sort-by='.lastTimestamp' | head -20
   ```

2. **Review Application Logs**
   ```bash
   # Recent errors
   kubectl logs -l app=sightedit-backend --tail=100 | grep -i error
   
   # Check for out of memory or crashes
   kubectl logs -l app=sightedit-backend --previous
   ```

3. **Check Resource Usage**
   ```bash
   # CPU and Memory usage
   kubectl top pods -l app=sightedit-backend
   ```

#### Resolution Steps

1. **Quick Fix Options**
   ```bash
   # Restart pods
   kubectl rollout restart deployment/sightedit-backend
   
   # Scale up if resource constrained
   kubectl scale deployment sightedit-backend --replicas=6
   ```

2. **Database Connection Issues**
   ```bash
   # Check database connections
   kubectl exec -it postgres-pod -- psql -U sightedit -c "
   SELECT count(*), state FROM pg_stat_activity 
   WHERE datname = 'sightedit' 
   GROUP BY state;"
   
   # Kill idle connections if needed
   kubectl exec -it postgres-pod -- psql -U sightedit -c "
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' AND state_change < now() - interval '5 minutes';"
   ```

### Database Performance Issues

#### Symptoms
- Slow query performance
- High database connection count
- Lock contentions

#### Investigation Steps

1. **Check Active Queries**
   ```sql
   -- Long running queries
   SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
   ```

2. **Check Locks**
   ```sql
   -- Current locks
   SELECT t.relname,l.locktype,page,virtualtransaction,pid,mode,granted 
   FROM pg_locks l, pg_stat_all_tables t 
   WHERE l.relation=t.relid ORDER BY relation asc;
   ```

3. **Check Connection Pool**
   ```sql
   -- Connection count by state
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```

#### Resolution Steps

1. **Kill Problematic Queries**
   ```sql
   -- Terminate long-running query
   SELECT pg_terminate_backend(pid);
   ```

2. **Restart Connection Pool**
   ```bash
   # Restart pgbouncer or connection pool
   kubectl rollout restart deployment/pgbouncer
   ```

### Redis/Cache Issues

#### Symptoms
- Cache miss rate > 50%
- High response times
- Memory usage warnings

#### Investigation Steps

1. **Check Redis Status**
   ```bash
   kubectl exec -it redis-pod -- redis-cli info memory
   kubectl exec -it redis-pod -- redis-cli info stats
   ```

2. **Check Cache Hit Rate**
   ```bash
   kubectl exec -it redis-pod -- redis-cli info stats | grep keyspace
   ```

#### Resolution Steps

1. **Clear Cache if Corrupted**
   ```bash
   kubectl exec -it redis-pod -- redis-cli flushdb
   ```

2. **Restart Redis**
   ```bash
   kubectl rollout restart deployment/redis
   ```

### High Memory Usage

#### Symptoms
- Memory usage > 85%
- Out of memory errors
- Pod restarts due to OOM

#### Investigation Steps

1. **Check Memory Usage**
   ```bash
   kubectl top pods --sort-by=memory
   kubectl describe node [node-name]
   ```

2. **Review Memory Limits**
   ```bash
   kubectl describe deployment sightedit-backend | grep -A 5 -B 5 resources
   ```

#### Resolution Steps

1. **Increase Memory Limits**
   ```bash
   kubectl patch deployment sightedit-backend -p '{"spec":{"template":{"spec":{"containers":[{"name":"sightedit-backend","resources":{"limits":{"memory":"2Gi"}}}]}}}}'
   ```

2. **Scale Horizontally**
   ```bash
   kubectl scale deployment sightedit-backend --replicas=4
   ```

### Security Incidents

#### Symptoms
- Unusual login patterns
- High rate of authentication failures
- Suspicious API usage

#### Investigation Steps

1. **Check Security Logs**
   ```bash
   # Recent security events
   kubectl logs -l app=sightedit-backend | grep -i security | tail -50
   
   # Failed login attempts
   kubectl logs -l app=sightedit-backend | grep "auth.*failed" | tail -20
   ```

2. **Review Access Logs**
   ```bash
   # Suspicious IP addresses
   kubectl logs -l app=nginx | grep -E "(40[1-4]|50[0-9])" | awk '{print $1}' | sort | uniq -c | sort -nr | head -10
   ```

#### Resolution Steps

1. **Block Suspicious IPs**
   ```bash
   # Add IP to blocklist
   kubectl patch configmap nginx-config --patch '{"data":{"blocked-ips":"1.2.3.4,5.6.7.8"}}'
   kubectl rollout restart deployment/nginx
   ```

2. **Force Password Resets** (if needed)
   ```bash
   # Disable compromised accounts
   kubectl exec -it postgres-pod -- psql -U sightedit -c "
   UPDATE users SET account_locked = true 
   WHERE id IN (SELECT user_id FROM security_events WHERE event_type = 'account_takeover');"
   ```

## Escalation Procedures

### Level 1: On-Call Engineer (0-30 minutes)
- Initial assessment and basic troubleshooting
- Apply known fixes and restart services
- Escalate if unable to resolve within 30 minutes

### Level 2: Senior Engineer (30-60 minutes)
- Deep technical investigation
- Complex debugging and code-level fixes
- Coordination with development team
- Escalate to Level 3 if needed

### Level 3: Engineering Manager + CTO (60+ minutes)
- Major architectural decisions
- External vendor coordination
- Customer communication approval
- Post-incident review planning

### External Escalations
- **Infrastructure Provider**: For cloud/hosting issues
- **Third-party Services**: For external API failures
- **Security Team**: For confirmed security breaches
- **Legal/Compliance**: For data breach incidents

## Communication Templates

### Initial Incident Notice
```
Subject: [P0] SightEdit Service Disruption - Investigating

We are currently investigating reports of service disruption affecting SightEdit users. 

Impact: [Description of user impact]
Start Time: [UTC timestamp]
Status: Investigating

We will provide updates every 30 minutes until resolved.

SightEdit Engineering Team
```

### Resolution Notice
```
Subject: [RESOLVED] SightEdit Service Disruption

The service disruption affecting SightEdit has been resolved.

Root Cause: [Brief technical explanation]
Resolution: [What was done to fix it]
Duration: [Total incident duration]

A detailed post-incident review will be published within 48 hours.

SightEdit Engineering Team
```

## Post-Incident Procedures

### Immediate (Within 24 hours)
1. Create incident timeline
2. Collect all relevant logs and metrics
3. Document actions taken
4. Schedule post-incident review meeting

### Short-term (Within 1 week)
1. Conduct blameless post-incident review
2. Identify root causes and contributing factors
3. Create action items with owners and deadlines
4. Update runbooks and alerting as needed

### Long-term (Within 1 month)
1. Implement preventive measures
2. Review and update incident response procedures
3. Share learnings with the broader team
4. Update monitoring and alerting thresholds

## Emergency Contacts

### Internal Team
- **On-Call Engineer**: PagerDuty rotation
- **Engineering Manager**: [phone] / [email]
- **CTO**: [phone] / [email]
- **DevOps Lead**: [phone] / [email]

### External Vendors
- **AWS Support**: 1-800-xxx-xxxx (Premium Support)
- **Datadog Support**: [email] / [slack channel]
- **CDN Provider**: [emergency contact]

### Communication Channels
- **Slack**: #incident-response
- **Status Page**: https://status.sightedit.com
- **Customer Support**: support@sightedit.com

## Tools and Dashboards

### Monitoring
- **Grafana**: https://monitoring.sightedit.com
- **Prometheus**: https://prometheus.sightedit.com
- **Alertmanager**: https://alerts.sightedit.com

### Logs
- **Kibana**: https://logs.sightedit.com
- **Loki**: https://loki.sightedit.com

### Infrastructure
- **Kubernetes**: kubectl configured for production cluster
- **AWS Console**: https://console.aws.amazon.com
- **CloudFlare**: https://dash.cloudflare.com

### Tracing
- **Jaeger**: https://tracing.sightedit.com

Remember: The goal is to restore service quickly while maintaining system integrity and user trust. When in doubt, escalate early and communicate proactively.