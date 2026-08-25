const ALL_URLS_PERMISSION = {
    origins: ['<all_urls>']
};

/**
 * Request the optional host permission used for replaying requests.
 * Calling request directly keeps it associated with the user's click; Chrome
 * resolves immediately without another prompt when the permission is present.
 *
 * @returns {Promise<boolean>} Whether replay permission is available.
 */
export function requestReplayPermission() {
    return new Promise(resolve => {
        chrome.permissions.request(ALL_URLS_PERMISSION, granted => {
            if (chrome.runtime?.lastError) {
                console.error('Unable to request replay permission:', chrome.runtime.lastError.message);
                resolve(false);
                return;
            }

            resolve(granted);
        });
    });
}
