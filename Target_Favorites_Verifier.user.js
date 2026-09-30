// ==UserScript==
// @name         Target Favorites Verifier
// @namespace    HootLoot
// @version      1.0
// @description  Read-only verifier for your Target Favorites page
// @match        https://www.target.com/lists/favorites*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'target-favorites-verifier';

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function scanFavorites() {
        const results = new Map();

        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.href;
            const match = href.match(/\/p\/[^/]+\/-\/(A-\d+)/i);
            if (!match) return;

            const id = match[1].toUpperCase();
            let name = a.innerText.trim();

            if (!name || name.length < 3) {
                const card = a.closest('article, li, [role="listitem"]');
                if (card) name = card.innerText.replace(/\s+/g, ' ').trim();
            }

            name = name
                .replace(/Add to cart/gi, '')
                .replace(/Remove from favorites/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!name) name = '(name not detected)';

            results.set(id, {
                id,
                name,
                url: href.split('?')[0]
            });
        });

        return [...results.values()];
    }

    function render() {
        let panel = document.getElementById(PANEL_ID);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.style.cssText = `
                position:fixed;
                top:12px;
                left:12px;
                right:12px;
                max-height:70vh;
                overflow:auto;
                z-index:2147483647;
                background:#111;
                color:#fff;
                border:3px solid #4caf50;
                border-radius:14px;
                padding:14px;
                font-family:-apple-system,BlinkMacSystemFont,sans-serif;
                font-size:14px;
                box-shadow:0 8px 30px rgba(0,0,0,.5);
            `;
            document.body.appendChild(panel);
        }

        const items = scanFavorites();

        panel.innerHTML = `
            <div style="font-size:18px;font-weight:700;margin-bottom:8px">
                Target Favorites Verifier
            </div>
            <div style="margin-bottom:12px">
                Items detected: <strong>${items.length}</strong>
            </div>
            ${items.length ? items.map((item, i) => `
                <div style="border-top:1px solid #444;padding:9px 0">
                    <strong>${i + 1}. ${escapeHtml(item.name)}</strong>
                    <div style="color:#aaa;margin-top:3px">${item.id}</div>
                    <div style="color:#6cb6ff;font-size:11px;word-break:break-all;margin-top:3px">
                        ${escapeHtml(item.url)}
                    </div>
                </div>
            `).join('') : '<div>No Target product links detected yet.</div>'}
            <div style="margin-top:12px;padding-top:8px;border-top:1px solid #444;color:#aaa;font-size:11px">
                READ-ONLY — this script does not add, remove, or purchase anything.
            </div>
        `;
    }

    setTimeout(render, 1500);

    const observer = new MutationObserver(() => {
        clearTimeout(window.__targetFavScan);
        window.__targetFavScan = setTimeout(render, 500);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
