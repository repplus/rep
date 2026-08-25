import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestReplayPermission } from '../js/network/permissions.js';

describe('requestReplayPermission', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('requests the optional all-URLs host permission', async () => {
        const request = vi.fn((permissions, callback) => callback(true));
        vi.stubGlobal('chrome', {
            permissions: { request },
            runtime: {}
        });

        await expect(requestReplayPermission()).resolves.toBe(true);
        expect(request).toHaveBeenCalledWith(
            { origins: ['<all_urls>'] },
            expect.any(Function)
        );
    });

    it('returns false when the permission is denied', async () => {
        vi.stubGlobal('chrome', {
            permissions: {
                request: vi.fn((permissions, callback) => callback(false))
            },
            runtime: {}
        });

        await expect(requestReplayPermission()).resolves.toBe(false);
    });

    it('returns false when Chrome reports an error', async () => {
        vi.stubGlobal('chrome', {
            permissions: {
                request: vi.fn((permissions, callback) => callback(false))
            },
            runtime: {
                lastError: { message: 'Permission request failed' }
            }
        });
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(requestReplayPermission()).resolves.toBe(false);
    });
});
