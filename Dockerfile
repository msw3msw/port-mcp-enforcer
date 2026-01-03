# Port-MCP Enforcer - Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Copy application files
COPY . .

# Create snapshots directory
RUN mkdir -p /app/snapshots

# Expose web UI port
EXPOSE 4200

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:4200/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the web UI server
CMD ["node", "src/ui/web/server.js"]
