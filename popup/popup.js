// BlockIT Pro - Popup Script
// Professional popup interface

class BlockITPopup {
    constructor() {
        this.isEnabled = true;
        this.currentTab = null;
        
        this.init();
    }
    
    async init() {
        // Get current tab
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tabs[0];
        } catch (e) {
            // Handle silently - no need to show user tab access errors
        }
        
        // Load initial state
        await this.loadState();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
    }
    
    async loadState() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getStatus' });
            if (response) {
                this.isEnabled = response.isEnabled;
            }
        } catch (e) {
            // Use default state if communication fails
        }
    }
    
    setupEventListeners() {
        // Toggle button
        const toggleButton = document.getElementById('toggleButton');
        if (toggleButton) {
            toggleButton.addEventListener('click', () => this.toggleBlocking());
        }
    }
    
    async toggleBlocking() {
        const toggleButton = document.getElementById('toggleButton');
        
        try {
            // Disable button during transition
            if (toggleButton) toggleButton.disabled = true;
            
            // Send toggle message
            const response = await chrome.runtime.sendMessage({
                action: 'toggleBlocking',
                enabled: !this.isEnabled
            });
            
            if (response && response.success) {
                this.isEnabled = response.isEnabled;
                this.updateUI();
                
                // Show user feedback
                this.showNotification(
                    this.isEnabled ? 'Protection enabled' : 'Protection disabled',
                    this.isEnabled ? 'success' : 'warning'
                );
            }
        } catch (e) {
            this.showNotification('Failed to toggle protection', 'error');
        } finally {
            // Re-enable button
            if (toggleButton) toggleButton.disabled = false;
        }
    }
    
    updateUI() {
        this.updateToggleButton();
        this.updateStatusIndicator();
        this.updateCurrentSite();
        this.updateProtectionDisplay();
    }
    
    updateToggleButton() {
        const toggleButton = document.getElementById('toggleButton');
        const statusText = document.getElementById('statusText');
        
        if (toggleButton) {
            if (this.isEnabled) {
                toggleButton.classList.remove('disabled');
                toggleButton.setAttribute('title', 'Disable protection');
            } else {
                toggleButton.classList.add('disabled');
                toggleButton.setAttribute('title', 'Enable protection');
            }
        }
        
        if (statusText) {
            statusText.textContent = this.isEnabled ? 'Protection Active' : 'Protection Disabled';
        }
    }
    
    updateStatusIndicator() {
        const statusIndicator = document.getElementById('statusIndicator');
        
        if (statusIndicator) {
            if (this.isEnabled) {
                statusIndicator.classList.remove('disabled');
            } else {
                statusIndicator.classList.add('disabled');
            }
        }
    }
    
    updateCurrentSite() {
        const siteUrl = document.getElementById('siteUrl');
        
        if (siteUrl) {
            if (this.currentTab && this.currentTab.url) {
                try {
                    const url = new URL(this.currentTab.url);
                    siteUrl.textContent = url.hostname;
                } catch (e) {
                    siteUrl.textContent = 'Invalid URL';
                }
            } else {
                siteUrl.textContent = 'No active tab';
            }
        }
    }
    
    updateProtectionDisplay() {
        const protectionInfo = document.querySelector('.protection-info');
        const featuresSection = document.querySelector('.features-section');
        const shieldIcon = document.getElementById('shieldIcon');
        const protectionTitle = document.getElementById('protectionTitle');
        const protectionDescription = document.getElementById('protectionDescription');
        
        if (this.isEnabled) {
            // Active protection state
            if (protectionInfo) protectionInfo.classList.remove('disabled');
            if (featuresSection) featuresSection.classList.remove('disabled');
            if (shieldIcon) shieldIcon.classList.remove('disabled');
            
            if (protectionTitle) {
                protectionTitle.textContent = '🛡️ You are protected!';
            }
            
            if (protectionDescription) {
                protectionDescription.textContent = 'BlockIT Pro is actively blocking ads, trackers, and unwanted content to keep your browsing experience clean and fast.';
            }
        } else {
            // Disabled protection state
            if (protectionInfo) protectionInfo.classList.add('disabled');
            if (featuresSection) featuresSection.classList.add('disabled');
            if (shieldIcon) shieldIcon.classList.add('disabled');
            
            if (protectionTitle) {
                protectionTitle.textContent = '⚠️ Protection disabled';
            }
            
            if (protectionDescription) {
                protectionDescription.textContent = 'Turn on BlockIT Pro to block ads, protect your privacy, and enjoy faster browsing.';
            }
        }
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            color: 'white',
            fontWeight: '500',
            fontSize: '14px',
            zIndex: '9999',
            opacity: '0',
            transform: 'translateY(-20px)',
            transition: 'all 0.3s ease',
            maxWidth: '300px',
            wordWrap: 'break-word'
        });
        
        // Set background color based on type
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        notification.style.backgroundColor = colors[type] || colors.info;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        });
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BlockITPopup();
}); 