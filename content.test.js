import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set up Chrome API Mock before importing content.js
const chromeMock = {
    storage: {
        sync: {
            get: vi.fn((keys, cb) => cb({ apiKey: 'fake-key', showLogs: true })),
            set: vi.fn((data, cb) => cb && cb())
        },
        onChanged: {
            addListener: vi.fn()
        }
    },
    runtime: {
        sendMessage: vi.fn()
    }
};
global.chrome = chromeMock;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    constructor(cb) {
        this.cb = cb;
    }
    observe(elem) {}
    unobserve() {}
    disconnect() {}
};

// Mock document.execCommand
document.execCommand = vi.fn();

// Import content.js
const content = require('./content.js');

describe('Gemini Next Queries - content.js', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
        
        // Reset chatSession state
        content.chatSession.history = [];
        content.chatSession.currentIndex = -1;
    });

    describe('hashCode', () => {
        it('should generate consistent hash for the same string', () => {
            const str = 'hello world';
            const hash1 = content.hashCode(str);
            const hash2 = content.hashCode(str);
            expect(hash1).toBe(hash2);
            expect(typeof hash1).toBe('string');
        });

        it('should generate different hashes for different strings', () => {
            const hash1 = content.hashCode('hello');
            const hash2 = content.hashCode('world');
            expect(hash1).not.toBe(hash2);
        });
    });

    describe('getOrCreateContainer', () => {
        it('should create container with header, logs, loader and buttons elements', () => {
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            document.body.appendChild(chatHistory);

            const container = content.getOrCreateContainer(chatHistory);
            
            expect(container).not.toBeNull();
            expect(document.getElementById('gemini-ext-container')).toBe(container);
            expect(document.getElementById('gemini-pagination')).not.toBeNull();
            expect(document.getElementById('gemini-ext-logs')).not.toBeNull();
            expect(document.getElementById('gemini-ext-loader')).not.toBeNull();
            expect(document.getElementById('gemini-ext-buttons')).not.toBeNull();
        });

        it('should return existing container if it already exists', () => {
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            document.body.appendChild(chatHistory);

            const container1 = content.getOrCreateContainer(chatHistory);
            const container2 = content.getOrCreateContainer(chatHistory);

            expect(container1).toBe(container2);
        });
    });

    describe('renderButtons', () => {
        it('should render correct query text on buttons and register click events', () => {
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            document.body.appendChild(chatHistory);
            content.getOrCreateContainer(chatHistory);

            const queries = ['Query A', 'Query B'];
            
            // Add a mock rich-textarea/prompt area to the DOM
            const textarea = document.createElement('textarea');
            textarea.setAttribute('aria-label', 'prompt');
            document.body.appendChild(textarea);

            content.renderButtons(queries);

            const buttonsDiv = document.getElementById('gemini-ext-buttons');
            const buttons = buttonsDiv.querySelectorAll('button');

            expect(buttons.length).toBe(2);
            expect(buttons[0].textContent).toContain('Query A');
            expect(buttons[1].textContent).toContain('Query B');

            // Simulate click on first button
            buttons[0].click();
            expect(document.execCommand).toHaveBeenCalledWith('insertText', false, 'Query A');
        });
    });

    describe('updatePaginationUI', () => {
        it('should update pagination text and disabled states correctly', () => {
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            document.body.appendChild(chatHistory);
            content.getOrCreateContainer(chatHistory);

            content.chatSession.history = [
                ['Q1', 'Q2'],
                ['Q3', 'Q4'],
                ['Q5', 'Q6']
            ];
            content.chatSession.currentIndex = 1;

            content.updatePaginationUI();

            const pagText = document.getElementById('gemini-pagination').querySelector('span');
            expect(pagText.textContent).toBe('2 / 3');

            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');

            expect(prevBtn.disabled).toBe(false);
            expect(nextBtn.disabled).toBe(false);
        });

        it('should disable prev button when at index 0', () => {
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            document.body.appendChild(chatHistory);
            content.getOrCreateContainer(chatHistory);

            content.chatSession.history = [['Q1']];
            content.chatSession.currentIndex = 0;

            content.updatePaginationUI();

            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');

            expect(prevBtn.disabled).toBe(true);
            expect(nextBtn.disabled).toBe(true);
        });
    });

    describe('setupInputListener', () => {
        it('should hide container when input area has text and show when empty', () => {
            const chatHistory = document.createElement('div');
            chatHistory.id = 'chat-history';
            document.body.appendChild(chatHistory);
            const container = content.getOrCreateContainer(chatHistory);

            const textarea = document.createElement('textarea');
            content.setupInputListener(textarea);

            // Container starts visible
            container.style.display = 'block';

            // Simulate typing text
            textarea.value = 'hello';
            textarea.dispatchEvent(new Event('input'));
            expect(container.style.display).toBe('none');

            // Simulate clearing text
            textarea.value = '';
            textarea.dispatchEvent(new Event('input'));
            expect(container.style.display).toBe('block');
        });
    });
});
