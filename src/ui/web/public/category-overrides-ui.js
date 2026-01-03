/**
 * ============================================================================
 * CategoryOverridesUI
 * Location: src/ui/web/public/category-overrides-ui.js
 *
 * Responsibility:
 * - Manage UI-only category overrides
 * - Persist overrides via API
 * - Expose override selector
 *
 * HARD RULES:
 * - UI only
 * - No planner logic
 * ============================================================================
 */

"use strict";

const CategoryOverridesUI = {
    categoryOverrides: {},

    async loadPersistedOverrides() {
        try {
            const res = await fetch("/api/overrides/category");
            if (!res.ok) return;

            const data = await res.json();

            // Flatten persisted structure
            for (const [name, obj] of Object.entries(data || {})) {
                if (obj?.category) {
                    CategoryOverridesUI.categoryOverrides[name] = obj.category;
                }
            }
        } catch {
            // non-fatal
        }
    },

    async persistOverrides() {
        try {
            await fetch("/api/overrides/category", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(CategoryOverridesUI.categoryOverrides)
            });
        } catch {
            // non-fatal
        }
    },

    openCategoryOverride(containerName, ev) {
        const categories = ["apps", "games", "system", "unknown"];

        const select = document.createElement("select");
        select.innerHTML = `
<option value="">(auto)</option>
${categories.map(c => `<option value="${c}">${c}</option>`).join("")}
`;

        select.value =
            CategoryOverridesUI.categoryOverrides[containerName] || "";

        select.onchange = async () => {
            if (select.value) {
                CategoryOverridesUI.categoryOverrides[containerName] =
                    select.value;
            } else {
                delete CategoryOverridesUI.categoryOverrides[containerName];
            }

            await CategoryOverridesUI.persistOverrides();

            if (typeof window.render === "function") {
                window.render();
            }
        };

        const target = ev?.target;
        if (target && typeof target.replaceWith === "function") {
            target.replaceWith(select);
        }

        select.focus();
    }
};

/* ============================================================================
   Global export (AFTER definition — REQUIRED)
============================================================================ */

window.CategoryOverridesUI = CategoryOverridesUI;
