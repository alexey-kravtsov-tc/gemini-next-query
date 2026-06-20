if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .pagination-btn { cursor: pointer; padding: 2px 8px; border: 1px solid #555; background: #333; color: #fff; border-radius: 4px; font-size: 11px; }
        .pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .ext-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: #888; padding: 0 4px; }
        .ext-controls { display: flex; gap: 12px; align-items: center; }
        .ext-btn { position: relative; overflow: hidden; padding: 10px 14px; border-radius: 20px; border: 1px solid #555; background: #333; color: #fff; cursor: pointer; text-align: left; font-size: 13px; }
    `;
    document.head.appendChild(style);
}

let debounceTimer;
let lastProcessedHash = null;
const chatSession = { history: [], currentIndex: -1 };

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return hash.toString();
}

function addLog(message, isError = false) {
    const logsDiv = document.getElementById('gemini-ext-logs');
    if (!logsDiv) return;
    const entry = document.createElement('div');
    entry.style.cssText = `margin-bottom: 4px; ${isError ? 'color: #ff6b6b;' : 'color: #a8c7fa;'}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logsDiv.appendChild(entry);
    logsDiv.scrollTop = logsDiv.scrollHeight;
}

function getOrCreateContainer(chatHistoryElem) {
    let container = document.getElementById('gemini-ext-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'gemini-ext-container';
        container.style.cssText = 'width: 100%; box-sizing: border-box; font-family: system-ui, sans-serif; position: relative; z-index: 10; margin-top: 16px; margin-bottom: 16px;';
        
        const syncWidth = () => { if (chatHistoryElem) container.style.width = chatHistoryElem.offsetWidth + 'px'; };
        new ResizeObserver(syncWidth).observe(chatHistoryElem);

        container.innerHTML = `
            <div class="ext-header">
                <div style="font-weight: 600; color: #e8eaed;">Gemini Next Query</div>
                <div id="gemini-pagination" style="display: flex; align-items: center; gap: 4px;"></div>
                <div class="ext-controls">
                    <label><input type="checkbox" id="gemini-log-toggle"> Logs</label>
                    <button style="background:transparent; border:none; cursor:pointer;" onclick="chrome.runtime.sendMessage({action:'openOptions'})">⚙️</button>
                </div>
            </div>
            <div id="gemini-ext-logs" style="display: none; background: #000; padding: 8px; font-family: monospace; font-size: 10px; margin-bottom: 8px; border-radius: 4px; max-height: 100px; overflow-y: auto;"></div>
            <div id="gemini-ext-loader" style="display: none; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, #8ab4f8, transparent); animation: geminiExtLoading 1.5s infinite linear; margin-bottom: 12px;"></div>
            <div id="gemini-ext-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;"></div>
        `;
        
        container.querySelector('#gemini-log-toggle').onchange = (e) => {
            document.getElementById('gemini-ext-logs').style.display = e.target.checked ? 'block' : 'none';
        };
        
        chatHistoryElem.insertAdjacentElement('afterend', container);
    }
    return container;
}

function updatePaginationUI() {
    const pag = document.getElementById('gemini-pagination');
    if (!pag) return;
    pag.innerHTML = `
        <button class="pagination-btn" id="prev-btn" ${chatSession.currentIndex <= 0 ? 'disabled' : ''}>&lt;</button>
        <span style="font-size: 11px;">${chatSession.currentIndex + 1} / ${chatSession.history.length}</span>
        <button class="pagination-btn" id="next-btn" ${chatSession.currentIndex >= chatSession.history.length - 1 ? 'disabled' : ''}>&gt;</button>
    `;
    document.getElementById('prev-btn').onclick = () => { chatSession.currentIndex--; renderButtons(chatSession.history[chatSession.currentIndex]); updatePaginationUI(); };
    document.getElementById('next-btn').onclick = () => { chatSession.currentIndex++; renderButtons(chatSession.history[chatSession.currentIndex]); updatePaginationUI(); };
}

function renderButtons(queries) {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    if(!buttonsDiv) return;
    buttonsDiv.innerHTML = '';
    queries.forEach((q) => {
        const btn = document.createElement('button');
        btn.className = 'ext-btn';
        btn.textContent = q;
        btn.onclick = () => { inputArea.focus(); document.execCommand('insertText', false, q); };
        buttonsDiv.appendChild(btn);
    });
}

function processChat() {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    const chatHistoryElem = document.getElementById('chat-history');
    if (!inputArea || !chatHistoryElem) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
        const chatText = document.body.innerText.trim();
        if (chatText.length < 50) return;
        
        const currentHash = hashCode(chatText);
        if (currentHash === lastProcessedHash) return;

        addLog('Processing chat context...');
        
        chrome.storage.sync.get(['apiKey', 'selectedModel', 'maxWords'], async (items) => {
            if (!items.apiKey) {
                addLog('Error: API Key missing', true);
                return;
            }
            
            lastProcessedHash = currentHash;
            getOrCreateContainer(chatHistoryElem);
            document.getElementById('gemini-ext-loader').style.display = 'block';

            try {
                const model = items.selectedModel || 'models/gemini-1.5-flash';
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${items.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: `Provide 4 follow-up questions.\nContext:\n${chatText.slice(-3000)}` }] }] })
                });
                
                const data = await res.json();
                if (data.candidates && data.candidates[0]) {
                    const text = data.candidates[0].content.parts[0].text;
                    const queries = JSON.parse(text.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']'));
                    
                    chatSession.history.push(queries);
                    chatSession.currentIndex = chatSession.history.length - 1;
                    
                    document.getElementById('gemini-ext-loader').style.display = 'none';
                    renderButtons(queries);
                    updatePaginationUI();
                    addLog('Predictions generated.');
                }
            } catch (e) { 
                addLog(`Error: ${e.message}`, true);
                document.getElementById('gemini-ext-loader').style.display = 'none'; 
            }
        });
    }, 1500);
}

const observer = new MutationObserver(processChat);
observer.observe(document.body, { childList: true, subtree: true });
