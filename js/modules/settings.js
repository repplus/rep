// Settings Module
import { state, oosPatterns } from './state.js';
import { filterRequests } from './ui.js';

// Default OOS patterns from state.js
const DEFAULT_OOS_PATTERNS = [
    '^/_next/',
    '^/__nextjs',
    '^/next/',
    '^/_app/',
    '^/@svelte',
    '^\\.svelte-kit/',
    '^/_nuxt/',
    '^/__nuxt',
    '^/@vite',
    '^/@react-refresh',
    '^/@id/',
    '^/node_modules/',
    '^/__vite_',
    '^/webpack',
    '\\.hot-update\\.',
    '^/sockjs-node',
    '\\.map$',
    '^/_ws$',
    '^/ws$',
    '^/socket\\.io',
    '^/static/chunks/',
    '^/static/development/',
    '^/static/webpack/',
    '^/_buildManifest\\.js',
    '^/_ssgManifest\\.js',
    '^/gtm\\.js',
    '^/gtag/',
    '/analytics',
    '/collect\\?',
    '^/cdn-cgi/',
    '\\?t=\\d+$',
    '^/hmr$'
];

/**
 * Settings structure - easily extensible for new settings
 */
export const settings = {
    oosPatterns: {
        title: 'Out-of-Scope Patterns',
        description: 'Regex patterns to filter framework noise (one per line)',
        type: 'list',
        value: [],
        default: DEFAULT_OOS_PATTERNS
    },
    inScopePatterns: {
        title: 'In-Scope Patterns',
        description: 'Regex patterns to always include (overrides OOS)',
        type: 'list',
        value: [],
        default: []
    }
};

/**
 * Load settings from localStorage
 */
export function loadSettings() {
    try {
        const stored = localStorage.getItem('rep_settings');
        if (stored) {
            const parsed = JSON.parse(stored);
            Object.keys(settings).forEach(key => {
                if (parsed[key] !== undefined) {
                    settings[key].value = parsed[key];
                }
            });
        } else {
            // First time - use defaults
            settings.oosPatterns.value = [...DEFAULT_OOS_PATTERNS];
        }
        
        // Clear existing OOS patterns and rebuild from settings
        oosPatterns.length = 0;
        
        // Add OOS patterns
        settings.oosPatterns.value.forEach(pattern => {
            try {
                oosPatterns.push(new RegExp(pattern));
            } catch (e) {
                console.error('Invalid OOS pattern:', pattern, e);
            }
        });
        
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

/**
 * Save settings to localStorage
 */
export function saveSettings() {
    try {
        const toSave = {};
        Object.keys(settings).forEach(key => {
            toSave[key] = settings[key].value;
        });
        localStorage.setItem('rep_settings', JSON.stringify(toSave));
        return true;
    } catch (e) {
        console.error('Failed to save settings:', e);
        return false;
    }
}

/**
 * Reset settings to defaults
 */
export function resetSettings() {
    Object.keys(settings).forEach(key => {
        settings[key].value = settings[key].default;
    });
    saveSettings();
}

/**
 * Initialize settings modal
 */
export function initSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const openBtn = document.getElementById('settings-btn');
    const closeBtn = document.getElementById('settings-close');
    const saveBtn = document.getElementById('settings-save');
    const resetBtn = document.getElementById('settings-reset');
    
    if (!modal || !openBtn) return;
    
    // Open modal
    openBtn.addEventListener('click', () => {
        renderSettingsUI();
        modal.classList.add('show');
    });
    
    // Close modal
    const closeModal = () => modal.classList.remove('show');
    
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Save settings
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            if (saveSettingsFromUI()) {
                closeModal();
                filterRequests(); // Re-filter with new patterns
                showToast('Settings saved successfully');
            }
        });
    }
    
    // Reset settings
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Reset all settings to defaults?')) {
                resetSettings();
                renderSettingsUI();
                showToast('Settings reset to defaults');
            }
        });
    }
}

/**
 * Render settings UI dynamically
 */
function renderSettingsUI() {
    const container = document.getElementById('settings-content');
    if (!container) return;
    
    container.innerHTML = '';
    
    // OOS Patterns Section
    const oosSection = createSettingSection('oosPatterns', settings.oosPatterns);
    container.appendChild(oosSection);
    
    // In-Scope Patterns Section
    const inScopeSection = createSettingSection('inScopePatterns', settings.inScopePatterns);
    container.appendChild(inScopeSection);
}

/**
 * Create a setting section based on type
 */
function createSettingSection(key, setting) {
    const section = document.createElement('div');
    section.className = 'setting-section';
    section.dataset.key = key;
    
    const header = document.createElement('div');
    header.className = 'setting-header';
    header.innerHTML = `
        <h3>${setting.title}</h3>
        <p>${setting.description}</p>
    `;
    section.appendChild(header);
    
    const content = document.createElement('div');
    content.className = 'setting-content';
    
    if (setting.type === 'list') {
        content.appendChild(createListInput(key, setting));
    } else if (setting.type === 'text') {
        content.appendChild(createTextInput(key, setting));
    }
    
    section.appendChild(content);
    return section;
}

/**
 * Create list input (for OOS patterns, match/replace)
 */
function createListInput(key, setting) {
    const container = document.createElement('div');
    container.className = 'list-input';
    
    const list = document.createElement('div');
    list.className = 'list-items';
    list.id = `list-${key}`;
    
    // Render existing items
    const items = setting.value;
    items.forEach((item, index) => {
        list.appendChild(createListItem(item, index, key));
    });
    
    container.appendChild(list);
    
    // Add new item input
    const addContainer = document.createElement('div');
    addContainer.className = 'add-item-container';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = key === 'inScopePatterns' ? 'e.g., ^/api/ or /admin' : 'e.g., ^/_custom/ or \\.debug$';
    input.className = 'add-item-input';
    input.id = `add-${key}`;
    
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', () => {
        const value = input.value.trim();
        if (value) {
            // Validate regex
            try {
                new RegExp(value);
            } catch (e) {
                showToast('Invalid regex pattern: ' + e.message, 'error');
                return;
            }
            
            setting.value.push(value);
            list.appendChild(createListItem(value, setting.value.length - 1, key));
            input.value = '';
        }
    });
    
    // Enter key to add
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
    
    addContainer.appendChild(input);
    addContainer.appendChild(addBtn);
    container.appendChild(addContainer);
    
    return container;
}

/**
 * Create a single list item
 */
function createListItem(value, index, key) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.dataset.index = index;
    
    const text = document.createElement('span');
    text.className = 'list-item-text';
    text.textContent = value;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.innerHTML = '×';
    deleteBtn.addEventListener('click', () => {
        settings[key].value.splice(index, 1);
        item.remove();
        // Re-index remaining items
        document.querySelectorAll(`#list-${key} .list-item`).forEach((el, idx) => {
            el.dataset.index = idx;
        });
    });
    
    item.appendChild(text);
    item.appendChild(deleteBtn);
    return item;
}

/**
 * Create text input
 */
function createTextInput(key, setting) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.value = setting.value;
    input.placeholder = 'Enter ' + setting.title.toLowerCase();
    input.id = `input-${key}`;
    return input;
}

/**
 * Save settings from UI
 */
function saveSettingsFromUI() {
    try {
        // Settings are already updated during interaction
        // Just save and reload OOS patterns
        if (saveSettings()) {
            loadSettings(); // Reload to update oosPatterns
            return true;
        }
        return false;
    } catch (e) {
        showToast('Failed to save settings: ' + e.message, 'error');
        return false;
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}
