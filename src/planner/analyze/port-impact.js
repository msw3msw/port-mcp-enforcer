/**
 * ============================================================================
 * Port-MCP Enforcer – Port Change Impact Analyzer (SMART v3 - FIXED)
 * Location: src/planner/analyze/port-impact.js
 *
 * Responsibility:
 * - Analyze which containers might be affected by port changes
 * - SCAN for hardcoded port references in env vars, labels, and configs
 * - Detect network dependencies
 * - Check port availability
 * - SUGGEST next available port in correct range
 * 
 * v3 FIXES:
 * - Track already-suggested ports (no duplicates)
 * - Skip VPN/protected ports (58946)
 * - Start apps range at 5000 (not 1024)
 * ============================================================================
 */

"use strict";

// Port ranges (must match policy)
const PORT_RANGES = {
    system: [[1, 1023]],
    apps: [[1024, 19999]],
    games: [
        [7000, 9999],    // Low range for hardcoded game ports
        [20000, 39999]   // High range for flexible games
    ],
    reserved: [[40000, 45000]]
};

/**
 * Find next available port with SMART range detection for games
 * 
 * For GAMES category:
 * - If current port is in LOW range (7000-9999) → Suggest from LOW range
 * - If current port is in HIGH range (20000-39999) → Suggest from HIGH range
 * - If current port is outside both → Default to HIGH range
 * 
 * For APPS category:
 * - Start at 5000 (not 1024)
 * 
 * For other categories: Use standard logic
 * 
 * @param {string} category - Container category
 * @param {number} currentPort - Port being changed
 * @param {Array} usedPorts - All currently used ports
 * @param {Set|Array} alreadySuggested - Ports already suggested in this session
 */
function findNextAvailablePort(category, currentPort, usedPorts, alreadySuggested = new Set()) {
    const ranges = PORT_RANGES[category] || PORT_RANGES.apps;
    
    // Convert alreadySuggested to Set if it's an array
    const suggestedSet = Array.isArray(alreadySuggested) 
        ? new Set(alreadySuggested) 
        : alreadySuggested;
    
    // Combine used ports and already-suggested ports
    const usedSet = new Set([
        ...usedPorts.map(p => p.host),
        ...Array.from(suggestedSet)
    ]);
    
    // SMART GAMES LOGIC: Detect which range the current port is in
    if (category === 'games' && Array.isArray(ranges) && ranges.length === 2) {
        const [lowRange, highRange] = ranges;
        const [lowMin, lowMax] = lowRange;
        const [highMin, highMax] = highRange;
        
        // Determine which range to search based on current port
        let targetRange;
        let rangeLabel;
        
        if (currentPort >= lowMin && currentPort <= lowMax) {
            // Current port is in LOW range → suggest from LOW range
            targetRange = lowRange;
            rangeLabel = 'low';
        } else if (currentPort >= highMin && currentPort <= highMax) {
            // Current port is in HIGH range → suggest from HIGH range
            targetRange = highRange;
            rangeLabel = 'high';
        } else {
            // Current port outside both ranges → default to HIGH range
            targetRange = highRange;
            rangeLabel = 'high';
        }
        
        // Search in the target range
        const [min, max] = targetRange;
        const start = currentPort >= min && currentPort <= max 
            ? currentPort + 1 
            : min;
        
        for (let port = start; port <= max; port++) {
            if (!usedSet.has(port)) {
                return {
                    port,
                    range: `${min}-${max}`,
                    reason: `Next available in ${category} ${rangeLabel} range`
                };
            }
        }
        
        // If no ports available in target range, try the other range
        const otherRange = targetRange === lowRange ? highRange : lowRange;
        const otherLabel = rangeLabel === 'low' ? 'high' : 'low';
        const [otherMin, otherMax] = otherRange;
        
        for (let port = otherMin; port <= otherMax; port++) {
            if (!usedSet.has(port)) {
                return {
                    port,
                    range: `${otherMin}-${otherMax}`,
                    reason: `Next available in ${category} ${otherLabel} range (${rangeLabel} range full)`
                };
            }
        }
        
        return null; // Both ranges full
    }
    
    // APPS LOGIC: Start at 5000, not 1024
    if (category === 'apps') {
        const [min, max] = ranges[0]; // [1024, 19999]
        const startPort = Math.max(5000, min); // Start at 5000
        
        for (let port = startPort; port <= max; port++) {
            if (!usedSet.has(port)) {
                return {
                    port,
                    range: `${min}-${max}`,
                    reason: `Next available in ${category} range (starting at 5000)`
                };
            }
        }
        
        return null;
    }
    
    // STANDARD LOGIC for other categories
    for (const [min, max] of ranges) {
        // Start from current port + 1 if in range, otherwise start of range
        let start = currentPort >= min && currentPort < max 
            ? currentPort + 1 
            : min;
        
        for (let port = start; port <= max; port++) {
            if (!usedSet.has(port)) {
                return {
                    port,
                    range: `${min}-${max}`,
                    reason: `Next available in ${category} range`
                };
            }
        }
    }
    
    return null;
}

/**
 * SMART SCANNING: Find hardcoded port references in container config
 * 
 * Scans:
 * - Environment variables
 * - Labels (Traefik, Caddy, etc)
 * - Command/entrypoint args
 */
function findPortReferences(containerName, port, container) {
    const references = [];
    const portStr = String(port);
    
    // 1. Scan environment variables
    if (container.env && Array.isArray(container.env)) {
        for (const envLine of container.env) {
            // Match patterns like:
            // RADARR_URL=http://radarr:7878
            // API_PORT=8080
            // SERVICE_URL=http://service:9999/api
            if (envLine.includes(`:${portStr}`) || 
                envLine.includes(`=${portStr}`) ||
                envLine.includes(` ${portStr}`)) {
                
                references.push({
                    container: container.name,
                    type: 'environment',
                    location: 'ENV',
                    detail: envLine.length > 80 ? envLine.substring(0, 77) + '...' : envLine,
                    confidence: 'high',
                    risk: 'breaking'
                });
            }
        }
    }
    
    // 2. Scan labels (common in reverse proxies)
    if (container.labels && typeof container.labels === 'object') {
        for (const [key, value] of Object.entries(container.labels)) {
            const valueStr = String(value);
            
            // Match Traefik/Caddy patterns:
            // traefik.http.services.app.loadbalancer.server.port=8080
            // caddy.reverse_proxy={{upstreams 8080}}
            if (valueStr.includes(`:${portStr}`) || 
                valueStr.includes(`=${portStr}`) ||
                valueStr.includes(` ${portStr}`) ||
                valueStr.includes(`{${portStr}}`)) {
                
                references.push({
                    container: container.name,
                    type: 'label',
                    location: key,
                    detail: valueStr.length > 80 ? valueStr.substring(0, 77) + '...' : valueStr,
                    confidence: 'high',
                    risk: 'breaking'
                });
            }
        }
    }
    
    // 3. Scan command/entrypoint (less common but possible)
    if (container.command && Array.isArray(container.command)) {
        const cmdStr = container.command.join(' ');
        if (cmdStr.includes(portStr)) {
            references.push({
                container: container.name,
                type: 'command',
                location: 'CMD',
                detail: cmdStr.length > 80 ? cmdStr.substring(0, 77) + '...' : cmdStr,
                confidence: 'medium',
                risk: 'potential'
            });
        }
    }
    
    return references;
}

/**
 * Analyze impact of changing a container's port
 * 
 * @param {Object} params
 * @param {string} params.containerName - Container to change
 * @param {number} params.currentPort - Current port number
 * @param {number} params.newPort - Desired new port (optional for suggestions)
 * @param {Object} params.state - Current Docker state
 * @param {Array} params.alreadySuggested - Ports already suggested (optional)
 * @returns {Object} Impact analysis
 */
function analyzePortChangeImpact({ containerName, currentPort, newPort, state, alreadySuggested }) {
    const affectedContainers = [];
    const warnings = [];
    const checks = {
        portAvailable: false,
        containerExists: false,
        hasPort: false
    };

    // Find the target container
    const targetContainer = state.containers.find(c => c.name === containerName);
    
    if (!targetContainer) {
        return {
            success: false,
            error: `Container "${containerName}" not found`,
            checks
        };
    }
    checks.containerExists = true;

    // Check if container actually uses this port
    const currentPortBinding = targetContainer.ports.find(p => 
        p.host === Number(currentPort)
    );
    
    if (!currentPortBinding) {
        warnings.push(`Container does not currently use port ${currentPort}`);
    } else {
        checks.hasPort = true;
    }

    // Get container category for smart suggestions
    const category = detectCategory(targetContainer);
    
    // Suggest next available port if newPort not provided
    let suggestedPort = null;
    if (!newPort) {
        suggestedPort = findNextAvailablePort(
            category, 
            Number(currentPort), 
            state.ports,
            alreadySuggested || []
        );
    }

    // Check if new port is available (if provided)
    let portInUse = null;
    if (newPort) {
        portInUse = state.ports.find(p => p.host === Number(newPort));
        
        if (portInUse) {
            warnings.push(`Port ${newPort} is already in use by ${portInUse.containerName || portInUse.container}`);
        } else {
            checks.portAvailable = true;
        }
    }

    // SMART SCAN: Check ALL containers for hardcoded references to this port
    const hardcodedReferences = [];
    const networkDependencies = [];
    const targetNetworks = targetContainer.networks.map(n => n.name);
    
    for (const container of state.containers) {
        if (container.name === containerName) continue; // Skip self
        
        // Scan for hardcoded port references
        const refs = findPortReferences(containerName, currentPort, container);
        if (refs.length > 0) {
            hardcodedReferences.push({
                name: container.name,
                category: detectCategory(container),
                references: refs,
                confidence: 'high',
                reason: refs.map(r => `${r.type}: ${r.detail}`).join(' | ')
            });
        }
        
        // Also check for network-based dependencies (lower confidence)
        const sharedNetworks = container.networks
            .map(n => n.name)
            .filter(n => targetNetworks.includes(n));
        
        if (sharedNetworks.length > 0) {
            networkDependencies.push({
                name: container.name,
                category: detectCategory(container),
                confidence: 'low',
                reason: `Shared network: ${sharedNetworks.join(', ')}`,
                networks: sharedNetworks
            });
        }
    }

    // Combine results: hardcoded refs first (high priority), then network deps
    affectedContainers.push(
        ...hardcodedReferences.map(c => ({ ...c, priority: 'high' })),
        ...networkDependencies
            .filter(nd => !hardcodedReferences.find(hr => hr.name === nd.name))
            .map(c => ({ ...c, priority: 'low' }))
    );

    return {
        success: true,
        containerName,
        category,
        currentPort: Number(currentPort),
        newPort: newPort ? Number(newPort) : null,
        suggestedPort,
        checks,
        warnings,
        affectedContainers: affectedContainers.sort((a, b) => {
            // Sort by priority (high first), then by name
            if (a.priority !== b.priority) {
                return a.priority === 'high' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        }),
        summary: {
            totalAffected: affectedContainers.length,
            highConfidence: hardcodedReferences.length,
            lowConfidence: networkDependencies.length - hardcodedReferences.length,
            portAvailable: newPort ? checks.portAvailable : null,
            requiresManualUpdate: affectedContainers.length > 0
        }
    };
}

/**
 * Simple category detection (matches classifier logic)
 */
function detectCategory(container) {
    const name = container.name.toLowerCase();
    const image = (container.image || '').toLowerCase();
    
    // Games
    if (name.includes('minecraft') || name.includes('7dtd') ||
        name.includes('conan') || name.includes('icarus') ||
        name.includes('satisfactory') || name.includes('valheim') ||
        image.includes('itzg/') || image.includes('vinanrra/') ||
        image.includes('wolveix/')) {
        return 'games';
    }
    
    // Media/Apps
    if (name.includes('radarr') || name.includes('sonarr') ||
        name.includes('bazarr') || name.includes('prowlarr') ||
        name.includes('overseerr') || name.includes('plex') ||
        name.includes('deluge') || image.includes('binhex')) {
        return 'apps';
    }
    
    // System
    if (name.includes('nginx') || name.includes('traefik') ||
        name.includes('proxy') || name.includes('port-mcp')) {
        return 'system';
    }
    
    return 'apps'; // Default
}

module.exports = {
    analyzePortChangeImpact
};
