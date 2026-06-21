import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set up Chrome API Mock before importing options.js
const chromeMock = {
    storage: {
        sync: {
            get: vi.fn((keys, cb) => cb({
                apiKey: 'stored-api-key',
                maxWords: 15,
                k1: 'a',
                k2: 'b',
                k3: 'c',
                k4: 'd'
            })),
            set: vi.fn((data, cb) => cb && cb())
        }
    }
};
global.chrome = chromeMock;

describe('Gemini Next Queries - options.js', () => {
    beforeEach(() => {
        // Set up the DOM matching options.html
        document.body.innerHTML = `
            <input type="text" id="k1">
            <input type="text" id="k2">
            <input type="text" id="k3">
            <input type="text" id="k4">
            <input type="number" id="maxWords">
            <input type="password" id="apiKey">
            <button id="saveBtn">Save Settings</button>
            <div id="status"></div>
        `;
        vi.clearAllMocks();
        // Reset the module cache to trigger DOMContentLoaded listener each time
        delete require.cache[require.resolve('./options.js')];
    });

    it('should load saved settings on DOMContentLoaded', () => {
        // Load the file
        require('./options.js');
        
        // Dispatch DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(chromeMock.storage.sync.get).toHaveBeenCalledWith(
            ['apiKey', 'maxWords', 'k1', 'k2', 'k3', 'k4'],
            expect.any(Function)
        );

        expect(document.getElementById('apiKey').value).toBe('stored-api-key');
        expect(document.getElementById('maxWords').value).toBe('15');
        expect(document.getElementById('k1').value).toBe('a');
        expect(document.getElementById('k2').value).toBe('b');
        expect(document.getElementById('k3').value).toBe('c');
        expect(document.getElementById('k4').value).toBe('d');
    });

    it('should save settings when clicking the save button', () => {
        require('./options.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Modify values
        document.getElementById('apiKey').value = 'new-api-key';
        document.getElementById('maxWords').value = '25';
        document.getElementById('k1').value = 'x';

        // Trigger click
        document.getElementById('saveBtn').click();

        expect(chromeMock.storage.sync.set).toHaveBeenCalledWith({
            apiKey: 'new-api-key',
            maxWords: 25,
            k1: 'x',
            k2: 'b',
            k3: 'c',
            k4: 'd'
        }, expect.any(Function));

        // Status message should be set
        expect(document.getElementById('status').textContent).toBe('Saved successfully');
    });
});
