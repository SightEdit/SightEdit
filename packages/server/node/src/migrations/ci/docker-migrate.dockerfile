# Multi-stage Docker image for running SightEdit migrations
# Supports all database types: PostgreSQL, MySQL, SQLite, MongoDB

ARG NODE_VERSION=18-alpine

# Base stage with Node.js and common dependencies
FROM node:${NODE_VERSION} AS base

# Install system dependencies
RUN apk add --no-cache \
    bash \
    curl \
    git \
    python3 \
    make \
    g++ \
    sqlite \
    postgresql-client \
    mysql-client \
    mongodb-tools

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/server/node/package*.json ./packages/server/node/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage with full toolchain
FROM base AS development

RUN npm ci && npm cache clean --force

# Copy source code
COPY packages/server/node/src ./packages/server/node/src
COPY packages/server/node/tsconfig.json ./packages/server/node/
COPY tsconfig.base.json ./

# Build the project
RUN cd packages/server/node && npm run build

# Production stage
FROM base AS production

# Copy built application
COPY --from=development /app/packages/server/node/dist ./packages/server/node/dist
COPY --from=development /app/packages/server/node/src/migrations ./packages/server/node/src/migrations

# Create non-root user
RUN addgroup -g 1001 -S sightedit && \
    adduser -S sightedit -u 1001 -G sightedit

# Create directories with proper permissions
RUN mkdir -p /app/backups /app/logs /app/temp && \
    chown -R sightedit:sightedit /app

USER sightedit

# Health check script
COPY packages/server/node/src/migrations/ci/healthcheck.sh /usr/local/bin/healthcheck.sh
USER root
RUN chmod +x /usr/local/bin/healthcheck.sh
USER sightedit

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /usr/local/bin/healthcheck.sh

# Default environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV MIGRATION_TIMEOUT=600000
ENV BACKUP_ENABLED=true
ENV BACKUP_RETENTION_DAYS=30

# Entry point script
COPY packages/server/node/src/migrations/ci/entrypoint.sh /usr/local/bin/entrypoint.sh
USER root
RUN chmod +x /usr/local/bin/entrypoint.sh
USER sightedit

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

# Default command
CMD ["status"]

# Labels for metadata
LABEL maintainer="SightEdit Team <team@sightedit.com>"
LABEL version="1.0.0"
LABEL description="SightEdit Database Migration Container"
LABEL org.opencontainers.image.title="SightEdit Migration"
LABEL org.opencontainers.image.description="Container for running SightEdit database migrations"
LABEL org.opencontainers.image.url="https://github.com/sightedit/sightedit"
LABEL org.opencontainers.image.documentation="https://docs.sightedit.com/migrations"
LABEL org.opencontainers.image.source="https://github.com/sightedit/sightedit"
LABEL org.opencontainers.image.vendor="SightEdit"
LABEL org.opencontainers.image.licenses="MIT"

# Multi-architecture support
FROM production AS migration-runner

# Install additional database clients for multi-database support
USER root

# PostgreSQL client
RUN apk add --no-cache postgresql15-client

# MySQL client
RUN apk add --no-cache mysql-client

# MongoDB tools
RUN apk add --no-cache mongodb-tools

# Redis CLI (for caching scenarios)
RUN apk add --no-cache redis

USER sightedit

# Testing stage for CI/CD
FROM development AS testing

USER root

# Install testing dependencies
RUN apk add --no-cache \
    docker-cli \
    docker-compose

# Install additional npm packages for testing
RUN cd packages/server/node && \
    npm install --save-dev \
    @types/node \
    ts-node \
    typescript

USER sightedit

# Copy test configurations
COPY packages/server/node/src/migrations/testing ./packages/server/node/src/migrations/testing
COPY packages/server/node/src/migrations/ci/test-*.json ./packages/server/node/src/migrations/ci/

# Test runner command
CMD ["npm", "test"]