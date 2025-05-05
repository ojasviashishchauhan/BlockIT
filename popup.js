// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const refreshButton = document.getElementById('refreshRules');
    const blockedCountSpan = document.getElementById('blockedCount');
    const scriptsBlockedSpan = document.getElementById('scriptsBlocked');
    const imagesBlockedSpan = document.getElementById('imagesBlocked');
    const framesBlockedSpan = document.getElementById('framesBlocked');
    const othersBlockedSpan = document.getElementById('othersBlocked');
    const topDomainsDiv = document.getElementById('topDomains');
    const uptimeSpan = document.getElementById('uptime');
    
    // Utility function to format numbers
    const formatNumber = (num) => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    // Utility function to format time duration
    const formatUptime = (seconds) => {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        
        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        if (minutes > 0) return `${minutes}m`;
        return `${seconds}s`;
    };

    // Update stats in the popup
    const updateStats = async () => {
        try {
            const stats = await chrome.storage.local.get([
                'totalBlocked',
                'scriptsBlocked',
                'imagesBlocked',
                'framesBlocked',
                'othersBlocked',
                'topDomains',
                'startTime'
            ]);

            // Update main stats
            blockedCountSpan.textContent = formatNumber(stats.totalBlocked || 0);
            scriptsBlockedSpan.textContent = formatNumber(stats.scriptsBlocked || 0);
            imagesBlockedSpan.textContent = formatNumber(stats.imagesBlocked || 0);
            framesBlockedSpan.textContent = formatNumber(stats.framesBlocked || 0);
            othersBlockedSpan.textContent = formatNumber(stats.othersBlocked || 0);

            // Update uptime
            const startTime = stats.startTime || Date.now();
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            uptimeSpan.textContent = `Uptime: ${formatUptime(uptime)}`;

            // Update top domains list
            topDomainsDiv.innerHTML = ''; // Clear existing content

            const topDomains = stats.topDomains || {};
            const sortedDomains = Object.entries(topDomains)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

            sortedDomains.forEach(([domain, count]) => {
                const domainItem = document.createElement('div');
                domainItem.className = 'domain-item';
                domainItem.innerHTML = `
                    <span class="domain-name">${domain}</span>
                    <span class="domain-count">${formatNumber(count)}</span>
                `;
                topDomainsDiv.appendChild(domainItem);
            });

            // Check IPL stream protection status
            const iplStatus = document.getElementById('iplStatus');
            const isIplProtected = await checkIplProtection();
            iplStatus.textContent = isIplProtected ? 'Protected' : 'Not Protected';
            iplStatus.style.color = isIplProtected ? 'var(--success-color)' : '#dc3545';

        } catch (error) {
            console.error('Error updating stats:', error);
        }
    };

    // Check IPL protection status
    const checkIplProtection = async () => {
        try {
            const rules = await chrome.declarativeNetRequest.getDynamicRules();
            const iplDomains = ['hotstar.com', 'jiocinema.com'];
            return rules.some(rule => 
                iplDomains.some(domain => rule.condition?.domains?.includes(domain))
            );
        } catch (error) {
            console.error('Error checking IPL protection:', error);
            return false;
        }
    };

    // Handle rule refresh
    document.getElementById('refreshRules').addEventListener('click', async () => {
        const button = document.getElementById('refreshRules');
        const originalText = button.innerHTML;
        
        try {
            button.innerHTML = '<span class="refresh-icon">↻</span> Updating...';
            button.disabled = true;

            // Send message to background script to update rules
            await chrome.runtime.sendMessage({ action: 'updateRules' });
            
            // Show success state briefly
            button.innerHTML = '<span class="refresh-icon">✓</span> Updated!';
            button.style.backgroundColor = 'var(--success-color)';
            
            // Refresh stats
            await updateStats();

            // Reset button after 2 seconds
            setTimeout(() => {
                button.innerHTML = originalText;
                button.style.backgroundColor = '';
                button.disabled = false;
            }, 2000);

        } catch (error) {
            console.error('Error updating rules:', error);
            button.innerHTML = '<span class="refresh-icon">✕</span> Error';
            button.style.backgroundColor = '#dc3545';
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.style.backgroundColor = '';
                button.disabled = false;
            }, 2000);
        }
    });

    // Add some CSS for domain items
    const style = document.createElement('style');
    style.textContent = `
        .domain-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background-color: #f8fafc;
            border-radius: 6px;
            font-size: 0.875rem;
        }

        .domain-name {
            color: var(--text-color);
            max-width: 70%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .domain-count {
            color: var(--primary-color);
            font-weight: 500;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .refresh-button:disabled .refresh-icon {
            animation: spin 1s linear infinite;
        }
    `;
    document.head.appendChild(style);

    // Initialize popup
    updateStats();
    // Update stats every 5 seconds
    setInterval(updateStats, 5000);

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'statsUpdated') {
            updateStats();
        }
    });
});

// Popup script for BlockIT
document.addEventListener('DOMContentLoaded', async () => {
    // Get UI elements
    const toggle = document.getElementById('adBlockerToggle');
    const youtubeStatus = document.getElementById('youtubeStatus');
    const spotifyStatus = document.getElementById('spotifyStatus');
    const iplStatus = document.getElementById('iplStatus');
    const statusIcon = document.querySelector('.status-icon');
    const statusText = document.querySelector('.status-text');

    // Load initial state
    const state = await chrome.storage.local.get(['adBlockerEnabled', 'totalBlocked']);
    const isEnabled = state.adBlockerEnabled !== false; // Default to true if not set
    toggle.checked = isEnabled;

    // Update status displays
    function updateStatus(enabled) {
        const status = enabled ? 'Active' : 'Paused';
        const color = enabled ? '#4caf50' : '#666';
        const bgColor = enabled ? '#4caf50' : '#ccc';

        // Update platform statuses
        youtubeStatus.textContent = status;
        spotifyStatus.textContent = status;
        iplStatus.textContent = status;
        youtubeStatus.style.color = color;
        spotifyStatus.style.color = color;
        iplStatus.style.color = color;

        // Update main status indicator
        statusIcon.style.backgroundColor = bgColor;
        statusText.textContent = enabled ? 'Protected' : 'Paused';
        statusText.style.color = color;

        // Update blocked count if available
        if (state.totalBlocked) {
            statusText.textContent = `Protected (${formatNumber(state.totalBlocked)} blocked)`;
        }
    }

    // Utility function to format numbers
    const formatNumber = (num) => {
        if (!num) return '0';
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
        return num.toString();
    };

    // Initialize status display
    updateStatus(isEnabled);

    // Handle toggle changes
    toggle.addEventListener('change', async () => {
        const enabled = toggle.checked;
        
        // Save state
        await chrome.storage.local.set({ adBlockerEnabled: enabled });
        
        // Update UI
        updateStatus(enabled);

        // Notify content scripts
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.url?.includes('youtube.com') || 
                    tab.url?.includes('spotify.com') || 
                    tab.url?.includes('hotstar.com') ||
                    tab.url?.includes('jiocinema.com')) {
                    chrome.tabs.sendMessage(tab.id, {
                        type: 'BLOCKIT_TOGGLE',
                        enabled: enabled
                    }).catch(() => {
                        // Ignore errors for inactive tabs
                    });
                }
            });
        });
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'statsUpdated') {
            chrome.storage.local.get(['totalBlocked'], (state) => {
                updateStatus(toggle.checked);
            });
        }
    });
}); 