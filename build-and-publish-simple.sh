#!/bin/bash
# Port-MCP Enforcer - Docker Build Script (Simplified)
# Assumes all files are already in place

set -e  # Exit on error

echo "🐳 Port-MCP Enforcer - Docker Build & Publish"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPO_DIR="/mnt/user/appdata/port-mcp-enforcer"
DOCKER_USER="msw3msw"
IMAGE_NAME="port-mcp-enforcer"
VERSION="1.0.0"

echo "📁 Repository: $REPO_DIR"
echo "🏷️  Image: $DOCKER_USER/$IMAGE_NAME:$VERSION"
echo ""

# Step 1: Navigate to repo
echo "Step 1: Navigating to repository..."
cd "$REPO_DIR" || exit 1
echo -e "${GREEN}✓${NC} In repository directory"
echo ""

# Step 2: Verify critical files
echo "Step 2: Verifying critical files..."

CRITICAL_FILES=(
    "src/ui/web/server.js"
    "src/ui/web/no-op-confirm.js"
    "src/ui/web/public/index.html"
    "src/ui/web/public/app.js"
    "src/ui/web/public/standardized-tab-ui.js"
    "src/ui/web/public/tabs-ui.js"
    "Dockerfile"
    "docker-compose.yml"
)

MISSING=0
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${RED}✗${NC} $file ${RED}MISSING${NC}"
        MISSING=1
    fi
done

if [ $MISSING -eq 1 ]; then
    echo ""
    echo -e "${RED}ERROR: Critical files missing!${NC}"
    echo ""
    echo "Please make sure all files are uploaded to the correct locations."
    exit 1
fi

echo -e "${GREEN}✓${NC} All critical files present"
echo ""

# Step 3: Create/update package.json
echo "Step 3: Creating package.json..."

cat > package.json << 'EOF'
{
  "name": "port-mcp-enforcer",
  "version": "1.0.0",
  "description": "Docker port management UI for Port-MCP",
  "type": "commonjs",
  "main": "src/ui/web/server.js",
  "scripts": {
    "start": "node src/ui/web/server.js"
  },
  "dependencies": {},
  "repository": {
    "type": "git",
    "url": "https://github.com/msw3msw/port-mcp-enforcer.git"
  },
  "author": "msw3msw",
  "license": "MIT"
}
EOF

echo -e "${GREEN}✓${NC} package.json created"
echo ""

# Step 4: Build Docker image
echo "Step 4: Building Docker image..."
echo ""

docker build \
  -t "$DOCKER_USER/$IMAGE_NAME:latest" \
  -t "$DOCKER_USER/$IMAGE_NAME:v$VERSION" \
  .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓${NC} Docker build successful"
else
    echo ""
    echo -e "${RED}✗${NC} Docker build failed"
    exit 1
fi
echo ""

# Step 5: Test the image
echo "Step 5: Testing Docker image..."

echo "  → Starting test container..."
docker run -d \
  --name port-mcp-enforcer-test \
  --network host \
  -e PORT_MCP_URL=http://localhost:4100 \
  "$DOCKER_USER/$IMAGE_NAME:latest"

sleep 3

echo "  → Checking if server responds..."
if curl -s http://localhost:4200 | grep -q "Port-MCP"; then
    echo -e "  ${GREEN}✓${NC} Server responding correctly"
else
    echo -e "  ${YELLOW}⚠${NC}  Server not responding (Port-MCP may not be running)"
fi

echo "  → Checking critical files in container..."
docker exec port-mcp-enforcer-test ls src/ui/web/no-op-confirm.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} no-op-confirm.js present in container"
else
    echo -e "  ${RED}✗${NC} no-op-confirm.js MISSING in container"
    docker stop port-mcp-enforcer-test
    docker rm port-mcp-enforcer-test
    exit 1
fi

docker exec port-mcp-enforcer-test ls src/ui/web/public/standardized-tab-ui.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} standardized-tab-ui.js present in container"
else
    echo -e "  ${RED}✗${NC} standardized-tab-ui.js MISSING in container"
    docker stop port-mcp-enforcer-test
    docker rm port-mcp-enforcer-test
    exit 1
fi

echo "  → Stopping test container..."
docker stop port-mcp-enforcer-test > /dev/null 2>&1
docker rm port-mcp-enforcer-test > /dev/null 2>&1

echo -e "${GREEN}✓${NC} Container test passed"
echo ""

# Step 6: Show next steps
echo "=============================================="
echo -e "${GREEN}✓ BUILD COMPLETE${NC}"
echo "=============================================="
echo ""
echo "📦 Images created:"
echo "   - $DOCKER_USER/$IMAGE_NAME:latest"
echo "   - $DOCKER_USER/$IMAGE_NAME:v$VERSION"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1️⃣  Commit to GitHub:"
echo "   git add ."
echo "   git commit -m 'feat: complete dockerization with all features'"
echo "   git push origin main"
echo ""
echo "2️⃣  Login to Docker Hub:"
echo "   docker login"
echo ""
echo "3️⃣  Push to Docker Hub:"
echo "   docker push $DOCKER_USER/$IMAGE_NAME:latest"
echo "   docker push $DOCKER_USER/$IMAGE_NAME:v$VERSION"
echo ""
echo "4️⃣  Deploy anywhere with:"
echo "   docker pull $DOCKER_USER/$IMAGE_NAME:latest"
echo "   docker-compose up -d"
echo ""
echo "=============================================="
echo ""

exit 0
