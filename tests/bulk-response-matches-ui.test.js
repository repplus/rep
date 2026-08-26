import { beforeEach, describe, expect, it, vi } from 'vitest';

const uiMocks = vi.hoisted(() => ({
    elements: {}
}));

vi.mock('../js/ui/main-ui.js', () => ({
    elements: uiMocks.elements
}));

vi.mock('../js/network/permissions.js', () => ({
    requestReplayPermission: vi.fn().mockResolvedValue(true)
}));

import { state } from '../js/core/state.js';
import { setupBulkReplay } from '../js/features/bulk-replay/index.js';

describe('Bulk Replay response-marker UI', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button id="bulk-replay-btn" disabled></button>
            <div id="bulk-config-modal"><button class="close-modal"></button></div>
            <button id="start-attack-btn"></button>
            <div id="bulk-replay-pane"></div>
            <table id="bulk-results-table"><tbody></tbody></table>
            <div id="bulk-progress-bar"></div>
            <span id="bulk-progress-text"></span>
            <button id="bulk-stop-btn"></button>
            <button id="bulk-close-btn"></button>
            <div class="vertical-resize-handle"></div>
            <select id="attack-type"><option value="sniper">Sniper</option></select>
            <span id="attack-type-help"></span>
            <span id="payload-count"></span>
            <div id="positions-container"></div>
            <div id="battering-ram-config">
                <select class="payload-type-select"><option value="simple-list">Simple List</option></select>
                <div class="payload-options-simple-list"><textarea class="payload-list-input"></textarea></div>
                <div class="payload-options-numbers"></div>
            </div>
            <button id="add-response-matcher"></button>
            <div id="response-matchers"></div>
            <input id="response-match-case-sensitive" type="checkbox" checked>
            <input id="use-https" type="checkbox" checked>
            <div class="main-content"></div>
            <div id="context-menu"><button data-action="mark-payload"></button></div>
        `;

        const rawRequestInput = document.createElement('div');
        rawRequestInput.innerText = 'GET /login?username=§candidate§ HTTP/1.1\nHost: example.test\n\n';
        const rawResponseDisplay = document.createElement('div');

        Object.assign(uiMocks.elements, {
            rawRequestInput,
            rawResponseDisplay,
            diffToggle: document.createElement('div'),
            showDiffCheckbox: Object.assign(document.createElement('input'), { checked: false }),
            resStatus: document.createElement('span'),
            resTime: document.createElement('span'),
            resSize: document.createElement('span')
        });

        state.positionConfigs = [];
        state.currentAttackType = 'sniper';
        state.responseMatchers = [];
        state.responseMatchCaseSensitive = true;
        state.shouldStopBulk = false;
        state.shouldPauseBulk = false;

        Element.prototype.scrollIntoView = vi.fn();
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'content-type': 'application/json' }),
            text: vi.fn().mockResolvedValue('{"message":"Invalid username and password"}')
        });
    });

    function addResponseMatcher(text, mode = 'partial') {
        document.getElementById('add-response-matcher').click();
        const rows = document.querySelectorAll('.response-matcher-row');
        const row = rows[rows.length - 1];
        row.querySelector('.response-matcher-text').value = text;
        row.querySelector('.response-matcher-mode').value = mode;
        return row;
    }

    it('shows only the longest overlapping marker and highlights it in the opened response', async () => {
        setupBulkReplay();

        document.getElementById('bulk-replay-btn').click();
        document.querySelector('.position-card .payload-list-input').value = 'alice';
        addResponseMatcher('Invalid username');
        addResponseMatcher('Invalid username and password');

        document.getElementById('start-attack-btn').click();

        await vi.waitFor(() => {
            expect(document.querySelector('.matches-cell')?.textContent).toBe('Invalid username and password');
        });

        expect(document.querySelectorAll('.response-match-badge')).toHaveLength(1);
        expect(document.querySelector('tr.has-response-match')).not.toBeNull();

        document.querySelector('#bulk-results-table tbody tr').click();

        expect(uiMocks.elements.rawResponseDisplay.querySelectorAll('mark.response-match-highlight')).toHaveLength(1);
        expect(uiMocks.elements.rawResponseDisplay.querySelector('mark')?.textContent).toBe('Invalid username and password');
    });

    it('uses each matcher\'s contains or whole-response mode', async () => {
        globalThis.fetch.mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            text: vi.fn().mockResolvedValue('Invalid username and password')
        });
        setupBulkReplay();

        document.getElementById('bulk-replay-btn').click();
        document.querySelector('.position-card .payload-list-input').value = 'alice';
        addResponseMatcher('Invalid username', 'whole');
        addResponseMatcher('username and password', 'partial');
        document.getElementById('start-attack-btn').click();

        await vi.waitFor(() => {
            expect(document.querySelectorAll('.response-match-badge')).toHaveLength(1);
        });

        expect(document.querySelector('.response-match-badge')?.textContent).toBe('username and password');
        expect(document.querySelector('.response-match-badge')?.dataset.mode).toBe('partial');
    });

    it('clearly marks responses that miss every configured matcher', async () => {
        setupBulkReplay();

        document.getElementById('bulk-replay-btn').click();
        document.querySelector('.position-card .payload-list-input').value = 'alice';
        addResponseMatcher('Welcome back');
        document.getElementById('start-attack-btn').click();

        await vi.waitFor(() => {
            expect(document.querySelector('.response-match-badge-negative')?.textContent).toBe('No match');
        });

        expect(document.querySelector('.matches-cell')?.classList.contains('empty')).toBe(false);
        expect(document.querySelector('tr.has-no-response-match')).not.toBeNull();
        expect(document.querySelector('tr.has-response-match')).toBeNull();
    });

    it('keeps the matches cell neutral when no matchers are configured', async () => {
        setupBulkReplay();

        document.getElementById('bulk-replay-btn').click();
        document.querySelector('.position-card .payload-list-input').value = 'alice';
        document.getElementById('start-attack-btn').click();

        await vi.waitFor(() => {
            expect(document.querySelector('.status-cell')?.textContent).toBe('200 OK');
        });

        expect(document.querySelector('.matches-cell')?.textContent).toBe('—');
        expect(document.querySelector('.matches-cell')?.classList.contains('empty')).toBe(true);
        expect(document.querySelector('.response-match-badge-negative')).toBeNull();
        expect(document.querySelector('tr.has-no-response-match')).toBeNull();
    });

    it('adds marked response text to the matcher configuration without changing the response', () => {
        setupBulkReplay();
        uiMocks.elements.rawResponseDisplay.textContent = 'Invalid username and password';

        const contextMenu = document.getElementById('context-menu');
        contextMenu.dataset.target = 'response';
        contextMenu.dataset.selectedText = 'Invalid username';
        contextMenu.querySelector('[data-action="mark-payload"]').click();

        const row = document.querySelector('.response-matcher-row');
        expect(row.querySelector('.response-matcher-text').value).toBe('Invalid username');
        expect(row.querySelector('.response-matcher-mode').value).toBe('partial');
        expect(state.responseMatchers).toEqual([{ text: 'Invalid username', mode: 'partial' }]);
        expect(uiMocks.elements.rawResponseDisplay.textContent).toBe('Invalid username and password');
    });
});
