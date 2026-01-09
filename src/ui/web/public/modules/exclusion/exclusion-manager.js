/**
 * ============================================================================
 * Port-MCP Enforcer — Exclusion Manager
 * Location: src/ui/web/public/modules/exclusion/exclusion-manager.js
 *
 * Responsibility:
 * - Track which containers are excluded from standardization
 * - Persist exclusions to backend
 * - Trigger re-render on changes
 *
 * HARD RULES:
 * - UI state only
 * - No execution logic
 * - Isolated state (IIFE pattern)
 * ============================================================================
 */

"use strict";

window.ExclusionManager = (function() {
    /* ====================================================================
       Private State
    ==================================================================== */
    
    let exclusions = new Set();
    
    /* ====================================================================
       Public API
    ==================================================================== */
    
    /**
     * Check if a container is excluded
     */
    function isExcluded(containerName) {
        return exclusions.has(containerName);
    }
    
    /**
     * Toggle exclusion for a container
     */
    function toggle(containerName) {
        if (exclusions.has(containerName)) {
            exclusions.delete(containerName);
        } else {
            exclusions.add(containerName);
        }
        
        // Persist to backend
        persistExclusions();
        
        // Trigger re-render
        triggerRerender();
    }
    
    /**
     * Set exclusion state for a container
     */
    function setExcluded(containerName, excluded) {
        if (excluded) {
            exclusions.add(containerName);
        } else {
            exclusions.delete(containerName);
        }
        
        persistExclusions();
        triggerRerender();
    }
    
    /**
     * Get all excluded containers
     */
    function getExcluded() {
        return Array.from(exclusions);
    }
    
    /**
     * Get count of excluded containers
     */
    function count() {
        return exclusions.size;
    }
    
    /**
     * Load exclusions from backend
     */
    async function loadExclusions() {
        try {
            const res = await fetch('/api/exclusions');
            if (res.ok) {
                const data = await res.json();
                exclusions = new Set(data.exclusions || []);
            }
        } catch (err) {
            console.warn('[ExclusionManager] Failed to load exclusions:', err);
        }
    }
    
    /**
     * Clear all exclusions
     */
    function clearAll() {
        exclusions.clear();
        persistExclusions();
        triggerRerender();
    }
    
    /* ====================================================================
       Internal Helpers
    ==================================================================== */
    
    /**
     * Persist exclusions to backend
     */
    async function persistExclusions() {
        try {
            await fetch('/api/exclusions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exclusions: Array.from(exclusions)
                })
            });
        } catch (err) {
            console.warn('[ExclusionManager] Failed to persist exclusions:', err);
        }
    }
    
    /**
     * Trigger re-render after exclusion change
     */
    function triggerRerender() {
        if (typeof window.render === 'function') {
            window.render();
        }
    }
    
    /* ====================================================================
       Module API
    ==================================================================== */
    
    return {
        isExcluded,
        toggle,
        setExcluded,
        getExcluded,
        count,
        loadExclusions,
        clearAll
    };
})();

/* ============================================================================
   Auto-load exclusions on page load
============================================================================ */

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.ExclusionManager.loadExclusions();
    });
} else {
    window.ExclusionManager.loadExclusions();
}
