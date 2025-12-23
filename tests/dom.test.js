// Test for dom.js utility functions
import { describe, it, expect } from 'vitest';
import { escapeHtml, arrayToCSV } from '../js/core/utils/dom.js';

// Note: With vitest environment: 'jsdom', document and window are automatically available

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    // Note: textContent doesn't escape quotes, only <, >, and &
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
  });

  it('should escape ampersands', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('should escape angle brackets but not quotes', () => {
    // textContent preserves quotes as-is when reading innerHTML
    expect(escapeHtml('He said "hello"')).toBe('He said "hello"');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should handle plain text without special characters', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('should escape multiple special characters', () => {
    // textContent escapes <, >, and & but preserves quotes
    expect(escapeHtml('<div class="test">&</div>')).toBe('&lt;div class="test"&gt;&amp;&lt;/div&gt;');
  });
});

describe('arrayToCSV', () => {
  it('should convert simple array to CSV', () => {
    const data = [
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 }
    ];
    const result = arrayToCSV(data);
    expect(result).toContain('name,age');
    expect(result).toContain('John,30');
    expect(result).toContain('Jane,25');
  });

  it('should use provided headers', () => {
    const data = [
      { name: 'John', age: 30, city: 'NYC' },
      { name: 'Jane', age: 25, city: 'LA' }
    ];
    const headers = ['name', 'city'];
    const result = arrayToCSV(data, headers);
    expect(result).toContain('name,city');
    expect(result).toContain('John,NYC');
    expect(result).toContain('Jane,LA');
    expect(result).not.toContain('age');
  });

  it('should handle empty array with headers', () => {
    const result = arrayToCSV([], ['name', 'age']);
    expect(result).toBe('name,age');
  });

  it('should handle empty array without headers', () => {
    const result = arrayToCSV([]);
    expect(result).toBe('');
  });

  it('should escape commas in values', () => {
    const data = [
      { name: 'John, Jr.', age: 30 }
    ];
    const result = arrayToCSV(data);
    expect(result).toContain('"John, Jr."');
  });

  it('should escape quotes in values', () => {
    const data = [
      { name: 'John "Johnny" Doe', age: 30 }
    ];
    const result = arrayToCSV(data);
    expect(result).toContain('"John ""Johnny"" Doe"');
  });

  it('should escape newlines in values', () => {
    const data = [
      { name: 'John\nDoe', age: 30 }
    ];
    const result = arrayToCSV(data);
    expect(result).toContain('"John\nDoe"');
  });

  it('should handle null and undefined values', () => {
    const data = [
      { name: 'John', age: null, city: undefined }
    ];
    const result = arrayToCSV(data);
    expect(result).toContain('John,,');
  });

  it('should handle numeric values', () => {
    const data = [
      { name: 'John', age: 30, score: 95.5 }
    ];
    const result = arrayToCSV(data);
    expect(result).toContain('John,30,95.5');
  });
});
