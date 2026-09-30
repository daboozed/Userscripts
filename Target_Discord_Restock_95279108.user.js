// ==UserScript==
// @name         Target Discord Restock Monitor - 95279108
// @namespace    HootLoot
// @version      1.3
// @description  Monitor Discord for Target 95279108 and add it from Favorites
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
    const CHANNEL_PATH = '/channels/1349910660317843540/1369180056144056321';
    const SIGNAL_KEY = 'hootloot_target_drop_' + TCIN;
    const HEARTBEAT_KEY = 'hootloot_discord_heartbeat_' + TCIN;
    const EVENT_KEY = 'hootloot_target_event_' + TCIN;

    const isDiscord = location.hostname === 'discord.com' && location.pathname.includes(CHANNEL_PATH);
    const isFavorites = location.hostname === 'www.target.com' && location.pathname.includes('/lists/favorites');
    const isProduct = location.hostname === 'www.target.com' && location.pathname.includes('/A-' + TCIN);

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
        p.innerHTML = '<b style="font-size:16px">Target 95279108 Monitor</b>' +
            '<div id="hootloot-status" style="margin-top:7px">' + text + '</div>';
    }

    function setStatus(text) {
        const el = document.getElementById('hootloot-status');
        if (el) el.textContent = text;
    }

    async function sendSignal(reason) {
        const token = Date.now();
        await GM.setValue(SIGNAL_KEY, { token, tcin: TCIN, reason });
        await GM.setValue(EVENT_KEY, { token, type: 'drop', reason, time: Date.now() });
        setStatus('DROP SIGNAL SENT — ' + reason);
    }

    // ---------------- DISCORD ----------------
    if (isDiscord) {
        panel('Starting Discord monitor…');

        const seenTexts = new Set();
        let lastActivity = Date.now();

        async function heartbeat(note) {
            await GM.setValue(HEARTBEAT_KEY, {
                time: Date.now(),
                note: note || 'watching',
                channel: CHANNEL_PATH
            });
        }

        function textOf(el) {
            return (el.innerText || el.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
        }

        function matchesDrop(text) {
            // Exact TCIN/Target ID is a definitive match.
            if (text.includes(TCIN) || text.includes(PRODUCT_ID)) return true;

            // Product name + an availability/drop phrase.
            const productWords = ['owala', 'kanto', 'first partners', 'pokemon'];
            const dropWords = [
                'restock', 'restocked', 'available', 'in stock',
                'back in stock', 'live', 'drop', 'dropped', 'up'
            ];

            return productWords.some(w => text.includes(w)) &&
                   dropWords.some(w => text.includes(w));
        }

        function scanMessages() {
            const nodes = document.querySelectorAll(
                'li, article, [data-list-item-id], [role="listitem"], [class*="message"]'
            );

            for (const el of nodes) {
                const text = textOf(el);
                if (!text || text.length > 2000) continue;

                // Only evaluate each exact visible message text once.
                if (seenTexts.has(text)) continue;
                seenTexts.add(text);

                lastActivity = Date.now();
                if (matchesDrop(text)) {
                    sendSignal('Discord message matched 95279108');
                    return;
                }
            }

            // Keep memory bounded.
            if (seenTexts.size > 1000) seenTexts.clear();
        }

        setTimeout(() => {
            heartbeat('monitor started');
            panel('🟢 DISCORD MONITORING — scanning channel');

            // IMPORTANT: periodic scanning catches Discord virtual-DOM updates
            // that don't reliably appear as simple MutationObserver additions.
            scanMessages();
            setInterval(() => {
                scanMessages();
                heartbeat('heartbeat');
            }, 1000);

            // Also observe major page changes for faster reaction.
            const observer = new MutationObserver(() => scanMessages());
            observer.observe(document.body, { childList: true, subtree: true });
        }, 2000);
    }

    // ---------------- TARGET FAVORITES ----------------
    if (isFavorites) {
        panel('Checking Discord monitor…');
        let lastToken = null;
        let working = false;

        async function discordStatus() {
            const hb = await GM.getValue(HEARTBEAT_KEY, null);
            if (!hb || !hb.time) {
                setStatus('🔴 DISCORD NOT CONNECTED — open the Discord channel');
                return;
            }

            const age = Date.now() - hb.time;
            if (age < 15000) {
                setStatus('🟢 DISCORD ACTIVE — last heartbeat ' + Math.round(age / 1000) + 's ago');
            } else if (age < 60000) {
                setStatus('🟡 DISCORD STALE — last heartbeat ' + Math.round(age / 1000) + 's ago');
            } else {
                setStatus('🔴 DISCORD STOPPED — last heartbeat ' + Math.round(age / 1000) + 's ago');
            }
        }

        function findFavoriteCard() {
            const links = [...document.querySelectorAll('a[href]')];
            const link = links.find(a => {
                const href = a.href || '';
                return href.includes('/A-' + TCIN);
            });

            if (!link) return null;

            // Find the product-card container around the exact product link.
            return link.closest(
                'article, li, [role="listitem"], [data-test], [class*="ProductCard"], [class*="product-card"]'
            ) || link.parentElement?.parentElement?.parentElement || link.parentElement;
        }

        function findCartButton(card) {
            if (!card) return null;

            const buttons = [...card.querySelectorAll('button')];

            return buttons.find(button => {
                if (button.disabled) return false;
                const text = (button.innerText || button.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                return text === 'add to cart' ||
                       text.includes('add to cart');
            }) || null;
        }

        async function addFromFavorites() {
            if (working) return;
            working = true;

            setStatus('DROP DETECTED — finding 95279108 in Favorites…');

            // Stay on Favorites. Do NOT navigate to the product page.
            let card = null;
            let button = null;

            for (let i = 0; i < 20 && !button; i++) {
                card = findFavoriteCard();
                button = findCartButton(card);

                if (!button) {
                    await new Promise(r => setTimeout(r, 500));
                }
            }

            if (!button) {
                panel(
                    'DROP DETECTED, but Add to cart was not found on the 95279108 Favorites card. No purchase was made.',
                    false
                );
                working = false;
                return;
            }

            button.scrollIntoView({ block: 'center', behavior: 'instant' });
            setStatus('DROP DETECTED — clicking Favorites Add to cart once…');

            // One normal Target UI click. No checkout/payment.
            button.click();

            await GM.setValue(EVENT_KEY, {
                token: Date.now(),
                type: 'cart_clicked',
                tcin: TCIN,
                time: Date.now()
            });

            setTimeout(() => {
                setStatus('ADD TO CART CLICKED — STOPPED. Check your cart.');
                working = false;
            }, 1500);
        }

        async function poll() {
            try {
                const signal = await GM.getValue(SIGNAL_KEY, null);

                if (signal && signal.tcin === TCIN && signal.token !== lastToken) {
                    lastToken = signal.token;
                    await addFromFavorites();
                    return;
                }

                await discordStatus();
            } catch (e) {
                setStatus('Error: ' + e.message);
            }
        }

        // Poll continuously; no Target refresh is required.
        setInterval(poll, 1000);
        poll();
    }

    // Product-page match is intentionally informational only.
    // The requested workflow stays on Favorites and clicks its Add to cart button.
    if (isProduct) {
        panel('This script uses the Favorites card for 95279108. Return to Target Favorites.');
    }
})();