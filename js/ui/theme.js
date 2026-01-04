// Theme Management Module

const THEMES = {
    'dark': { name: 'Dark (Default)', icon: '🌙' },
    'light': { name: 'Light', icon: '☀️' },
    'modern-dark': { name: 'Modern Dark', icon: '🎨' },
    'modern-light': { name: 'Modern Light', icon: '✨' },
    'blue': { name: 'Blue', icon: '💙' },
    'high-contrast': { name: 'High Contrast', icon: '🔆' },
    'terminal': { name: 'Terminal', icon: '🖥️' }
};

export function initTheme() {
    updateTheme();

    // Theme Selector
    const themeBtn = document.getElementById('theme-selector-btn');
    const themeMenu = document.getElementById('theme-menu');
    
    if (themeBtn && themeMenu) {
        // Toggle menu
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeMenu.classList.toggle('open');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!themeMenu.contains(e.target) && e.target !== themeBtn) {
                themeMenu.classList.remove('open');
            }
        });

        // Handle theme selection
        themeMenu.querySelectorAll('.theme-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const theme = item.dataset.theme;
                localStorage.setItem('themePreference', theme);
                updateTheme(true);
                themeMenu.classList.remove('open');
            });
        });
    }

    // Auto-detect system preference on first load
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            // Only auto-update if user hasn't set a preference
            if (!localStorage.getItem('themePreference')) {
                updateTheme();
            }
        });
    }
}

function updateTheme(animate = false) {
    // Add transition class for smooth animation
    if (animate) {
        document.body.classList.add('theme-transitioning');
    }

    // Remove all theme classes
    document.body.classList.remove('light-theme', 'theme-modern-dark', 'theme-modern-light', 
                                   'theme-blue', 'theme-high-contrast', 'theme-terminal');

    const pref = localStorage.getItem('themePreference');
    let themeToApply = pref;

    // If no preference, auto-detect
    if (!pref) {
        const devToolsTheme = chrome.devtools?.panels?.themeName;
        if (devToolsTheme === 'dark') {
            themeToApply = 'dark';
        } else if (devToolsTheme === 'default') {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                themeToApply = 'dark';
            } else {
                themeToApply = 'light';
            }
        } else {
            themeToApply = 'light';
        }
    }

    // Apply theme class
    if (themeToApply === 'light') {
        document.body.classList.add('light-theme');
    } else if (themeToApply && themeToApply !== 'dark') {
        document.body.classList.add(`theme-${themeToApply}`);
    }
    // 'dark' is the default, no class needed
    
    updateThemeMenu();
    
    // Remove transition class after animation completes
    if (animate) {
        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
        }, 300); // Match CSS transition duration
    }
}

function updateThemeMenu() {
    const themeMenu = document.getElementById('theme-menu');
    if (!themeMenu) return;

    const currentTheme = localStorage.getItem('themePreference') || 'dark';
    
    // Update active state
    themeMenu.querySelectorAll('.theme-menu-item').forEach(item => {
        item.classList.toggle('active', item.dataset.theme === currentTheme);
    });
}
