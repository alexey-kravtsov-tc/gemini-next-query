document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get(['apiKey', 'maxWords', 'selectedModel'], (data) => {
        if (data.apiKey) document.getElementById('apiKey').value = data.apiKey;
        if (data.maxWords) document.getElementById('maxWords').value = data.maxWords;
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
    
    logs.value = ''; // Clear previous logs
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
        log(`Response received (Status: ${response.status})`);
        
        if (!response.ok) {
            log(`API Error: ${JSON.stringify(data.error)}`);
            throw new Error(data.error?.message || 'Request failed');
        }

        if (!data.models || !Array.isArray(data.models)) {
            log('Error: "models" field missing in response.');
            throw new Error('Unexpected API response structure');
        }

        log(`Found ${data.models.length} models.`);
        
        // Filter models that support generation
        const validModels = data.models.filter(m => 
            Array.isArray(m.supportedGenerationMethods) && 
            m.supportedGenerationMethods.includes('generateContent')
        );

        log(`Filtered ${validModels.length} models that support generateContent.`);
        
        if (validModels.length === 0) {
            log('Error: No models found that support generateContent.');
            throw new Error('No compatible models found');
        }
        
        select.innerHTML = '';
        let targetModel = validModels[validModels.length - 1].name;
        
        validModels.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            select.appendChild(opt);
            // Prioritize "lite" models
            if (m.name.toLowerCase().includes('lite')) targetModel = m.name;
        });
        
        select.value = targetModel;
        chrome.storage.sync.set({ apiKey, selectedModel: targetModel });
        log(`Success! Set model to: ${targetModel}`);
        status.textContent = 'Success! Models updated.';
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
    
    chrome.storage.sync.set({ apiKey, maxWords, selectedModel }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Saved successfully';
        setTimeout(() => status.textContent = '', 2000);
    });
});
