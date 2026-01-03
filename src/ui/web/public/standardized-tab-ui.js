/**
 * ============================================================================
 * Port-MCP Enforcer — Standardized Containers Tab
 * Location: src/ui/web/public/standardized-tab-ui.js
 *
 * Responsibility:
 * - Show containers that are already compliant (standardized)
 * - Display port range standards
 * - Read-only view (no checkboxes)
 * - Green text for compliant containers
 * ============================================================================
 */

"use strict";

window.StandardizedTabUI = {
    
    // Port range definitions
    PORT_RANGES: {
        system: { 
            ranges: [[1, 1023]], 
            label: "System",
            icon: "⚙️",
            description: "Privileged system ports"
        },
        apps: { 
            ranges: [[1024, 19999]], 
            label: "Apps",
            icon: "📱",
            description: "Application services"
        },
        games: { 
            ranges: [
                [7000, 9999],    // Low range for hardcoded game ports
                [20000, 39999]   // High range for flexible games
            ], 
            label: "Games",
            icon: "🎮",
            description: "Game servers (low: 7000-9999, high: 20000-39999)"
        },
        reserved: { 
            ranges: [[40000, 45000]], 
            label: "Reserved",
            icon: "🔒",
            description: "Reserved for future use"
        }
    },
    
    /**
     * Check if a port is compliant for a given category
     */
    isPortCompliant(port, category) {
        const ranges = this.PORT_RANGES[category]?.ranges || [];
        return ranges.some(([min, max]) => port >= min && port <= max);
    },
    
    /**
     * Check if a container is standardized
     */
    isContainerStandardized(container, ports, categoryOverrides) {
        const name = container.name;
        const category = categoryOverrides[name]?.category || container.category;
        const confidence = categoryOverrides[name] ? 1.0 : container.confidence;
        
        // Must have valid category
        if (!category || category === 'unknown') return false;
        
        // Must have high confidence or override
        if (confidence < 0.9) return false;
        
        // Must have at least one port
        if (!ports || ports.length === 0) return false;
        
        // All TCP ports must be in correct range
        const tcpPorts = ports.filter(p => p.protocol === 'tcp');
        if (tcpPorts.length === 0) return false;
        
        return tcpPorts.every(p => this.isPortCompliant(p.host, category));
    },
    
    /**
     * Get standardized containers
     */
    getStandardizedContainers(containers, portsByContainer, categoryOverrides) {
        const standardized = [];
        
        for (const container of containers) {
            const ports = portsByContainer[container.name] || [];
            
            if (this.isContainerStandardized(container, ports, categoryOverrides)) {
                standardized.push({
                    ...container,
                    ports,
                    effectiveCategory: categoryOverrides[container.name]?.category || container.category
                });
            }
        }
        
        return standardized;
    },
    
    /**
     * Render the standardized tab
     */
    renderStandardizedTab(containers, portsByContainer, categoryOverrides, renderPorts) {
        const standardized = this.getStandardizedContainers(
            containers,
            portsByContainer,
            categoryOverrides
        );
        
        const total = containers.length;
        const standardizedCount = standardized.length;
        const percentage = total > 0 ? Math.round((standardizedCount / total) * 100) : 0;
        
        let html = '<div class="standardized-view">';
        
        // Legend
        html += this.renderLegend();
        
        // Progress summary
        html += this.renderProgress(total, standardizedCount, percentage);
        
        // Group by category
        const byCategory = this.groupByCategory(standardized);
        
        // Render each category
        for (const [category, items] of Object.entries(byCategory)) {
            if (items.length > 0) {
                html += this.renderCategorySection(category, items, renderPorts);
            }
        }
        
        // Empty state
        if (standardized.length === 0) {
            html += this.renderEmptyState();
        }
        
        html += '</div>';
        
        return html;
    },
    
    /**
     * Render legend showing port ranges
     */
    renderLegend() {
        return `
<div class="panel legend-panel">
    <h3>📋 Port Assignment Standards</h3>
    <div class="legend-grid">
        ${Object.entries(this.PORT_RANGES).map(([key, range]) => `
            <div class="legend-item">
                <span class="legend-icon">${range.icon}</span>
                <div class="legend-content">
                    <strong>${range.label}</strong>
                    <div class="legend-ranges">
                        ${range.ranges.map(([min, max]) => 
                            `<code>${min}-${max}</code>`
                        ).join(' or ')}
                    </div>
                    <div class="legend-desc">${range.description}</div>
                </div>
            </div>
        `).join('')}
    </div>
</div>
`;
    },
    
    /**
     * Render progress indicator
     */
    renderProgress(total, standardized, percentage) {
        const remaining = total - standardized;
        const barWidth = Math.min(percentage, 100);
        
        return `
<div class="panel progress-panel">
    <h3>📊 Standardization Progress</h3>
    <div class="progress-stats">
        <div class="stat">
            <span class="stat-value">${standardized}</span>
            <span class="stat-label">Standardized</span>
        </div>
        <div class="stat">
            <span class="stat-value">${remaining}</span>
            <span class="stat-label">Remaining</span>
        </div>
        <div class="stat">
            <span class="stat-value">${percentage}%</span>
            <span class="stat-label">Complete</span>
        </div>
    </div>
    <div class="progress-bar">
        <div class="progress-fill" style="width: ${barWidth}%"></div>
    </div>
</div>
`;
    },
    
    /**
     * Group containers by category
     */
    groupByCategory(containers) {
        const groups = {
            apps: [],
            games: [],
            system: [],
            unknown: []
        };
        
        for (const container of containers) {
            const category = container.effectiveCategory || 'unknown';
            if (groups[category]) {
                groups[category].push(container);
            } else {
                groups.unknown.push(container);
            }
        }
        
        return groups;
    },
    
    /**
     * Render a category section
     */
    renderCategorySection(category, containers, renderPorts) {
        const info = this.PORT_RANGES[category] || { icon: '❓', label: category };
        
        return `
<div class="panel category-panel">
    <h3 class="category-header-standardized">
        <span class="category-icon">${info.icon}</span>
        ${info.label.toUpperCase()}
        <span class="category-count">${containers.length}</span>
    </h3>
    
    <table class="standardized-table">
        <thead>
            <tr>
                <th>Container</th>
                <th>Category</th>
                <th>Ports</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${containers.map(c => this.renderContainerRow(c, renderPorts)).join('')}
        </tbody>
    </table>
</div>
`;
    },
    
    /**
     * Render a single container row (green text, no checkbox)
     */
    renderContainerRow(container, renderPorts) {
        const ports = container.ports || [];
        
        return `
<tr class="standardized-row">
    <td class="container-name">
        <span class="checkmark">✓</span>
        <strong>${container.name}</strong>
    </td>
    <td class="container-category">${container.effectiveCategory}</td>
    <td class="container-ports">${renderPorts(ports)}</td>
    <td class="container-status">
        <span class="status-badge status-compliant">✅ Compliant</span>
    </td>
</tr>
`;
    },
    
    /**
     * Render empty state
     */
    renderEmptyState() {
        return `
<div class="panel empty-state">
    <div class="empty-state-content">
        <div class="empty-icon">📋</div>
        <h2>No Standardized Containers Yet</h2>
        <p>Execute changes in the Overview tab to see compliant containers appear here.</p>
        <button onclick="window.switchTab('overview')" class="btn-primary">
            ← Go to Overview
        </button>
    </div>
</div>
`;
    },
    
    /**
     * Format relative time
     */
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

/* ============================================================================
   CSS Styles for Standardized Tab
============================================================================ */

const standardizedStyles = `
<style>
/* Legend Panel */
.legend-panel {
    background: linear-gradient(135deg, #1a2332 0%, #1e2837 100%);
    border-left: 4px solid #3498db;
}

.legend-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    margin-top: 12px;
}

.legend-item {
    display: flex;
    gap: 12px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.legend-icon {
    font-size: 24px;
}

.legend-content {
    flex: 1;
}

.legend-content strong {
    display: block;
    font-size: 14px;
    margin-bottom: 4px;
}

.legend-ranges {
    margin: 4px 0;
}

.legend-ranges code {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 12px;
    color: #4fd1c5;
}

.legend-desc {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 4px;
}

/* Progress Panel */
.progress-panel {
    background: linear-gradient(135deg, #1e2837 0%, #1a2332 100%);
    border-left: 4px solid #2ecc71;
}

.progress-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin: 16px 0;
}

.stat {
    text-align: center;
}

.stat-value {
    display: block;
    font-size: 32px;
    font-weight: 700;
    color: #2ecc71;
}

.stat-label {
    display: block;
    font-size: 12px;
    opacity: 0.7;
    margin-top: 4px;
}

.progress-bar {
    height: 24px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    overflow: hidden;
    margin-top: 16px;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #2ecc71 0%, #27ae60 100%);
    transition: width 0.5s ease;
}

/* Category Panel */
.category-panel {
    margin-bottom: 16px;
}

.category-header-standardized {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    font-size: 16px;
}

/* Standardized Table */
.standardized-table {
    width: 100%;
    border-collapse: collapse;
}

.standardized-table thead th {
    text-align: left;
    padding: 8px;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
    font-size: 12px;
    opacity: 0.7;
}

.standardized-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.standardized-row:hover {
    background: rgba(46, 204, 113, 0.1);
}

.standardized-row td {
    padding: 12px 8px;
    color: #2ecc71; /* GREEN TEXT */
}

.checkmark {
    color: #2ecc71;
    margin-right: 8px;
    font-weight: bold;
}

.container-name strong {
    color: #2ecc71;
    font-weight: 600;
}

.status-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
}

.status-compliant {
    background: rgba(46, 204, 113, 0.2);
    color: #2ecc71;
    border: 1px solid #2ecc71;
}

/* Empty State */
.empty-state {
    text-align: center;
    padding: 4rem 2rem;
}

.empty-icon {
    font-size: 64px;
    margin-bottom: 1rem;
    opacity: 0.5;
}

.empty-state h2 {
    font-size: 24px;
    margin-bottom: 0.5rem;
}

.empty-state p {
    opacity: 0.7;
    margin-bottom: 1.5rem;
}

.btn-primary {
    background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.btn-primary:hover {
    background: linear-gradient(135deg, #2980b9 0%, #3498db 100%);
}
</style>
`;

// Inject styles
document.head.insertAdjacentHTML('beforeend', standardizedStyles);
