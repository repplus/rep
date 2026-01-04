// Test for format.js utility functions
import { describe, it, expect } from 'vitest';
import { formatBytes, formatTime } from '../js/core/utils/format.js';

describe('formatBytes', () => {
  it('should format 0 bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
  });

  it('should format bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 Bytes');
  });

  it('should format kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('should format gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('should respect decimal places', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
    // Note: parseFloat removes trailing zeros, so 3 decimals still shows as 1.5
    expect(formatBytes(1536, 3)).toBe('1.5 KB');
    // Test with a value that actually needs 3 decimals
    expect(formatBytes(1537, 3)).toBe('1.501 KB');
  });
});

describe('formatTime', () => {
  it('should return empty string for invalid input', () => {
    expect(formatTime(null)).toBe('');
    expect(formatTime(undefined)).toBe('');
  });

  it('should format timestamp correctly', () => {
    // Create a fixed date: 2024-01-15 14:30:45
    const timestamp = new Date('2024-01-15T14:30:45').getTime();
    expect(formatTime(timestamp)).toBe('14:30:45');
  });

  it('should pad single digit hours, minutes, and seconds', () => {
    // 2024-01-15 09:05:03
    const timestamp = new Date('2024-01-15T09:05:03').getTime();
    expect(formatTime(timestamp)).toBe('09:05:03');
  });
});

