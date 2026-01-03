/**
 * ============================================================================
 * Port-MCP Enforcer — Tabbed Interface
 * Location: src/ui/web/public/tabs-ui.js
 *
 * Responsibility:
 * - Tab navigation (Overview / History)
 * - History view showing modified containers
 * - Rollback interface per container
 * ============================================================================
 */

"use strict";

window.TabsUI = {
    currentTab: 'overview',
    
    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
        
        // Re-render
        if (typeof window.render === 'function') {
            window.render();
        }
    },
    
    renderTabBar() {
        return `
<div class="tab-bar">
    <button class="tab-button ${this.currentTab === 'overview' ? 'active' : ''}" 
            data-tab="overview"
            onclick="window.TabsUI.switchTab('overview')">
        <span class="tab-icon">📊</span>
        <span class="tab-label">Overview</span>
    </button>
    
    <button class="tab-button ${this.currentTab === 'standardized' ? 'active' : ''}"
            data-tab="standardized" 
            onclick="window.TabsUI.switchTab('standardized')">
        <span class="tab-icon">✅</span>
        <span class="tab-label">Standardized</span>
    </button>
    
    <button class="tab-button ${this.currentTab === 'history' ? 'active' : ''}"
            data-tab="history" 
            onclick="window.TabsUI.switchTab('history')">
        <span class="tab-icon">📜</span>
        <span class="tab-label">History & Rollback</span>
    </button>
</div>
`;
    },
    
    renderHistoryView(jobs, containers) {
        // jobs parameter is ignored - we'll fetch from server
        // This function is called synchronously but we need async fetch
        // So we'll show a loading state and fetch in the background
        
        // Trigger async load
        this.loadAndRenderHistory(containers);
        
        // Return loading placeholder
        return `
<div class="panel">
    <div id="history-content" style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 1rem; opacity: 0.5;">⏳</div>
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
            Loading history...
        </h2>
        <p>Fetching execution jobs from server</p>
    </div>
</div>
`;
    },
    
    async loadAndRenderHistory(containers) {
        try {
            // Fetch snapshots from disk (not in-memory jobs)
            const res = await fetch('/api/snapshots');
            if (!res.ok) throw new Error('Failed to fetch snapshots');
            
            const data = await res.json();
            const snapshots = data.snapshots || [];
            
            if (snapshots.length === 0) {
                document.getElementById('history-content').innerHTML = `
                    <div style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary);">
                        <div style="font-size: 48px; margin-bottom: 1rem; opacity: 0.5;">📜</div>
                        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
                            No execution history
                        </h2>
                        <p>Execute some changes to see history here</p>
                    </div>
                `;
                return;
            }
            
            // Convert snapshots to job format for rendering
            const jobs = new Map();
            
            for (const snapshot of snapshots) {
                // Skip rollback/restore jobs
                if (snapshot.kind === 'rollback' || snapshot.kind === 'restore') {
                    continue;
                }
                
                // Fetch full snapshot details
                try {
                    const detailRes = await fetch(`/api/snapshots/${snapshot.jobId}`);
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        
                        // Convert to job format expected by renderHistoryContent
                        jobs.set(snapshot.jobId, {
                            id: snapshot.jobId,
                            status: snapshot.status,
                            startedAt: snapshot.startedAt,
                            finishedAt: snapshot.finishedAt,
                            selectedContainers: snapshot.selectedContainers || [],
                            preState: detail.preState,
                            postState: detail.postState,
                            kind: snapshot.kind || 'execution'
                        });
                    }
                } catch (err) {
                    console.log(`Could not load snapshot ${snapshot.jobId}:`, err);
                }
            }
            
            if (jobs.size === 0) {
                document.getElementById('history-content').innerHTML = `
                    <div style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary);">
                        <div style="font-size: 48px; margin-bottom: 1rem; opacity: 0.5;">📜</div>
                        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
                            No execution history
                        </h2>
                        <p>Snapshots found, but could not load details</p>
                    </div>
                `;
                return;
            }
            
            // Render the history
            const html = this.renderHistoryContent(jobs, containers);
            document.getElementById('history-content').innerHTML = html;
            
        } catch (err) {
            console.error('Failed to load history:', err);
            document.getElementById('history-content').innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--accent-red);">
                    Failed to load history: ${err.message}
                </div>
            `;
        }
    },
    
    renderHistoryContent(jobs, containers) {
        // Group completed jobs by container
        const containerChanges = this.groupChangesByContainer(jobs);
        
        // Group by category
        const byCategory = this.groupByCategory(containerChanges, containers);
        
        let html = '<div class="history-view">';
        
        // Render each category
        for (const [category, changes] of Object.entries(byCategory)) {
            if (changes.length === 0) continue;
            
            const categoryColor = this.getCategoryColor(category);
            const categoryIcon = this.getCategoryIcon(category);
            
            html += `
<div class="category-section">
    <h3 class="category-header" style="border-left-color: ${categoryColor};">
        <span class="category-icon">${categoryIcon}</span>
        ${category.toUpperCase()}
        <span class="category-count">${changes.length}</span>
    </h3>
    
    <div class="changes-list">
`;
            
            for (const change of changes) {
                html += this.renderChangeCard(change);
            }
            
            html += `
    </div>
</div>
`;
        }
        
        html += '</div>';
        
        return html;
    },
    
    groupChangesByContainer(jobs) {
        const changes = new Map();
        
        for (const [jobId, job] of jobs.entries()) {
            // Only completed jobs with snapshots
            if (job.status !== 'completed') continue;
            if (!job.preState || !job.postState) continue;
            if (job.kind === 'rollback') continue; // Skip rollback jobs
            
            // Find port changes
            const prePorts = job.preState.ports || [];
            const postPorts = job.postState.ports || [];
            
            const portChanges = this.diffPorts(prePorts, postPorts);
            
            for (const [container, diff] of Object.entries(portChanges)) {
                if (!changes.has(container)) {
                    changes.set(container, []);
                }
                
                changes.get(container).push({
                    jobId,
                    timestamp: job.finishedAt || job.startedAt,
                    container,
                    changes: diff,
                    canRollback: this.canRollback(jobId, jobs)
                });
            }
        }
        
        return changes;
    },
    
    diffPorts(prePorts, postPorts) {
        const changes = {};
        
        // Group ports by container
        const preByContainer = {};
        const postByContainer = {};
        
        for (const p of prePorts) {
            if (!preByContainer[p.container]) preByContainer[p.container] = new Map();
            const key = `${p.containerPort}/${p.protocol}`;
            preByContainer[p.container].set(key, p.host);
        }
        
        for (const p of postPorts) {
            if (!postByContainer[p.container]) postByContainer[p.container] = new Map();
            const key = `${p.containerPort}/${p.protocol}`;
            postByContainer[p.container].set(key, p.host);
        }
        
        // Find changes per container
        for (const [container, postMap] of Object.entries(postByContainer)) {
            const preMap = preByContainer[container] || new Map();
            
            for (const [key, newHost] of postMap.entries()) {
                const oldHost = preMap.get(key);
                
                // Only include if there was an actual change
                if (oldHost !== newHost) {
                    if (!changes[container]) changes[container] = [];
                    
                    const [containerPort, protocol] = key.split('/');
                    changes[container].push({
                        containerPort: parseInt(containerPort),
                        protocol,
                        from: oldHost || 'none',
                        to: newHost
                    });
                }
            }
        }
        
        // Also check for removed ports (in pre but not in post)
        for (const [container, preMap] of Object.entries(preByContainer)) {
            const postMap = postByContainer[container] || new Map();
            
            for (const [key, oldHost] of preMap.entries()) {
                if (!postMap.has(key)) {
                    if (!changes[container]) changes[container] = [];
                    
                    const [containerPort, protocol] = key.split('/');
                    changes[container].push({
                        containerPort: parseInt(containerPort),
                        protocol,
                        from: oldHost,
                        to: 'none'
                    });
                }
            }
        }
        
        return changes;
    },
    
    groupByCategory(containerChanges, containers) {
        const byCategory = {
            apps: [],
            games: [],
            system: [],
            unknown: []
        };
        
        for (const [containerName, changesList] of containerChanges.entries()) {
            // Find category from current containers
            const container = containers.find(c => c.name === containerName);
            const category = container?.category || 'unknown';
            
            if (!byCategory[category]) byCategory[category] = [];
            
            // Get most recent change
            const mostRecent = changesList.sort((a, b) => b.timestamp - a.timestamp)[0];
            mostRecent.allChanges = changesList;
            
            byCategory[category].push(mostRecent);
        }
        
        return byCategory;
    },
    
    canRollback(jobId, jobs) {
        // Check if a rollback already exists for this job
        for (const job of jobs.values()) {
            if (job.kind === 'rollback' && job.sourceJobId === jobId) {
                return false;
            }
        }
        return true;
    },
    
    renderChangeCard(change) {
        const relativeTime = this.formatRelativeTime(change.timestamp);
        const canRollback = change.canRollback;
        
        return `
<div class="change-card">
    <div class="change-header">
        <div class="change-title">
            <strong>${change.container}</strong>
            <span class="change-time">${relativeTime}</span>
        </div>
        <div class="change-actions">
            ${canRollback ? `
                <button class="btn-rollback" 
                        onclick="window.TabsUI.initiateRollback('${change.jobId}', '${change.container}')"
                        title="Rollback to previous port configuration">
                    ↩️ Rollback
                </button>
            ` : `
                <span class="rollback-disabled" title="Already rolled back">
                    ✓ Rolled back
                </span>
            `}
        </div>
    </div>
    
    <div class="change-details">
        ${change.changes.map(c => `
            <div class="port-change">
                <span class="port-label">Port ${c.containerPort}/${c.protocol}:</span>
                <span class="port-from">${c.from}</span>
                <span class="port-arrow">→</span>
                <span class="port-to">${c.to}</span>
            </div>
        `).join('')}
    </div>
    
    ${change.allChanges && change.allChanges.length > 1 ? `
        <div class="change-history-toggle" onclick="this.nextElementSibling.classList.toggle('expanded')">
            <small>Show ${change.allChanges.length - 1} older changes ▼</small>
        </div>
        <div class="change-history">
            ${change.allChanges.slice(1).map(old => `
                <div class="old-change">
                    <span class="old-change-time">${this.formatRelativeTime(old.timestamp)}</span>
                    ${old.changes.map(c => 
                        `${c.from} → ${c.to}`
                    ).join(', ')}
                </div>
            `).join('')}
        </div>
    ` : ''}
</div>
`;
    },
    
    formatRelativeTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    },
    
    getCategoryColor(category) {
        const colors = {
            apps: '#58a6ff',
            games: '#bc8cff',
            system: '#ff9966',
            unknown: '#f85149'
        };
        return colors[category] || colors.unknown;
    },
    
    getCategoryIcon(category) {
        const icons = {
            apps: '📱',
            games: '🎮',
            system: '⚙️',
            unknown: '❓'
        };
        return icons[category] || icons.unknown;
    },
    
    async initiateRollback(jobId, containerName) {
        if (!confirm(`Rollback ${containerName} to previous port configuration?\n\nThis will stop and restart the container.`)) {
            return;
        }
        
        try {
            // Generate rollback plan
            const planRes = await fetch('/api/rollback/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    selectedContainers: [containerName]
                })
            });
            
            if (!planRes.ok) {
                throw new Error('Failed to generate rollback plan');
            }
            
            const planData = await planRes.json();
            
            if (!planData.actions || planData.actions.length === 0) {
                alert('No rollback actions needed - container already at target state');
                return;
            }
            
            // Show confirmation dialog
            const confirmPhrase = 'ROLLBACK';
            const typed = prompt(
                `About to rollback ${containerName}.\n\n` +
                `Changes:\n${planData.actions.map(a => 
                    `  ${a.protocol} ${a.from} → ${a.to}`
                ).join('\n')}\n\n` +
                `Type "${confirmPhrase}" to confirm:`
            );
            
            if (typed !== confirmPhrase) {
                alert('Rollback cancelled');
                return;
            }
            
            // Execute rollback
            const applyRes = await fetch('/api/rollback/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobId,
                    selectedContainers: [containerName],
                    allowDockerMutation: true,
                    confirmPhrase: confirmPhrase,
                    dryRun: false
                })
            });
            
            if (!applyRes.ok) {
                throw new Error('Rollback failed');
            }
            
            const result = await applyRes.json();
            alert(`Rollback initiated!\nJob ID: ${result.jobId}\n\nRefresh the page to see updated status.`);
            
            // Refresh view
            if (typeof window.scan === 'function') {
                setTimeout(() => window.scan(), 2000);
            }
            
        } catch (err) {
            alert(`Rollback error: ${err.message}`);
        }
    }
};

// Auto-initialize
window.addEventListener('load', () => {
    window.TabsUI.currentTab = 'overview';
});
