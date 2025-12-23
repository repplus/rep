import { escapeHtml } from '../core/utils/dom.js';
import { JSONFormatter } from "../core/utils/json-formatter.js";

const formatter = new JSONFormatter();

function extractBody(rawHttp) {
    if (!rawHttp || typeof rawHttp !== 'string') {
        return '';
    }

    // Try CRLF format first (\r\n\r\n)
    let separatorIndex = rawHttp.indexOf('\r\n\r\n');
    if (separatorIndex !== -1) {
        return rawHttp.substring(separatorIndex + 4);
    }
    
    // Try LF format (\n\n)
    separatorIndex = rawHttp.indexOf('\n\n');
    if (separatorIndex !== -1) {
        return rawHttp.substring(separatorIndex + 2);
    }
    
    return '';
}

export function generateJsonView(text) {
    const body = extractBody(text);

    // Format body with JSONFormatter, if not json it'll return raw body
    const formattedBody = formatter.format(body, 5);
    if (document.body.classList.contains('dark-theme'))
        formattedBody.classList.add('dark-theme');

    return formattedBody;
}
