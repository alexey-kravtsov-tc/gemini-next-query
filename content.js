if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .pagination-btn { cursor: pointer; padding: 2px 8px; border: 1px solid #555; background: #333; color: #fff; border-radius: 4px; font-size: 11px; }
        .pagination-btn:disabled { opacity: 0.3; cursor: not-allowed; }
        .ext-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: #888; padding: 0 4px; }
        .ext-controls { display: flex; gap: 12px; align-items: center; }
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

// Ensure the UI exists and returns references to DOM elements
function getOrCreateContainer(chatHistoryElem) {
    let container = document.getElementById('gemini-ext-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'gemini-ext-container';
        container.style.cssText = 'width: 100%; box-sizing: border-box; font-family: system-ui, sans-serif; position: relative; z-index: 10; margin-top: 16px; margin-bottom: 16px;';
        
        const syncWidth = () => { if (chatHistoryElem) container.style.width = chatHistoryElem.offsetWidth + 'px'; };
        new ResizeObserver(syncWidth).observe(chatHistoryElem);

        // Build Header
        const header = document.createElement('div');
        header.className = 'ext-header';
        
        const title = document.createElement('div');
        title.innerHTML = '<strong>Gemini Next Query</strong>';
        
        const pagination = document.createElement('div');
        pagination.id = 'gemini-pagination';
        
        const controls = document.createElement('div');
        controls.className = 'ext-controls';
        
        const logToggle = document.createElement('label');
        logToggle.innerHTML = `<input type="checkbox" id="gemini-log-toggle"> Logs`;
        logToggle.querySelector('input').onchange = (e) => {
            document.getElementById('gemini-ext-logs').style.display = e.target.checked ? 'block' : 'none';
        };

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '⚙️';
        settingsBtn.onclick = () => chrome.runtime.sendMessage({ action: 'openOptions' });

        controls.append(logToggle, settingsBtn);
        header.append(title, pagination, controls);

        // Build Body
        const logs = document.createElement('div');
        logs.id = 'gemini-ext-logs';
        logs.style.cssText = 'display: none; background: #000; padding: 8px; font-family: monospace; font-size: 10px; margin-bottom: 8px; border-radius: 4px;';
        
        const loader = document.createElement('div');
        loader.id = 'gemini-ext-loader';
        loader.style.cssText = 'display: none; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, #8ab4f8, transparent); animation: geminiExtLoading 1.5s infinite linear; margin-bottom: 12px;';
        
        const buttons = document.createElement('div');
        buttons.id = 'gemini-ext-buttons';
        buttons.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 8px;';

        container.append(header, logs, loader, buttons);
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
        btn.textContent = q;
        btn.style.cssText = 'padding: 10px 14px; border-radius: 20px; border: 1px solid #555; background: #333; color: #fff; cursor: pointer; text-align: left; font-size: 13px;';
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

        chrome.storage.sync.get(['apiKey', 'selectedModel', 'maxWords', 'showLogs'], async (items) => {
            if (!items.apiKey) return;
            
            lastProcessedHash = currentHash;
            const container = getOrCreateContainer(chatHistoryElem);
            document.getElementById('gemini-ext-loader').style.display = 'block';

            try {
                const model = items.selectedModel || 'models/gemini-1.5-flash';
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${items.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: `Provide 4 follow-up questions (under ${items.maxWords} words each).\nContext:\n${chatText.slice(-3000)}` }] }] })
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
                }
            } catch (e) { 
                console.error('Gemini Extension Error:', e);
                document.getElementById('gemini-ext-loader').style.display = 'none'; 
            }
        });
    }, 1500);
}

const observer = new MutationObserver(processChat);
observer.observe(document.body, { childList: true, subtree: true });
