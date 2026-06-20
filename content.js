if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .pagination-btn { cursor: pointer; padding: 2px 6px; border: 1px solid #555; background: #333; color: #fff; border-radius: 4px; font-size: 11px; }
        .pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
}

let isInjecting = false, debounceTimer, lastProcessedHash = null, showLogs = false, lastUrl = location.href, lastShortcutKey = null, shortcutTimer = null;
let keyBindings = { '1': 0, '2': 1, '3': 2, '4': 3 };

function loadBindings() {
    chrome.storage.sync.get(['k1', 'k2', 'k3', 'k4', 'showLogs'], (res) => {
        keyBindings = { [res.k1 || '1']: 0, [res.k2 || '2']: 1, [res.k3 || '3']: 2, [res.k4 || '4']: 3 };
        showLogs = res.showLogs || false;
    });
}
loadBindings();
chrome.storage.onChanged.addListener(loadBindings);

document.addEventListener('keydown', (e) => {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (!inputArea || (inputArea.innerText || inputArea.value || '').trim().length > 0) return;
    const key = e.key;
    if (keyBindings.hasOwnProperty(key)) {
        if (key === lastShortcutKey) {
            clearTimeout(shortcutTimer); lastShortcutKey = null;
            triggerButton(keyBindings[key]); e.preventDefault();
        } else {
            clearTimeout(shortcutTimer); lastShortcutKey = key;
            shortcutTimer = setTimeout(() => { lastShortcutKey = null; }, 1000);
        }
    }
});

function triggerButton(index) {
    const btns = document.getElementById('gemini-ext-buttons')?.querySelectorAll('button');
    if (btns && btns[index]) {
        const cleanText = btns[index].textContent.replace(/^\[.\]\s+/, '');
        const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
        inputArea.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, cleanText);
        inputArea.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => document.querySelector('button[aria-label="Send message"]')?.click(), 100);
    }
}

function hashCode(str) { let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; } return hash.toString(); }

const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) { lastUrl = location.href; lastProcessedHash = null; const c = document.getElementById('gemini-ext-container'); if (c) c.remove(); }
    if (isInjecting) return; clearTimeout(debounceTimer); debounceTimer = setTimeout(processChat, 2000);
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });

function renderButtons(queries) {
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    buttonsDiv.innerHTML = '';
    const revMap = Object.entries(keyBindings).reduce((acc, [k, v]) => { acc[v] = k; return acc; }, {});
    queries.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.textContent = `[${revMap[i] || i+1}] ${q}`;
        btn.style.cssText = 'padding: 10px 14px; border-radius: 20px; border: 1px solid #555; background: transparent; color: inherit; cursor: pointer; text-align: left; font-size: 13px; width: 100%;';
        btn.onclick = () => {
            const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
            inputArea.focus(); document.execCommand('selectAll', false, null); document.execCommand('insertText', false, q);
            inputArea.dispatchEvent(new Event('input', { bubbles: true }));
        };
        buttonsDiv.appendChild(btn);
    });
}

function getOrCreateContainer(chatHistoryElem) {
    let container = document.getElementById('gemini-ext-container');
    if (!container) {
        isInjecting = true;
        container = document.createElement('div');
        container.id = 'gemini-ext-container';
        container.style.cssText = 'width: 100%; box-sizing: border-box; font-family: system-ui, sans-serif; position: relative; z-index: 10; margin: 16px 0; padding: 0 4px;';
        
        const syncWidth = () => { if (chatHistoryElem) container.style.width = chatHistoryElem.offsetWidth + 'px'; };
        syncWidth(); new ResizeObserver(syncWidth).observe(chatHistoryElem);

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: #888;';
        header.innerHTML = '<div style="font-weight:600; color:#e8eaed;">Gemini Next Query</div><div id="gemini-pagination" style="display:flex;gap:4px;"></div><div id="gemini-controls" style="display:flex;gap:16px;"></div>';
        
        const loader = document.createElement('div'); loader.id = 'gemini-ext-loader'; loader.style.cssText = 'display: none; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, #8ab4f8, transparent); animation: geminiExtLoading 1.5s infinite linear; margin-bottom: 12px;';
        const buttons = document.createElement('div'); buttons.id = 'gemini-ext-buttons'; buttons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;';
        
        container.append(header, loader, buttons);
        chatHistoryElem.insertAdjacentElement('afterend', container);
        isInjecting = false;
    }
    return container;
}

async function processChat() {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (!inputArea) return;
    const chatHistoryElem = document.getElementById('chat-history');
    if (!chatHistoryElem) return;

    let chatText = document.body.innerText || "";
    const containerElem = document.getElementById('gemini-ext-container');
    if (containerElem) chatText = chatText.replace(containerElem.innerText, '');
    chatText = chatText.trim();
    if (chatText.length < 50) return;

    const currentHash = hashCode(chatText);
    if (currentHash === lastProcessedHash) return;

    getOrCreateContainer(chatHistoryElem);
    
    chrome.storage.sync.get(['apiKey'], async (items) => {
        if (!items.apiKey) return;
        lastProcessedHash = currentHash;
        document.getElementById('gemini-ext-loader').style.display = 'block';
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${items.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Provide 4 follow-up questions. Return ONLY JSON array.\nContext:\n${chatText.slice(-3000)}` }] }] })
            });
            const data = await res.json();
            const queries = JSON.parse(data.candidates[0].content.parts[0].text.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']'));
            document.getElementById('gemini-ext-loader').style.display = 'none';
            renderButtons(queries);
        } catch (e) {
            document.getElementById('gemini-ext-loader').style.display = 'none';
        }
    });
}
