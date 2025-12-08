import { escapeHtml } from "./utils.js";
import { JSONFormatter } from "./json-formatter.js";

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
    try {
        // Try to parse as JSON
        JSON.parse(body);

        // If valid JSON, format it with JSONFormatter
        const formattedBody = formatter.format(body, 5);
        if (document.body.classList.contains('dark-theme'))
            formattedBody.classList.add('dark-theme');
        
        return formattedBody;
    } catch (e) {
        // Not JSON, return as-is
        return escapeHtml(text);
    }
}