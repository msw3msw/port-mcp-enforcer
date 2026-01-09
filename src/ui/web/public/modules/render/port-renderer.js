/**
 * ============================================================================
 * Port-MCP Enforcer — Port Renderer Module (ENHANCED v2)
 * Location: src/ui/web/public/modules/render/port-renderer.js
 *
 * Responsibility:
 * - Render port listings with smart color coding
 * - Check TCP ports for ACTUAL WEB UIs (HTML content)
 * - Distinguish web UIs from APIs/game servers/backends
 * - Show running state warnings
 * - Add port impact analysis icons
 * 
 * Color Scheme:
 * - Bright Teal = TCP port serving HTML (actual web UI)
 * - Gray = API endpoint, game server, backend service, or UDP
 * ============================================================================
 */

"use strict";

window.PortRenderer = (function() {
    /* ====================================================================
       Constants
    ==================================================================== */
    
    const HOST_IP = "192.168.0.100";
    
    // Global cache for accessibility results
    const accessibilityCache = {};
    
    /* ====================================================================
       Accessibility Checking
    ==================================================================== */
    
    async function checkContainerPorts(containerName, ports) {
        const portsToCheck = ports
            .filter(p => p.protocol === 'tcp')
            .map(p => ({ host: p.host, protocol: p.protocol }));
        
        if (portsToCheck.length === 0) return {};
        
        try {
            const res = await fetch('/api/check-ports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: HOST_IP,
                    ports: portsToCheck
                })
            });
            
            if (!res.ok) {
                console.warn('[PortRenderer] Accessibility check failed:', res.status);
                return {};
            }
            
            const data = await res.json();
            return data.results || {};
        } catch (err) {
            console.warn('[PortRenderer] Accessibility check error:', err);
            return {};
        }
    }
    
    /* ====================================================================
       Public API
    ==================================================================== */
    
    function render(ports, container) {
        const isRunning = container?._raw?.running || container?._raw?.state === 'running';
        
        if (!isRunning) {
            return `<span style="color: #f1c40f; font-size: 12px; font-style: italic;">⚠️ Container must be running to verify</span>`;
        }
        
        if (!ports || !ports.length) {
            return `<span style="opacity: 0.5; font-size: 12px; font-style: italic;">No exposed ports</span>`;
        }
        
        const containerName = container?.name || 'unknown';
        const accessibility = accessibilityCache[containerName] || {};
        
        return ports.map(p => renderPort(p, accessibility)).join("<br>");
    }
    
    /**
     * Check accessibility for a container's ports (async)
     * Call this after rendering to update colors dynamically
     */
    async function checkAccessibility(containerName, ports) {
        const results = await checkContainerPorts(containerName, ports);
        accessibilityCache[containerName] = results;
        return results;
    }
    
    /* ====================================================================
       Internal Helpers
    ==================================================================== */
    
    function renderPort(p, accessibility) {
        const host = p.host || '?';
        const containerPort = p.containerPort || p.container || '?';
        const proto = p.protocol || 'tcp';
        
        // Determine accessibility
        const key = `${host}-${proto}`;
        const isAccessible = accessibility[key] === true;
        const isTcp = proto === 'tcp';
        
        // Color scheme:
        // - TCP + HTML response = bright teal (actual web UI)
        // - TCP + non-HTML OR UDP = gray (API/game/backend)
        let portColor, protoColor, isClickable;
        
        if (isTcp && isAccessible) {
            portColor = '#39d0d8';  // Bright teal - serves HTML web UI
            protoColor = '#39d0d8';
            isClickable = true;
        } else {
            portColor = '#8b949e';  // Gray - API/game/backend/UDP
            protoColor = '#6e7681';
            isClickable = false;
        }
        
        const label = formatPortLabel(host, containerPort, proto, portColor, protoColor);
        const title = `External: ${host} → Container: ${containerPort} (${proto.toUpperCase()})${isAccessible ? ' - HTML Web UI' : ''}`;
        
        const portLink = isClickable
            ? `<a href="http://${HOST_IP}:${host}" target="_blank" title="${title}" style="color:${portColor};text-decoration:none;">${label}</a>`
            : `<span title="${title}">${label}</span>`;
        
        const impactIcon = renderImpactIcon(p.container, host, proto);
        
        return portLink + ' ' + impactIcon;
    }
    
    function formatPortLabel(host, containerPort, proto, portColor, protoColor) {
        return `<span style="color:${portColor};font-weight:600;">${host}</span>:<span style="color:#8b949e;">${containerPort}</span>/<span style="color:${protoColor};font-size:11px;">${proto}</span>`;
    }
    
    function renderImpactIcon(container, host, proto) {
        return `<span class="port-impact-icon" onclick="window.PortImpactModalComplete.show('${container}', ${host}, '${proto}')" title="Manage port & analyze impact">🔍</span>`;
    }
    
    /* ====================================================================
       Module API
    ==================================================================== */
    
    return {
        render,
        checkAccessibility
    };
})();

/* ============================================================================
   Global Shortcuts
============================================================================ */

window.renderPorts = (ports, container) => window.PortRenderer.render(ports, container);
