// ==UserScript==
// @name         Target Discord Drop Test
// @namespace    HootLoot
// @version      1.0
// @description  Test Discord-to-Target cart handoff for one Target item
// @match        https://discord.com/channels/1349910660317843540/1369180056144056321*
// @match        https://www.target.com/p/*/-/A-95279108*
// @grant        GM.setValue
// @grant        GM.getValue
// @inject-into  content
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_T = '95279108';
    const TARGET_URL = 'https://www.target.com/p/-/A-95279108';
    const SIGNAL_KEY = 'hootloot_target_drop_95279108';
    const CHANNEL_URL_PART = '/channels/1349910660317843540/1369180056144056321';

    const isDiscord = location.hostname === 'discord.com' && location.pathname.includes(CHANNEL_URL_PART);
    const isTarget = location.hostname === 'www.target.com' && location.pathname.includes('/A-95279108');

    function addPanel(title, text) {
        const id = 'hootloot-drop-test-panel';
        let panel = document.getElementById(id);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = id;
            panel.style.cssText = [
                'position:fixed',
                'top:12px',
                'left:12px',
                'right:12px',
                'z-index:2147483647',
                'background:#111',
                'color:#fff',
                'border:3px solid #4caf50',
                'border-radius:14px',
                'padding:14px',
                'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
                'font-size:14px',
                'box-shadow:0 8px 30px rgba(0,0,0,.5)'
            ].join(';');
            document.body.appendChild(panel);
        }
        panel.innerHTML = '<b style="font-size:17px">' + title + '</b>' +
            '<div id="hootloot-status" style="margin-top:8px">' + text + '</div>';
        return panel;
    }

    function setStatus(text) {
        const el = document.getElementById('hootloot-status');
        if (el) el.textContent = text;
    }

    function signalDrop(source) {
        GM.setValue(SIGNAL_KEY, {
            token: Date.now(),
            source: source,
            tcin: TARGET_T
        });
        setStatus('DROP SIGNAL SENT — Target tab should react.');
    }

    // ---------------- DISCORD ----------------
    if (isDiscord) {
        const panel = addPanel(
            'Discord → Target TEST',
            'Watching this Discord channel for the test item…'
        );

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'TEST TARGET TRIGGER';
        button.style.cssText = [
            'margin-top:10px',
            'padding:10px 14px',
            'border:0',
            'border-radius:9px',
            'font-weight:700',
            'font-size:14px'
        ].join(';');
        button.addEventListener('click', () => signalDrop('manual test button'));
        panel.appendChild(button);

        const keywords = [
            '95279108',
            'A-95279108',
            'owala',
            'kanto region first partners',
            '840467316197',
            '082-04-4411'
        ];

        const seen = new WeakSet();

        function textOf(el) {
            return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        }

        function markExisting() {
            document.querySelectorAll('li, [data-list-item-id], article').forEach(el => seen.add(el));
        }

        function inspectNode(node) {
            if (!(node instanceof Element)) return;

            const candidates = [node, ...node.querySelectorAll('li, [data-list-item-id], article')];

            for (const el of candidates) {
                if (seen.has(el)) continue;
                seen.add(el);

                const text = textOf(el);
                if (!text) continue;

                const isItem = keywords.some(k => text.includes(k.toLowerCase()));
                if (isItem) {
                    signalDrop('new Discord message matched item');
                    return;
                }
            }
        }

        setTimeout(() => {
            markExisting();
            setStatus('WATCHING — test item: Owala Pokémon Kanto First Partners (TCIN ' + TARGET_T + ')');

            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        inspectNode(node);
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }, 2000);
    }

    // ---------------- TARGET ----------------
    if (isTarget) {
        addPanel(
            'Target Cart Test',
            'Waiting for a Discord drop signal for TCIN ' + TARGET_T + '…'
        );

        let lastToken = null;
        let busy = false;

        function findAddButton() {
            const buttons = [...document.querySelectorAll('button')];
            return buttons.find(button => {
                const text = (button.innerText || button.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .toLowerCase();

                return text === 'add to cart' ||
                    text === 'add to cart.' ||
                    text.includes('add to cart');
            });
        }

        async function handleSignal(signal) {
            if (!signal || signal.tcin !== TARGET_T || signal.token === lastToken || busy) return;

            lastToken = signal.token;
            busy = true;
            setStatus('DROP DETECTED — looking for Add to cart…');

            let button = null;

            for (let i = 0; i < 20 && !button; i++) {
                button = findAddButton();
                if (!button) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            if (!button) {
                setStatus('DROP DETECTED, but Add to cart was not found. No purchase was made.');
                busy = false;
                return;
            }

            button.scrollIntoView({ block: 'center', behavior: 'instant' });
            setStatus('DROP DETECTED — clicking Add to cart…');

            // One normal page click only. No checkout or purchase steps.
            button.click();

            setTimeout(() => {
                setStatus('ADD TO CART CLICKED — STOPPED. Check your cart.');
                busy = false;
            }, 1200);
        }

        async function poll() {
            try {
                const signal = await GM.getValue(SIGNAL_KEY, null);
                await handleSignal(signal);
            } catch (error) {
                setStatus('GM storage error: ' + error.message);
            }
        }

        setInterval(poll, 500);
        poll();
    }
})();
