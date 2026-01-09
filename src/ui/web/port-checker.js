/**
 * ============================================================================
 * Port-MCP Enforcer — Port Accessibility Checker (IMPROVED)
 * Location: src/ui/web/port-checker.js
 *
 * Responsibility:
 * - Test if TCP ports have WEB UIs (not just TCP connections)
 * - Distinguish HTML responses from API/game server responses
 * - Cache results for 5 minutes
 * - Parallel checking for performance
 * 
 * Detection Strategy:
 * 1. Try HTTP GET request
 * 2. Check response headers AND body for HTML indicators
 * 3. Handle auth redirects (302 to /login) as web UIs
 * 4. Handle apps that return HTML even with non-200 status
 * ============================================================================
 */

"use strict";

const http = require('http');

// Cache: { "host:port" => { hasWebUI: boolean, checkedAt: timestamp } }
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a port has an actual web UI (HTML response)
 * Not just a TCP connection or API endpoint
 */
function checkPortAccessibility(host, port, timeout = 3000) {
    // Known API-only services (no web UI)
    const API_ONLY_PORTS = [
        4100  // Port-MCP backend API
    ];
    
    if (API_ONLY_PORTS.includes(port)) {
        console.log(`[Port ${port}] Known API-only service - skipping check`);
        return Promise.resolve(false);
    }
    
    return new Promise((resolve) => {
        const req = http.request({
            host: host,
            port: port,
            method: 'GET',
            path: '/',
            timeout: timeout,
            headers: {
                'User-Agent': 'Port-MCP-Enforcer/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, (res) => {
            let data = '';
            
            res.on('data', chunk => {
                data += chunk.toString();
                // Stop after 4KB - enough to detect HTML
                if (data.length > 4096) {
                    res.destroy();
                }
            });
            
            res.on('end', () => {
                checkResponse(res, data, resolve, port);
            });
            
            res.on('error', () => {
                checkResponse(res, data, resolve, port);
            });
        });

        req.on('error', (err) => {
            console.log(`[Port ${port}] Connection error:`, err.code);
            resolve(false);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Check if response indicates a web UI (not an API)
 * IMPROVED: Better detection for apps with auth
 */
function checkResponse(res, data, resolve, port) {
    const contentType = (res.headers['content-type'] || '').toLowerCase();
    const statusCode = res.statusCode;
    const location = res.headers['location'] || '';
    
    // === REJECT CLEAR API RESPONSES ===
    
    // JSON API
    if (contentType.includes('application/json')) {
        console.log(`[Port ${port}] ✗ JSON API detected`);
        resolve(false);
        return;
    }
    
    // Plain text API (but not if it contains HTML)
    if (contentType.includes('text/plain') && !/<html/i.test(data)) {
        console.log(`[Port ${port}] ✗ Plain text API detected`);
        resolve(false);
        return;
    }
    
    // XML API (not XHTML)
    if (contentType.includes('application/xml') && !contentType.includes('xhtml')) {
        console.log(`[Port ${port}] ✗ XML API detected`);
        resolve(false);
        return;
    }
    
    // === ACCEPT WEB UI INDICATORS ===
    
    // Check for HTML content type
    const isHTMLContentType = 
        contentType.includes('text/html') ||
        contentType.includes('application/xhtml');
    
    // Check for HTML tags in body
    const hasHTMLTags = 
        /<html/i.test(data) || 
        /<head/i.test(data) || 
        /<body/i.test(data) ||
        /<!DOCTYPE html/i.test(data) ||
        /<title/i.test(data) ||
        /<div/i.test(data) ||
        /<script/i.test(data);
    
    // Check for auth redirect (common in Radarr, Sonarr, etc.)
    // These redirect to /login, /auth, /signin etc.
    const isAuthRedirect = 
        (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307) &&
        (location.includes('/login') || 
         location.includes('/auth') || 
         location.includes('/signin') ||
         location.includes('/initialize') ||
         location.length > 0);  // Any redirect from root is likely a web app
    
    // Check for web-related status codes
    const isWebStatus = 
        (statusCode >= 200 && statusCode < 400) ||  // Success or redirect
        statusCode === 401 ||                        // Auth required (but still a web UI)
        statusCode === 403;                          // Forbidden (but still HTML likely)
    
    // === FINAL DECISION ===
    
    // Is Web UI if ANY of these:
    // 1. HTML content type + success/redirect/auth status
    // 2. Has HTML tags in response body
    // 3. Auth redirect (302 to /login etc.)
    // 4. Empty content-type + redirect (common for web apps)
    
    const isWebUI = 
        (isHTMLContentType && isWebStatus) || 
        hasHTMLTags ||
        isAuthRedirect ||
        (!contentType && (statusCode === 301 || statusCode === 302)) ||
        (!contentType && statusCode === 401);
    
    if (isWebUI) {
        console.log(`[Port ${port}] ✓ Web UI detected:`, {
            contentType: contentType.substring(0, 50) || '(none)',
            status: statusCode,
            hasHTML: hasHTMLTags,
            isRedirect: isAuthRedirect,
            location: location.substring(0, 50) || '(none)'
        });
    } else {
        console.log(`[Port ${port}] ✗ Not a web UI:`, {
            contentType: contentType.substring(0, 50) || '(none)',
            status: statusCode,
            hasHTML: hasHTMLTags,
            dataPreview: data.substring(0, 100)
        });
    }
    
    resolve(isWebUI);
}

/**
 * Check port with caching
 */
async function checkPort(host, port) {
    const key = `${host}:${port}`;
    const now = Date.now();

    // Check cache
    const cached = cache.get(key);
    if (cached && (now - cached.checkedAt) < CACHE_DURATION) {
        return cached.hasWebUI;
    }

    // Perform check
    const hasWebUI = await checkPortAccessibility(host, port);

    // Update cache
    cache.set(key, {
        hasWebUI,
        checkedAt: now
    });

    return hasWebUI;
}

/**
 * Check multiple ports in parallel
 */
async function checkPorts(host, ports) {
    const results = {};

    const promises = ports.map(async (port) => {
        const hasWebUI = await checkPort(host, port.host);
        results[`${port.host}-${port.protocol}`] = hasWebUI;
    });

    await Promise.all(promises);
    return results;
}

/**
 * Clear cache (useful for testing or manual refresh)
 */
function clearCache() {
    cache.clear();
}

module.exports = {
    checkPort,
    checkPorts,
    clearCache
};
