/**
 * ============================================================================
 * Port-MCP Enforcer — Snapshot Browser & Restore UI
 * Location: src/ui/web/public/restore-ui.js
 *
 * Responsibility:
 * - Browse saved snapshots
 * - Preview snapshot contents
 * - Restore from any snapshot
 * ============================================================================
 */

"use strict";

window.RestoreUI = {
    snapshots: [],
    selectedSnapshot: null,
    
    async loadSnapshots() {
        try {
            const res = await fetch('/api/snapshots');
            const data = await res.json();
            this.snapshots = data.snapshots || [];
            return this.snapshots;
        } catch (err) {
            console.error('Failed to load snapshots:', err);
            return [];
        }
    },
    
    renderSnapshotsTab() {
        if (this.snapshots.length === 0) {
            return `
<div class="panel">
    <div style="text-align: center; padding: 4rem 2rem; color: var(--text-secondary);">
        <div style="font-size: 48px; margin-bottom: 1rem; opacity: 0.5;">💾</div>
        <h2 style="font-size: 20px; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary);">
            No saved snapshots
        </h2>
        <p>Execute some changes to create snapshots</p>
    </div>
</div>
`;
        }
        
        let html = '<div class="snapshots-view">';
        
        html += `
<div class="panel">
    <h3>📦 Saved Snapshots (${this.snapshots.length})</h3>
    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
        Restore your system to any previous state
    </p>
    <div class="snapshots-list">
`;
        
        for (const snapshot of this.snapshots) {
            html += this.renderSnapshotCard(snapshot);
        }
        
        html += `
    </div>
</div>
</div>
`;
        
        return html;
    },
    
    renderSnapshotCard(snapshot) {
        const date = new Date(snapshot.finishedAt);
        const dateStr = date.toLocaleString();
        const relativeTime = this.formatRelativeTime(snapshot.finishedAt);
        
        const containers = snapshot.selectedContainers || [];
        const containerList = containers.length > 0
            ? containers.join(', ')
            : 'All containers';
        
        return `
<div class="snapshot-card">
    <div class="snapshot-header">
        <div class="snapshot-info">
            <div class="snapshot-title">
                <strong>📸 ${snapshot.jobId.slice(0, 12)}</strong>
                <span class="snapshot-time">${relativeTime}</span>
            </div>
            <div class="snapshot-meta">
                <span title="${dateStr}">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>
                <span>•</span>
                <span>${containerList}</span>
            </div>
        </div>
        <div class="snapshot-actions">
            <button class="btn-preview" 
                    onclick="window.RestoreUI.previewSnapshot('${snapshot.jobId}')"
                    title="Preview what will be restored">
                👁️ Preview
            </button>
            <button class="btn-restore" 
                    onclick="window.RestoreUI.initiateRestore('${snapshot.jobId}')"
                    title="Restore system to this snapshot">
                ⏮️ Restore
            </button>
        </div>
    </div>
    
    <div id="preview-${snapshot.jobId}" class="snapshot-preview" style="display: none;">
        <!-- Preview loaded dynamically -->
    </div>
</div>
`;
    },
    
    async previewSnapshot(snapshotId) {
        const previewDiv = document.getElementById(`preview-${snapshotId}`);
        
        if (previewDiv.style.display === 'block') {
            previewDiv.style.display = 'none';
            return;
        }
        
        try {
            const res = await fetch(`/api/snapshots/${snapshotId}`);
            const snapshot = await res.json();
            
            const prePorts = snapshot.preState.ports || [];
            const postPorts = snapshot.postState.ports || [];
            const diff = snapshot.diff?.changes || [];
            
            let html = `
<div style="padding: 16px; background: var(--bg-secondary); border-radius: 6px; margin-top: 12px;">
    <h4 style="margin: 0 0 12px 0; font-size: 14px;">Snapshot Contents</h4>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div>
            <strong style="color: var(--accent-red);">Before (${prePorts.length} ports)</strong>
            <div style="font-size: 12px; margin-top: 8px; max-height: 150px; overflow-y: auto;">
                ${prePorts.map(p => `
                    <div>${p.container}: ${p.host}:${p.containerPort}/${p.protocol}</div>
                `).join('')}
            </div>
        </div>
        <div>
            <strong style="color: var(--accent-green);">After (${postPorts.length} ports)</strong>
            <div style="font-size: 12px; margin-top: 8px; max-height: 150px; overflow-y: auto;">
                ${postPorts.map(p => `
                    <div>${p.container}: ${p.host}:${p.containerPort}/${p.protocol}</div>
                `).join('')}
            </div>
        </div>
    </div>
    
    ${diff.length > 0 ? `
    <div>
        <strong style="color: var(--accent-blue);">Changes (${diff.length})</strong>
        <div style="font-size: 12px; margin-top: 8px;">
            ${diff.map(c => `
                <div class="port-change">
                    <span>${c.container} port ${c.containerPort}/${c.protocol}:</span>
                    <span class="port-from">${c.from || 'none'}</span>
                    <span class="port-arrow">→</span>
                    <span class="port-to">${c.to || 'none'}</span>
                </div>
            `).join('')}
        </div>
    </div>
    ` : ''}
</div>
`;
            
            previewDiv.innerHTML = html;
            previewDiv.style.display = 'block';
            
        } catch (err) {
            previewDiv.innerHTML = `
<div style="padding: 16px; color: var(--accent-red);">
    Failed to load snapshot: ${err.message}
</div>
`;
            previewDiv.style.display = 'block';
        }
    },
    
    async initiateRestore(snapshotId) {
        if (!confirm(
            `Restore system to snapshot ${snapshotId}?\n\n` +
            `This will:\n` +
            `• Stop affected containers\n` +
            `• Restore port bindings to snapshot state\n` +
            `• Restart containers\n\n` +
            `Continue?`
        )) {
            return;
        }
        
        const confirmPhrase = 'RESTORE';
        const typed = prompt(
            `This operation will modify running containers.\n\n` +
            `Type "${confirmPhrase}" to confirm restoration:`
        );
        
        if (typed !== confirmPhrase) {
            alert('Restore cancelled');
            return;
        }
        
        try {
            const res = await fetch('/api/restore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    snapshotId,
                    selectedContainers: null, // Restore all
                    allowDockerMutation: true,
                    confirmPhrase: confirmPhrase,
                    dryRun: false
                })
            });
            
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Restore failed');
            }
            
            const result = await res.json();
            alert(
                `Restore initiated!\n\n` +
                `Job ID: ${result.jobId}\n\n` +
                `Your system is being restored to the snapshot state.\n` +
                `Refresh the page in a few moments to see updated status.`
            );
            
            // Refresh after delay
            setTimeout(() => {
                if (typeof window.scan === 'function') {
                    window.scan();
                }
            }, 5000);
            
        } catch (err) {
            alert(`Restore error: ${err.message}`);
        }
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
    }
};
