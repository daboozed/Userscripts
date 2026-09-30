// ==UserScript==
// @name         Target Discord Restock Monitor - 95279108
// @namespace    HootLoot
// @version      1.2
// @description  Monitor one Discord channel for a Target drop, show Discord heartbeat on Target, and add one item to cart
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
    const HEARTBEAT_KEY = 'hootloot_discord_heartbeat_' + TCIN;
    const KEYWORDS = ['95279108','A-95279108','owala','kanto','first partners','pokemon'];

    const isDiscord = location.hostname === 'discord.com' && location.pathname.includes(CHANNEL_PATH);
    const isTarget = location.hostname === 'www.target.com' &&
        (location.pathname.includes('/A-' + TCIN) || location.pathname.includes('/lists/favorites'));

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
        p.innerHTML = '<b style="font-size:16px">Target 95279108 Monitor</b><div id="hootloot-status" style="margin-top:7px">' + text + '</div>';
    }

    function setStatus(text) {
        const el = document.getElementById('hootloot-status');
        if (el) el.textContent = text;
    }

    async function sendSignal(reason) {
        await GM.setValue(SIGNAL_KEY, { token: Date.now(), tcin: TCIN, reason });
        setStatus('DROP SIGNAL SENT — ' + reason);
    }

    // DISCORD: heartbeat + new-message monitoring
    if (isDiscord) {
        panel('Starting Discord monitor…');
        const seen = new WeakSet();

        async function heartbeat(note) {
            await GM.setValue(HEARTBEAT_KEY, { time: Date.now(), note: note || 'watching' });
        }

        function normalizedText(el) {
            return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        }

        function matchesDrop(text) {
            if (text.includes(TCIN) || text.includes(PRODUCT_ID)) return true;
            const productWords = ['owala','kanto','first partners','pokemon'];
            const dropWords = ['restock','available','in stock','live','drop','back'];
            return productWords.some(w => text.includes(w)) && dropWords.some(w => text.includes(w));
        }

        function inspect(el) {
            if (!(el instanceof Element) || seen.has(el)) return;
            seen.add(el);
            const text = normalizedText(el);
            if (!text) return;
            heartbeat('message activity seen');
            if (matchesDrop(text)) sendSignal('Discord message matched the monitored item');
        }

        setTimeout(() => {
            heartbeat('monitor started');
            panel('🟢 DISCORD MONITORING — heartbeat active');
            setInterval(() => heartbeat('heartbeat'), 5000);

            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (!(node instanceof Element)) continue;
                        inspect(node);
                        node.querySelectorAll('li, article, [data-list-item-id], [class*="message"], [role="listitem"]').forEach(inspect);
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }, 2000);
    }

    // TARGET: heartbeat status + cart action
    if (isTarget) {
        panel('Checking Discord monitor…');
        let lastToken = null;
        let working = false;

        function findAddToCart() {
            return [...document.querySelectorAll('button')].find(button => {
                if (button.disabled) return false;
                const text = (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                return text === 'add to cart' || text.includes('add to cart');
            });
        }

        async function checkDiscordStatus() {
            try {
                const hb = await GM.getValue(HEARTBEAT_KEY, null);
                if (!hb || !hb.time) {
                    setStatus('🔴 DISCORD MONITOR NOT SEEN — open the Discord channel');
                    return;
                }
                const age = Date.now() - hb.time;
                if (age < 15000) {
                    setStatus('🟢 DISCORD MONITOR ACTIVE — last heartbeat ' + Math.round(age / 1000) + 's ago');
                } else if (age < 60000) {
                    setStatus('🟡 DISCORD MONITOR STALE — last heartbeat ' + Math.round(age / 1000) + 's ago');
                } else {
                    setStatus('🔴 DISCORD MONITOR APPEARS STOPPED — last heartbeat ' + Math.round(age / 1000) + 's ago');
                }
            } catch (e) {
                setStatus('🔴 Could not read Discord heartbeat: ' + e.message);
            }
        }

        async function openProductAndCart() {
            if (working) return;
            working = true;
            setStatus('DROP DETECTED — opening Target product…');

            if (!location.pathname.includes('/A-' + TCIN)) {
                location.href = TARGET_URL;
                return;
            }

            let button = null;
            for (let i = 0; i < 30 && !button; i++) {
                button = findAddToCart();
                if (!button) await new Promise(r => setTimeout(r, 500));
            }

            if (!button) {
                panel('DROP DETECTED, but Add to cart was not found. No purchase was made.', false);
                working = false;
                return;
            }

            button.scrollIntoView({ block: 'center', behavior: 'instant' });
            setStatus('DROP DETECTED — clicking Add to cart once…');
            button.click();

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
                    await openProductAndCart();
                    return;
                }
                await checkDiscordStatus();
            } catch (e) {
                setStatus('Error: ' + e.message);
            }
        }

        setInterval(poll, 3000);
        poll();
    }
})();