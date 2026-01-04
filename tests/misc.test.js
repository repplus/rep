// Test for misc.js utility functions
import { describe, it, expect } from 'vitest';
import { testRegex, decodeJWT } from '../js/core/utils/misc.js';

describe('testRegex', () => {
  it('should match valid regex patterns', () => {
    expect(testRegex('test', 'this is a test')).toBe(true);
    expect(testRegex('test', 'no match here')).toBe(false);
  });

  it('should handle case-insensitive patterns', () => {
    expect(testRegex('TEST', 'this is a test')).toBe(false); // Case sensitive by default
    expect(testRegex('test', 'This is a TEST')).toBe(false);
  });

  it('should handle regex special characters', () => {
    expect(testRegex('test\\.js', 'test.js')).toBe(true);
    expect(testRegex('test\\.js', 'testjs')).toBe(false);
  });

  it('should handle regex quantifiers', () => {
    expect(testRegex('test+', 'testest')).toBe(true);
    expect(testRegex('test*', 'tes')).toBe(true);
    expect(testRegex('test?', 'tes')).toBe(true);
  });

  it('should handle character classes', () => {
    expect(testRegex('[0-9]+', '123')).toBe(true);
    expect(testRegex('[0-9]+', 'abc')).toBe(false);
  });

  it('should return false for invalid regex patterns', () => {
    expect(testRegex('[invalid', 'test')).toBe(false); // Unclosed bracket
    expect(testRegex('(unclosed', 'test')).toBe(false); // Unclosed parenthesis
  });

  it('should handle empty pattern', () => {
    expect(testRegex('', 'anything')).toBe(true); // Empty regex matches everything
  });

  it('should handle empty string', () => {
    expect(testRegex('test', '')).toBe(false);
    expect(testRegex('', '')).toBe(true);
  });
});

describe('decodeJWT', () => {
  // Valid JWT test token (header.payload.signature)
  // Header: {"alg":"HS256","typ":"JWT"}
  // Payload: {"sub":"1234567890","name":"John Doe","iat":1516239022,"exp":9999999999}
  const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.signature';

  it('should decode valid JWT', () => {
    const result = decodeJWT(validJWT);
    expect(result).toContain('JWT Decoded');
    expect(result).toContain('HEADER');
    expect(result).toContain('PAYLOAD');
    expect(result).toContain('SIGNATURE');
    expect(result).toContain('HS256');
    expect(result).toContain('John Doe');
  });

  it('should handle JWT with expiration claim', () => {
    // Create a JWT with exp claim in the future
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = btoa(JSON.stringify({ exp: futureExp })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const jwt = `${header}.${payload}.signature`;
    
    const result = decodeJWT(jwt);
    expect(result).toContain('TOKEN INFO');
    expect(result).toContain('VALID');
  });

  it('should handle JWT with expired token', () => {
    // Create a JWT with exp claim in the past
    const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = btoa(JSON.stringify({ exp: pastExp })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const jwt = `${header}.${payload}.signature`;
    
    const result = decodeJWT(jwt);
    expect(result).toContain('EXPIRED');
  });

  it('should throw error for invalid JWT format', () => {
    // Only single part throws "Invalid JWT format" (parts.length !== 3)
    expect(() => decodeJWT('one')).toThrow('Invalid JWT format');
    // Two parts tries to decode base64, which fails with different error
    expect(() => decodeJWT('only.two.parts')).toThrow('JWT decode failed');
    // Invalid base64 throws decode error
    expect(() => decodeJWT('invalid.jwt')).toThrow('JWT decode failed');
  });

  it('should throw error for invalid base64', () => {
    expect(() => decodeJWT('invalid.base64.signature')).toThrow('Failed to decode');
  });

  it('should handle JWT with whitespace', () => {
    const result = decodeJWT(`  ${validJWT}  `);
    expect(result).toContain('JWT Decoded');
  });

  it('should handle JWT without exp claim', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = btoa(JSON.stringify({ sub: '123' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const jwt = `${header}.${payload}.signature`;
    
    const result = decodeJWT(jwt);
    expect(result).toContain('JWT Decoded');
    expect(result).not.toContain('TOKEN INFO'); // No exp claim, so no token info
  });
});

