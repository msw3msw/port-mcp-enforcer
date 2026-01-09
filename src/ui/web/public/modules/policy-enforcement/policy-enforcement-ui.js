/**
 * ============================================================================
 * Port-MCP Enforcer — Policy Enforcement UI Module
 * Location: src/ui/web/public/modules/policy-enforcement/policy-enforcement-ui.js
 *
 * Responsibility:
 * - Manage policy enforcement intent (opt-in checkboxes)
 * - Track which containers user wants to enforce policies on
 * - Trigger re-planning when intent changes
 *
 * HARD RULES:
 * - UI state only (no execution)
 * - Intent-based (does not execute)
 * - Isolated state (IIFE pattern)
 * ============================================================================
 */

"use strict";

window.PolicyEnforcementUI = (function() {
    /* ====================================================================
       Private State (isolated)
    ==================================================================== */
    
    let enforcementIntent = {};
    
    /* ====================================================================
       Public API
    ==================================================================== */
    
    /**
     * Get current enforcement intent map
     * @returns {Object} Container name -> boolean
     */
    function getIntent() {
        return enforcementIntent;
    }
    
    /**
     * Check if a specific container is marked for enforcement
     * @param {string} containerName
     * @returns {boolean}
     */
    function isEnforced(containerName) {
        return enforcementIntent[containerName] === true;
    }
    
    /**
     * Set enforcement intent for a container
     * @param {string} containerName
     * @param {boolean} enabled
     */
    function set(containerName, enabled) {
        if (!containerName) return;
        
        if (enabled) {
            enforcementIntent[containerName] = true;
        } else {
            delete enforcementIntent[containerName];
        }
        
        // Trigger re-plan to update UI
        triggerReplan();
    }
    
    /**
     * Clear all enforcement intent
     */
    function clearAll() {
        enforcementIntent = {};
        triggerReplan();
    }
    
    /**
     * Get count of containers marked for enforcement
     * @returns {number}
     */
    function count() {
        return Object.keys(enforcementIntent).length;
    }
    
    /**
     * Get list of container names marked for enforcement
     * @returns {string[]}
     */
    function getSelectedContainers() {
        return Object.keys(enforcementIntent).filter(
            name => enforcementIntent[name] === true
        );
    }
    
    /* ====================================================================
       Internal Helpers
    ==================================================================== */
    
    /**
     * Trigger re-planning after intent change
     * This allows the planner to update actions based on new intent
     */
    function triggerReplan() {
        // Check if ScanOrchestrator is available
        if (typeof window.ScanOrchestrator?.plan === 'function') {
            window.ScanOrchestrator.plan().catch(err => {
                console.error('[PolicyEnforcementUI] Re-plan failed:', err);
            });
        } else if (typeof window.plan === 'function') {
            // Fallback to global plan function if ScanOrchestrator not yet loaded
            window.plan().catch(err => {
                console.error('[PolicyEnforcementUI] Re-plan failed:', err);
            });
        }
    }
    
    /* ====================================================================
       Module API
    ==================================================================== */
    
    return {
        getIntent,
        isEnforced,
        set,
        clearAll,
        count,
        getSelectedContainers
    };
})();

/* ============================================================================
   Global Shortcuts (for onclick handlers in HTML)
============================================================================ */

window.setPolicyEnforcementIntent = (name, enabled) =>
    window.PolicyEnforcementUI.set(name, enabled);

window.clearPolicyEnforcementIntent = () =>
    window.PolicyEnforcementUI.clearAll();
