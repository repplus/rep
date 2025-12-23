// Test for network.js utility functions
import { describe, it, expect } from 'vitest';
import { getHostname } from '../js/core/utils/network.js';

describe('getHostname', () => {
  it('should extract hostname from HTTP URL', () => {
    expect(getHostname('http://example.com/path')).toBe('example.com');
  });

  it('should extract hostname from HTTPS URL', () => {
    expect(getHostname('https://example.com/path')).toBe('example.com');
  });

  it('should extract hostname from URL with port', () => {
    expect(getHostname('http://localhost:3000/api')).toBe('localhost');
    expect(getHostname('https://example.com:8080/path')).toBe('example.com');
  });

  it('should extract hostname from URL with query parameters', () => {
    expect(getHostname('https://example.com/path?param=value')).toBe('example.com');
  });

  it('should extract hostname from URL with subdomain', () => {
    expect(getHostname('https://api.example.com/v1/users')).toBe('api.example.com');
  });

  it('should extract hostname from URL with multiple subdomains', () => {
    expect(getHostname('https://sub1.sub2.example.com/path')).toBe('sub1.sub2.example.com');
  });

  it('should return "unknown" for invalid URL', () => {
    expect(getHostname('not-a-url')).toBe('unknown');
    expect(getHostname('')).toBe('unknown');
    expect(getHostname('://invalid')).toBe('unknown');
  });

  it('should handle URLs with IP addresses', () => {
    expect(getHostname('http://192.168.1.1/api')).toBe('192.168.1.1');
    expect(getHostname('http://127.0.0.1:3000')).toBe('127.0.0.1');
  });

  it('should handle URLs with IPv6 addresses', () => {
    expect(getHostname('http://[2001:db8::1]/path')).toBe('[2001:db8::1]');
  });
});

