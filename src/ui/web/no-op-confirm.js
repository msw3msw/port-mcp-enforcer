/**
 * ============================================================================
 * No-Op Confirm Module (Web UI Replacement)
 * Location: src/ui/web/no-op-confirm.js
 *
 * This module replaces the executor's confirm.js when called from the web UI.
 * The web UI already has its own gates (checkboxes + confirmation phrase),
 * so we don't need terminal prompts.
 * ============================================================================
 */

"use strict";

/**
 * Always approve - web UI already confirmed
 */
async function confirmApply(plan) {
    // Web UI already validated via gates
    return true;
}

/**
 * Always approve - web UI already confirmed  
 */
async function confirmDockerDowntime() {
    // Web UI already validated via:
    // 1. "Apply planned changes" checkbox
    // 2. Confirmation phrase typed
    return true;
}

module.exports = {
    confirmApply,
    confirmDockerDowntime
};
