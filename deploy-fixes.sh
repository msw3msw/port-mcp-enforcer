#!/bin/bash
# Deploy Port Impact Modal Fixes - v1.0.4
# Run this from Unraid terminal

set -e

echo "==================================================================="
echo "  Port-MCP Enforcer - Deploy Fixes v1.0.4"
echo "==================================================================="
echo ""
echo "This will fix:"
echo "  ✓ 58846:undefined → 58846:58846"
echo "  ✓ 58846 not protected → 58846 PROTECTED"
echo "  ✓ All ports get 5001 → 5000, 5001, 5002, 5003..."
echo ""
read -p "Press ENTER to continue or CTRL+C to cancel..."

# Step 1: Copy files from outputs to project directory
echo ""
echo "[1/4] Copying files to project directory..."

cp /mnt/user-data/outputs/port-impact-modal-COMPLETE.js \
   /mnt/user/appdata/port-mcp-enforcer-dev/src/ui/web/public/modules/port-impact/port-impact-modal-COMPLETE.js

cp /mnt/user-data/outputs/server.js \
   /mnt/user/appdata/port-mcp-enforcer-dev/src/ui/web/server.js

cp /mnt/user-data/outputs/render-orchestrator.js \
   /mnt/user/appdata/port-mcp-enforcer-dev/src/ui/web/public/modules/render/render-orchestrator.js

echo "✓ Files copied to project"

# Step 2: Copy into running container
echo ""
echo "[2/4] Copying files into running container..."

docker cp /mnt/user/appdata/port-mcp-enforcer-dev/src/ui/web/public/modules/port-impact/port-impact-modal-COMPLETE.js \
  port-mcp-enforcer:/app/src/ui/web/public/modules/port-impact/port-impact-modal-COMPLETE.js

docker cp /mnt/user/appdata/port-mcp-enforcer-dev/src/ui/web/server.js \
  port-mcp-enforcer:/app/src/ui/web/server.js

docker cp /mnt/user/appdata/port-mcp-enforcer-dev/src/ui/web/public/modules/render/render-orchestrator.js \
  port-mcp-enforcer:/app/src/ui/web/public/modules/render/render-orchestrator.js

echo "✓ Files copied to container"

# Step 3: Verify files in container
echo ""
echo "[3/4] Verifying deployment..."

# Check if 58846 is in PROTECTED_PORTS
if docker exec port-mcp-enforcer grep -q "58846.*VPN data port" /app/src/ui/web/public/modules/port-impact/port-impact-modal-COMPLETE.js; then
    echo "✓ Modal file verified - 58846 protected"
else
    echo "❌ Modal file verification failed"
    exit 1
fi

# Check if server.js has alreadySuggested
if docker exec port-mcp-enforcer grep -q "alreadySuggested" /app/src/ui/web/server.js; then
    echo "✓ Server file verified - incremental suggestions enabled"
else
    echo "❌ Server file verification failed"
    exit 1
fi

echo "✓ All files verified"

# Step 4: Restart container
echo ""
echo "[4/4] Restarting container..."
docker restart port-mcp-enforcer

echo ""
echo "==================================================================="
echo "  ✓ Deployment Complete!"
echo "==================================================================="
echo ""
echo "Wait 10 seconds for container to restart, then:"
echo ""
echo "1. Refresh your browser (CTRL+SHIFT+R)"
echo "2. Click on binhex-delugevpn port 🔍 icon"
echo "3. Verify:"
echo "   ✓ Shows 58846:58846 (not undefined)"
echo "   ✓ Both 58846 and 58946 have orange border + 🔒"
echo "   ✓ Other ports get 5000, 5001, 5002 (not all 5001)"
echo ""
echo "If issues persist, check logs:"
echo "  docker logs port-mcp-enforcer --tail 50"
echo ""
