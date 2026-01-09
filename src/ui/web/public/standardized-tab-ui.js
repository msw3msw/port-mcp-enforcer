/**
 * ============================================================================
 * Port-MCP Enforcer — Standardized Tab UI (POLISHED with Sub-Tabs)
 * Location: src/ui/web/public/standardized-tab-ui.js
 *
 * FEATURES:
 * - Sub-tabs for Apps / Games / System / Excluded
 * - Horizontal port standards legend
 * - Clean, uncluttered view
 * - Progress summary always visible
 * 
 * FIX: Unknown category containers are NEVER standardized
 * ============================================================================
 */

"use strict";

window.StandardizedTabUI = {
    
    // Current sub-tab
    currentSubTab: 'apps',
    
    PORT_RANGES: {
        system: { 
            ranges: [[1, 1023]], 
            label: "System",
            icon: "⚙️",
            color: "#ff9966",
            description: "Privileged ports"
        },
        apps: { 
            ranges: [[1024, 19999]], 
            label: "Apps",
            icon: "📱",
            color: "#58a6ff",
            description: "Application services"
        },
        games: { 
            ranges: [
                [7000, 9999],
                [20000, 39999]
            ], 
            label: "Games",
            icon: "🎮",
            color: "#bc8cff",
            description: "Game servers"
        },
        reserved: { 
            ranges: [[40000, 45000]], 
            label: "Reserved",
            icon: "🔒",
            color: "#6e7681",
            description: "Future use"
        }
    },
    
    DAEMON_PORTS: new Set([58846, 58946]),
    
    switchSubTab(tabName) {
        this.currentSubTab = tabName;
        if (typeof window.render === 'function') {
            window.render();
        }
    },
    
    isPortCompliant(port, category) {
        const ranges = this.PORT_RANGES[category]?.ranges || [];
        return ranges.some(([min, max]) => port >= min && port <= max);
    },
    
    isContainerStandardized(container, ports, categoryOverrides) {
        const name = container.name;
        const category = categoryOverrides[name]?.category || container.category;
        const confidence = categoryOverrides[name] ? 1.0 : container.confidence;
        
        // RULE 1: Unknown category = NEVER standardized (must be classified first)
        if (!category || category === 'unknown') {
            return false;
        }
        
        // RULE 2: Low confidence = NEVER standardized (needs manual review)
        if (confidence < 0.9) {
            return false;
        }
        
        // RULE 3: System category = always standardized (protected)
        if (category === 'system') {
            return true;
        }
        
        // RULE 4: Running with no exposed ports = standardized (internal service)
        const isRunning = container._raw?.running || container._raw?.state === 'running';
        if (isRunning && (!ports || ports.length === 0)) {
            return true;
        }
        
        // RULE 5: Must have ports to check compliance
        if (!ports || ports.length === 0) {
            return false;
        }
        
        // RULE 6: Check port compliance based on category
        const tcpPorts = ports.filter(p => p.protocol === 'tcp');
        const udpPorts = ports.filter(p => p.protocol === 'udp');
        
        if (category === 'games') {
            const allPorts = [...tcpPorts, ...udpPorts];
            if (allPorts.length === 0) return false;
            return allPorts.every(p => this.isPortCompliant(p.host, category));
        }
        
        // Apps: Check TCP ports (ignore daemon ports)
        const relevantTcpPorts = tcpPorts.filter(p => !this.DAEMON_PORTS.has(p.host));
        
        if (relevantTcpPorts.length === 0 && tcpPorts.length > 0) {
            return true; // Only daemon ports - OK
        }
        
        if (relevantTcpPorts.length === 0) {
            return false;
        }
        
        return relevantTcpPorts.every(p => this.isPortCompliant(p.host, category));
    },
    
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
    
    renderStandardizedTab(containers, portsByContainer, categoryOverrides, renderPorts) {
        const standardized = this.getStandardizedContainers(
            containers,
            portsByContainer,
            categoryOverrides
        );
        
        const exclusions = new Set(window.ExclusionManager?.getExcluded() || []);
        
        // Standardized containers that are NOT excluded
        const nonExcluded = standardized.filter(c => !exclusions.has(c.name));
        
        // ALL excluded containers (regardless of standardization status)
        const allExcluded = containers.filter(c => exclusions.has(c.name)).map(c => ({
            ...c,
            ports: portsByContainer[c.name] || [],
            effectiveCategory: categoryOverrides[c.name]?.category || c.category
        }));
        
        // Group by category
        const byCategory = this.groupByCategory(nonExcluded);
        
        const total = containers.length;
        const standardizedCount = nonExcluded.length;  // Only count non-excluded standardized
        const excludedCount = allExcluded.length;
        // Progress = standardized + excluded (both are "done")
        const doneCount = standardizedCount + excludedCount;
        const percentage = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        
        let html = '<div class="standardized-view">';
        
        // Compact horizontal legend
        html += this.renderHorizontalLegend();
        
        // Progress bar
        html += this.renderProgress(total, standardizedCount, excludedCount, percentage, byCategory);
        
        // Sub-tabs
        html += this.renderSubTabs(byCategory, allExcluded);
        
        // Content based on current sub-tab
        html += this.renderSubTabContent(byCategory, allExcluded, renderPorts);
        
        html += '</div>';
        
        return html;
    },
    
    renderHorizontalLegend() {
        return `
<div class="panel" style="padding: 16px;">
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <span style="font-size: 16px;">📋</span>
        <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Port Assignment Standards</h3>
    </div>
    
    <div style="display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
        ${Object.entries(this.PORT_RANGES).map(([key, range]) => `
            <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: rgba(255,255,255,0.03); border-radius: 6px; border-left: 3px solid ${range.color};">
                <span style="font-size: 16px;">${range.icon}</span>
                <div>
                    <div style="font-weight: 600; font-size: 12px; color: ${range.color};">${range.label}</div>
                    <div style="font-size: 11px; opacity: 0.7;">
                        ${range.ranges.map(([min, max]) => `${min}-${max}`).join(' / ')}
                    </div>
                </div>
            </div>
        `).join('')}
    </div>
    
    <div style="display: flex; gap: 24px; padding: 8px 12px; background: rgba(88, 166, 255, 0.05); border-radius: 6px; font-size: 11px;">
        <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #39d0d8; font-size: 14px;">●</span>
            <span>Teal = Web UI (HTML)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
            <span style="color: #8b949e; font-size: 14px;">●</span>
            <span>Gray = API / Backend / Game</span>
        </div>
    </div>
</div>
`;
    },
    
    renderProgress(total, standardized, excluded, percentage, byCategory) {
        const remaining = total - standardized - excluded;
        const barWidth = Math.min(percentage, 100);
        
        return `
<div class="panel" style="padding: 16px;">
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <h3 style="margin: 0; font-size: 14px;">📊 Standardization Progress</h3>
        <span style="font-size: 24px; font-weight: 700; color: #3fb950;">${percentage}%</span>
    </div>
    
    <div style="height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; margin-bottom: 12px;">
        <div style="height: 100%; width: ${barWidth}%; background: linear-gradient(90deg, #3fb950, #2ecc71); border-radius: 4px; transition: width 0.3s ease;"></div>
    </div>
    
    <div style="display: flex; gap: 16px; font-size: 12px;">
        <div><strong style="color: #3fb950;">${standardized}</strong> <span style="opacity: 0.7;">Standardized</span></div>
        <div><strong style="color: #ff9966;">${excluded}</strong> <span style="opacity: 0.7;">Excluded</span></div>
        <div><strong style="color: #f85149;">${remaining}</strong> <span style="opacity: 0.7;">Remaining</span></div>
        <div style="margin-left: auto; opacity: 0.7;">
            📱 ${byCategory.apps?.length || 0} Apps • 
            🎮 ${byCategory.games?.length || 0} Games • 
            ⚙️ ${byCategory.system?.length || 0} System
        </div>
    </div>
</div>
`;
    },
    
    renderSubTabs(byCategory, excluded) {
        const tabs = [
            { id: 'apps', label: 'Apps', icon: '📱', count: byCategory.apps?.length || 0, color: '#58a6ff' },
            { id: 'games', label: 'Games', icon: '🎮', count: byCategory.games?.length || 0, color: '#bc8cff' },
            { id: 'system', label: 'System', icon: '⚙️', count: byCategory.system?.length || 0, color: '#ff9966' },
            { id: 'excluded', label: 'Excluded', icon: '🚫', count: excluded.length, color: '#f85149' }
        ];
        
        return `
<div style="display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 2px solid var(--border-color); padding-bottom: 0;">
    ${tabs.map(tab => `
        <button onclick="window.StandardizedTabUI.switchSubTab('${tab.id}')"
                style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 20px;
                    background: ${this.currentSubTab === tab.id ? 'rgba(88, 166, 255, 0.1)' : 'transparent'};
                    border: none;
                    border-bottom: 3px solid ${this.currentSubTab === tab.id ? tab.color : 'transparent'};
                    color: ${this.currentSubTab === tab.id ? tab.color : 'var(--text-secondary)'};
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s ease;
                    margin-bottom: -2px;
                ">
            <span>${tab.icon}</span>
            <span>${tab.label}</span>
            <span style="
                background: ${this.currentSubTab === tab.id ? tab.color : 'var(--bg-tertiary)'};
                color: ${this.currentSubTab === tab.id ? '#fff' : 'var(--text-secondary)'};
                padding: 2px 8px;
                border-radius: 10px;
                font-size: 11px;
            ">${tab.count}</span>
        </button>
    `).join('')}
</div>
`;
    },
    
    renderSubTabContent(byCategory, excluded, renderPorts) {
        switch (this.currentSubTab) {
            case 'apps':
                return this.renderCategoryContent(byCategory.apps || [], 'apps', renderPorts);
            case 'games':
                return this.renderCategoryContent(byCategory.games || [], 'games', renderPorts);
            case 'system':
                return this.renderCategoryContent(byCategory.system || [], 'system', renderPorts);
            case 'excluded':
                return this.renderExcludedContent(excluded, renderPorts);
            default:
                return this.renderCategoryContent(byCategory.apps || [], 'apps', renderPorts);
        }
    },
    
    renderCategoryContent(containers, category, renderPorts) {
        if (containers.length === 0) {
            const info = this.PORT_RANGES[category] || { icon: '❓', label: category };
            return `
<div class="panel" style="text-align: center; padding: 48px 24px;">
    <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">${info.icon}</div>
    <h3 style="margin: 0 0 8px 0; color: var(--text-primary);">No ${info.label} Containers</h3>
    <p style="color: var(--text-secondary); font-size: 13px;">
        No standardized containers in this category yet.
    </p>
</div>
`;
        }
        
        return `
<div class="panel" style="padding: 0; overflow: hidden;">
    <table style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr style="background: var(--bg-tertiary);">
                <th style="padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Container</th>
                <th style="padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Ports</th>
                <th style="padding: 12px 16px; text-align: center; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Status</th>
                <th style="padding: 12px 16px; text-align: center; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Exclude</th>
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
        
        return `
<tr style="border-bottom: 1px solid var(--border-color);" data-container="${container.name}">
    <td style="padding: 12px 16px;">
        <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #3fb950;">✓</span>
            <strong>${container.name}</strong>
        </div>
    </td>
    <td style="padding: 12px 16px;" class="container-ports">
        ${renderPorts(ports, container)}
    </td>
    <td style="padding: 12px 16px; text-align: center;">
        <span style="
            display: inline-block;
            padding: 4px 12px;
            background: rgba(63, 185, 80, 0.1);
            color: #3fb950;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        ">✅ Compliant</span>
    </td>
    <td style="padding: 12px 16px; text-align: center;">
        <input type="checkbox" 
               style="width: 16px; height: 16px; cursor: pointer; accent-color: #ff9966;"
               onchange="window.ExclusionManager.toggle('${container.name}')"
               title="Exclude from automation">
    </td>
</tr>
`;
    },
    
    renderExcludedContent(excluded, renderPorts) {
        if (excluded.length === 0) {
            return `
<div class="panel" style="text-align: center; padding: 48px 24px;">
    <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">✅</div>
    <h3 style="margin: 0 0 8px 0; color: var(--text-primary);">No Excluded Containers</h3>
    <p style="color: var(--text-secondary); font-size: 13px;">
        All standardized containers are included in automation.
    </p>
</div>
`;
        }
        
        return `
<div class="panel" style="border-left: 3px solid #ff9966; padding: 0; overflow: hidden;">
    <div style="padding: 12px 16px; background: rgba(255, 153, 102, 0.05); border-bottom: 1px solid var(--border-color);">
        <p style="margin: 0; font-size: 12px; color: var(--text-secondary);">
            These containers are excluded from automation. <strong>Uncheck to include them again.</strong>
        </p>
    </div>
    <table style="width: 100%; border-collapse: collapse;">
        <thead>
            <tr style="background: var(--bg-tertiary);">
                <th style="padding: 12px 16px; text-align: center; font-size: 11px; text-transform: uppercase; color: var(--text-secondary); width: 80px;">Include</th>
                <th style="padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Container</th>
                <th style="padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Category</th>
                <th style="padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; color: var(--text-secondary);">Ports</th>
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
        const catInfo = this.PORT_RANGES[container.effectiveCategory] || { icon: '❓', color: '#6e7681' };
        
        return `
<tr style="border-bottom: 1px solid var(--border-color); background: rgba(255, 153, 102, 0.02);" data-container="${container.name}">
    <td style="padding: 12px 16px; text-align: center;">
        <input type="checkbox" 
               checked
               style="width: 16px; height: 16px; cursor: pointer; accent-color: #3fb950;"
               onchange="window.ExclusionManager.toggle('${container.name}')"
               title="Click to include in automation">
    </td>
    <td style="padding: 12px 16px;">
        <strong>${container.name}</strong>
    </td>
    <td style="padding: 12px 16px;">
        <span style="color: ${catInfo.color};">${catInfo.icon} ${container.effectiveCategory}</span>
    </td>
    <td style="padding: 12px 16px;" class="container-ports">
        ${renderPorts(ports, container)}
    </td>
</tr>
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
