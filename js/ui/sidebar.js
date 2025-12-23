// Sidebar Module - Handles sidebar hide/show toggle
import { elements } from './main-ui.js';

/**
 * Sets up sidebar hide/show toggle functionality
 */
export function setupSidebar() {
    const toggleSidebarVisibility = (hidden) => {
        const container = document.querySelector('.container');
        if (!container) return;
        
        if (hidden) {
            container.classList.add('sidebar-hidden');
        } else {
            container.classList.remove('sidebar-hidden');
        }
        
        // Update sidebar button (inside sidebar)
        if (elements.toggleSidebarBtn) {
            elements.toggleSidebarBtn.classList.toggle('active', hidden);
            const label = hidden ? 'Show sidebar' : 'Hide sidebar';
            elements.toggleSidebarBtn.title = label;
            elements.toggleSidebarBtn.setAttribute('aria-label', label);
        }
        
        // Update show sidebar button (in request pane)
        if (elements.showSidebarBtn) {
            elements.showSidebarBtn.style.display = hidden ? 'flex' : 'none';
        }
        
        localStorage.setItem('rep_sidebar_hidden', hidden ? '1' : '0');
    };

    if (elements.toggleSidebarBtn) {
        elements.toggleSidebarBtn.addEventListener('click', () => {
            const container = document.querySelector('.container');
            const isHidden = container && container.classList.contains('sidebar-hidden');
            toggleSidebarVisibility(!isHidden);
        });
    }

    if (elements.showSidebarBtn) {
        elements.showSidebarBtn.addEventListener('click', () => {
            toggleSidebarVisibility(false);
        });
    }

    // Load saved sidebar state
    const savedSidebar = localStorage.getItem('rep_sidebar_hidden');
    if (savedSidebar === '1') {
        toggleSidebarVisibility(true);
    }
}

