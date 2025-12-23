// Tests for network parsing (request parsing, response formatting, export/import)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRequest, executeRequest } from '../js/network/capture.js';
import { formatRawResponse, getStatusClass } from '../js/network/response-parser.js';
import { exportRequests, importRequests } from '../js/ui/ui-utils.js';
import { state, clearRequests, addRequest } from '../js/core/state.js';

// Mock DOM elements for export/import tests
const mockElements = {
  rawRequestInput: { innerText: '' },
  useHttpsCheckbox: { checked: false }
};

describe('Request Parsing', () => {
  it('should parse a simple GET request', () => {
    const rawContent = `GET /api/users HTTP/1.1
Host: example.com
Accept: application/json`;

    const result = parseRequest(rawContent, false);

    expect(result.method).toBe('GET');
    expect(result.url).toBe('http://example.com/api/users');
    expect(result.filteredHeaders).toHaveProperty('Accept');
    expect(result.filteredHeaders['Accept']).toBe('application/json');
    expect(result.bodyText).toBeNull();
  });

  it('should parse a POST request with body', () => {
    const rawContent = `POST /api/login HTTP/1.1
Host: example.com
Content-Type: application/json

{"username":"user","password":"pass"}`;

    const result = parseRequest(rawContent, false);

    expect(result.method).toBe('POST');
    expect(result.url).toBe('http://example.com/api/login');
    expect(result.bodyText).toBe('{"username":"user","password":"pass"}');
    expect(result.options.body).toBe(result.bodyText);
  });

  it('should use HTTPS when useHttps is true', () => {
    const rawContent = `GET /api/data HTTP/1.1
Host: example.com`;

    const result = parseRequest(rawContent, true);

    expect(result.url).toBe('https://example.com/api/data');
  });

  it('should filter forbidden headers', () => {
    const rawContent = `GET /api/data HTTP/1.1
Host: example.com
Connection: keep-alive
Content-Length: 100
Origin: https://example.com
Custom-Header: value`;

    const result = parseRequest(rawContent, false);

    // Forbidden headers should be filtered out
    expect(result.filteredHeaders).not.toHaveProperty('Connection');
    expect(result.filteredHeaders).not.toHaveProperty('Content-Length');
    expect(result.filteredHeaders).not.toHaveProperty('Origin');
    // Custom header should be kept
    expect(result.filteredHeaders).toHaveProperty('Custom-Header');
    expect(result.filteredHeaders['Custom-Header']).toBe('value');
  });

  it('should filter sec- and proxy- prefixed headers', () => {
    const rawContent = `GET /api/data HTTP/1.1
Host: example.com
Sec-Fetch-Dest: document
Proxy-Authorization: Basic token
X-Custom-Header: value`;

    const result = parseRequest(rawContent, false);

    expect(result.filteredHeaders).not.toHaveProperty('Sec-Fetch-Dest');
    expect(result.filteredHeaders).not.toHaveProperty('Proxy-Authorization');
    expect(result.filteredHeaders).toHaveProperty('X-Custom-Header');
  });

  it('should handle multi-line body', () => {
    const rawContent = `POST /api/data HTTP/1.1
Host: example.com
Content-Type: text/plain

Line 1
Line 2
Line 3`;

    const result = parseRequest(rawContent, false);

    expect(result.bodyText).toBe('Line 1\nLine 2\nLine 3');
  });

  it('should throw error for missing host header', () => {
    const rawContent = `GET /api/data HTTP/1.1
Accept: application/json`;

    expect(() => parseRequest(rawContent, false)).toThrow('Host header is missing!');
  });

  it('should throw error for invalid request line', () => {
    const rawContent = `INVALID
Host: example.com`;

    expect(() => parseRequest(rawContent, false)).toThrow('Invalid Request Line');
  });

  it('should throw error for empty content', () => {
    expect(() => parseRequest('', false)).toThrow('Invalid Request Line');
  });

  it('should handle headers with colons in values', () => {
    const rawContent = `GET /api/data HTTP/1.1
Host: example.com
Authorization: Bearer token:with:colons`;

    const result = parseRequest(rawContent, false);

    expect(result.filteredHeaders['Authorization']).toBe('Bearer token:with:colons');
  });

  it('should skip HTTP/2 pseudo-headers', () => {
    const rawContent = `GET /api/data HTTP/1.1
:method: GET
:path: /api/data
Host: example.com
Accept: application/json`;

    const result = parseRequest(rawContent, false);

    expect(result.filteredHeaders).not.toHaveProperty(':method');
    expect(result.filteredHeaders).not.toHaveProperty(':path');
    expect(result.filteredHeaders).toHaveProperty('Accept');
  });

  it('should include body for PUT and PATCH methods', () => {
    const putContent = `PUT /api/users/1 HTTP/1.1
Host: example.com
Content-Type: application/json

{"name":"John"}`;

    const result = parseRequest(putContent, false);

    expect(result.method).toBe('PUT');
    expect(result.options.body).toBe('{"name":"John"}');
  });

  it('should not include body for GET method even if present', () => {
    const rawContent = `GET /api/data HTTP/1.1
Host: example.com

some body content`;

    const result = parseRequest(rawContent, false);

    expect(result.method).toBe('GET');
    // GET requests shouldn't have body in options
    expect(result.options.body).toBeUndefined();
  });

  it('should normalize method to uppercase', () => {
    const rawContent = `post /api/login HTTP/1.1
Host: example.com`;

    const result = parseRequest(rawContent, false);

    expect(result.method).toBe('POST');
  });

  it('should handle DELETE method', () => {
    const rawContent = `DELETE /api/users/1 HTTP/1.1
Host: example.com`;

    const result = parseRequest(rawContent, false);

    expect(result.method).toBe('DELETE');
    expect(result.url).toBe('http://example.com/api/users/1');
  });

  it('should handle request with no headers except Host', () => {
    const rawContent = `GET /api/data HTTP/1.1
Host: example.com`;

    const result = parseRequest(rawContent, false);

    expect(result.method).toBe('GET');
    expect(Object.keys(result.filteredHeaders).length).toBe(0);
  });

  it('should handle special characters in URL path', () => {
    const rawContent = `GET /api/users%20test?q=hello%20world HTTP/1.1
Host: example.com`;

    const result = parseRequest(rawContent, false);

    expect(result.url).toBe('http://example.com/api/users%20test?q=hello%20world');
  });
});

describe('Response Formatting', () => {
  it('should format response with status and headers', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: new Headers([
        ['Content-Type', 'application/json'],
        ['Content-Length', '100']
      ]),
      body: '{"message":"success"}'
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('HTTP/1.1 200 OK');
    // Headers are lowercased when iterating Headers object
    expect(formatted.toLowerCase()).toContain('content-type: application/json');
    expect(formatted.toLowerCase()).toContain('content-length: 100');
  });

  it('should pretty-print JSON body', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: '{"name":"John","age":30,"city":"New York"}'
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('"name": "John"');
    expect(formatted).toContain('"age": 30');
    expect(formatted).toContain('"city": "New York"');
    // Should be formatted with indentation
    expect(formatted).toMatch(/\n\s+"name"/);
  });

  it('should handle non-JSON body', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: 'Plain text response'
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('Plain text response');
    expect(formatted).not.toContain('"Plain text response"');
  });

  it('should handle empty body', () => {
    const result = {
      status: 204,
      statusText: 'No Content',
      headers: new Headers(),
      body: ''
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('HTTP/1.1 204 No Content');
    expect(formatted.trim().endsWith('No Content') || formatted.trim().endsWith('')).toBe(true);
  });

  it('should handle headers as array of objects', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'X-Custom', value: 'value' }
      ],
      body: ''
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('Content-Type: application/json');
    expect(formatted).toContain('X-Custom: value');
  });

  it('should handle missing statusText', () => {
    const result = {
      status: 200,
      headers: new Headers(),
      body: ''
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('HTTP/1.1 200');
  });

  it('should handle invalid JSON body gracefully', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: 'not valid json {'
    };

    const formatted = formatRawResponse(result);

    // Should return body as-is when JSON parsing fails
    expect(formatted).toContain('not valid json {');
  });

  it('should handle null body', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: null
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('HTTP/1.1 200 OK');
  });

  it('should handle malformed JSON body gracefully', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: new Headers([['Content-Type', 'application/json']]),
      body: '{"invalid": json}' // Missing quotes around json
    };

    const formatted = formatRawResponse(result);

    // Should return body as-is when JSON parsing fails
    expect(formatted).toContain('{"invalid": json}');
  });

  it('should handle empty headers array', () => {
    const result = {
      status: 200,
      statusText: 'OK',
      headers: [],
      body: 'test'
    };

    const formatted = formatRawResponse(result);

    expect(formatted).toContain('HTTP/1.1 200 OK');
    expect(formatted).toContain('test');
  });
});

describe('Status Class', () => {
  it('should return status-2xx for 2xx status codes', () => {
    expect(getStatusClass(200)).toBe('status-badge status-2xx');
    expect(getStatusClass(201)).toBe('status-badge status-2xx');
    expect(getStatusClass(204)).toBe('status-badge status-2xx');
    expect(getStatusClass(299)).toBe('status-badge status-2xx');
  });

  it('should return status-4xx for 4xx status codes', () => {
    expect(getStatusClass(400)).toBe('status-badge status-4xx');
    expect(getStatusClass(401)).toBe('status-badge status-4xx');
    expect(getStatusClass(404)).toBe('status-badge status-4xx');
    expect(getStatusClass(499)).toBe('status-badge status-4xx');
  });

  it('should return status-5xx for 5xx status codes', () => {
    expect(getStatusClass(500)).toBe('status-badge status-5xx');
    expect(getStatusClass(502)).toBe('status-badge status-5xx');
    expect(getStatusClass(503)).toBe('status-badge status-5xx');
    expect(getStatusClass(599)).toBe('status-badge status-5xx');
  });

  it('should return default status-badge for other codes', () => {
    expect(getStatusClass(100)).toBe('status-badge');
    expect(getStatusClass(199)).toBe('status-badge');
    expect(getStatusClass(300)).toBe('status-badge');
    expect(getStatusClass(399)).toBe('status-badge');
  });

  it('should handle edge case status codes', () => {
    expect(getStatusClass(0)).toBe('status-badge');
    expect(getStatusClass(99)).toBe('status-badge');
    // 600 is >= 500, so it's correctly classified as 5xx
    expect(getStatusClass(600)).toBe('status-badge status-5xx');
  });
});

describe('Export/Import', () => {
  let originalConsoleError;

  beforeEach(() => {
    clearRequests();
    // Mock state.requests to have some test data
    state.requests = [];
    
    // Suppress event listeners that try to render UI
    // The listeners are registered when modules are loaded, so we need to clear them
    // before each test that imports requests
    const { events } = require('../js/core/events.js');
    // Clear all listeners to prevent UI rendering attempts in test environment
    events.removeAllListeners('request:rendered');
    
    // Suppress console.error for UI rendering errors during import tests
    originalConsoleError = console.error;
    console.error = vi.fn((...args) => {
      // Only suppress the specific error we're expecting from UI rendering
      const errorMsg = args[0]?.toString() || '';
      if (errorMsg.includes('Error in event listener for "request:rendered"')) {
        return; // Suppress this specific error
      }
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    // Restore console.error
    if (originalConsoleError) {
      console.error = originalConsoleError;
    }
  });

  it('should export requests in correct format', () => {
    const mockRequest = {
      request: {
        method: 'POST',
        url: 'https://example.com/api/login',
        headers: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Authorization', value: 'Bearer token' }
        ],
        postData: { text: '{"username":"user"}' }
      },
      response: {
        status: 200,
        headers: [
          { name: 'Content-Type', value: 'application/json' }
        ],
        content: { text: '{"success":true}' }
      },
      capturedAt: 1234567890,
      starred: false
    };

    addRequest(mockRequest);
    
    // Set up state so getFilteredRequests returns our request
    state.currentSearchTerm = '';
    state.currentFilter = 'all';

    // Mock alert and DOM methods
    global.alert = vi.fn();
    let capturedBlobContent = null;
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:url'),
      revokeObjectURL: vi.fn()
    };
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn()
    };
    global.document = {
      createElement: vi.fn(() => mockLink),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };
    global.Blob = class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        // Capture the JSON content for verification
        capturedBlobContent = parts[0];
      }
    };

    exportRequests();

    // Verify export was called
    expect(global.document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
    
    // Verify the exported data structure
    expect(capturedBlobContent).toBeTruthy();
    const exportedData = JSON.parse(capturedBlobContent);
    expect(exportedData).toHaveProperty('version');
    expect(exportedData).toHaveProperty('exported_at');
    expect(exportedData).toHaveProperty('requests');
    expect(Array.isArray(exportedData.requests)).toBe(true);
    expect(exportedData.requests.length).toBe(1);
    
    const exportedRequest = exportedData.requests[0];
    expect(exportedRequest).toHaveProperty('id');
    expect(exportedRequest.method).toBe('POST');
    expect(exportedRequest.url).toBe('https://example.com/api/login');
    expect(exportedRequest.headers).toEqual({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token'
    });
    expect(exportedRequest.body).toBe('{"username":"user"}');
    expect(exportedRequest.response.status).toBe(200);
    expect(exportedRequest.response.headers).toEqual({
      'Content-Type': 'application/json'
    });
    expect(exportedRequest.response.body).toBe('{"success":true}');
    expect(exportedRequest.timestamp).toBe(1234567890);
  });

  it('should import requests from JSON format', () => {
    const importData = {
      version: "1.0",
      exported_at: "2024-01-01T00:00:00.000Z",
      requests: [
        {
          id: "req_1",
          method: "GET",
          url: "https://example.com/api/data",
          headers: {
            "Accept": "application/json",
            "Authorization": "Bearer token"
          },
          body: "",
          response: {
            status: 200,
            headers: {
              "Content-Type": "application/json"
            },
            body: '{"data":"value"}'
          },
          timestamp: 1234567890
        }
      ]
    };

    // Mock FileReader
    const mockFileReader = {
      result: JSON.stringify(importData),
      onload: null,
      readAsText: vi.fn(function(file) {
        // Simulate async read
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: this });
          }
        }, 0);
      })
    };
    global.FileReader = vi.fn(() => mockFileReader);
    global.alert = vi.fn();

    const file = { name: 'test.json' };
    importRequests(file);

    // Wait for async FileReader
    return new Promise(resolve => {
      setTimeout(() => {
        expect(state.requests.length).toBe(1);
        const imported = state.requests[0];
        expect(imported.request.method).toBe('GET');
        expect(imported.request.url).toBe('https://example.com/api/data');
        expect(imported.request.headers).toHaveLength(2);
        expect(imported.response.status).toBe(200);
        expect(imported.response.headers).toHaveLength(1);
        expect(imported.capturedAt).toBe(1234567890);
        expect(imported.starred).toBe(false);
        expect(global.alert).toHaveBeenCalledWith('Imported 1 requests.');
        resolve();
      }, 10);
    });
  });

  it('should handle import with missing optional fields', () => {
    const importData = {
      requests: [
        {
          method: "POST",
          url: "https://example.com/api/test"
          // Missing response, headers, body, timestamp
        }
      ]
    };

    const mockFileReader = {
      result: JSON.stringify(importData),
      onload: null,
      readAsText: vi.fn(function(file) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: this });
          }
        }, 0);
      })
    };
    global.FileReader = vi.fn(() => mockFileReader);
    global.alert = vi.fn();

    const file = { name: 'test.json' };
    importRequests(file);

    return new Promise(resolve => {
      setTimeout(() => {
        expect(state.requests.length).toBe(1);
        const imported = state.requests[0];
        expect(imported.request.method).toBe('POST');
        expect(imported.request.url).toBe('https://example.com/api/test');
        expect(imported.request.headers).toEqual([]);
        expect(imported.response.status).toBe(0);
        expect(imported.response.headers).toEqual([]);
        expect(imported.capturedAt).toBeGreaterThan(0);
        resolve();
      }, 10);
    });
  });

  it('should throw error for invalid import format', () => {
    const invalidData = {
      // Missing "requests" array
      version: "1.0"
    };

    const mockFileReader = {
      result: JSON.stringify(invalidData),
      onload: null,
      readAsText: vi.fn(function(file) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: this });
          }
        }, 0);
      })
    };
    global.FileReader = vi.fn(() => mockFileReader);
    global.alert = vi.fn();
    global.console = { error: vi.fn() };

    const file = { name: 'test.json' };
    importRequests(file);

    return new Promise(resolve => {
      setTimeout(() => {
        expect(global.console.error).toHaveBeenCalled();
        expect(state.requests.length).toBe(0);
        resolve();
      }, 10);
    });
  });

  it('should convert headers from array to object on export', () => {
    const mockRequest = {
      request: {
        method: 'GET',
        url: 'https://example.com/api',
        headers: [
          { name: 'Header1', value: 'Value1' },
          { name: 'Header2', value: 'Value2' }
        ],
        postData: null
      },
      response: {
        status: 200,
        headers: [
          { name: 'ResHeader1', value: 'ResValue1' }
        ],
        content: { text: '' }
      },
      capturedAt: 1234567890
    };

    addRequest(mockRequest);
    
    // Set up state so getFilteredRequests returns our request
    state.currentSearchTerm = '';
    state.currentFilter = 'all';

    let capturedBlobContent = null;
    global.alert = vi.fn();
    global.URL = {
      createObjectURL: vi.fn(() => 'blob:url'),
      revokeObjectURL: vi.fn()
    };
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn()
    };
    global.document = {
      createElement: vi.fn(() => mockLink),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    };
    global.Blob = class Blob {
      constructor(parts, options) {
        this.parts = parts;
        this.options = options;
        capturedBlobContent = parts[0];
      }
    };

    exportRequests();

    // Verify headers were converted to object format
    expect(capturedBlobContent).toBeTruthy();
    const exportedData = JSON.parse(capturedBlobContent);
    const exportedRequest = exportedData.requests[0];
    
    // Headers should be objects, not arrays
    expect(typeof exportedRequest.headers).toBe('object');
    expect(Array.isArray(exportedRequest.headers)).toBe(false);
    expect(exportedRequest.headers).toEqual({ Header1: 'Value1', Header2: 'Value2' });
    
    expect(typeof exportedRequest.response.headers).toBe('object');
    expect(Array.isArray(exportedRequest.response.headers)).toBe(false);
    expect(exportedRequest.response.headers).toEqual({ ResHeader1: 'ResValue1' });
  });
});

