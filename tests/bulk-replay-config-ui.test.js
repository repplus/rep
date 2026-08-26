import { beforeEach, describe, expect, it, vi } from 'vitest';

const uiMocks = vi.hoisted(() => ({ elements: {} }));

vi.mock('../js/ui/main-ui.js', () => ({ elements: uiMocks.elements }));

import { state } from '../js/core/state.js';
import { setupBulkReplay } from '../js/features/bulk-replay/index.js';

describe('Bulk Replay configuration persistence', () => {
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
            <select id="attack-type">
                <option value="sniper">Sniper</option>
                <option value="battering-ram">Battering Ram</option>
                <option value="pitchfork">Pitchfork</option>
            </select>
            <span id="attack-type-help"></span>
            <span id="payload-count"></span>
            <div id="positions-container"></div>
            <div id="battering-ram-config">
                <select class="payload-type-select">
                    <option value="simple-list">Simple List</option>
                    <option value="numbers">Numbers</option>
                </select>
                <div class="payload-options-simple-list"><textarea class="payload-list-input"></textarea></div>
                <div class="payload-options-numbers">
                    <input class="num-from-input" value="1">
                    <input class="num-to-input" value="10">
                    <input class="num-step-input" value="1">
                </div>
            </div>
            <input id="use-https" type="checkbox" checked>
            <div class="main-content"></div>
            <div id="context-menu"><button data-action="mark-payload"></button></div>
        `;

        const rawRequestInput = document.createElement('div');
        rawRequestInput.innerText = 'GET /login?username=§candidate§ HTTP/1.1\nHost: example.test\n\n';
        Object.assign(uiMocks.elements, {
            rawRequestInput,
            rawResponseDisplay: document.createElement('div'),
            diffToggle: document.createElement('div'),
            showDiffCheckbox: Object.assign(document.createElement('input'), { checked: false }),
            resStatus: document.createElement('span'),
            resTime: document.createElement('span'),
            resSize: document.createElement('span')
        });

        state.bulkReplayTemplate = '';
        state.positionConfigs = [];
        state.batteringRamConfig = {
            type: 'simple-list',
            list: '',
            numbers: { from: 1, to: 10, step: 1 }
        };
        state.currentAttackType = 'sniper';
        state.shouldStopBulk = false;
        state.shouldPauseBulk = false;

        Element.prototype.scrollIntoView = vi.fn();
        globalThis.fetch = vi.fn().mockResolvedValue({
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            text: vi.fn().mockResolvedValue('Invalid username')
        });
    });

    it('reopens the previous attack after selecting an unmarked result', async () => {
        setupBulkReplay();

        const replayButton = document.getElementById('bulk-replay-btn');
        replayButton.click();

        const attackType = document.getElementById('attack-type');
        attackType.value = 'pitchfork';
        attackType.dispatchEvent(new Event('change'));

        const payloadList = document.querySelector('.position-card .payload-list-input');
        payloadList.value = 'alice\nbob';
        payloadList.dispatchEvent(new Event('input'));
        document.getElementById('start-attack-btn').click();

        await vi.waitFor(() => {
            expect(document.querySelectorAll('#bulk-results-table tbody tr')).toHaveLength(2);
            expect(document.getElementById('bulk-progress-text').textContent).toBe('2/2');
        });

        document.querySelector('#bulk-results-table tbody tr').click();
        await vi.waitFor(() => expect(replayButton.title).toContain('Reuse previous'));
        expect(replayButton.disabled).toBe(false);
        expect(uiMocks.elements.rawRequestInput.innerText).not.toContain('§');

        replayButton.click();

        expect(document.getElementById('bulk-config-modal').style.display).toBe('block');
        expect(document.getElementById('attack-type').value).toBe('pitchfork');
        expect(document.querySelector('.position-card .payload-list-input').value).toBe('alice\nbob');
        expect(state.bulkReplayTemplate).toContain('§candidate§');
    });

    it('remembers Battering Ram selections when the modal is reopened', () => {
        setupBulkReplay();

        const replayButton = document.getElementById('bulk-replay-btn');
        replayButton.click();

        const attackType = document.getElementById('attack-type');
        attackType.value = 'battering-ram';
        attackType.dispatchEvent(new Event('change'));

        const payloadList = document.querySelector('#battering-ram-config .payload-list-input');
        payloadList.value = 'shared-one\nshared-two';
        payloadList.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.close-modal').click();

        replayButton.click();

        expect(document.getElementById('attack-type').value).toBe('battering-ram');
        expect(document.querySelector('#battering-ram-config .payload-list-input').value).toBe('shared-one\nshared-two');
    });
});
