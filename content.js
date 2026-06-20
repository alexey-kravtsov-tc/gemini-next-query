if (!document.getElementById('gemini-ext-styles')) {
    const style = document.createElement('style');
    style.id = 'gemini-ext-styles';
    style.textContent = `
        @keyframes geminiExtLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes ripple-anim { to { transform: scale(2); opacity: 0; } }
        .ripple { position: absolute; border-radius: 50%; transform: scale(0); animation: ripple-anim 0.6s linear; background: rgba(255,255,255,0.4); pointer-events: none; }
        .pagination-btn { cursor: pointer; padding: 2px 8px; border: 1px solid #555; background: #333; color: #fff; border-radius: 4px; font-size: 11px; }
        .ext-btn { position: relative; overflow: hidden; padding: 10px 14px; border-radius: 20px; border: 1px solid #555; background: #333; color: #fff; cursor: pointer; text-align: left; font-size: 13px; }
        .confirm-overlay { position: absolute; top: -20px; left: 0; width: 100%; font-size: 10px; color: #8ab4f8; text-align: center; }
    `;
    document.head.appendChild(style);
}

let debounceTimer;
let lastProcessedHash = null;
const chatSession = { history: [], currentIndex: -1 };
let pendingSelection = null; // Stores { btnIndex: number, timer: timeout }

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
    return hash.toString();
}

function triggerRipple(btn, e) {
    const circle = document.createElement("span");
    const diameter = Math.max(btn.clientWidth, btn.clientHeight);
    circle.style.width = circle.style.height = `${diameter}px`;
    circle.classList.add("ripple");
    btn.appendChild(circle);
    setTimeout(() => circle.remove(), 600);
}

function handleKeyBinding(e) {
    // Only 1 char allowed
    if (e.key.length !== 1) return;
    
    const index = parseInt(e.key) - 1;
    if (isNaN(index) || index < 0 || index > 3) return;
    
    const btns = document.querySelectorAll('.ext-btn');
    if (!btns[index]) return;

    if (pendingSelection && pendingSelection.index === index) {
        // Second press: Submit
        const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
        inputArea.focus();
        document.execCommand('insertText', false, btns[index].textContent);
        
        clearTimeout(pendingSelection.timer);
        btns[index].querySelector('.confirm-overlay')?.remove();
        pendingSelection = null;
        triggerRipple(btns[index]);
    } else {
        // First press: Confirm
        if (pendingSelection) {
            btns[pendingSelection.index].querySelector('.confirm-overlay')?.remove();
            clearTimeout(pendingSelection.timer);
        }
        
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.textContent = 'Press again to submit';
        btns[index].appendChild(overlay);
        
        const timer = setTimeout(() => {
            overlay.remove();
            pendingSelection = null;
        }, 3000);
        
        pendingSelection = { index, timer };
    }
}

document.addEventListener('keydown', handleKeyBinding);

function getOrCreateContainer(chatHistoryElem) {
    let container = document.getElementById('gemini-ext-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'gemini-ext-container';
        container.style.cssText = 'width: 100%; box-sizing: border-box; font-family: system-ui, sans-serif; position: relative; z-index: 10; margin-top: 16px; margin-bottom: 16px;';
        
        const syncWidth = () => { if (chatHistoryElem) container.style.width = chatHistoryElem.offsetWidth + 'px'; };
        new ResizeObserver(syncWidth).observe(chatHistoryElem);

        container.innerHTML = `
            <div class="ext-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 12px; color: #888; padding: 0 4px;">
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

function renderButtons(queries) {
    const inputArea = document.querySelector('rich-textarea, div[contenteditable="true"][aria-label*="prompt"], textarea');
    const buttonsDiv = document.getElementById('gemini-ext-buttons');
    if(!buttonsDiv) return;
    buttonsDiv.innerHTML = '';
    queries.forEach((q) => {
        const btn = document.createElement('button');
        btn.className = 'ext-btn';
        btn.textContent = q;
        btn.onclick = (e) => { 
            inputArea.focus(); 
            document.execCommand('insertText', false, q); 
            triggerRipple(btn);
        };
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

        chrome.storage.sync.get(['apiKey', 'selectedModel', 'maxWords'], async (items) => {
            if (!items.apiKey) return;
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
                    const queries = JSON.parse(data.candidates[0].content.parts[0].text.replace(/^[\s\S]*?\[/, '[').replace(/\][\s\S]*$/, ']'));
                    chatSession.history.push(queries);
                    chatSession.currentIndex = chatSession.history.length - 1;
                    document.getElementById('gemini-ext-loader').style.display = 'none';
                    renderButtons(queries);
                }
            } catch (e) { document.getElementById('gemini-ext-loader').style.display = 'none'; }
        });
    }, 1500);
}

const observer = new MutationObserver(processChat);
observer.observe(document.body, { childList: true, subtree: true });
