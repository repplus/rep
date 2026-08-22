import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSSEParser,
  flattenOpenCodeModels,
  getOpenCodePermissionPattern,
  normalizeOpenCodeBaseUrl,
  parseOpenCodeModel,
  resetOpenCodeConversation,
  streamFromOpenCode
} from '../js/features/ai/opencode.js';
import { getAISettings, saveAISettings } from '../js/features/ai/core.js';

describe('OpenCode provider', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    });
  });

  it('normalizes supported loopback URLs', () => {
    expect(normalizeOpenCodeBaseUrl('http://127.0.0.1:4096/')).toBe('http://127.0.0.1:4096');
    expect(normalizeOpenCodeBaseUrl('https://localhost:4443')).toBe('https://localhost:4443');
  });

  it('rejects remote hosts and URL paths', () => {
    expect(() => normalizeOpenCodeBaseUrl('https://example.com')).toThrow(/localhost/);
    expect(() => normalizeOpenCodeBaseUrl('http://localhost:4096/api')).toThrow(/without a path/);
    expect(() => normalizeOpenCodeBaseUrl('http://user:pass@localhost:4096')).toThrow(/credentials/);
  });

  it('builds a least-specific localhost permission that covers custom ports', () => {
    expect(getOpenCodePermissionPattern('http://127.0.0.1:4096')).toBe('http://127.0.0.1/*');
  });

  it('keeps slashes inside OpenCode model IDs', () => {
    expect(parseOpenCodeModel('openrouter/vendor/model')).toEqual({
      providerID: 'openrouter',
      modelID: 'vendor/model'
    });
  });

  it('returns models only from connected providers', () => {
    const models = flattenOpenCodeModels({
      connected: ['anthropic'],
      all: [
        {
          id: 'anthropic',
          name: 'Anthropic',
          models: {
            sonnet: { id: 'claude-sonnet', name: 'Claude Sonnet' }
          }
        },
        {
          id: 'gemini',
          name: 'Google',
          models: {
            flash: { id: 'gemini-flash', name: 'Gemini Flash' }
          }
        }
      ]
    });

    expect(models).toEqual([
      { id: 'anthropic/claude-sonnet', label: 'Anthropic - Claude Sonnet' }
    ]);
    expect(flattenOpenCodeModels({ connected: [], all: [{ id: 'anthropic', models: { sonnet: { id: 'sonnet' } } }] })).toEqual([]);
    expect(flattenOpenCodeModels({
      providers: [{ id: 'opencode', name: 'OpenCode Zen', models: { pickle: { id: 'big-pickle', name: 'Big Pickle' } } }]
    })).toEqual([{ id: 'opencode/big-pickle', label: 'OpenCode Zen - Big Pickle' }]);
  });

  it('parses fragmented SSE events', () => {
    const events = [];
    const parser = createSSEParser(event => events.push(event));

    parser.feed('data: {"type":"message.part.');
    parser.feed('updated","properties":{"part":{"text":"hello"}}}\r\n');
    parser.feed('\r\ndata: {"type":"session.idle","properties":{"sessionID":"abc"}}\n\n');
    parser.feed('data: {"type":"message.part.delta","properties":{"partID":"part-1","field":"text","delta":"!"}}\n\n');

    expect(events).toEqual([
      { type: 'message.part.updated', properties: { part: { text: 'hello' } } },
      { type: 'session.idle', properties: { sessionID: 'abc' } },
      { type: 'message.part.delta', properties: { partID: 'part-1', field: 'text', delta: '!' } }
    ]);
  });

  it('round-trips OpenCode settings', () => {
    saveAISettings('opencode', 'http://127.0.0.1:4096', 'anthropic/claude-sonnet', {
      username: 'rep-user',
      password: 'secret'
    });

    expect(getAISettings()).toEqual({
      provider: 'opencode',
      apiKey: 'http://127.0.0.1:4096',
      baseUrl: 'http://127.0.0.1:4096',
      username: 'rep-user',
      password: 'secret',
      model: 'anthropic/claude-sonnet'
    });
  });

  it('creates, streams, and deletes a tool-disabled temporary session', async () => {
    const sent = [];
    let onMessage;
    let streamRequestId;
    let sessionCounter = 0;
    let currentSessionId;
    let pendingSessionRequest;
    const pendingDeleteRequests = [];
    let mode = 'success';
    const port = {
      onMessage: { addListener: listener => { onMessage = listener; } },
      onDisconnect: { addListener: vi.fn() },
      postMessage(message) {
        sent.push(message);
        if (message.type !== 'opencode-request') return;

        if (message.path === '/session' && message.method === 'POST') {
          currentSessionId = `session-${++sessionCounter}`;
          if (mode === 'delayed-session') {
            pendingSessionRequest = message;
            return;
          }
          onMessage({
            type: 'opencode-response',
            requestId: message.requestId,
            body: JSON.stringify({ id: currentSessionId })
          });
        } else if (message.path === '/event') {
          streamRequestId = message.requestId;
          onMessage({ type: 'opencode-stream-start', requestId: message.requestId });
        } else if (message.path.endsWith('/prompt_async')) {
          onMessage({ type: 'opencode-response', requestId: message.requestId, body: '' });
          queueMicrotask(() => {
            if (mode === 'closed-stream') {
              onMessage({
                type: 'opencode-stream-chunk',
                requestId: streamRequestId,
                chunk: `data: ${JSON.stringify({ type: 'session.status', properties: { sessionID: currentSessionId, status: { type: 'busy' } } })}\n\n`
              });
              onMessage({ type: 'opencode-stream-done', requestId: streamRequestId });
              return;
            }
            if (mode === 'permission') {
              onMessage({
                type: 'opencode-stream-chunk',
                requestId: streamRequestId,
                chunk: `data: ${JSON.stringify({ type: 'permission.asked', properties: { id: 'permission-1', sessionID: currentSessionId, permission: 'bash' } })}\n\n`
              });
              return;
            }
            const events = [
              { type: 'session.status', properties: { sessionID: currentSessionId, status: { type: 'busy' } } },
              { type: 'message.updated', properties: { info: { id: 'message-1', sessionID: currentSessionId, role: 'assistant' } } },
              { type: 'message.part.updated', properties: { part: { id: 'part-1', messageID: 'message-1', sessionID: currentSessionId, type: 'text', text: '' } } },
              { type: 'message.part.delta', properties: { sessionID: currentSessionId, partID: 'part-1', field: 'text', delta: 'hello' } },
              { type: 'session.status', properties: { sessionID: currentSessionId, status: { type: 'idle' } } }
            ];
            events.forEach(event => onMessage({
              type: 'opencode-stream-chunk',
              requestId: streamRequestId,
              chunk: `data: ${JSON.stringify(event)}\n\n`
            }));
          });
        } else if (message.method === 'DELETE' && mode === 'delayed-delete') {
          pendingDeleteRequests.push(message);
        } else {
          onMessage({ type: 'opencode-response', requestId: message.requestId, body: 'true' });
        }
      }
    };
    vi.stubGlobal('chrome', {
      runtime: { connect: () => port, lastError: undefined }
    });

    const updates = [];
    const result = await streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      text => updates.push(text)
    );

    expect(result).toBe('hello');
    expect(updates).toContain('hello');
    expect(sent.find(message => message.path === '/session').body.permission).toEqual([
      { permission: '*', pattern: '*', action: 'deny' }
    ]);
    expect(sent.find(message => message.path?.endsWith('/prompt_async')).body.tools).toEqual({ '*': false });
    expect(sent.some(message => message.path === '/session/session-1' && message.method === 'DELETE')).toBe(true);

    mode = 'closed-stream';
    await expect(streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn()
    )).rejects.toThrow(/closed the event stream/);

    mode = 'permission';
    await expect(streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn()
    )).rejects.toThrow(/"bash" permission/);
    expect(sent.some(message => message.path === '/permission/permission-1/reply')).toBe(true);

    mode = 'delayed-session';
    const conversationKey = {};
    const pendingStream = streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn(),
      { conversationKey }
    );
    await vi.waitFor(() => expect(pendingSessionRequest).toBeDefined());
    await resetOpenCodeConversation(conversationKey);
    onMessage({
      type: 'opencode-response',
      requestId: pendingSessionRequest.requestId,
      body: JSON.stringify({ id: currentSessionId })
    });

    await expect(pendingStream).rejects.toThrow(/creation was cancelled/);
    expect(sent.some(message => message.path === `/session/${currentSessionId}/prompt_async`)).toBe(false);
    expect(sent.some(message => message.path === `/session/${currentSessionId}` && message.method === 'DELETE')).toBe(true);

    mode = 'success';
    const validationKey = {};
    await streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn(),
      { conversationKey: validationKey }
    );
    mode = 'closed-stream';
    await expect(streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn(),
      { conversationKey: validationKey }
    )).rejects.toThrow(/closed the event stream/);

    mode = 'delayed-delete';
    const validationStream = streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn(),
      { conversationKey: validationKey }
    );
    await vi.waitFor(() => expect(pendingDeleteRequests).toHaveLength(1));
    const reset = resetOpenCodeConversation(validationKey);
    await vi.waitFor(() => expect(pendingDeleteRequests).toHaveLength(2));
    pendingDeleteRequests.forEach(message => onMessage({
      type: 'opencode-response',
      requestId: message.requestId,
      body: 'true'
    }));

    await reset;
    await expect(validationStream).rejects.toThrow(/validation was cancelled/);

    mode = 'success';
    const connectionChangeKey = {};
    await streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: '' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn(),
      { conversationKey: connectionChangeKey }
    );
    pendingDeleteRequests.length = 0;
    mode = 'delayed-delete';
    const controller = new AbortController();
    const sessionCountBeforeReset = sessionCounter;
    const replacementStream = streamFromOpenCode(
      { baseUrl: 'http://127.0.0.1:4096', username: 'opencode', password: 'changed' },
      'opencode/big-pickle',
      'system',
      'prompt',
      vi.fn(),
      { conversationKey: connectionChangeKey, signal: controller.signal }
    );
    await vi.waitFor(() => expect(pendingDeleteRequests).toHaveLength(1));
    controller.abort();
    onMessage({
      type: 'opencode-response',
      requestId: pendingDeleteRequests[0].requestId,
      body: 'true'
    });

    await expect(replacementStream).rejects.toThrow(/request was cancelled/);
    expect(sessionCounter).toBe(sessionCountBeforeReset);
  });
});
