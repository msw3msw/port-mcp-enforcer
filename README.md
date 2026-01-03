# Port-MCP Enforcer

**Web UI for Docker Port Management and Standardization**

Port-MCP Enforcer is a user-friendly web interface that connects to Port-MCP to visualize, manage, and standardize Docker container port assignments.

## Features

### 📊 **Overview Tab**
- Real-time container classification (Apps, Games, System)
- AI-powered categorization with confidence scores
- Manual category overrides
- Policy-based port assignment recommendations
- Execution gates with confirmation requirements

### ✅ **Standardized Tab**
- View compliant containers at a glance
- Progress tracking (X of Y standardized)
- Port range standards reference
- Green visual indicators for compliance
- Grouped by category (Apps/Games/System)

### 📜 **History & Rollback Tab**
- Complete execution history
- Snapshot-based rollback system
- Before/after state comparison
- Per-container rollback capability
- Persistent across restarts

## Port Standards

- **System:** 1-1023 (privileged ports)
- **Apps:** 1024-19999 (application services)
- **Games:** 7000-9999 OR 20000-39999 (game servers - dual ranges)
- **Reserved:** 40000-45000 (future use)

## Quick Start

### Prerequisites

Port-MCP must be running:
```bash
docker run -d \
  --name port-mcp \
  -p 4100:4100 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  msw3msw/port-mcp:latest
```

### Deploy Port-MCP Enforcer
```bash
docker pull msw3msw/port-mcp-enforcer:latest

docker run -d \
  --name port-mcp-enforcer \
  -p 4200:4200 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ./snapshots:/app/snapshots \
  -e PORT_MCP_URL=http://host.docker.internal:4100 \
  -e HOST_IP=192.168.0.100 \
  msw3msw/port-mcp-enforcer:latest
```

### Access the UI

Open your browser to: `http://192.168.0.100:4200`

## Full Stack Deployment

Deploy both Port-MCP and Port-MCP Enforcer together:
```yaml
version: '3.8'

services:
  port-mcp:
    image: msw3msw/port-mcp:latest
    container_name: port-mcp
    ports:
      - "4100:4100"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./port-mcp-data:/data
    restart: unless-stopped
    networks:
      - port-mcp-net

  port-mcp-enforcer:
    image: msw3msw/port-mcp-enforcer:latest
    container_name: port-mcp-enforcer
    ports:
      - "4200:4200"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./enforcer-snapshots:/app/snapshots
      - ./enforcer-data:/app/src/ui/web/data
    environment:
      - PORT_MCP_URL=http://port-mcp:4100
      - HOST_IP=192.168.0.100
    depends_on:
      - port-mcp
    restart: unless-stopped
    networks:
      - port-mcp-net

networks:
  port-mcp-net:
    driver: bridge
```

Save as `docker-compose.yml` and run:
```bash
docker-compose up -d
```

## Environment Variables

- `PORT_MCP_URL` - Port-MCP API URL (default: http://localhost:4100)
- `HOST_IP` - Your server IP for clickable port links (e.g., 192.168.0.100)

## Volumes

- `/var/run/docker.sock` - Docker socket (required for container management)
- `/app/snapshots` - Execution snapshots for rollback functionality
- `/app/src/ui/web/data` - Category overrides and user preferences

## Safety Features

### Execution Gates
- ✅ Dry-run mode testing
- ✅ Explicit Docker mutation consent
- ✅ Confirmation phrase requirement: "I UNDERSTAND THIS WILL CAUSE DOWNTIME"
- ✅ Manual review for low-confidence classifications
- ✅ Policy enforcement opt-in per container

### Rollback System
- 📸 Automatic snapshots before execution
- 🔄 Port-only rollback (safe and fast)
- 📊 Diff comparison before rollback
- ⏱️ Persistent history across container restarts

## Classification

Containers are automatically classified using:
- Image name patterns (e.g., `binhex-`, `linuxserver/`)
- Port protocols (UDP = likely game server)
- Port ranges (20000+ = likely game)
- Keyword matching (radarr, sonarr, minecraft, etc.)

### Categories

- **Apps** - Media servers, databases, web services
- **Games** - Game servers (Minecraft, Valheim, 7 Days to Die, etc.)
- **System** - Infrastructure (Traefik, Nginx, monitoring)
- **Unknown** - Requires manual classification

## Manual Overrides

Click any confidence score to manually override the category. Overrides are:
- ✅ Saved persistently
- ✅ Set confidence to 1.0
- ✅ Take precedence over AI classification

## Screenshots

### Overview Tab
See all containers with categories, confidence scores, and policy status.

### Standardized Tab
Track compliance progress with visual indicators and port range reference.

### History & Rollback
Review past changes and rollback if needed with before/after comparison.

## Related Projects

- [Port-MCP](https://hub.docker.com/r/msw3msw/port-mcp) - Backend API (required)

## Requirements

- Docker
- Port-MCP running on port 4100
- Network access to Docker socket

## Support

For issues, feature requests, or questions, please visit the GitHub repository.

## License

MIT
