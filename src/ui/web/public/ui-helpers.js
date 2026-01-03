/**
 * ============================================================================
 * Port-MCP Enforcer — UI Helpers
 * Location: src/ui/web/public/ui-helpers.js
 *
 * UI Modularization — Step UI-A
 *
 * Responsibility:
 * - Stateless helper utilities for UI rendering and formatting
 * - NO application state
 * - NO DOM ownership
 * - NO side effects
 *
 * These functions are intentionally global so existing UI code
 * can be migrated incrementally without rewrites.
 * ============================================================================
 */

"use strict";

/**
 * Escape HTML for safe rendering.
 *
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/**
 * Format a job/SSE event into a single log line.
 *
 * @param {Object} evt
 * @returns {string}
 */
function formatEventLine(evt) {
    const parts = [];
    parts.push(`[${evt.type || "event"}]`);

    if (evt.container) parts.push(`container=${evt.container}`);
    if (evt.actionType) parts.push(`action=${evt.actionType}`);
    if (evt.error) parts.push(`error=${evt.error}`);

    return parts.join(" ");
}

// Expose helpers explicitly (intentional global surface)
window.UIHelpers = {
    escapeHtml,
    formatEventLine
};
