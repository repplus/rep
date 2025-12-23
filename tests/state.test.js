// Test for state management functions
import { describe, it, expect, beforeEach } from 'vitest';
import { state, addRequest, clearRequests, addToHistory } from '../js/core/state/index.js';

describe('State Management', () => {
  beforeEach(() => {
    // Reset state before each test
    clearRequests();
    state.selectedMethods.clear();
    state.starFilterActive = false;
    state.currentColorFilter = 'all';
    state.currentSearchTerm = '';
    state.useRegex = false;
    state.starredPages.clear();
    state.starredDomains.clear();
    state.domainsWithAttackSurface.clear();
    state.blockedQueue = [];
    state.blockRequests = false;
  });

  describe('addRequest', () => {
    it('should add a request to state.requests', () => {
      const request = {
        request: { method: 'GET', url: 'https://example.com' },
        response: { status: 200 }
      };

      const index = addRequest(request);

      expect(state.requests).toHaveLength(1);
      expect(state.requests[0]).toBe(request);
      expect(index).toBe(0);
    });

    it('should initialize request defaults', () => {
      const request = {
        request: { method: 'POST', url: 'https://example.com/api' }
      };

      addRequest(request);

      expect(request.starred).toBe(false);
      expect(request.color).toBe(null);
      expect(request.name).toBe(null);
    });

    it('should reset starred status to false', () => {
      // addRequest always sets starred to false, even if it was true
      const request = {
        request: { method: 'GET', url: 'https://example.com' },
        starred: true
      };

      addRequest(request);

      expect(request.starred).toBe(false);
    });

    it('should reset color to null', () => {
      // addRequest always sets color to null, even if it had a value
      const request = {
        request: { method: 'GET', url: 'https://example.com' },
        color: 'red'
      };

      addRequest(request);

      expect(request.color).toBe(null);
    });

    it('should preserve existing name', () => {
      const request = {
        request: { method: 'GET', url: 'https://example.com' },
        name: 'My Request'
      };

      addRequest(request);

      expect(request.name).toBe('My Request');
    });

    it('should return correct index for multiple requests', () => {
      const req1 = { request: { method: 'GET', url: 'https://example.com/1' } };
      const req2 = { request: { method: 'POST', url: 'https://example.com/2' } };
      const req3 = { request: { method: 'PUT', url: 'https://example.com/3' } };

      expect(addRequest(req1)).toBe(0);
      expect(addRequest(req2)).toBe(1);
      expect(addRequest(req3)).toBe(2);

      expect(state.requests).toHaveLength(3);
    });
  });

  describe('clearRequests', () => {
    it('should clear all requests', () => {
      addRequest({ request: { method: 'GET', url: 'https://example.com/1' } });
      addRequest({ request: { method: 'POST', url: 'https://example.com/2' } });

      clearRequests();

      expect(state.requests).toHaveLength(0);
    });

    it('should reset selectedRequest', () => {
      const request = { request: { method: 'GET', url: 'https://example.com' } };
      addRequest(request);
      state.selectedRequest = request;

      clearRequests();

      expect(state.selectedRequest).toBe(null);
    });

    it('should clear request history', () => {
      addToHistory('GET /api', false);
      addToHistory('POST /api', true);

      clearRequests();

      expect(state.requestHistory).toHaveLength(0);
      expect(state.historyIndex).toBe(-1);
    });

    it('should reset timeline filter', () => {
      state.timelineFilterTimestamp = Date.now();
      state.timelineFilterRequestIndex = 5;

      clearRequests();

      expect(state.timelineFilterTimestamp).toBe(null);
      expect(state.timelineFilterRequestIndex).toBe(null);
    });

    it('should clear attack surface data', () => {
      state.attackSurfaceCategories = { 0: { category: 'test' } };
      state.domainsWithAttackSurface.add('example.com');

      clearRequests();

      expect(state.attackSurfaceCategories).toEqual({});
      expect(state.domainsWithAttackSurface.size).toBe(0);
    });

    it('should reset diff state', () => {
      state.regularRequestBaseline = { status: 200 };
      state.currentResponse = { status: 404 };

      clearRequests();

      expect(state.regularRequestBaseline).toBe(null);
      expect(state.currentResponse).toBe(null);
    });
  });

  describe('addToHistory', () => {
    it('should add entry to history', () => {
      addToHistory('GET /api', false);

      expect(state.requestHistory).toHaveLength(1);
      expect(state.requestHistory[0]).toEqual({ rawText: 'GET /api', useHttps: false });
      expect(state.historyIndex).toBe(0);
    });

    it('should increment history index', () => {
      addToHistory('GET /api', false);
      addToHistory('POST /api', true);

      expect(state.requestHistory).toHaveLength(2);
      expect(state.historyIndex).toBe(1);
    });

    it('should not add duplicate consecutive entries', () => {
      addToHistory('GET /api', false);
      addToHistory('GET /api', false); // Same as current

      expect(state.requestHistory).toHaveLength(1);
      expect(state.historyIndex).toBe(0);
    });

    it('should add if useHttps differs', () => {
      addToHistory('GET /api', false);
      addToHistory('GET /api', true); // Different useHttps

      expect(state.requestHistory).toHaveLength(2);
    });

    it('should discard future history when adding new entry in middle', () => {
      addToHistory('GET /api', false);
      addToHistory('POST /api', false);
      addToHistory('PUT /api', false);

      // Go back in history
      state.historyIndex = 0;

      // Add new entry - should discard future entries
      addToHistory('DELETE /api', false);

      expect(state.requestHistory).toHaveLength(2);
      expect(state.requestHistory[0]).toEqual({ rawText: 'GET /api', useHttps: false });
      expect(state.requestHistory[1]).toEqual({ rawText: 'DELETE /api', useHttps: false });
      expect(state.historyIndex).toBe(1);
    });

    it('should handle empty history', () => {
      addToHistory('GET /api', false);

      expect(state.requestHistory).toHaveLength(1);
      expect(state.historyIndex).toBe(0);
    });
  });

  describe('Filter State', () => {
    it('should initialize filter state correctly', () => {
      expect(state.currentFilter).toBe('all');
      expect(state.selectedMethods.size).toBe(0);
      expect(state.starFilterActive).toBe(false);
      expect(state.currentColorFilter).toBe('all');
      expect(state.currentSearchTerm).toBe('');
      expect(state.useRegex).toBe(false);
    });

    it('should allow setting selected methods', () => {
      state.selectedMethods.add('GET');
      state.selectedMethods.add('POST');

      expect(state.selectedMethods.has('GET')).toBe(true);
      expect(state.selectedMethods.has('POST')).toBe(true);
      expect(state.selectedMethods.size).toBe(2);
    });

    it('should allow removing selected methods', () => {
      state.selectedMethods.add('GET');
      state.selectedMethods.add('POST');
      state.selectedMethods.delete('GET');

      expect(state.selectedMethods.has('GET')).toBe(false);
      expect(state.selectedMethods.has('POST')).toBe(true);
      expect(state.selectedMethods.size).toBe(1);
    });
  });

  describe('Starring State', () => {
    it('should initialize starring state correctly', () => {
      expect(state.starredPages.size).toBe(0);
      expect(state.starredDomains.size).toBe(0);
    });

    it('should allow starring pages', () => {
      state.starredPages.add('example.com');

      expect(state.starredPages.has('example.com')).toBe(true);
      expect(state.starredPages.size).toBe(1);
    });

    it('should allow starring domains', () => {
      state.starredDomains.add('api.example.com');

      expect(state.starredDomains.has('api.example.com')).toBe(true);
      expect(state.starredDomains.size).toBe(1);
    });

    it('should allow unstarring', () => {
      state.starredPages.add('example.com');
      state.starredPages.delete('example.com');

      expect(state.starredPages.has('example.com')).toBe(false);
      expect(state.starredPages.size).toBe(0);
    });
  });

  describe('Blocking State', () => {
    it('should initialize blocking state correctly', () => {
      expect(state.blockRequests).toBe(false);
      expect(state.blockedQueue).toEqual([]);
    });

    it('should allow setting block mode', () => {
      state.blockRequests = true;

      expect(state.blockRequests).toBe(true);
    });

    it('should allow adding to blocked queue', () => {
      const request = { request: { method: 'GET', url: 'https://example.com' } };
      state.blockedQueue.push(request);

      expect(state.blockedQueue).toHaveLength(1);
      expect(state.blockedQueue[0]).toBe(request);
    });
  });
});

