import { escapeHtml } from "./dom.js";

class JSONFormatter {
    constructor() {
        this.expandDepth = 5;
    }


    format(body, expandDepth = 5) {
        this.expandDepth = expandDepth;
        const warningBar = document.querySelector('#res-view-json .json-warning-bar');
        
        try {
            const obj = JSON.parse(body);
            const container = document.createElement('div');
            container.className = 'json-formatter-container';
            // Add formatted content
            container.innerHTML = this.valueToHTML(obj, 0);
            this.attachEventListeners(container);
            // Hide warning bar for valid JSON
            warningBar.style.display = 'none';
            return container;
        } catch (e) {
            if (body)
                warningBar.style.display = 'flex';
            else
                warningBar.style.display = 'none';

            // Return raw content
            const contentContainer = document.createElement('pre');
            contentContainer.className = 'json-raw-content';
            contentContainer.textContent = body;
            return contentContainer;
        }
    }

    valueToHTML(value, depth) {
        if (value === null) {
            return `<span class="json-null">null</span>`;
        }

        const type = typeof value;
        switch (type) {
            case 'boolean':
                return `<span class="json-boolean">${value}</span>`;
            case 'number':
                return `<span class="json-number">${value}</span>`;
            case 'string':
                return `<span class="json-string">"${escapeHtml(value)}"</span>`;
            case 'object':
                return Array.isArray(value) 
                    ? this.arrayToHTML(value, depth)
                    : this.objectToHTML(value, depth);
            default:
                return `<span class="json-undefined">undefined</span>`;
        }
    }

    objectToHTML(obj, depth) {
        const keys = Object.keys(obj);
        
        if (keys.length === 0) {
            return `<span class="json-punctuation">{}</span>`;
        }

        const isExpanded = depth < this.expandDepth;
        const toggleClass = isExpanded ? 'expanded' : 'collapsed';
        
        let html = `<div class="json-object ${toggleClass}">`;
        html += `<span class="json-toggle" data-depth="${depth}"></span>`;
        html += `<span class="json-punctuation">{</span>`;
        html += `<span class="json-ellipsis">...</span>`;
        html += `<span class="json-item-count">${keys.length} ${keys.length === 1 ? 'item' : 'items'}</span>`;
        
        html += `<div class="json-content">`;
        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            html += `<div class="json-line">`;
            html += `<span class="json-key">"${escapeHtml(key)}"</span>`;
            html += `<span class="json-punctuation">: </span>`;
            html += this.valueToHTML(obj[key], depth + 1);
            if (!isLast) {
                html += `<span class="json-punctuation">,</span>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
        
        html += `<span class="json-punctuation">}</span>`;
        html += `</div>`;
        
        return html;
    }

    arrayToHTML(arr, depth) {
        if (arr.length === 0) {
            return `<span class="json-punctuation">[]</span>`;
        }

        const isExpanded = depth < this.expandDepth;
        const toggleClass = isExpanded ? 'expanded' : 'collapsed';
        
        let html = `<div class="json-array ${toggleClass}">`;
        html += `<span class="json-toggle" data-depth="${depth}"></span>`;
        html += `<span class="json-punctuation">[</span>`;
        html += `<span class="json-ellipsis">...</span>`;
        html += `<span class="json-item-count">${arr.length} ${arr.length === 1 ? 'item' : 'items'}</span>`;
        
        html += `<div class="json-content">`;
        arr.forEach((item, index) => {
            const isLast = index === arr.length - 1;
            html += `<div class="json-line">`;
            html += this.valueToHTML(item, depth + 1);
            if (!isLast) {
                html += `<span class="json-punctuation">,</span>`;
            }
            html += `</div>`;
        });
        html += `</div>`;
        
        html += `<span class="json-punctuation">]</span>`;
        html += `</div>`;
        
        return html;
    }

    attachEventListeners(container) {
        const toggles = container.querySelectorAll('.json-toggle');
        
        toggles.forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const parent = toggle.parentElement;
                
                if (parent.classList.contains('expanded')) {
                    parent.classList.remove('expanded');
                    parent.classList.add('collapsed');
                } else {
                    parent.classList.remove('collapsed');
                    parent.classList.add('expanded');
                }
            });
        });
    }

}

export { JSONFormatter };