/**
 * ============================================================================
 * VERSION B: CHECKBOX COLUMN (Clear & Explicit) - Standardized Tab
 * v1.0.4 - Fixed no-port container standardization
 * 
 * - Dedicated checkbox column
 * - Excluded containers in separate section
 * - No-port containers with valid category + confidence are standardized
 * ============================================================================
 */

"use strict";

window.StandardizedTabUI = {
    
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
                [7000, 9999],
                [20000, 39999]
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
    
    DAEMON_PORTS: new Set([58846, 58946]),
    
    isPortCompliant(port, category) {
        const ranges = this.PORT_RANGES[category]?.ranges || [];
        return ranges.some(([min, max]) => port >= min && port <= max);
    },
    
    isContainerStandardized(container, ports, categoryOverrides) {
        const name = container.name;
        const hasOverride = categoryOverrides[name]?.category || categoryOverrides[name];
        const category = (typeof hasOverride === 'string' ? hasOverride : hasOverride?.category) || container.category;
        const confidence = hasOverride ? 1.0 : container.confidence;
        
        // Unknown category = never standardized
        if (!category || category === 'unknown') return false;
        
        // System category = always standardized (protected)
        if (category === 'system') {
            return true;
        }
        
        // v1.0.4 FIX: No exposed ports with valid category + high confidence = standardized
        // This handles containers like binhex-plexpass that use host networking
        // or internal-only services that don't expose ports
        if (!ports || ports.length === 0) {
            // If user explicitly set category (override), trust them
            if (hasOverride && confidence >= 0.9) {
                return true;
            }
            // If running with no ports, also consider standardized
            const isRunning = container._raw?.running || container._raw?.state === 'running';
            if (isRunning && confidence >= 0.9) {
                return true;
            }
            // Otherwise, needs manual review
            return false;
        }
        
        // Low confidence = needs manual review
        if (confidence < 0.9) return false;
        
        const tcpPorts = ports.filter(p => p.protocol === 'tcp');
        const udpPorts = ports.filter(p => p.protocol === 'udp');
        
        // Games: all ports must be in game ranges
        if (category === 'games') {
            const allPorts = [...tcpPorts, ...udpPorts];
            if (allPorts.length === 0) return true; // No ports to check
            return allPorts.every(p => this.isPortCompliant(p.host, category));
        }
        
        // Apps: TCP ports must be in app range (ignoring daemon ports)
        const relevantTcpPorts = tcpPorts.filter(p => !this.DAEMON_PORTS.has(p.host));
        
        // Only daemon ports = standardized (VPN containers)
        if (relevantTcpPorts.length === 0 && tcpPorts.length > 0) {
            return true;
        }
        
        // No relevant ports to check = standardized
        if (relevantTcpPorts.length === 0) return true;
        
        // Check all relevant ports are compliant
        return relevantTcpPorts.every(p => this.isPortCompliant(p.host, category));
    },
    
    getStandardizedContainers(containers, portsByContainer, categoryOverrides) {
        const standardized = [];
        
        for (const container of containers) {
            const ports = portsByContainer[container.name] || [];
            
            if (this.isContainerStandardized(container, ports, categoryOverrides)) {
                const hasOverride = categoryOverrides[container.name]?.category || categoryOverrides[container.name];
                const effectiveCategory = (typeof hasOverride === 'string' ? hasOverride : hasOverride?.category) || container.category;
                
                standardized.push({
                    ...container,
                    ports,
                    effectiveCategory
                });
            }
        }
        
        return standardized;
    },
    
    // Track active sub-tab
    activeSubTab: 'all',
    
    setSubTab(tab) {
        this.activeSubTab = tab;
        if (typeof window.render === 'function') {
            window.render();
        }
    },
    
    renderStandardizedTab(containers, portsByContainer, categoryOverrides, renderPorts) {
        const standardized = this.getStandardizedContainers(
            containers,
            portsByContainer,
            categoryOverrides
        );
        
        const exclusions = window.ExclusionManager?.getExcluded() || [];
        const exclusionSet = new Set(exclusions);
        
        // Standardized but not excluded
        const nonExcluded = standardized.filter(c => !exclusionSet.has(c.name));
        
        // ALL excluded containers (not just standardized ones)
        const allExcluded = containers.filter(c => exclusionSet.has(c.name)).map(c => {
            const hasOverride = categoryOverrides[c.name]?.category || categoryOverrides[c.name];
            const effectiveCategory = (typeof hasOverride === 'string' ? hasOverride : hasOverride?.category) || c.category;
            return {
                ...c,
                ports: portsByContainer[c.name] || [],
                effectiveCategory
            };
        });
        
        const total = containers.length;
        const standardizedCount = standardized.length;
        const excludedCount = allExcluded.length;
        
        // Progress = standardized (not excluded) + excluded
        const doneCount = nonExcluded.length + excludedCount;
        const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        
        // Group by category for sub-tabs
        const byCategory = this.groupByCategory(nonExcluded);
        
        let html = '<div class="standardized-view">';
        
        html += this.renderLegend();
        html += this.renderProgress(total, nonExcluded.length, excludedCount, percentage);
        html += this.renderSubTabs(byCategory, allExcluded);
        
        // Render content based on active sub-tab
        if (this.activeSubTab === 'all') {
            for (const [category, items] of Object.entries(byCategory)) {
                if (items.length > 0) {
                    html += this.renderCategorySection(category, items, renderPorts);
                }
            }
            if (allExcluded.length > 0) {
                html += this.renderExcludedSection(allExcluded, renderPorts);
            }
        } else if (this.activeSubTab === 'excluded') {
            if (allExcluded.length > 0) {
                html += this.renderExcludedSection(allExcluded, renderPorts);
            } else {
                html += '<div class="panel" style="text-align: center; padding: 2rem; opacity: 0.7;">No excluded containers</div>';
            }
        } else {
            const items = byCategory[this.activeSubTab] || [];
            if (items.length > 0) {
                html += this.renderCategorySection(this.activeSubTab, items, renderPorts);
            } else {
                html += `<div class="panel" style="text-align: center; padding: 2rem; opacity: 0.7;">No ${this.activeSubTab} containers standardized yet</div>`;
            }
        }
        
        if (nonExcluded.length === 0 && allExcluded.length === 0) {
            html += this.renderEmptyState();
        }
        
        html += '</div>';
        
        return html;
    },
    
    renderSubTabs(byCategory, excluded) {
        const tabs = [
            { id: 'all', label: 'All', icon: '📋', count: Object.values(byCategory).flat().length + excluded.length },
            { id: 'apps', label: 'Apps', icon: '📱', count: (byCategory.apps || []).length },
            { id: 'games', label: 'Games', icon: '🎮', count: (byCategory.games || []).length },
            { id: 'system', label: 'System', icon: '⚙️', count: (byCategory.system || []).length },
            { id: 'excluded', label: 'Excluded', icon: '🚫', count: excluded.length }
        ];
        
        return `
<div class="sub-tab-bar" style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;">
    ${tabs.map(tab => `
        <button class="sub-tab-button ${this.activeSubTab === tab.id ? 'active' : ''}" 
                onclick="window.StandardizedTabUI.setSubTab('${tab.id}')"
                style="
                    background: ${this.activeSubTab === tab.id ? 'rgba(88, 166, 255, 0.2)' : 'var(--bg-tertiary)'};
                    border: 1px solid ${this.activeSubTab === tab.id ? 'var(--accent-blue)' : 'var(--border-color)'};
                    color: ${this.activeSubTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)'};
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s ease;
                ">
            <span>${tab.icon}</span>
            <span>${tab.label}</span>
            <span style="
                background: ${this.activeSubTab === tab.id ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)'};
                color: ${this.activeSubTab === tab.id ? 'white' : 'var(--text-muted)'};
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 11px;
            ">${tab.count}</span>
        </button>
    `).join('')}
</div>
`;
    },
    
    renderLegend() {
        return `
<div class="panel legend-panel" style="padding: 16px;">
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
            ${Object.entries(this.PORT_RANGES).map(([key, range]) => `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px;">${range.icon}</span>
                    <strong style="font-size: 12px;">${range.label}</strong>
                    <code style="font-size: 11px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">${range.ranges.map(([min, max]) => `${min}-${max}`).join(' / ')}</code>
                </div>
            `).join('')}
        </div>
        <div style="display: flex; align-items: center; gap: 16px; font-size: 11px;">
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #39d0d8; font-weight: 600;">●</span>
                <span>Web UI</span>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
                <span style="color: #8b949e; font-weight: 600;">●</span>
                <span>API/Backend</span>
            </div>
        </div>
    </div>
</div>
`;
    },
    
    renderProgress(total, standardized, excluded, percentage) {
        const remaining = total - standardized - excluded;
        const barWidth = Math.min(percentage, 100);
        
        return `
<div class="panel progress-panel" style="padding: 16px;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">📊</span>
            <strong style="font-size: 14px;">Progress</strong>
        </div>
        <div style="display: flex; align-items: center; gap: 24px;">
            <div style="text-align: center;">
                <span style="font-size: 20px; font-weight: 700; color: var(--accent-green);">${standardized}</span>
                <span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">Standardized</span>
            </div>
            <div style="text-align: center;">
                <span style="font-size: 20px; font-weight: 700; color: var(--accent-orange);">${excluded}</span>
                <span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">Excluded</span>
            </div>
            <div style="text-align: center;">
                <span style="font-size: 20px; font-weight: 700; color: var(--text-secondary);">${remaining}</span>
                <span style="font-size: 11px; color: var(--text-muted); margin-left: 4px;">Remaining</span>
            </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; min-width: 200px;">
            <div class="progress-bar" style="flex: 1; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden;">
                <div class="progress-fill" style="width: ${barWidth}%; height: 100%; background: linear-gradient(90deg, var(--accent-green), var(--accent-blue)); border-radius: 4px;"></div>
            </div>
            <span style="font-size: 16px; font-weight: 700; color: var(--accent-blue);">${percentage}%</span>
        </div>
    </div>
</div>
`;
    },
    
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
    
    renderContainerRow(container, renderPorts) {
        const ports = container.ports || [];
        const portsDisplay = ports.length === 0 
            ? '<span style="opacity: 0.5; font-style: italic;">No exposed ports</span>'
            : renderPorts(ports, container);
        
        return `
<tr class="standardized-row" data-container="${container.name}">
    <td class="container-name">
        <span class="checkmark">✓</span>
        <strong>${container.name}</strong>
    </td>
    <td class="container-category">${container.effectiveCategory}</td>
    <td class="container-ports">${portsDisplay}</td>
    <td class="container-status">
        <span class="status-badge status-compliant">✅ Compliant</span>
    </td>
</tr>
`;
    },
    
    renderExcludedSection(excluded, renderPorts) {
        return `
<div class="panel excluded-panel">
    <h3 class="excluded-header">
        <span class="excluded-icon">🚫</span>
        EXCLUDED CONTAINERS
        <span class="category-count">${excluded.length}</span>
    </h3>
    
    <div class="excluded-note">
        These containers are excluded from automation but count toward progress.
        <strong>Uncheck the box to include them again.</strong>
    </div>
    
    <table class="standardized-table">
        <thead>
            <tr>
                <th class="exclude-column-header" style="background: rgba(63, 185, 80, 0.1); border-right: 2px solid rgba(63, 185, 80, 0.3);">
                    <div class="exclude-header-content">
                        <span>✅</span>
                        <span>INCLUDE</span>
                    </div>
                </th>
                <th>Container</th>
                <th>Category</th>
                <th>Ports</th>
                <th>Status</th>
            </tr>
        </thead>
        <tbody>
            ${excluded.map(c => this.renderExcludedRow(c, renderPorts)).join('')}
        </tbody>
    </table>
</div>
`;
    },
    
    renderExcludedRow(container, renderPorts) {
        const ports = container.ports || [];
        const portsDisplay = ports.length === 0 
            ? '<span style="opacity: 0.5; font-style: italic;">No exposed ports</span>'
            : renderPorts(ports, container);
        
        const excludeCheckbox = `
            <input type="checkbox" 
                   class="exclude-checkbox"
                   checked
                   onchange="window.ExclusionManager.toggle('${container.name}')"
                   title="Click to include in automation">
        `;
        
        return `
<tr class="excluded-row" data-container="${container.name}">
    <td class="exclude-column">${excludeCheckbox}</td>
    <td class="container-name">
        <strong>${container.name}</strong>
    </td>
    <td class="container-category">${container.effectiveCategory}</td>
    <td class="container-ports">${portsDisplay}</td>
    <td class="container-status">
        <span class="status-badge status-excluded">🚫 Excluded</span>
    </td>
</tr>
`;
    },
    
    renderEmptyState() {
        return `
<div class="panel empty-state">
    <div class="empty-state-content">
        <div class="empty-icon">📋</div>
        <h2>No Standardized Containers Yet</h2>
        <p>Execute changes in the Overview tab to see compliant containers appear here.</p>
        <button onclick="window.TabsUI.switchTab('overview')" class="btn-primary">
            ← Go to Overview
        </button>
    </div>
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
    }
};
