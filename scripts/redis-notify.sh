#!/bin/bash

# ================================
# Redis Sentinel Notification Script
# ================================
# This script is called by Redis Sentinel when master state changes
# It handles notifications and logging for Redis failover events

set -euo pipefail

# Configuration
LOG_FILE="/var/log/redis/sentinel-notifications.log"
EMAIL_TO="${ALERT_EMAIL:-admin@yourdomain.com}"
WEBHOOK_URL="${WEBHOOK_URL:-}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# Event parameters from Sentinel
EVENT_TYPE="$1"
EVENT_SOURCE="$2"
MASTER_NAME="$3"
MASTER_IP="$4"
MASTER_PORT="$5"

# Timestamp for logging
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Logging function
log_event() {
    echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

# Send email notification
send_email() {
    local subject="$1"
    local body="$2"
    
    if command -v sendmail >/dev/null 2>&1; then
        {
            echo "To: $EMAIL_TO"
            echo "Subject: $subject"
            echo "Date: $(date -R)"
            echo ""
            echo "$body"
        } | sendmail "$EMAIL_TO"
        
        log_event "Email notification sent to $EMAIL_TO"
    else
        log_event "WARNING: sendmail not available, email notification skipped"
    fi
}

# Send Slack notification
send_slack() {
    local message="$1"
    local color="$2"
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"attachments\":[{\"color\":\"$color\",\"text\":\"$message\"}]}" \
            "$SLACK_WEBHOOK" >/dev/null 2>&1
        
        log_event "Slack notification sent"
    fi
}

# Send webhook notification
send_webhook() {
    local payload="$1"
    
    if [[ -n "$WEBHOOK_URL" ]]; then
        curl -X POST -H 'Content-Type: application/json' \
            -d "$payload" \
            "$WEBHOOK_URL" >/dev/null 2>&1
        
        log_event "Webhook notification sent"
    fi
}

# Main notification logic
case "$EVENT_TYPE" in
    "+odown")
        # Objective down - master is down according to this sentinel
        MESSAGE="Redis Master DOWN (Objective): $MASTER_NAME at $MASTER_IP:$MASTER_PORT is not reachable"
        log_event "ALERT: $MESSAGE"
        
        send_email "ALERT: Redis Master Down" "$MESSAGE"
        send_slack ":red_circle: $MESSAGE" "danger"
        send_webhook "{\"event\":\"master_down\",\"master\":\"$MASTER_NAME\",\"ip\":\"$MASTER_IP\",\"port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    "-odown")
        # Objective up - master is back up according to this sentinel
        MESSAGE="Redis Master UP (Objective): $MASTER_NAME at $MASTER_IP:$MASTER_PORT is now reachable"
        log_event "RECOVERY: $MESSAGE"
        
        send_email "RECOVERY: Redis Master Up" "$MESSAGE"
        send_slack ":green_circle: $MESSAGE" "good"
        send_webhook "{\"event\":\"master_up\",\"master\":\"$MASTER_NAME\",\"ip\":\"$MASTER_IP\",\"port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    "+sdown")
        # Subjective down - master is down according to multiple sentinels
        MESSAGE="Redis Master DOWN (Subjective): $MASTER_NAME at $MASTER_IP:$MASTER_PORT - Consensus reached, initiating failover"
        log_event "CRITICAL: $MESSAGE"
        
        send_email "CRITICAL: Redis Master Failover Starting" "$MESSAGE"
        send_slack ":warning: $MESSAGE" "warning"
        send_webhook "{\"event\":\"failover_start\",\"master\":\"$MASTER_NAME\",\"ip\":\"$MASTER_IP\",\"port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    "-sdown")
        # Subjective up - master is back up according to multiple sentinels
        MESSAGE="Redis Master UP (Subjective): $MASTER_NAME at $MASTER_IP:$MASTER_PORT - Consensus reached, master is healthy"
        log_event "INFO: $MESSAGE"
        
        send_slack ":white_check_mark: $MESSAGE" "good"
        send_webhook "{\"event\":\"master_healthy\",\"master\":\"$MASTER_NAME\",\"ip\":\"$MASTER_IP\",\"port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    "+failover-triggered")
        # Failover has been triggered
        MESSAGE="Redis Failover TRIGGERED: Starting failover for $MASTER_NAME (was at $MASTER_IP:$MASTER_PORT)"
        log_event "CRITICAL: $MESSAGE"
        
        send_email "CRITICAL: Redis Failover in Progress" "$MESSAGE"
        send_slack ":rotating_light: $MESSAGE" "danger"
        send_webhook "{\"event\":\"failover_triggered\",\"master\":\"$MASTER_NAME\",\"old_ip\":\"$MASTER_IP\",\"old_port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    "+failover-state-reconf-slaves")
        # Reconfiguring slaves during failover
        MESSAGE="Redis Failover: Reconfiguring replicas for $MASTER_NAME"
        log_event "INFO: $MESSAGE"
        
        send_slack ":gear: $MESSAGE" "warning"
        ;;
        
    "+failover-end")
        # Failover completed successfully
        MESSAGE="Redis Failover COMPLETED: New master for $MASTER_NAME is now at $MASTER_IP:$MASTER_PORT"
        log_event "SUCCESS: $MESSAGE"
        
        send_email "SUCCESS: Redis Failover Completed" "$MESSAGE"
        send_slack ":white_check_mark: $MESSAGE" "good"
        send_webhook "{\"event\":\"failover_completed\",\"master\":\"$MASTER_NAME\",\"new_ip\":\"$MASTER_IP\",\"new_port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    "+switch-master")
        # Master switched (new master promoted)
        MESSAGE="Redis Master SWITCHED: $MASTER_NAME switched to new master at $MASTER_IP:$MASTER_PORT"
        log_event "IMPORTANT: $MESSAGE"
        
        send_email "IMPORTANT: Redis Master Switched" "$MESSAGE"
        send_slack ":repeat: $MESSAGE" "warning"
        send_webhook "{\"event\":\"master_switched\",\"master\":\"$MASTER_NAME\",\"new_ip\":\"$MASTER_IP\",\"new_port\":\"$MASTER_PORT\",\"timestamp\":\"$TIMESTAMP\"}"
        ;;
        
    *)
        # Unknown event type
        MESSAGE="Redis Sentinel Unknown Event: $EVENT_TYPE for $MASTER_NAME at $MASTER_IP:$MASTER_PORT"
        log_event "WARNING: $MESSAGE"
        ;;
esac

# Always log the raw event for debugging
log_event "RAW_EVENT: Type=$EVENT_TYPE Source=$EVENT_SOURCE Master=$MASTER_NAME IP=$MASTER_IP Port=$MASTER_PORT"

exit 0