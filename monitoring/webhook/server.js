/**
 * Webhook Server for SightEdit Alert Processing
 * Handles incoming alerts from Alertmanager and processes automated responses
 */

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const PORT = process.env.WEBHOOK_PORT || 8080;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'sightedit_webhook_secret';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const PAGERDUTY_INTEGRATION_KEY = process.env.PAGERDUTY_INTEGRATION_KEY;
const DATADOG_API_KEY = process.env.DATADOG_API_KEY;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Logger setup
const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: '/var/log/webhook-server.log' })
  ]
});

const app = express();

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use((req, res, next) => {
  req.startTime = Date.now();
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  // Basic metrics in Prometheus format
  res.set('Content-Type', 'text/plain');
  res.send(`
# HELP webhook_requests_total Total number of webhook requests
# TYPE webhook_requests_total counter
webhook_requests_total{endpoint="alerts"} ${alertsProcessed}
webhook_requests_total{endpoint="health"} ${healthChecks}

# HELP webhook_processing_duration_seconds Time spent processing webhooks
# TYPE webhook_processing_duration_seconds histogram
webhook_processing_duration_seconds_sum ${totalProcessingTime}
webhook_processing_duration_seconds_count ${alertsProcessed}

# HELP webhook_errors_total Total number of webhook processing errors
# TYPE webhook_errors_total counter
webhook_errors_total ${processingErrors}
`.trim());
});

// Global counters for metrics
let alertsProcessed = 0;
let healthChecks = 0;
let processingErrors = 0;
let totalProcessingTime = 0;

// Webhook signature verification
function verifySignature(payload, signature) {
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${expectedSignature}`),
    Buffer.from(signature)
  );
}

// Main alert webhook endpoint
app.post('/alerts/:receiver?', async (req, res) => {
  const startTime = Date.now();
  const receiver = req.params.receiver || 'default';

  try {
    // Verify signature if provided
    const signature = req.get('X-Hub-Signature-256');
    if (signature && !verifySignature(JSON.stringify(req.body), signature)) {
      logger.warn('Invalid webhook signature', { receiver, ip: req.ip });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    logger.info('Processing alert webhook', {
      receiver,
      alertCount: req.body.alerts?.length || 0,
      status: req.body.status,
      groupKey: req.body.groupKey
    });

    // Process alerts
    await processAlerts(req.body, receiver);

    alertsProcessed++;
    totalProcessingTime += (Date.now() - startTime) / 1000;

    res.json({
      status: 'success',
      message: 'Alerts processed successfully',
      alertsReceived: req.body.alerts?.length || 0,
      processingTime: Date.now() - startTime
    });

  } catch (error) {
    processingErrors++;
    logger.error('Error processing alerts', {
      error: error.message,
      stack: error.stack,
      receiver,
      alertCount: req.body.alerts?.length || 0
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to process alerts',
      error: error.message
    });
  }
});

// Process incoming alerts
async function processAlerts(webhook, receiver) {
  const { alerts, status, groupKey, groupLabels } = webhook;

  logger.info('Processing alert group', {
    receiver,
    status,
    groupKey,
    alertCount: alerts.length,
    groupLabels
  });

  // Process each alert
  for (const alert of alerts) {
    await processIndividualAlert(alert, receiver, status);
  }

  // Handle group-level processing
  await processAlertGroup(webhook, receiver);
}

// Process individual alert
async function processIndividualAlert(alert, receiver, status) {
  const { labels, annotations, startsAt, endsAt } = alert;
  
  logger.info('Processing individual alert', {
    alertname: labels.alertname,
    severity: labels.severity,
    service: labels.service,
    instance: labels.instance,
    status
  });

  // Auto-remediation based on alert type
  if (status === 'firing' && labels.severity === 'critical') {
    await attemptAutoRemediation(alert);
  }

  // Create incident ticket if critical
  if (status === 'firing' && labels.severity === 'critical' && !labels.no_ticket) {
    await createIncidentTicket(alert);
  }

  // Update external monitoring systems
  await updateExternalSystems(alert, receiver, status);

  // Store alert for analytics
  await storeAlertData(alert, receiver, status);
}

// Process alert group
async function processAlertGroup(webhook, receiver) {
  const { alerts, groupLabels, status } = webhook;
  
  // Check for alert storms
  if (alerts.length > 10) {
    logger.warn('Alert storm detected', {
      receiver,
      alertCount: alerts.length,
      groupLabels
    });
    
    await notifyAlertStorm(webhook);
  }

  // Check for service-wide outages
  const services = new Set(alerts.map(alert => alert.labels.service));
  if (services.size === 1 && alerts.length >= 5) {
    const service = Array.from(services)[0];
    logger.warn('Service-wide outage detected', {
      service,
      receiver,
      alertCount: alerts.length
    });
    
    await handleServiceOutage(service, alerts);
  }
}

// Attempt automated remediation
async function attemptAutoRemediation(alert) {
  const { labels, annotations } = alert;
  const alertname = labels.alertname;

  logger.info('Attempting auto-remediation', {
    alertname,
    service: labels.service,
    instance: labels.instance
  });

  try {
    switch (alertname) {
      case 'HighMemoryUsage':
        await restartService(labels.service, labels.instance, 'high memory usage');
        break;
        
      case 'HighDiskUsage':
        await cleanupDiskSpace(labels.instance);
        break;
        
      case 'DatabaseConnectionHigh':
        await killIdleConnections(labels.service);
        break;
        
      case 'RedisDown':
        await restartRedis(labels.instance);
        break;
        
      case 'HighErrorRate':
        await scaleUpService(labels.service);
        break;
        
      default:
        logger.info('No auto-remediation available', { alertname });
    }
  } catch (error) {
    logger.error('Auto-remediation failed', {
      alertname,
      error: error.message,
      service: labels.service,
      instance: labels.instance
    });
  }
}

// Restart service
async function restartService(service, instance, reason) {
  logger.info('Restarting service', { service, instance, reason });
  
  // In a real implementation, this would call Kubernetes API or Docker API
  // For now, we'll simulate the restart
  
  try {
    // Simulate service restart
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info('Service restart completed', { service, instance });
    
    // Send notification
    await sendSlackMessage(`🔄 Auto-remediation: Restarted service ${service} on ${instance} due to ${reason}`);
    
  } catch (error) {
    logger.error('Service restart failed', {
      service,
      instance,
      error: error.message
    });
  }
}

// Clean up disk space
async function cleanupDiskSpace(instance) {
  logger.info('Cleaning up disk space', { instance });
  
  try {
    // In a real implementation, this would run cleanup commands
    // For now, we'll simulate the cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    logger.info('Disk cleanup completed', { instance });
    
    await sendSlackMessage(`🧹 Auto-remediation: Cleaned up disk space on ${instance}`);
    
  } catch (error) {
    logger.error('Disk cleanup failed', {
      instance,
      error: error.message
    });
  }
}

// Kill idle database connections
async function killIdleConnections(service) {
  logger.info('Killing idle database connections', { service });
  
  try {
    // In a real implementation, this would connect to the database and kill idle connections
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info('Idle connections killed', { service });
    
    await sendSlackMessage(`🔌 Auto-remediation: Killed idle database connections for ${service}`);
    
  } catch (error) {
    logger.error('Failed to kill idle connections', {
      service,
      error: error.message
    });
  }
}

// Restart Redis
async function restartRedis(instance) {
  logger.info('Restarting Redis', { instance });
  
  try {
    // Simulate Redis restart
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    logger.info('Redis restart completed', { instance });
    
    await sendSlackMessage(`🔴 Auto-remediation: Restarted Redis on ${instance}`);
    
  } catch (error) {
    logger.error('Redis restart failed', {
      instance,
      error: error.message
    });
  }
}

// Scale up service
async function scaleUpService(service) {
  logger.info('Scaling up service', { service });
  
  try {
    // In a real implementation, this would call Kubernetes API to scale up
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    logger.info('Service scaled up', { service });
    
    await sendSlackMessage(`📈 Auto-remediation: Scaled up service ${service} to handle increased load`);
    
  } catch (error) {
    logger.error('Service scale up failed', {
      service,
      error: error.message
    });
  }
}

// Create incident ticket
async function createIncidentTicket(alert) {
  const { labels, annotations } = alert;
  
  logger.info('Creating incident ticket', {
    alertname: labels.alertname,
    severity: labels.severity,
    service: labels.service
  });

  try {
    // Create PagerDuty incident if configured
    if (PAGERDUTY_INTEGRATION_KEY) {
      await createPagerDutyIncident(alert);
    }
    
    // Store incident data
    const incident = {
      id: generateIncidentId(),
      alertname: labels.alertname,
      severity: labels.severity,
      service: labels.service,
      instance: labels.instance,
      description: annotations.description,
      summary: annotations.summary,
      timestamp: new Date().toISOString(),
      status: 'open',
      runbook: annotations.runbook_url,
      dashboard: annotations.dashboard
    };
    
    await storeIncident(incident);
    
    logger.info('Incident ticket created', {
      incidentId: incident.id,
      alertname: labels.alertname
    });
    
  } catch (error) {
    logger.error('Failed to create incident ticket', {
      alertname: labels.alertname,
      error: error.message
    });
  }
}

// Create PagerDuty incident
async function createPagerDutyIncident(alert) {
  const { labels, annotations } = alert;
  
  const payload = {
    routing_key: PAGERDUTY_INTEGRATION_KEY,
    event_action: 'trigger',
    dedup_key: `${labels.alertname}_${labels.service}_${labels.instance}`,
    payload: {
      summary: `${labels.alertname}: ${labels.service}`,
      source: labels.instance,
      severity: labels.severity,
      component: labels.service,
      group: labels.category,
      custom_details: {
        description: annotations.description,
        runbook: annotations.runbook_url,
        dashboard: annotations.dashboard,
        service: labels.service,
        instance: labels.instance
      }
    },
    links: [
      {
        href: annotations.runbook_url,
        text: 'Runbook'
      },
      {
        href: annotations.dashboard,
        text: 'Dashboard'
      }
    ]
  };

  try {
    await axios.post('https://events.pagerduty.com/v2/enqueue', payload);
    logger.info('PagerDuty incident created', {
      dedupKey: payload.dedup_key,
      alertname: labels.alertname
    });
  } catch (error) {
    logger.error('Failed to create PagerDuty incident', {
      error: error.message,
      alertname: labels.alertname
    });
  }
}

// Update external monitoring systems
async function updateExternalSystems(alert, receiver, status) {
  const { labels } = alert;
  
  // Send to Datadog if configured
  if (DATADOG_API_KEY) {
    try {
      await sendToDatadog(alert, status);
    } catch (error) {
      logger.error('Failed to send to Datadog', {
        error: error.message,
        alertname: labels.alertname
      });
    }
  }
  
  // Update internal monitoring dashboard
  try {
    await updateMonitoringDashboard(alert, status);
  } catch (error) {
    logger.error('Failed to update monitoring dashboard', {
      error: error.message,
      alertname: labels.alertname
    });
  }
}

// Send to Datadog
async function sendToDatadog(alert, status) {
  const { labels, annotations } = alert;
  
  const event = {
    title: `${labels.alertname}: ${labels.service}`,
    text: annotations.description,
    date_happened: Math.floor(Date.now() / 1000),
    priority: labels.severity === 'critical' ? 'high' : 'normal',
    tags: [
      `service:${labels.service}`,
      `instance:${labels.instance}`,
      `severity:${labels.severity}`,
      `alertname:${labels.alertname}`,
      `status:${status}`
    ],
    alert_type: status === 'firing' ? 'error' : 'info',
    source_type_name: 'prometheus'
  };

  await axios.post('https://api.datadoghq.com/api/v1/events', event, {
    headers: {
      'DD-API-KEY': DATADOG_API_KEY,
      'Content-Type': 'application/json'
    }
  });
}

// Send Slack message
async function sendSlackMessage(message, channel = '#alerts') {
  if (!SLACK_WEBHOOK_URL) return;
  
  try {
    await axios.post(SLACK_WEBHOOK_URL, {
      channel,
      text: message,
      username: 'SightEdit Monitor',
      icon_emoji: ':robot_face:'
    });
  } catch (error) {
    logger.error('Failed to send Slack message', {
      error: error.message,
      message
    });
  }
}

// Notify alert storm
async function notifyAlertStorm(webhook) {
  const message = `🌪️ Alert storm detected! Received ${webhook.alerts.length} alerts for ${JSON.stringify(webhook.groupLabels)}`;
  await sendSlackMessage(message, '#alerts-critical');
}

// Handle service outage
async function handleServiceOutage(service, alerts) {
  const message = `🚨 Service outage detected for ${service}! ${alerts.length} alerts firing.`;
  await sendSlackMessage(message, '#alerts-critical');
  
  // Auto-escalate to critical team
  logger.error('Service outage detected', {
    service,
    alertCount: alerts.length,
    alerts: alerts.map(a => a.labels.alertname)
  });
}

// Store alert data
async function storeAlertData(alert, receiver, status) {
  // In a real implementation, this would store to a database or time series DB
  const alertData = {
    ...alert,
    receiver,
    status,
    processedAt: new Date().toISOString()
  };
  
  // For now, just log structured data
  logger.info('Storing alert data', { alertData });
}

// Store incident
async function storeIncident(incident) {
  try {
    const incidentFile = path.join('/tmp', `incident_${incident.id}.json`);
    await fs.writeFile(incidentFile, JSON.stringify(incident, null, 2));
    logger.info('Incident stored', { incidentId: incident.id, file: incidentFile });
  } catch (error) {
    logger.error('Failed to store incident', {
      incidentId: incident.id,
      error: error.message
    });
  }
}

// Update monitoring dashboard
async function updateMonitoringDashboard(alert, status) {
  // This would update internal dashboard with alert status
  logger.debug('Updating monitoring dashboard', {
    alertname: alert.labels.alertname,
    status
  });
}

// Generate incident ID
function generateIncidentId() {
  return `INC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Request logging middleware
app.use((req, res, next) => {
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
    
    if (req.url === '/health') {
      healthChecks++;
    }
  });
  next();
});

// Start server
app.listen(PORT, () => {
  logger.info('Webhook server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});