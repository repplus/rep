// DOM manipulation utilities

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Escape CSV field value (handles quotes, commas, newlines)
 */
function escapeCsvField(value) {
    if (value == null) return '';
    const str = String(value);
    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Convert array of objects to CSV string
 */
export function arrayToCSV(data, headers) {
    if (!data || data.length === 0) {
        return headers ? headers.join(',') : '';
    }
    
    // Use provided headers or extract from first object
    const csvHeaders = headers || Object.keys(data[0]);
    
    // Build CSV rows
    const rows = [csvHeaders.map(escapeCsvField).join(',')];
    
    data.forEach(item => {
        const row = csvHeaders.map(header => {
            const value = item[header];
            return escapeCsvField(value);
        });
        rows.push(row.join(','));
    });
    
    return rows.join('\n');
}

/**
 * Download data as CSV file
 */
export function downloadCSV(data, filename, headers = null) {
    const csvContent = arrayToCSV(data, headers);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Download data as JSON file (for Postman collections, etc.)
 */
export function downloadJSON(data, filename) {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export async function copyToClipboard(text, btn) {
    // Check if we're in DevTools context (clipboard API is blocked)
    const isDevToolsContext = window.location.protocol === 'devtools:';
    
    // In DevTools, skip clipboard API and go straight to fallback
    if (!isDevToolsContext) {
        try {
            // Try modern API first
            await navigator.clipboard.writeText(text);
            if (btn) {
                showCopySuccess(btn);
            }
            return; // Success, exit early
        } catch (err) {
            // Clipboard API failed, will try fallback below
            // Only log if it's not a permissions policy error (expected in DevTools)
            if (!err.message?.includes('permissions policy') && !err.message?.includes('Permissions policy')) {
                console.warn('Clipboard API failed, trying fallback:', err);
            }
        }
    }

    // Fallback: create temporary textarea (works in DevTools)
    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;

        // Ensure it's not visible but part of DOM
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';
        document.body.appendChild(textArea);

        // Select the text
        textArea.focus();
        textArea.select();
        
        // For iOS Safari
        if (navigator.userAgent.match(/ipad|iphone/i)) {
            const range = document.createRange();
            range.selectNodeContents(textArea);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            textArea.setSelectionRange(0, 999999);
        }

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (successful) {
            if (btn) {
                showCopySuccess(btn);
            }
        } else {
            throw new Error('execCommand copy failed');
        }
    } catch (fallbackErr) {
        console.error('Copy to clipboard failed:', fallbackErr);
        // Show error state on button only if button exists
        if (btn) {
            const originalHtml = btn.innerHTML;
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="#f28b82"/></svg>';
            setTimeout(() => {
                if (btn) {
                    btn.innerHTML = originalHtml;
                }
            }, 1500);
        }
    }
}

function showCopySuccess(btn) {
    if (!btn) return;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#81c995"/></svg>';

    setTimeout(() => {
        if (btn) {
            btn.innerHTML = originalHtml;
        }
    }, 1500);
}

