// ==UserScript==
// @name         Target Discord Restock Monitor - 95279108
// @namespace    HootLoot
// @version      1.1
// @description  Monitor one Discord channel for a Target drop and add one favorite item to cart
// @match        https://discord.com/channels/1349910660317843540/1369180056144056321*
// @match        https://www.target.com/lists/favorites*
// @match        https://www.target.com/p/*/-/A-95279108*
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const TCIN = '95279108';
    const PRODUCT_ID = 'A-' + TCIN;
    const TARGET_URL = 'https://www.target.com/p/-/A-' + TCIN;
    const CHANNEL_PATH = '/channels/1349910660317843540/1369180056144056321';
    const SIGNAL_KEY = 'hootloot_target_drop_' + TCIN;
    const KEYWORDS = [
        TCIN,
        PRODUCT_ID,
        '95279108',
        'owala',
        'kanto',
        'first partners',
        'pokemon',
        'restock',
        'available',
        'in stock',
        'live',
        'drop'
    ];

    const isDiscord = location.hostname === 'discord.com' &&
        location.pathname.includes(CHANNEL_PATH);

    const isTarget = location.hostname === 'www.target.com' &&
        (location.pathname.includes('/A-' + TCIN) ||
         location.pathname.includes('/lists/favorites'));

    function panel(text, ok = true) {
        const id = 'hootloot-' + TCIN + '-panel';
        let p = document.getElementById(id);

        if (!p) {
            p = document.createElement('div');
            p.id = id;
            p.style.cssText =
                'position:fixed;top:12px;left:12px;right:12px;z-index:2147483647;' +
                'background:#111;color:#fff;border:3px solid ' + (ok ? '#4caf50' : '#f44336') + ';' +
                'border-radius:14px;padding:12px;font:14px -apple-system,BlinkMacSystemFont,sans-serif;' +
                'box-shadow:0 8px 30px rgba(0,0,0,.5)';
            document.body.appendChild(p);
        }

        p.innerHTML =
            '<b style="font-size:16px">Target 95279108 Monitor</b>' +
            '<div style="margin-top:7px">' + text + '</div>';
    }

    async function sendSignal(reason) {
        await GM.setValue(SIGNAL_KEY, {
            token: Date.now(),
            tcin: TCIN,
            reason: reason
        });
        panel('DROP SIGNAL SENT — ' + reason);
    }

    // ---------- DISCORD ----------
    if (isDiscord) {
        panel('Watching this Discord channel for Target ' + PRODUCT_ID + '…');

        let started = false;
        const seen = new WeakSet();

        function normalizedText(el) {
            return (el.innerText || el.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        function matchesDrop(text) {
            // Exact product identifiers are sufficient.
            if (text.includes(TCIN) || text.includes(PRODUCT_ID)) return true;

            // Require a product-related term plus an availability/drop term.
            const productWords = ['owala', 'kanto', 'first partners', 'pokemon'];
            const dropWords = ['restock', 'available', 'in stock', 'live', 'drop', 'back'];
            return productWords.some(w => text.includes(w)) &&
                   dropWords.some(w => text.includes(w));
        }

        function inspect(el) {
            if (!(el instanceof Element) || seen.has(el)) return;
            seen.add(el);

            const text = normalizedText(el);
            if (!text) return;

            if (matchesDrop(text)) {
                sendSignal('Discord message matched the monitored item');
            }
        }

        function scanAddedNodes(nodes) {
            for (const node of nodes) {
                if (!(node instanceof Element)) continue;
                inspect(node);

                node.querySelectorAll(
                    'li, article, [data-list-item-id], [class*="message"], [role="listitem"]'
                ).forEach(inspect);
            }
        }

        setTimeout(() => {
            started = true;

            const observer = new MutationObserver(mutations => {
                if (!started) return;
                for (const mutation of mutations) {
                    scanAddedNodes(mutation.addedNodes);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            panel('WATCHING — Target ' + PRODUCT_ID + ' in this Discord channel.');
        }, 2000);
    }

    // ---------- TARGET ----------
    if (isTarget) {
        panel('Waiting for a Discord drop signal for Target ' + PRODUCT_ID + '…');

        let lastToken = null;
        let working = false;

        function findAddToCart() {
            const buttons = [...document.querySelectorAll('button')];

            return buttons.find(button => {
                if (button.disabled) return false;

                const text = (button.innerText || button.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                return text === 'add to cart' || text.includes('add to cart');
            });
        }

        async function openProductAndCart() {
            if (working) return;
            working = true;

            panel('DROP DETECTED — opening Target product…');

            // If we're on Favorites, open the exact product in this tab.
            if (!location.pathname.includes('/A-' + TCIN)) {
                location.href = TARGET_URL;
                return;
            }

            let button = null;

            for (let i = 0; i < 30; i++) {
                button = findAddToCart();

                if (button) break;

                await new Promise(resolve => setTimeout(resolve, 500));
            }

            if (!button) {
                panel('DROP DETECTED, but Target did not expose Add to cart. No purchase was made.', false);
                working = false;
                return;
            }

            button.scrollIntoView({ block: 'center', behavior: 'instant' });

            panel('DROP DETECTED — clicking Add to cart once…');

            // One normal Target UI click only.
            button.click();

            setTimeout(() => {
                panel('ADD TO CART CLICKED — STOPPED. Check your cart.');
                working = false;
            }, 1500);
        }

        async function poll() {
            try {
                const signal = await GM.getValue(SIGNAL_KEY, null);

                if (!signal || signal.tcin !== TCIN || signal.token === lastToken) {
                    return;
                }

                lastToken = signal.token;
                await openProductAndCart();
            } catch (e) {
                panel('Error reading drop signal: ' + e.message, false);
            }
        }

        setInterval(poll, 500);
        poll();
    }
})();
