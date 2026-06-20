if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }
        .pagination-btn { cursor: pointer; padding: 2px 6px; border: 1px solid #555; background: #333; color: #fff; border-radius: 4px; font-size: 11px; }
        .pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
}

let isInjecting = false;
let debounceTimer;
let lastProcessedHash = null;
let showLogs = false;
let lastUrl = location.href;
let lastShortcutKey = null;
let shortcutTimer = null;

const chatSession = {
    history: [],
    currentIndex: -1
};

chrome.storage.sync.get(['showLogs'], (res) => {
    if (res.showLogs !== undefined) showLogs = res.showLogs;
});

// Shortcut Handling
document.addEventListener('keydown', (e) => {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (!inputArea || (inputArea.innerText || inputArea.value || '').trim().length > 0) return;

    const key = e.key;
    if (['1', '2', '3', '4'].includes(key)) {
        if (key === lastShortcutKey) {
            // Double press detected
            clearTimeout(shortcutTimer);
            lastShortcutKey = null;
            triggerButton(parseInt(key) - 1);
            e.preventDefault();
        } else {
            // First press or new key
            clearTimeout(shortcutTimer);
            lastShortcutKey = key;
            shortcutTimer = setTimeout(() => { lastShortcutKey = null; }, 1000);
        }
    }
});

function triggerButton(index) {
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    if (!buttonsDiv) return;
    const btns = buttonsDiv.querySelectorAll('button');
    if (btns[index]) {
        const text = btns[index].textContent;
        const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
        inputArea.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
        
        // Automated Submit
        const sendBtn = document.querySelector('button[aria-label*="Send"], button[data-test-id="send-button"]');
        if (sendBtn) sendBtn.click();
    }
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const chr = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return hash.toString();
}

const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastProcessedHash = null;
        chatSession.history = [];
        chatSession.currentIndex = -1;
        const container = document.getElementById('gemini-ext-container');
        if (container) container.remove();
    }

    if (isInjecting) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processChat, 2000);

    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    if (inputArea && !inputArea.dataset.extListenerAdded) {
        inputArea.dataset.extListenerAdded = 'true';
        inputArea.addEventListener('input', () => {
            const container = document.getElementById('gemini-ext-container');
            if (container) {
                const text = inputArea.innerText || inputArea.value || '';
                container.style.display = text.trim().length > 0 ? 'none' : 'block';
            }
        });
    }
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });

function updatePaginationUI() {
    const pag = document.getElementById('gemini-pagination');
    if (!pag) return;
    const count = chatSession.history.length;
    const current = chatSession.currentIndex + 1;
    pag.innerHTML = `
        <button class="pagination-btn" id="prev-btn" ${chatSession.currentIndex <= 0 ? 'disabled' : ''}>&lt;</button>
        <span style="margin: 0 8px; font-size: 12px;">${count > 0 ? current : 0} / ${count}</span>
        <button class="pagination-btn" id="next-btn" ${chatSession.currentIndex >= count - 1 ? 'disabled' : ''}>&gt;</button>
    `;
    document.getElementById('prev-btn').onclick = () => { if (chatSession.currentIndex > 0) { chatSession.currentIndex--; renderButtons(chatSession.history[chatSession.currentIndex]); updatePaginationUI(); } };
    document.getElementById('next-btn').onclick = () => { if (chatSession.currentIndex < chatSession.history.length - 1) { chatSession.currentIndex++; renderButtons(chatSession.history[chatSession.currentIndex]); updatePaginationUI(); } };
}

function getOrCreateContainer(chatHistoryElem) {
    let container = document.getElementById('gemini-ext-container');
    if (!container) {
        isInjecting = true;
        container = document.createElement('div');
        container.id = 'gemini-ext-container';
        container.style.cssText = 'width: 100%; box-sizing: border-box; font-family: system-ui, sans-serif; position: relative; z-index: 10; margin-top: 16px; margin-bottom: 16px; padding: 0 4px;';
        
        const syncWidth = () => { if (chatHistoryElem) container.style.width = chatHistoryElem.offsetWidth + 'px'; };
        syncWidth();
        new ResizeObserver(syncWidth).observe(chatHistoryElem);

        const header = document.createElement('div');
        header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: #888;';
        
        const title = document.createElement('div');
        title.textContent = 'Gemini Next Query';
        title.style.cssText = 'font-weight: 600; color: #e8eaed; font-size: 13px;';
        
        const pagination = document.createElement('div');
        pagination.id = 'gemini-pagination';
        pagination.style.cssText = 'display: flex; align-items: center; gap: 4px;';
        
        const controls = document.createElement('div');
        controls.style.cssText = 'display: flex; gap: 16px; align-items: center;';
        
        const toggleLabel = document.createElement('label');
        toggleLabel.innerHTML = `<input type="checkbox" id="gemini-log-toggle" ${showLogs ? 'checked' : ''}> Logs`;
        toggleLabel.querySelector('input').onchange = (e) => { showLogs = e.target.checked; chrome.storage.sync.set({ showLogs }); document.getElementById('gemini-ext-logs').style.display = showLogs ? 'block' : 'none'; };
        
        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️';
        settingsBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openOptions' });
        
        controls.append(toggleLabel, settingsBtn);
        header.append(title, pagination, controls);
        
        const logs = document.createElement('div');
        logs.id = 'gemini-ext-logs';
        logs.style.cssText = `display: ${showLogs ? 'block' : 'none'}; max-height: 100px; overflow-y: auto; background: rgba(30,30,30,0.8); border: 1px solid #444; border-radius: 4px; padding: 6px; margin-bottom: 12px; font-family: monospace; font-size: 10px; color: #a8c7fa;`;
        
        const loader = document.createElement('div');
        loader.id = 'gemini-ext-loader';
        loader.style.cssText = 'display: none; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, #8ab4f8, transparent); animation: geminiExtLoading 1.5s infinite linear; margin-bottom: 12px;';
        
        const buttons = document.createElement('div');
        buttons.id = 'gemini-ext-buttons';
        buttons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;';
        
        container.append(header, logs, loader, buttons);
        chatHistoryElem.insertAdjacentElement('afterend', container);
        isInjecting = false;
    }
    return container;
}

function renderButtons(queries) {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    buttonsDiv.innerHTML = '';
    
    queries.forEach((q, i) => {
        const btn = document.createElement('button');
        btn.textContent = `[${i + 1}] ${q}`;
        btn.style.cssText = 'padding: 10px 14px; border-radius: 20px; border: 1px solid #555; background: transparent; color: inherit; cursor: pointer; text-align: left; font-size: 13px; width: 100%;';
        btn.onclick = () => {
            inputArea.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, q);
        };
        buttonsDiv.appendChild(btn);
    });
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
    
    chrome.storage.sync.get(['apiKey', 'maxWords'], async (items) => {
        if (!items.apiKey) {
            document.getElementById('gemini-ext-buttons').innerHTML = '<button style="width:100%; padding:10px; background:#442222; color:#ff6b6b; border:none; border-radius:8px;" onclick="chrome.runtime.sendMessage({action:\'openOptions\'})">API Key Required - Click Settings</button>';
            return;
        }

        lastProcessedHash = currentHash;
        document.getElementById('gemini-ext-loader').style.display = 'block';

        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${items.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: `Based on this chat, provide exactly 4 follow-up questions.\nReturn ONLY JSON array of 4 strings.\n\nContext:\n${chatText.slice(-3000)}` }] }] })
            });
            const data = await res.json();
            const queries = JSON.parse(data.candidates[0].content.parts[0].text.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']'));
            chatSession.history.push(queries);
            chatSession.currentIndex = chatSession.history.length - 1;
            document.getElementById('gemini-ext-loader').style.display = 'none';
            renderButtons(queries);
            updatePaginationUI();
        } catch (e) {
            document.getElementById('gemini-ext-loader').style.display = 'none';
            console.error(e);
        }
    });
}
