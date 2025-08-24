# Multi-stage Dockerfile for SightEdit production builds
# Optimized for size, security, and performance

# ================================
# Build Stage
# ================================
FROM node:18-alpine AS builder

# Set build arguments
ARG VERSION=latest
ARG NODE_ENV=production

# Install build dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json lerna.json ./
COPY packages/core/package*.json ./packages/core/
COPY packages/react/package*.json ./packages/react/
COPY packages/vue/package*.json ./packages/vue/
COPY packages/plugin-markdown/package*.json ./packages/plugin-markdown/
COPY packages/plugin-image-crop/package*.json ./packages/plugin-image-crop/
COPY packages/server/node/package*.json ./packages/server/node/
COPY website/package*.json ./website/

# Install dependencies with npm ci for reproducible builds
RUN npm ci --production=false --legacy-peer-deps

# Copy source code
COPY . .

# Bootstrap packages and build
RUN npm run bootstrap && \
    npm run build && \
    npm run test && \
    npm prune --production

# Clean up build artifacts
RUN rm -rf \
    packages/*/src \
    packages/*/__tests__ \
    packages/*/test \
    packages/*/tests \
    .git \
    *.md \
    .github \
    .vscode \
    .eslintrc* \
    .prettierrc* \
    commitlint.config.js

# ================================
# Runtime Stage - CDN Server
# ================================
FROM nginx:alpine AS cdn-server

# Install security updates
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*

# Copy built assets
COPY --from=builder /app/packages/core/dist /usr/share/nginx/html/core
COPY --from=builder /app/packages/react/dist /usr/share/nginx/html/react
COPY --from=builder /app/packages/vue/dist /usr/share/nginx/html/vue
COPY --from=builder /app/packages/plugin-markdown/dist /usr/share/nginx/html/plugins/markdown
COPY --from=builder /app/packages/plugin-image-crop/dist /usr/share/nginx/html/plugins/image-crop

# Copy nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf

# Create non-root user
RUN addgroup -g 1001 -S nginx && \
    adduser -S -D -H -u 1001 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

# Set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# Switch to non-root user
USER nginx

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Expose port
EXPOSE 8080

# Labels for metadata
LABEL org.opencontainers.image.title="SightEdit CDN Server" \
      org.opencontainers.image.description="Production CDN server for SightEdit assets" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.vendor="SightEdit" \
      org.opencontainers.image.source="https://github.com/sightedit/sightedit"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

# ================================
# Runtime Stage - Node.js Backend
# ================================
FROM node:18-alpine AS backend-server

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    tini \
    curl \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appuser -g appuser appuser

# Copy package files
COPY --from=builder --chown=appuser:appuser /app/packages/server/node/package*.json ./
COPY --from=builder --chown=appuser:appuser /app/packages/server/node/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/packages/server/node/node_modules ./node_modules

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Expose port
EXPOSE 3000

# Labels for metadata
LABEL org.opencontainers.image.title="SightEdit Backend Server" \
      org.opencontainers.image.description="Production backend server for SightEdit" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.vendor="SightEdit" \
      org.opencontainers.image.source="https://github.com/sightedit/sightedit"

# Use tini as PID 1
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# ================================
# Runtime Stage - Full Stack
# ================================
FROM node:18-alpine AS fullstack

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    nginx \
    tini \
    curl \
    supervisor \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appuser -g appuser appuser

# Copy built assets for CDN
COPY --from=builder --chown=appuser:appuser /app/packages/core/dist /usr/share/nginx/html/core
COPY --from=builder --chown=appuser:appuser /app/packages/react/dist /usr/share/nginx/html/react
COPY --from=builder --chown=appuser:appuser /app/packages/vue/dist /usr/share/nginx/html/vue

# Copy backend server
COPY --from=builder --chown=appuser:appuser /app/packages/server/node/package*.json ./
COPY --from=builder --chown=appuser:appuser /app/packages/server/node/dist ./dist
COPY --from=builder --chown=appuser:appuser /app/packages/server/node/node_modules ./node_modules

# Copy configurations
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisord.conf

# Set permissions
RUN chown -R appuser:appuser /app && \
    chown -R appuser:appuser /usr/share/nginx/html && \
    mkdir -p /var/log/supervisor && \
    chown -R appuser:appuser /var/log/supervisor

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    NGINX_PORT=8080 \
    LOG_LEVEL=info

# Health check for both services
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:$NGINX_PORT/health && curl -f http://localhost:$PORT/health || exit 1

# Expose ports
EXPOSE 3000 8080

# Labels for metadata
LABEL org.opencontainers.image.title="SightEdit Full Stack" \
      org.opencontainers.image.description="Full stack SightEdit application with CDN and backend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.vendor="SightEdit" \
      org.opencontainers.image.source="https://github.com/sightedit/sightedit"

# Use tini as PID 1
ENTRYPOINT ["tini", "--"]

# Start supervisor to manage both nginx and node
CMD ["supervisord", "-c", "/etc/supervisord.conf"]