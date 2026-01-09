/**
 * ============================================================================
 * Port-MCP Enforcer — Render Orchestrator Module (CLEANED UP)
 * Location: src/ui/web/public/modules/render/render-orchestrator.js
 *
 * CHANGES:
 * - Removed Execution Gates panel (modal handles this now)
 * - Added exclusion filtering for Overview tab
 * - Cleaned up control panel
 * ============================================================================
 */

"use strict";

window.RenderOrchestrator = (function() {
    /* ====================================================================
       Constants
    ==================================================================== */
    
    const CONF_OVERRIDE_THRESHOLD = 0.9;
    
    /* ====================================================================
       Public API
    ==================================================================== */
    
    function render() {
        const out = document.getElementById("output");
        const scanData = window.ScanOrchestrator?.getLastScanData();
        const planData = window.ScanOrchestrator?.getLastPlanData();
        
        if (!out || !scanData || !planData) {
            if (out) out.textContent = "No data.";
            return;
        }
        
        const containers = buildContainers(scanData, planData);
        const portsByContainer = buildPortsByContainer(scanData);
        const actionsByContainer = buildActionsByContainer(planData);
        
        // Filter standardized AND excluded containers from overview
        const containersForOverview = filterForOverview(containers, portsByContainer);
        
        // Render tab bar
        const tabBar = window.TabsUI?.renderTabBar() || '';
        
        // Render content based on active tab
        let content = '';
        const currentTab = window.TabsUI?.currentTab || 'overview';
        
        if (currentTab === 'overview') {
            content = renderOverviewTab(
                containersForOverview,
                portsByContainer,
                actionsByContainer,
                planData.plan || {}
            );
        } else if (currentTab === 'standardized') {
            content = renderStandardizedTab(containers, portsByContainer);
        } else if (currentTab === 'history') {
            content = renderHistoryTab(containers);
        }
        
        out.innerHTML = tabBar + content;
        
        // OPTIMIZATION: Start port accessibility checks in background (don't await)
        checkPortAccessibilityAsync(containers, portsByContainer);
    }
    
    /* ====================================================================
       Port Accessibility Checking (TRULY async, non-blocking)
    ==================================================================== */
    
    function checkPortAccessibilityAsync(containers, portsByContainer) {
        if (!window.PortRenderer?.checkAccessibility) return;
        
        containers.forEach((container) => {
            const ports = portsByContainer[container.name] || [];
            if (ports.length === 0) return;
            
            window.PortRenderer.checkAccessibility(container.name, ports)
                .then(() => {
                    updateContainerPorts(container.name);
                })
                .catch((err) => {
                    console.debug(`[Accessibility] Check failed for ${container.name}:`, err.message);
                });
        });
    }
    
    function updateContainerPorts(containerName) {
        const rows = document.querySelectorAll(`tr[data-container="${containerName}"]`);
        
        for (const row of rows) {
            const portCell = row.querySelector('.container-ports');
            if (!portCell) continue;
            
            const scanData = window.ScanOrchestrator?.getLastScanData();
            if (!scanData) continue;
            
            const container = scanData.containers.find(c => c.name === containerName);
            if (!container) continue;
            
            const ports = (scanData.ports || []).filter(p => p.container === containerName);
            portCell.innerHTML = window.renderPorts(ports, { ...container, _raw: container });
        }
    }
    
    /* ====================================================================
       Data Builders
    ==================================================================== */
    
    function buildContainers(scanData, planData) {
        return scanData.containers.map(c => ({
            name: c.name || c.container || c.id || "(unknown)",
            category: planData.classification?.[c.name]?.category || "unknown",
            confidence: planData.classification?.[c.name]?.confidence ?? null,
            _raw: c
        }));
    }
    
    function buildPortsByContainer(scanData) {
        const map = {};
        for (const p of scanData.ports || []) {
            if (!p?.container) continue;
            (map[p.container] ||= []).push(p);
        }
        return map;
    }
    
    function buildActionsByContainer(planData) {
        const map = {};
        const actions = Array.isArray(planData.plan?.actions) ? planData.plan.actions : [];
        for (const a of actions) {
            if (!a?.container) continue;
            (map[a.container] ||= []).push(a);
        }
        return map;
    }
    
    function filterForOverview(containers, portsByContainer) {
        // Get excluded containers
        const excludedArray = window.ExclusionManager?.getExcluded() || [];
        const excluded = new Set(excludedArray);
        
        // Get standardized containers
        let standardizedNames = new Set();
        if (window.StandardizedTabUI) {
            const standardized = window.StandardizedTabUI.getStandardizedContainers(
                containers,
                portsByContainer,
                window.CategoryOverridesUI?.categoryOverrides || {}
            );
            standardizedNames = new Set(standardized.map(c => c.name));
        }
        
        // Filter out standardized AND excluded from Overview
        // Both are "done" - standardized by port changes, excluded by user decision
        return containers.filter(c => 
            !standardizedNames.has(c.name) && !excluded.has(c.name)
        );
    }
    
    /* ====================================================================
       Tab Renderers
    ==================================================================== */
    
    function renderOverviewTab(containers, portsByContainer, actionsByContainer, planObj) {
        const leftHtml = window.RenderTableUI?.renderContainersTable({
            containers,
            portsByContainer,
            actionsByContainer,
            categoryOverrides: window.CategoryOverridesUI?.categoryOverrides || {},
            isExecuting: window.ExecutionOrchestrator?.isExecuting() || false,
            CONF_OVERRIDE_THRESHOLD,
            plan: planObj,
            renderPorts: window.renderPorts,
            openConfidenceOverride: window.CategoryOverridesUI?.openCategoryOverride
        }) || '';
        
        // Simplified right panel - no more Execution Gates
        const rightHtml = renderInfoPanel();
        
        return window.Layout?.render({ left: leftHtml, right: rightHtml }) || '';
    }
    
    function renderStandardizedTab(containers, portsByContainer) {
        if (!window.StandardizedTabUI) {
            return '<div class="panel">Standardized tab not loaded</div>';
        }
        
        return window.StandardizedTabUI.renderStandardizedTab(
            containers,
            portsByContainer,
            window.CategoryOverridesUI?.categoryOverrides || {},
            window.renderPorts
        );
    }
    
    function renderHistoryTab(containers) {
        if (!window.TabsUI) return '';
        
        return window.TabsUI.renderHistoryView(
            new Map(),
            containers
        );
    }
    
    /* ====================================================================
       Info Panel (replaces Execution Gates)
    ==================================================================== */
    
    function renderInfoPanel() {
        const excludedCount = window.ExclusionManager?.count() || 0;
        
        return `
<div class="panel" style="border-left: 3px solid #58a6ff;">
    <h3 style="font-size: 14px; margin-bottom: 12px;">📋 Overview</h3>
    <div style="font-size: 12px; line-height: 1.8; color: var(--text-secondary);">
        <p style="margin-bottom: 12px;">
            This tab shows containers that need attention - either they're not yet standardized 
            or require manual review.
        </p>
        <p>
            <strong style="color: var(--text-primary);">To change ports:</strong> 
            Click the 🔍 icon next to any port to open the Port Impact Modal.
        </p>
    </div>
</div>

<div class="panel" style="border-left: 3px solid #2ecc71;">
    <h3 style="font-size: 14px; margin-bottom: 10px;">ℹ️ Auto-Standardization</h3>
    <div style="font-size: 12px; line-height: 1.6; opacity: 0.9;">
        <div style="margin-bottom: 8px;">
            <strong style="color: #2ecc71;">Containers automatically moved to Standardized:</strong>
        </div>
        
        <div style="margin: 6px 0; padding-left: 12px; border-left: 2px solid rgba(46, 204, 113, 0.3);">
            <div style="margin: 4px 0;">
                • <strong style="color: #f39c12;">SYSTEM</strong> category containers
                <div style="opacity: 0.7; font-size: 11px; margin-left: 12px;">
                    Infrastructure with known/fixed configs
                </div>
            </div>
            
            <div style="margin: 4px 0;">
                • <strong>RUNNING</strong> containers with <strong>no exposed ports</strong>
                <div style="opacity: 0.7; font-size: 11px; margin-left: 12px;">
                    Internal-only services (databases, workers, etc)
                </div>
            </div>
        </div>
        
        <div style="margin-top: 8px; padding: 6px; background: rgba(46, 204, 113, 0.1); border-radius: 4px; font-size: 11px; opacity: 0.8;">
            💡 Check the <strong>Standardized</strong> tab to see all compliant containers
        </div>
    </div>
</div>

${excludedCount > 0 ? `
<div class="panel" style="border-left: 3px solid #ff9966;">
    <h3 style="font-size: 14px; margin-bottom: 10px;">🚫 Excluded Containers</h3>
    <div style="font-size: 12px; line-height: 1.6;">
        <p><strong>${excludedCount}</strong> container(s) excluded from automation.</p>
        <p style="opacity: 0.7; margin-top: 6px;">
            View and manage exclusions in the <strong>Standardized</strong> tab.
        </p>
    </div>
</div>
` : ''}
`;
    }
    
    /* ====================================================================
       Module API
    ==================================================================== */
    
    return {
        render
    };
})();

/* ============================================================================
   Global Shortcuts
============================================================================ */

window.render = () => window.RenderOrchestrator.render();
