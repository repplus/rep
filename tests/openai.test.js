import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOpenAIResponseParser,
  fetchOpenAIModels,
  streamFromOpenAI
} from '../js/features/ai/openai.js';
import { getAISettings, saveAISettings } from '../js/features/ai/core.js';

describe('OpenAI Codex provider', () => {
  beforeEach(() => {
    const values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    });
  });

  it('returns only Codex models', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-5.3-codex' },
          { id: 'gpt-5.2' },
          { id: 'codex-mini-latest' }
        ]
      })
    });

    await expect(fetchOpenAIModels('secret', fetchImpl)).resolves.toEqual([
      { id: 'codex-mini-latest', label: 'codex-mini-latest' },
      { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex' }
    ]);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      headers: { Authorization: 'Bearer secret' }
    }));
  });

  it('parses fragmented Responses API events', () => {
    const events = [];
    const parser = createOpenAIResponseParser(event => events.push(event));
    parser.feed('data: {"type":"response.output_');
    parser.feed('text.delta","delta":"hello"}\n\n');
    parser.feed('data: [DONE]\n\n');

    expect(events).toEqual([{ type: 'response.output_text.delta', delta: 'hello' }]);
  });

  it('times out stalled model discovery', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const result = fetchOpenAIModels('secret', fetchImpl);
    const rejection = expect(result).rejects.toThrow(/model discovery timed out/);
    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    vi.useRealTimers();
  });

  it('streams Responses API text without enabling server storage or tools', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data: {"type":"response.output_text.delta","delta":"hello "}\n\n'),
      encoder.encode('data: {"type":"response.output_text.delta","delta":"world"}\n\n'),
      encoder.encode('data: {"type":"response.completed","response":{}}\n\n')
    ];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => chunks.length > 0
            ? { done: false, value: chunks.shift() }
            : { done: true, value: undefined }
        })
      }
    });
    const updates = [];

    const result = await streamFromOpenAI('secret', 'gpt-5.3-codex', [
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'Inspect this request.' }
    ], text => updates.push(text), fetchImpl);

    expect(result).toBe('hello world');
    expect(updates).toEqual(['hello ', 'hello world']);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      model: 'gpt-5.3-codex',
      instructions: 'Be concise.',
      store: false,
      stream: true
    });
    expect(body.tools).toBeUndefined();
  });

  it('rejects a response stream that closes before completion', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true }) }) }
    });

    await expect(streamFromOpenAI(
      'secret',
      'gpt-5.3-codex',
      [{ role: 'user', content: 'test' }],
      vi.fn(),
      fetchImpl
    )).rejects.toThrow(/before completion/);
  });

  it('returns streamed refusal text as a valid response', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data: {"type":"response.refusal.delta","delta":"I cannot help with that."}\n\n'),
      encoder.encode('data: {"type":"response.completed","response":{}}\n\n')
    ];
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => chunks.length > 0
            ? { done: false, value: chunks.shift() }
            : { done: true }
        })
      }
    });

    await expect(streamFromOpenAI(
      'secret',
      'gpt-5.3-codex',
      [{ role: 'user', content: 'test' }],
      vi.fn(),
      fetchImpl
    )).resolves.toBe('I cannot help with that.');
  });

  it('times out a stalled OpenAI request', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const result = streamFromOpenAI(
      'secret',
      'gpt-5.3-codex',
      [{ role: 'user', content: 'test' }],
      vi.fn(),
      fetchImpl
    );
    const rejection = expect(result).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await rejection;
    vi.useRealTimers();
  });

  it('cancels an active OpenAI request through an external signal', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    const result = streamFromOpenAI(
      'secret',
      'gpt-5.3-codex',
      [{ role: 'user', content: 'test' }],
      vi.fn(),
      fetchImpl,
      { signal: controller.signal }
    );
    controller.abort();

    await expect(result).rejects.toThrow(/cancelled/);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('round-trips OpenAI settings', () => {
    saveAISettings('openai', 'sk-test', 'gpt-5.3-codex');
    expect(getAISettings()).toEqual({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-5.3-codex'
    });
  });
});
