/**
 * ============================================================================
 * Port-MCP Enforcer — Scan Orchestrator Module
 * Location: src/ui/web/public/modules/scan/scan-orchestrator.js
 *
 * Responsibility:
 * - Orchestrate scan → plan → render workflow
 * - Handle Docker/Port-MCP connection errors
 * - Manage scan/plan state
 * ============================================================================
 */

"use strict";

window.ScanOrchestrator = (function() {
    /* ====================================================================
       Private State
    ==================================================================== */
    
    let lastScanData = null;
    let lastPlanData = null;
    
    /* ====================================================================
       Public API
    ==================================================================== */
    
    async function scan() {
        await window.CategoryOverridesUI?.loadPersistedOverrides();
        
        const out = document.getElementById("output");
        if (out) out.textContent = "Scanning Docker...";
        
        try {
            const res = await fetch("/api/scan");
            
            if (!res.ok) {
                if (out) {
                    out.innerHTML = renderDockerError(res.status);
                }
                return;
            }
            
            lastScanData = await res.json();
            await fetchRecentJobs();
            await plan();
            
        } catch (err) {
            if (out) {
                out.innerHTML = renderNetworkError(err);
            }
            console.error('Scan error:', err);
        }
    }
    
    async function plan() {
        const res = await fetch("/api/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                categoryOverrides: window.CategoryOverridesUI?.categoryOverrides || {},
                policyEnforcement: window.PolicyEnforcementUI?.getIntent() || {}
            })
        });
        
        lastPlanData = await res.json();
        
        if (typeof window.render === 'function') {
            window.render();
        }
    }
    
    function getLastScanData() {
        return lastScanData;
    }
    
    function getLastPlanData() {
        return lastPlanData;
    }
    
    /* ====================================================================
       Internal Helpers
    ==================================================================== */
    
    async function fetchRecentJobs() {
        try {
            // Future: GET /api/jobs endpoint
        } catch (err) {
            console.log('Could not fetch job history:', err);
        }
    }
    
    function renderDockerError(status) {
        return `
<div class="panel" style="text-align: center; padding: 4rem 2rem;">
    <div style="font-size: 64px; margin-bottom: 1rem;">🐳</div>
    <h2 style="color: #e74c3c;">Docker Not Running</h2>
    <p style="opacity: 0.8; margin: 1rem 0;">
        Cannot connect to Docker via Port-MCP (HTTP ${status})
    </p>
    <p style="opacity: 0.7; font-size: 14px;">
        Please start Docker and the Port-MCP backend, then refresh this page.
    </p>
    <button onclick="location.reload()" class="primary" style="margin-top: 1.5rem;">
        🔄 Retry Connection
    </button>
</div>
`;
    }
    
    function renderNetworkError(err) {
        return `
<div class="panel" style="text-align: center; padding: 4rem 2rem;">
    <div style="font-size: 64px; margin-bottom: 1rem;">⚠️</div>
    <h2 style="color: #e74c3c;">Cannot Connect to Port-MCP</h2>
    <p style="opacity: 0.8; margin: 1rem 0;">
        ${err.message}
    </p>
    <p style="opacity: 0.7; font-size: 14px;">
        Make sure Port-MCP is running and accessible at:<br>
        <code style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; margin-top: 8px; display: inline-block;">
            ${window.location.protocol}//${window.location.hostname}:4100
        </code>
    </p>
    <button onclick="location.reload()" class="primary" style="margin-top: 1.5rem;">
        🔄 Retry Connection
    </button>
</div>
`;
    }
    
    /* ====================================================================
       Module API
    ==================================================================== */
    
    return {
        scan,
        plan,
        getLastScanData,
        getLastPlanData
    };
})();

/* ============================================================================
   Global Shortcuts
============================================================================ */

window.scan = () => window.ScanOrchestrator.scan();
window.plan = () => window.ScanOrchestrator.plan();
