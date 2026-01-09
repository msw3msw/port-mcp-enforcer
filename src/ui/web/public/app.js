/**
 * ============================================================================
 * Port-MCP Enforcer â€” Web UI Controller
 * Location: src/ui/web/public/app.js
 *
 * Responsibility:
 * - Orchestrate Scan â†’ Plan â†’ Apply
 * - Wire UI helpers
 *
 * HARD RULES:
 * - UI only
 * - No planner logic
 * - No silent refactors
 * ============================================================================
 */

"use strict";

const HOST_IP = "192.168.0.100";
const CONFIRM_PHRASE = "I UNDERSTAND THIS WILL CAUSE DOWNTIME";
const CONF_OVERRIDE_THRESHOLD = 0.9;

let lastScanData = null;
let lastPlanData = null;
let lastExecutionJobs = new Map(); // Track completed jobs for history tab

let isExecuting = false;
let activeJobId = null;
let lastExecutionJob = null;
let liveEvents = [];

/* ============================================================================
   NOTE: PolicyEnforcementUI now loaded from modules/policy-enforcement/
============================================================================ */

/* ============================================================================
   Port Impact Modal (ENHANCED with Smart Suggestions)
============================================================================ */

window.PortImpactUI = {
    currentSuggestion: null,

    async show(containerName, portHost, portProto) {
        const modal = document.createElement('div');
        modal.id = 'port-impact-modal';
        modal.innerHTML = `
<div class="modal-overlay" onclick="window.PortImpactUI.close()">
    <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
            <h3>ðŸ” Port Change Impact - ${containerName}</h3>
            <button class="modal-close" onclick="window.PortImpactUI.close()">Ã—</button>
        </div>
        <div class="modal-body">
            <div class="port-input-group">
                <label>Current Port: <strong>${portHost}</strong> (${portProto.toUpperCase()})</label>
                
                <div id="suggestion-area" style="margin: 12px 0;">
                    <div class="loading">Analyzing available ports...</div>
                </div>
                
                <label>
                    New Port: 
                    <input type="number" id="new-port-input" min="1" max="65535" placeholder="Enter new port" />
                </label>
                <button onclick="window.PortImpactUI.analyze('${containerName}', ${portHost}, '${portProto}')">
                    Analyze Impact
                </button>
            </div>
            <div id="impact-results"></div>
        </div>
    </div>
</div>
`;
        document.body.appendChild(modal);
        
        // Get suggestion immediately
        await this.getSuggestion(containerName, portHost);
    },

    async getSuggestion(containerName, currentPort) {
        try {
            const res = await fetch('/api/port-impact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ containerName, currentPort, newPort: null })
            });

            const data = await res.json();
            
            if (data.success && data.suggestedPort) {
                this.currentSuggestion = data.suggestedPort;
                this.renderSuggestion(data);
            } else {
                document.getElementById('suggestion-area').innerHTML = 
                    '<div class="warning">âš ï¸ No available ports in recommended range</div>';
            }
        } catch (err) {
            document.getElementById('suggestion-area').innerHTML = 
                '<div class="error">Could not get port suggestion</div>';
        }
    },

    renderSuggestion(data) {
        const suggestionHtml = `
            <div class="port-suggestion">
                <div class="suggestion-header">
                    <span class="suggestion-icon">ðŸ’¡</span>
                    <strong>Recommended Port</strong>
                </div>
                <div class="suggestion-content">
                    <div class="suggested-port">${data.suggestedPort.port}</div>
                    <div class="suggestion-details">
                        ${data.category.toUpperCase()} range: ${data.suggestedPort.range}
                    </div>
                    <div class="suggestion-reason">${data.suggestedPort.reason}</div>
                </div>
                <button class="btn-use-suggested" onclick="window.PortImpactUI.useSuggested()">
                    Use Recommended Port
                </button>
            </div>
        `;
        
        document.getElementById('suggestion-area').innerHTML = suggestionHtml;
    },

    useSuggested() {
        if (this.currentSuggestion) {
            document.getElementById('new-port-input').value = this.currentSuggestion.port;
            document.getElementById('new-port-input').focus();
        }
    },

    async analyze(containerName, currentPort, protocol) {
        const newPortInput = document.getElementById('new-port-input');
        const newPort = parseInt(newPortInput.value);
        
        if (!newPort || newPort < 1 || newPort > 65535) {
            alert('Please enter a valid port number (1-65535)');
            return;
        }

        const resultsDiv = document.getElementById('impact-results');
        resultsDiv.innerHTML = '<div class="loading">Analyzing...</div>';

        try {
            const res = await fetch('/api/port-impact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ containerName, currentPort, newPort })
            });

            const impact = await res.json();
            
            if (!impact.success) {
                resultsDiv.innerHTML = `<div class="error">${impact.error}</div>`;
                return;
            }

            resultsDiv.innerHTML = this.renderImpact(impact);
        } catch (err) {
            resultsDiv.innerHTML = `<div class="error">Analysis failed: ${err.message}</div>`;
        }
    },

    renderImpact(impact) {
        let html = '<div class="impact-report">';
        
        // Checks
        html += '<div class="impact-section">';
        html += '<h4>Status Checks</h4>';
        html += `<div class="check ${impact.checks.portAvailable ? 'success' : 'error'}">
            ${impact.checks.portAvailable ? 'âœ…' : 'âŒ'} Port ${impact.newPort} ${impact.checks.portAvailable ? 'is available' : 'is in use'}
        </div>`;
        html += `<div class="check ${impact.checks.hasPort ? 'success' : 'warning'}">
            ${impact.checks.hasPort ? 'âœ…' : 'âš ï¸'} Container ${impact.checks.hasPort ? 'uses' : 'does not use'} port ${impact.currentPort}
        </div>`;
        html += '</div>';

        // Warnings
        if (impact.warnings && impact.warnings.length > 0) {
            html += '<div class="impact-section warnings">';
            html += '<h4>âš ï¸ Warnings</h4>';
            impact.warnings.forEach(w => {
                html += `<div class="warning">${w}</div>`;
            });
            html += '</div>';
        }

        // HIGH CONFIDENCE - Hardcoded port references (CRITICAL)
        const highConfidenceContainers = impact.affectedContainers ? 
            impact.affectedContainers.filter(c => c.priority === 'high') : [];
        
        if (highConfidenceContainers.length > 0) {
            html += '<div class="impact-section critical">';
            html += `<h4>ðŸ”´ ${highConfidenceContainers.length} Container(s) With HARDCODED Port References</h4>`;
            html += `<div class="critical-note">âš ï¸ These containers have explicit references to port ${impact.currentPort} in their configuration and WILL BREAK if changed!</div>`;
            
            // Group by category
            const byCategory = {};
            highConfidenceContainers.forEach(c => {
                const cat = c.category || 'unknown';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(c);
            });
            
            for (const [category, containers] of Object.entries(byCategory)) {
                html += `<div class="category-group critical">`;
                html += `<div class="category-label critical">${category.toUpperCase()} (${containers.length})</div>`;
                containers.forEach(c => {
                    html += `<div class="affected-container critical">
                        <strong>ðŸ”´ ${c.name}</strong>
                        <div class="reference-details">
                            ${c.references ? c.references.map(ref => `
                                <div class="reference-item">
                                    <span class="ref-type">${ref.type.toUpperCase()}</span>
                                    <code class="ref-detail">${this.escapeHtml(ref.detail)}</code>
                                </div>
                            `).join('') : `<div>${c.reason}</div>`}
                        </div>
                    </div>`;
                });
                html += `</div>`;
            }
            
            html += '<div class="manual-note critical">ðŸ”´ CRITICAL: You MUST manually update these containers before changing the port!</div>';
            html += '</div>';
        }

        // LOW CONFIDENCE - Network-based dependencies (INFORMATIONAL)
        const lowConfidenceContainers = impact.affectedContainers ? 
            impact.affectedContainers.filter(c => c.priority === 'low') : [];
        
        if (lowConfidenceContainers.length > 0) {
            html += '<div class="impact-section affected">';
            html += `<h4>ðŸ“¦ ${lowConfidenceContainers.length} Container(s) on Shared Network</h4>`;
            html += `<div class="info-note">â„¹ï¸ These containers share a network but no hardcoded references were detected.</div>`;
            
            // Group by category
            const byCategory = {};
            lowConfidenceContainers.forEach(c => {
                const cat = c.category || 'unknown';
                if (!byCategory[cat]) byCategory[cat] = [];
                byCategory[cat].push(c);
            });
            
            for (const [category, containers] of Object.entries(byCategory)) {
                html += `<div class="category-group">`;
                html += `<div class="category-label">${category.toUpperCase()} (${containers.length})</div>`;
                containers.forEach(c => {
                    html += `<div class="affected-container">
                        â€¢ <strong>${c.name}</strong> - ${c.reason}
                    </div>`;
                });
                html += `</div>`;
            }
            
            html += '<div class="manual-note">ðŸ’¡ Review these containers - they may have configuration that references this port.</div>';
            html += '</div>';
        }

        // No affected containers at all
        if (!impact.affectedContainers || impact.affectedContainers.length === 0) {
            html += '<div class="impact-section success">';
            html += '<div class="check success">âœ… No containers appear to be affected</div>';
            html += '</div>';
        }

        // Summary
        html += '<div class="impact-summary">';
        html += `<strong>Summary:</strong> `;
        
        if (highConfidenceContainers.length > 0) {
            html += `ðŸ”´ CRITICAL: ${highConfidenceContainers.length} container(s) have hardcoded references that will break!`;
        } else if (lowConfidenceContainers.length > 0) {
            html += `âš ï¸ ${lowConfidenceContainers.length} container(s) on shared network - review recommended`;
        } else if (impact.checks.portAvailable) {
            html += 'âœ… Port change looks safe!';
        } else if (!impact.checks.portAvailable) {
            html += 'âŒ Port is not available';
        }
        
        if (impact.summary && impact.summary.highConfidence > 0) {
            html += `<div style="margin-top: 8px; color: #ff6b6b; font-weight: 600;">
                You must update ${impact.summary.highConfidence} container(s) before proceeding!
            </div>`;
        }
        
        html += '</div>';

        html += '</div>';
        return html;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    close() {
        const modal = document.getElementById('port-impact-modal');
        if (modal) modal.remove();
    }
};

/* ============================================================================
   Scan â†’ Plan â†’ Render (ENHANCED with Docker error detection)
============================================================================ */

/* ============================================================================
   NOTE: scan/plan now loaded from modules/scan/scan-orchestrator.js
============================================================================ */


/* ============================================================================
   Render
============================================================================ */

/* ============================================================================
   NOTE: render now loaded from modules/render/render-orchestrator.js
============================================================================ */


/* ============================================================================
   NOTE: renderPorts now loaded from modules/render/port-renderer.js
============================================================================ */


/* ============================================================================
   NOTE: applySelected/execution now loaded from modules/execution/execution-orchestrator.js
============================================================================ */

/* ============================================================================
   Auto-start
============================================================================ */

window.addEventListener("load", scan);