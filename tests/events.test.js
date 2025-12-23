// Test for event system (EventBus)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { events, EVENT_NAMES } from '../js/core/events.js';

describe('EventBus', () => {
  beforeEach(() => {
    // Clear all listeners before each test to avoid interference
    events.removeAllListeners();
  });

  describe('Event Emission and Listening', () => {
    it('should emit and receive events', () => {
      let receivedData = null;
      
      events.on('test:event', (data) => {
        receivedData = data;
      });

      events.emit('test:event', { message: 'hello' });

      expect(receivedData).toEqual({ message: 'hello' });
    });

    it('should support multiple listeners for same event', () => {
      const results = [];

      events.on('test:event', (data) => {
        results.push('listener1');
      });

      events.on('test:event', (data) => {
        results.push('listener2');
      });

      events.emit('test:event', {});

      expect(results).toHaveLength(2);
      expect(results).toContain('listener1');
      expect(results).toContain('listener2');
    });

    it('should pass data to all listeners', () => {
      const data1 = [];
      const data2 = [];

      events.on('test:event', (data) => {
        data1.push(data);
      });

      events.on('test:event', (data) => {
        data2.push(data);
      });

      events.emit('test:event', { value: 42 });

      expect(data1[0]).toEqual({ value: 42 });
      expect(data2[0]).toEqual({ value: 42 });
    });

    it('should handle events with no listeners', () => {
      // Should not throw when emitting to non-existent event
      expect(() => {
        events.emit('nonexistent:event', {});
      }).not.toThrow();
    });

    it('should handle events with no data', () => {
      let called = false;

      events.on('test:event', (data) => {
        called = true;
        expect(data).toBeUndefined();
      });

      events.emit('test:event');

      expect(called).toBe(true);
    });
  });

  describe('Event Unsubscription', () => {
    it('should allow unsubscribing from events', () => {
      let callCount = 0;

      const unsubscribe = events.on('test:event', () => {
        callCount++;
      });

      events.emit('test:event');
      expect(callCount).toBe(1);

      unsubscribe();

      events.emit('test:event');
      expect(callCount).toBe(1); // Should not increment
    });

    it('should allow unsubscribing using off()', () => {
      let callCount = 0;

      const handler = () => {
        callCount++;
      };

      events.on('test:event', handler);

      events.emit('test:event');
      expect(callCount).toBe(1);

      events.off('test:event', handler);

      events.emit('test:event');
      expect(callCount).toBe(1); // Should not increment
    });

    it('should only remove the specific listener', () => {
      let count1 = 0;
      let count2 = 0;

      const handler1 = () => { count1++; };
      const handler2 = () => { count2++; };

      events.on('test:event', handler1);
      events.on('test:event', handler2);

      events.emit('test:event');
      expect(count1).toBe(1);
      expect(count2).toBe(1);

      events.off('test:event', handler1);

      events.emit('test:event');
      expect(count1).toBe(1); // Should not increment
      expect(count2).toBe(2); // Should still increment
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific event', () => {
      let count1 = 0;
      let count2 = 0;

      events.on('test:event', () => { count1++; });
      events.on('test:event', () => { count2++; });
      events.on('other:event', () => { /* should not be removed */ });

      events.removeAllListeners('test:event');

      events.emit('test:event');
      expect(count1).toBe(0);
      expect(count2).toBe(0);
    });

    it('should remove all listeners when no event specified', () => {
      let count1 = 0;
      let count2 = 0;

      events.on('test:event', () => { count1++; });
      events.on('other:event', () => { count2++; });

      events.removeAllListeners();

      events.emit('test:event');
      events.emit('other:event');

      expect(count1).toBe(0);
      expect(count2).toBe(0);
    });
  });

  describe('listenerCount', () => {
    it('should return correct listener count', () => {
      expect(events.listenerCount('test:event')).toBe(0);

      events.on('test:event', () => {});
      expect(events.listenerCount('test:event')).toBe(1);

      events.on('test:event', () => {});
      expect(events.listenerCount('test:event')).toBe(2);

      events.removeAllListeners('test:event');
      expect(events.listenerCount('test:event')).toBe(0);
    });

    it('should return 0 for non-existent events', () => {
      expect(events.listenerCount('nonexistent:event')).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in listeners gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      events.on('test:event', () => {
        throw new Error('Listener error');
      });

      events.on('test:event', () => {
        // This should still be called
      });

      let secondCalled = false;
      events.on('test:event', () => {
        secondCalled = true;
      });

      // Should not throw, but should log error
      expect(() => {
        events.emit('test:event');
      }).not.toThrow();

      expect(secondCalled).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should continue executing other listeners after error', () => {
      // Suppress console.error output for this test to avoid stderr noise
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const results = [];

      events.on('test:event', () => {
        results.push('before-error');
        throw new Error('Error in listener');
      });

      events.on('test:event', () => {
        results.push('after-error');
      });

      events.emit('test:event');

      expect(results).toContain('before-error');
      expect(results).toContain('after-error');
      expect(consoleErrorSpy).toHaveBeenCalled(); // Verify error was logged

      consoleErrorSpy.mockRestore();
    });
  });

  describe('EVENT_NAMES Constants', () => {
    it('should have REQUEST_SELECTED constant', () => {
      expect(EVENT_NAMES.REQUEST_SELECTED).toBe('request:selected');
    });

    it('should have UI_UPDATE_REQUEST_LIST constant', () => {
      expect(EVENT_NAMES.UI_UPDATE_REQUEST_LIST).toBe('ui:update-request-list');
    });

    it('should have REQUEST_RENDERED constant', () => {
      expect(EVENT_NAMES.REQUEST_RENDERED).toBe('request:rendered');
    });

    it('should have UI_UPDATE_HISTORY_BUTTONS constant', () => {
      expect(EVENT_NAMES.UI_UPDATE_HISTORY_BUTTONS).toBe('ui:update-history-buttons');
    });

    it('should have NETWORK_REQUEST_CAPTURED constant', () => {
      expect(EVENT_NAMES.NETWORK_REQUEST_CAPTURED).toBe('network:request-captured');
    });

    it('should have UI_CLEAR_ALL constant', () => {
      expect(EVENT_NAMES.UI_CLEAR_ALL).toBe('ui:clear-all');
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should handle request selection pattern', () => {
      let selectedIndex = null;

      events.on(EVENT_NAMES.REQUEST_SELECTED, (index) => {
        selectedIndex = index;
      });

      events.emit(EVENT_NAMES.REQUEST_SELECTED, 5);

      expect(selectedIndex).toBe(5);
    });

    it('should handle request rendered pattern', () => {
      const renderedRequests = [];

      events.on(EVENT_NAMES.REQUEST_RENDERED, (data) => {
        renderedRequests.push(data);
      });

      events.emit(EVENT_NAMES.REQUEST_RENDERED, { request: { id: 1 }, index: 0 });
      events.emit(EVENT_NAMES.REQUEST_RENDERED, { request: { id: 2 }, index: 1 });

      expect(renderedRequests).toHaveLength(2);
      expect(renderedRequests[0].index).toBe(0);
      expect(renderedRequests[1].index).toBe(1);
    });

    it('should handle multiple subscriptions and unsubscriptions', () => {
      const unsubscribers = [];
      const callCounts = [0, 0, 0];

      // Subscribe 3 listeners
      unsubscribers.push(events.on('test:event', () => { callCounts[0]++; }));
      unsubscribers.push(events.on('test:event', () => { callCounts[1]++; }));
      unsubscribers.push(events.on('test:event', () => { callCounts[2]++; }));

      events.emit('test:event');
      expect(callCounts).toEqual([1, 1, 1]);

      // Unsubscribe middle listener
      unsubscribers[1]();

      events.emit('test:event');
      expect(callCounts).toEqual([2, 1, 2]); // Middle one should not increment

      // Unsubscribe all
      unsubscribers[0]();
      unsubscribers[2]();

      events.emit('test:event');
      expect(callCounts).toEqual([2, 1, 2]); // None should increment
    });
  });
});

