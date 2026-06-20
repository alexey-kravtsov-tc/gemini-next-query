document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['apiKey', 'maxWords', 'selectedModel', 'showLogs'], (data) => {
        if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
        if (data.maxWords) document.getElementById('maxWords').value = data.maxWords;
        document.getElementById('showLogsToggle').checked = !!data.showLogs;
        toggleLogs(!!data.showLogs);
        
        if (data.selectedModel) {
            const select = document.getElementById('modelSelect');
            const opt = document.createElement('option');
            opt.value = data.selectedModel;
            opt.textContent = data.selectedModel;
            select.appendChild(opt);
            select.value = data.selectedModel;
        }
    });
});

function toggleLogs(show) {
    document.getElementById('logContainer').style.display = show ? 'block' : 'none';
}

document.getElementById('showLogsToggle').addEventListener('change', (e) => {
    toggleLogs(e.target.checked);
});

function log(msg) {
    const logs = document.getElementById('logs');
    logs.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    logs.scrollTop = logs.scrollHeight;
}

async function testApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const status = document.getElementById('status');
    const logs = document.getElementById('logs');
    const select = document.getElementById('modelSelect');
    
    logs.value = '';
    log('Starting API Test...');

    if (!apiKey) {
        log('Error: API Key is empty.');
        status.textContent = 'Please enter an API Key';
        return;
    }

    try {
        log('Fetching models from API...');
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();
        
        if (!response.ok) {
            log(`API Error: ${JSON.stringify(data.error)}`);
            throw new Error(data.error?.message || 'Request failed');
        }

        const validModels = data.models.filter(m => 
            Array.isArray(m.supportedGenerationMethods) && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        select.innerHTML = '';
        let targetModel = validModels[validModels.length - 1].name;
        
        validModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            select.appendChild(opt);
            if (m.name.toLowerCase().includes('lite')) targetModel = m.name;
        });
        
        select.value = targetModel;
        status.textContent = 'Success! Models fetched.';
        log('Success. Remember to click "Save Settings".');
    } catch (e) {
        log(`CRITICAL ERROR: ${e.message}`);
        status.textContent = 'Error: ' + e.message;
    }
}

document.getElementById('testApiKey').addEventListener('click', testApiKey);

document.getElementById('saveBtn').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value.trim();
    const maxWords = parseInt(document.getElementById('maxWords').value, 10) || 20;
    const selectedModel = document.getElementById('modelSelect').value;
    const showLogs = document.getElementById('showLogsToggle').checked;
    
    chrome.storage.sync.set({ apiKey, maxWords, selectedModel, showLogs }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Saved successfully';
        setTimeout(() => status.textContent = '', 2000);
    });
});
