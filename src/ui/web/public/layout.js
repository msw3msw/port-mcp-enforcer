/**
 * ============================================================================
 * Port-MCP Enforcer — Layout Engine (UI-ONLY) - POLISHED
 * Location: src/ui/web/public/layout.js
 *
 * Responsibility:
 * - Page layout (left/right split)
 * - Scrollable container list
 * - Sticky control panel
 * - Table polish + semantic coloring
 *
 * HARD RULES:
 * - NO data access
 * - NO fetch
 * - NO planner/executor logic
 * - NO event binding
 * - Presentation only
 * ============================================================================
 */

"use strict";

(function () {
    /* =========================================================================
       Inject scoped CSS (layout + semantic polish)
    ========================================================================= */

    const style = document.createElement("style");
    style.type = "text/css";
    style.textContent = `
/* =========================
   CSS Variables
========================= */

:root {
  --bg-primary: #0a0e14;
  --bg-secondary: #151b23;
  --bg-tertiary: #1e2731;
  --bg-hover: #242c38;
  --border-color: #2d3748;
  --border-accent: #3a4556;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  
  --accent-blue: #58a6ff;
  --accent-purple: #bc8cff;
  --accent-green: #3fb950;
  --accent-yellow: #d29922;
  --accent-red: #f85149;
  --accent-teal: #39d0d8;
  --accent-orange: #ff9966;
  
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.4);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.5);
}

/* =========================
   Tab Bar
========================= */

.tab-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 0;
}

.tab-button {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 3px solid transparent;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  margin-bottom: -2px;
}

.tab-button:hover {
  color: var(--text-primary);
  background: rgba(88, 166, 255, 0.05);
}

.tab-button.active {
  color: var(--accent-blue);
  border-bottom-color: var(--accent-blue);
  background: rgba(88, 166, 255, 0.1);
}

.tab-icon {
  font-size: 18px;
}

.tab-label {
  font-size: 14px;
}

/* =========================
   History View
========================= */

.history-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.category-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  box-shadow: var(--shadow-sm);
}

.category-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 16px 0;
  padding-left: 16px;
  border-left: 4px solid var(--accent-blue);
  font-size: 14px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-primary);
}

.category-icon {
  font-size: 20px;
}

.category-count {
  margin-left: auto;
  background: rgba(88, 166, 255, 0.15);
  color: var(--accent-blue);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.changes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Change Cards */
.change-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s ease;
}

.change-card:hover {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-md);
  transform: translateX(4px);
}

.change-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.change-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.change-title strong {
  font-size: 15px;
  color: var(--text-primary);
}

.change-time {
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(88, 166, 255, 0.1);
  padding: 3px 8px;
  border-radius: 10px;
}

.change-actions {
  display: flex;
  gap: 8px;
}

.btn-rollback {
  background: linear-gradient(135deg, var(--accent-orange), #e88654);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
}

.btn-rollback:hover {
  background: linear-gradient(135deg, #ffaa77, #f79666);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.rollback-disabled {
  color: var(--accent-green);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  background: rgba(63, 185, 80, 0.1);
  border-radius: 6px;
  border: 1px solid rgba(63, 185, 80, 0.3);
}

.change-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.port-change {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.port-label {
  color: var(--text-secondary);
  font-weight: 600;
  min-width: 100px;
}

.port-from {
  color: var(--accent-red);
  font-weight: 600;
  padding: 4px 8px;
  background: rgba(248, 81, 73, 0.1);
  border-radius: 4px;
}

.port-arrow {
  color: var(--text-muted);
  font-size: 16px;
}

.port-to {
  color: var(--accent-green);
  font-weight: 600;
  padding: 4px 8px;
  background: rgba(63, 185, 80, 0.1);
  border-radius: 4px;
}

/* Change History Expansion */
.change-history-toggle {
  margin-top: 8px;
  padding: 8px;
  text-align: center;
  cursor: pointer;
  color: var(--accent-blue);
  font-size: 12px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.change-history-toggle:hover {
  background: rgba(88, 166, 255, 0.1);
}

.change-history {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.change-history.expanded {
  max-height: 500px;
  margin-top: 12px;
}

.old-change {
  padding: 8px 12px;
  margin: 4px 0;
  background: var(--bg-primary);
  border-left: 3px solid var(--border-accent);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.old-change-time {
  color: var(--text-muted);
  margin-right: 12px;
  font-weight: 600;
}

/* =========================
   Base Layout
========================= */

.layout-root {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 24px;
  align-items: start;
  max-width: 1800px;
  margin: 0 auto;
}

@media (max-width: 1200px) {
  .layout-root {
    grid-template-columns: 1fr;
  }
  
  .layout-right {
    order: -1;
  }
}

/* Left pane: scrollable container list */
.layout-left {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  overflow-x: hidden;
}

/* Right pane: sticky controls */
.layout-right {
  position: sticky;
  top: 100px;
}

/* =========================
   Panels
========================= */

.panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.panel:hover {
  border-color: var(--border-accent);
  box-shadow: var(--shadow-md);
}

.panel h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: -0.3px;
}

.panel h3::before {
  content: "";
  width: 4px;
  height: 20px;
  background: linear-gradient(180deg, var(--accent-blue), var(--accent-purple));
  border-radius: 2px;
}

/* =========================
   Table Polish
========================= */

table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 13px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-secondary);
  box-shadow: var(--shadow-md);
}

thead th {
  position: sticky;
  top: 0;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  z-index: 2;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.5px;
  padding: 14px 12px;
  text-align: left;
  border-bottom: 2px solid var(--border-accent);
}

thead th:first-child {
  border-top-left-radius: 12px;
}

thead th:last-child {
  border-top-right-radius: 12px;
}

th, td {
  padding: 12px;
  vertical-align: middle;
  border-bottom: 1px solid var(--border-color);
}

tbody tr {
  transition: all 0.15s ease;
  background: var(--bg-secondary);
}

tbody tr:hover {
  background: var(--bg-hover);
  transform: scale(1.002);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

tbody tr:last-child td {
  border-bottom: none;
}

tbody tr:last-child td:first-child {
  border-bottom-left-radius: 12px;
}

tbody tr:last-child td:last-child {
  border-bottom-right-radius: 12px;
}

/* =========================
   Category Accents
========================= */

/* Left border accent by category */
tr[data-category="system"] td:first-child {
  border-left: 3px solid var(--accent-orange);
  box-shadow: inset 3px 0 6px rgba(255, 153, 102, 0.1);
}

tr[data-category="apps"] td:first-child {
  border-left: 3px solid var(--accent-blue);
  box-shadow: inset 3px 0 6px rgba(88, 166, 255, 0.1);
}

tr[data-category="games"] td:first-child {
  border-left: 3px solid var(--accent-purple);
  box-shadow: inset 3px 0 6px rgba(188, 140, 255, 0.1);
}

tr[data-category="unknown"] td:first-child {
  border-left: 3px solid var(--accent-red);
  box-shadow: inset 3px 0 6px rgba(248, 81, 73, 0.1);
}

/* Category text colors */
tr[data-category="system"] td:nth-child(3) {
  color: var(--accent-orange);
  font-weight: 600;
}

tr[data-category="apps"] td:nth-child(3) {
  color: var(--accent-blue);
  font-weight: 600;
}

tr[data-category="games"] td:nth-child(3) {
  color: var(--accent-purple);
  font-weight: 600;
}

tr[data-category="unknown"] td:nth-child(3) {
  color: var(--accent-red);
  font-weight: 600;
}

/* =========================
   Confidence Coloring
========================= */

.conf-high {
  color: var(--accent-green);
  font-weight: 600;
  text-shadow: 0 0 8px rgba(63, 185, 80, 0.3);
}

.conf-med {
  color: var(--accent-yellow);
  font-weight: 600;
}

.conf-low {
  color: var(--accent-red);
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
}

.conf-low:hover {
  color: #ff6b6b;
}

/* =========================
   Status Pills
========================= */

.status-ok {
  color: var(--accent-green);
  font-weight: 600;
  padding: 4px 10px;
  background: rgba(63, 185, 80, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(63, 185, 80, 0.2);
  display: inline-block;
}

.status-plan, .status-warn {
  color: var(--accent-yellow);
  font-weight: 600;
  padding: 4px 10px;
  background: rgba(210, 153, 34, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(210, 153, 34, 0.2);
  display: inline-block;
}

.status-error {
  color: var(--accent-red);
  font-weight: 600;
  padding: 4px 10px;
  background: rgba(248, 81, 73, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(248, 81, 73, 0.2);
  display: inline-block;
}

.status-info {
  color: var(--accent-teal);
  font-weight: 600;
  padding: 4px 10px;
  background: rgba(57, 208, 216, 0.1);
  border-radius: 12px;
  border: 1px solid rgba(57, 208, 216, 0.2);
  display: inline-block;
}

/* =========================
   Port Links
========================= */

td:nth-child(5) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.6;
}

td:nth-child(5) a {
  color: var(--accent-teal);
  text-decoration: none;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.15s ease;
  display: inline-block;
}

td:nth-child(5) a:hover {
  background: rgba(57, 208, 216, 0.15);
  color: #5aeaf2;
  transform: translateX(2px);
}

/* =========================
   Checkboxes
========================= */

.apply-box {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--accent-blue);
  transition: all 0.2s ease;
}

.apply-box:hover {
  transform: scale(1.1);
}

/* =========================
   Gates / Actions
========================= */

.gates {
  border: 1px solid var(--border-accent);
  border-radius: 8px;
  padding: 16px;
  background: var(--bg-tertiary);
  margin-bottom: 16px;
}

.gates label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  color: var(--text-primary);
  cursor: pointer;
  transition: color 0.2s ease;
}

.gates label:hover {
  color: var(--accent-blue);
}

.gates input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-blue);
  cursor: pointer;
}

.gates input[type="text"] {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s ease;
}

.gates input[type="text"]:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.1);
}

.gates input[type="text"]::placeholder {
  color: var(--text-muted);
  font-size: 11px;
}

/* =========================
   Rollback Panel
========================= */

.rollback-panel {
  border-left: 4px solid var(--accent-orange);
  background: linear-gradient(90deg, rgba(255, 153, 102, 0.05), transparent);
}

.rollback-panel h3::before {
  background: var(--accent-orange);
}

/* =========================
   Smooth Scrolling
========================= */

.layout-left::-webkit-scrollbar {
  width: 10px;
}

.layout-left::-webkit-scrollbar-track {
  background: var(--bg-primary);
  border-radius: 5px;
}

.layout-left::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 5px;
  border: 2px solid var(--bg-primary);
}

.layout-left::-webkit-scrollbar-thumb:hover {
  background: var(--border-accent);
}

/* =========================
   Loading States
========================= */

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.loading {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* =========================
   Tooltips (Title Attributes)
========================= */

[title] {
  cursor: help;
  position: relative;
}

/* =========================
   Responsive
========================= */

@media (max-width: 768px) {
  table {
    font-size: 12px;
  }
  
  th, td {
    padding: 8px 6px;
  }
  
  .panel {
    padding: 16px;
  }
}
`;
    document.head.appendChild(style);

    /* =========================================================================
       Public API
    ========================================================================= */

    function render(slots) {
        const left = slots && slots.left ? slots.left : "";
        const right = slots && slots.right ? slots.right : "";

        return `
<div class="layout-root">
  <div class="layout-left">
    ${left}
  </div>
  <div class="layout-right">
    ${right}
  </div>
</div>
`;
    }

    window.Layout = { render };
})();
