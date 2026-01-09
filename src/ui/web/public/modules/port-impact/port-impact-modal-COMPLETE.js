/**
 * Port-MCP Enforcer - Enhanced Port Impact Modal
 * v1.0.7 - Fixed to include ALL ports in from/to arrays (not just changed ones)
 */

"use strict";

window.PortImpactModalComplete = {
    currentContainer: null,
    currentPorts: [],
    originalPorts: [],
    suggestions: {},
    
    async show(containerName, portHost = null, portProto = null) {
        const containerData = await this.fetchContainerData(containerName);
        
        if (!containerData) {
            alert(`Container "${containerName}" not found`);
            return;
        }
        
        this.currentContainer = containerData;
        this.currentPorts = containerData.ports || [];
        
        await this.fetchOriginalPorts(containerName);
        
        const modal = document.createElement('div');
        modal.id = 'port-impact-modal-complete';
        modal.className = 'modal-overlay';
        modal.onclick = (e) => {
            if (e.target === modal) this.close();
        };
        
        const content = document.createElement('div');
        content.className = 'modal-content-large';
        content.onclick = (e) => e.stopPropagation();
        
        content.innerHTML = this.renderModalContent(containerName, portHost, portProto);
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        await this.loadAllSuggestions();
    },
    
    async fetchOriginalPorts(containerName) {
        try {
            const res = await fetch('/api/scan');
            const data = await res.json();
            
            this.originalPorts = (data.ports || []).filter(p => p.container === containerName);
            console.log('[Modal] Original ports:', this.originalPorts);
        } catch (err) {
            console.error('Failed to fetch original ports:', err);
            this.originalPorts = [];
        }
    },
    
    async fetchContainerData(containerName) {
        try {
            const res = await fetch('/api/scan');
            const data = await res.json();
            
            const container = data.containers.find(c => c.name === containerName);
            
            if (container && container.ports) {
                const seen = new Set();
                const uniquePorts = [];
                
                for (const port of container.ports) {
                    const containerPort = port.containerPort || port.container || port.host;
                    const key = `${port.host}:${containerPort}/${port.protocol}`;
                    
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniquePorts.push({
                            host: port.host,
                            containerPort: containerPort,
                            container: containerPort,
                            protocol: port.protocol
                        });
                    }
                }
                
                container.ports = uniquePorts;
            }
            
            return container;
        } catch (err) {
            console.error('Failed to fetch container data:', err);
            return null;
        }
    },
    
    renderModalContent(containerName, focusPort, focusProto) {
        return `
<div class="modal-header">
    <h3>Port Management - ${containerName}</h3>
    <button class="modal-close" onclick="window.PortImpactModalComplete.close()">&times;</button>
</div>

<div class="modal-body-large">
    <div class="section">
        <h4>Current Ports & Recommendations</h4>
        <div id="ports-list">
            <div class="loading">Loading port suggestions...</div>
        </div>
        <button class="btn-secondary" onclick="window.PortImpactModalComplete.acceptAllRecommendations()" id="accept-all-btn" disabled>
            Accept All Recommendations
        </button>
    </div>
    
    <div class="section">
        <h4>Impact Analysis</h4>
        <div id="impact-analysis">
            <div class="info-note">
                Click "Analyze Impact" after selecting new ports to see which containers may be affected.
            </div>
        </div>
        <button class="btn-primary" onclick="window.PortImpactModalComplete.analyzeImpact()" id="analyze-btn">
            Analyze Impact
        </button>
    </div>
    
    <div class="section execution-gates" id="execution-section" style="display: none;">
        <h4>Execution Gates</h4>
        
        <div class="gates-checklist">
            <label>
                <input type="checkbox" id="gate-dryrun" onchange="window.PortImpactModalComplete.updateApplyButton()">
                Dry-run only (preview changes without applying)
            </label>
            <label>
                <input type="checkbox" id="gate-mutation" onchange="window.PortImpactModalComplete.updateApplyButton()">
                Apply port changes (will restart containers)
            </label>
        </div>
        
        <div class="confirmation-input">
            <label>Type exactly: <code>I UNDERSTAND THIS WILL CAUSE DOWNTIME</code></label>
            <input type="text" 
                   id="gate-confirm" 
                   placeholder="Type confirmation phrase here" 
                   oninput="window.PortImpactModalComplete.updateApplyButton()"
                   style="width: 100%; padding: 8px; font-size: 13px;">
        </div>
        
        <div class="impact-summary" id="execution-summary"></div>
        
        <button class="btn-danger" onclick="window.PortImpactModalComplete.applyChanges()" id="apply-btn" disabled>
            Apply Port Changes
        </button>
    </div>
    
    <div id="execution-progress" style="display: none;">
        <div class="progress-indicator">
            <div class="spinner"></div>
            <div id="progress-message">Applying changes...</div>
        </div>
    </div>
</div>
`;
    },
    
    async loadAllSuggestions() {
        const portsList = document.getElementById('ports-list');
        
        if (this.currentPorts.length === 0) {
            portsList.innerHTML = '<div class="info-note">This container has no exposed ports.</div>';
            return;
        }
        
        const PROTECTED_PORTS = new Set([58846, 58946]);
        const suggestedPorts = new Set();
        
        let html = '<div class="ports-grid">';
        
        for (const port of this.currentPorts) {
            const isProtected = PROTECTED_PORTS.has(port.host);
            let suggestion = null;
            
            if (!isProtected) {
                suggestion = await this.getSuggestion(port.host, port.protocol, suggestedPorts);
                
                if (suggestion) {
                    this.suggestions[`${port.host}-${port.protocol}`] = suggestion;
                    suggestedPorts.add(suggestion.port);
                }
            }
            
            html += this.renderPortRow(port, suggestion, isProtected);
        }
        
        html += '</div>';
        portsList.innerHTML = html;
        
        if (Object.keys(this.suggestions).length > 0) {
            document.getElementById('accept-all-btn').disabled = false;
        }
    },
    
    async getSuggestion(currentPort, protocol, alreadySuggested = new Set()) {
        try {
            const res = await fetch('/api/port-impact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    containerName: this.currentContainer.name,
                    currentPort: Number(currentPort),
                    newPort: null,
                    alreadySuggested: Array.from(alreadySuggested)
                })
            });
            
            const data = await res.json();
            return (data.success && data.suggestedPort) ? data.suggestedPort : null;
        } catch (err) {
            console.error('Failed to get suggestion:', err);
            return null;
        }
    },
    
    renderPortRow(port, suggestion, isProtected = false) {
        const key = `${port.host}-${port.protocol}`;
        const hasAutoSuggestion = suggestion !== null;
        const containerPort = port.containerPort || port.container || port.host;
        
        return `
<div class="port-row ${isProtected ? 'port-protected' : ''}">
    <div class="port-current">
        <strong>${port.protocol.toUpperCase()}</strong>
        <span class="port-number">${port.host}:${containerPort}</span>
        ${isProtected ? '<span class="protected-badge">VPN/Protected</span>' : ''}
    </div>
    
    <div class="port-arrow">-></div>
    
    <div class="port-new">
        ${isProtected ? `
            <div class="protected-warning">
                <span class="warning-text">This port should NOT be changed</span>
                <small>VPN forwarded port or critical service</small>
            </div>
        ` : hasAutoSuggestion ? `
            <div class="suggested-port">
                <span class="suggestion-badge">Recommended</span>
                <span class="port-number">${suggestion.port}</span>
                <button class="btn-mini" onclick="window.PortImpactModalComplete.useSuggestion('${key}', ${suggestion.port})">Use</button>
            </div>
        ` : ''}
        
        ${!isProtected ? `
        <div class="custom-port">
            <input type="number" id="new-port-${key}" class="port-input" min="1" max="65535" placeholder="${hasAutoSuggestion ? 'Or enter custom' : 'Enter new port'}" value="">
        </div>
        ` : ''}
    </div>
    
    <div class="port-status" id="status-${key}">
        ${isProtected ? `<span class="status-protected">Keep current port</span>` : hasAutoSuggestion ? `<span class="status-info">${suggestion.reason}</span>` : `<span class="status-warn">No auto-suggestion available</span>`}
    </div>
</div>
`;
    },
    
    useSuggestion(key, port) {
        document.getElementById(`new-port-${key}`).value = port;
    },
    
    acceptAllRecommendations() {
        for (const [key, suggestion] of Object.entries(this.suggestions)) {
            document.getElementById(`new-port-${key}`).value = suggestion.port;
        }
        alert('All recommendations applied! Click "Analyze Impact" to continue.');
    },
    
    async analyzeImpact() {
        const analyzeBtn = document.getElementById('analyze-btn');
        const impactDiv = document.getElementById('impact-analysis');
        
        analyzeBtn.disabled = true;
        impactDiv.innerHTML = '<div class="loading">Analyzing impact...</div>';
        
        const changes = [];
        const PROTECTED_PORTS = new Set([58846, 58946]);
        
        for (const port of this.currentPorts) {
            if (PROTECTED_PORTS.has(port.host)) continue;
            
            const key = `${port.host}-${port.protocol}`;
            const newPortInput = document.getElementById(`new-port-${key}`);
            if (!newPortInput) continue;
            
            const newPort = parseInt(newPortInput.value);
            if (newPort && newPort !== port.host) {
                changes.push({
                    currentPort: port.host,
                    newPort: newPort,
                    protocol: port.protocol,
                    containerPort: port.containerPort || port.container || port.host
                });
            }
        }
        
        if (changes.length === 0) {
            impactDiv.innerHTML = '<div class="warning">No port changes detected. Enter new port numbers to analyze.</div>';
            analyzeBtn.disabled = false;
            return;
        }
        
        let combinedImpact = {
            highConfidence: new Set(),
            lowConfidence: new Set(),
            allAvailable: true,
            changes: changes
        };
        
        for (const change of changes) {
            try {
                const res = await fetch('/api/port-impact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        containerName: this.currentContainer.name,
                        currentPort: change.currentPort,
                        newPort: change.newPort
                    })
                });
                
                const impact = await res.json();
                
                if (!impact.checks.portAvailable) combinedImpact.allAvailable = false;
                
                if (impact.affectedContainers) {
                    impact.affectedContainers.forEach(c => {
                        if (c.priority === 'high') {
                            combinedImpact.highConfidence.add(c.name);
                        } else {
                            combinedImpact.lowConfidence.add(c.name);
                        }
                    });
                }
            } catch (err) {
                console.error('Impact analysis failed:', err);
            }
        }
        
        impactDiv.innerHTML = this.renderCombinedImpact(combinedImpact);
        analyzeBtn.disabled = false;
        
        document.getElementById('execution-section').style.display = 'block';
        this.updateExecutionSummary(combinedImpact);
    },
    
    renderCombinedImpact(impact) {
        let html = '<div class="impact-results">';
        
        html += impact.allAvailable 
            ? '<div class="alert alert-success">All new ports are available</div>'
            : '<div class="alert alert-error">Some ports are already in use!</div>';
        
        if (impact.highConfidence.size > 0) {
            html += `
<div class="impact-critical">
    <h5>${impact.highConfidence.size} Container(s) With Hardcoded References</h5>
    <ul>${Array.from(impact.highConfidence).map(name => `<li>${name}</li>`).join('')}</ul>
    <div class="warning-note">These containers WILL BREAK and must be updated manually!</div>
</div>`;
        }
        
        if (impact.lowConfidence.size > 0) {
            html += `
<div class="impact-info">
    <h5>${impact.lowConfidence.size} Container(s) on Shared Network</h5>
    <ul>${Array.from(impact.lowConfidence).map(name => `<li>${name}</li>`).join('')}</ul>
    <div class="info-note">These containers share a network - review recommended</div>
</div>`;
        }
        
        if (impact.highConfidence.size === 0 && impact.lowConfidence.size === 0) {
            html += '<div class="alert alert-success">No containers appear to be affected</div>';
        }
        
        html += '</div>';
        return html;
    },
    
    updateExecutionSummary(impact) {
        document.getElementById('execution-summary').innerHTML = `
<div class="summary-box">
    <strong>Changes to apply:</strong>
    <ul>${impact.changes.map(c => `<li>${c.protocol.toUpperCase()} ${c.currentPort} -> ${c.newPort}</li>`).join('')}</ul>
</div>`;
    },
    
    updateApplyButton() {
        const dryRun = document.getElementById('gate-dryrun').checked;
        const mutation = document.getElementById('gate-mutation').checked;
        const confirmText = document.getElementById('gate-confirm').value.trim();
        const applyBtn = document.getElementById('apply-btn');
        
        const CONFIRM_PHRASE = "I UNDERSTAND THIS WILL CAUSE DOWNTIME";
        const canApply = (dryRun || mutation) && (dryRun && !mutation || confirmText === CONFIRM_PHRASE);
        
        applyBtn.disabled = !canApply;
    },
    
    async applyChanges() {
        const dryRun = document.getElementById('gate-dryrun').checked;
        const mutation = document.getElementById('gate-mutation').checked;
        
        // CRITICAL: Build complete from/to arrays with ALL ports
        const fromPorts = [];
        const toPorts = [];
        const PROTECTED_PORTS = new Set([58846, 58946]);
        
        // Get user changes as a map
        const userChanges = new Map();
        for (const port of this.currentPorts) {
            if (PROTECTED_PORTS.has(port.host)) continue;
            
            const key = `${port.host}-${port.protocol}`;
            const newPortInput = document.getElementById(`new-port-${key}`);
            if (newPortInput && newPortInput.value) {
                const newPort = parseInt(newPortInput.value);
                if (newPort && newPort !== port.host) {
                    userChanges.set(key, newPort);
                }
            }
        }
        
        // Build from/to arrays including ALL ports (changed and unchanged)
        for (const originalPort of this.originalPorts) {
            const key = `${originalPort.host}-${originalPort.protocol}`;
            const newHostPort = userChanges.get(key);
            
            fromPorts.push({
                host: originalPort.host,
                container: originalPort.containerPort,
                protocol: originalPort.protocol
            });
            
            toPorts.push({
                host: newHostPort || originalPort.host,  // Use new or keep original
                container: originalPort.containerPort,
                protocol: originalPort.protocol
            });
        }
        
        console.log('[Modal] fromPorts:', fromPorts);
        console.log('[Modal] toPorts:', toPorts);
        
        document.getElementById('execution-section').style.display = 'none';
        document.getElementById('execution-progress').style.display = 'block';
        
        try {
            const plan = {
                dryRun: dryRun && !mutation,
                actions: [{
                    type: 'update-container-ports',
                    container: this.currentContainer.name,
                    from: fromPorts,
                    to: toPorts,
                    reason: 'Port change via impact modal'
                }]
            };
            
            const res = await fetch('/api/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedContainers: [this.currentContainer.name],
                    categoryOverrides: window.CategoryOverridesUI?.categoryOverrides || {},
                    policyEnforcement: {},
                    allowDockerMutation: mutation,
                    dryRun: dryRun && !mutation,
                    confirmPhrase: "I UNDERSTAND THIS WILL CAUSE DOWNTIME",
                    planObject: plan
                })
            });
            
            const result = await res.json();
            
            if (result.jobId) {
                document.getElementById('progress-message').textContent = `Job ${result.jobId} created. Monitoring...`;
                await this.pollJobCompletion(result.jobId);
            } else {
                throw new Error('No job ID returned');
            }
        } catch (err) {
            document.getElementById('execution-progress').innerHTML = `
                <div class="alert alert-error">Execution failed: ${err.message}</div>
                <button onclick="window.PortImpactModalComplete.close()">Close</button>
            `;
        }
    },
    
    async pollJobCompletion(jobId) {
        const maxAttempts = 60;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            try {
                const res = await fetch(`/api/jobs/${jobId}`);
                const job = await res.json();
                
                if (job.status === 'completed') {
                    document.getElementById('execution-progress').innerHTML = `
                        <div class="alert alert-success">
                            Port changes applied successfully!
                            <button onclick="window.location.reload()">Reload Page</button>
                        </div>
                    `;
                    return;
                }
                
                if (job.status === 'failed') {
                    throw new Error(job.error || 'Job failed');
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
            } catch (err) {
                document.getElementById('execution-progress').innerHTML = `
                    <div class="alert alert-error">${err.message}</div>
                    <button onclick="window.PortImpactModalComplete.close()">Close</button>
                `;
                return;
            }
        }
        
        document.getElementById('execution-progress').innerHTML = `
            <div class="alert alert-warn">Job timeout - check server logs</div>
            <button onclick="window.PortImpactModalComplete.close()">Close</button>
        `;
    },
    
    close() {
        const modal = document.getElementById('port-impact-modal-complete');
        if (modal) modal.remove();
        
        this.currentContainer = null;
        this.currentPorts = [];
        this.originalPorts = [];
        this.suggestions = {};
    }
};

window.showPortImpact = (containerName, port, proto) => 
    window.PortImpactModalComplete.show(containerName, port, proto);
