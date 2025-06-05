// BlockIT Pro - Service Worker
// Professional ad blocking service worker

class BlockITServiceWorker {
    constructor() {
        this.isEnabled = true;
        this.stats = {
            blockedRequests: 0,
            hiddenElements: 0,
            totalSaved: 0
        };
        
        this.initialized = false;
        this.init();
    }
    
    async init() {
        try {
            await this.waitForServiceWorkerReady();
            
            // Load saved settings
            const data = await chrome.storage.local.get(['isEnabled', 'stats']);
            this.isEnabled = data.isEnabled !== false;
            this.stats = data.stats || this.stats;
            
            this.setupEventListeners();
            this.updateBadge();
            
            // Verify rules are enabled
            setTimeout(() => this.verifyRulesStatus(), 1000);
            
            this.initialized = true;
        } catch (error) {
            // Retry initialization on failure
            setTimeout(() => this.init(), 2000);
        }
    }
    
    async waitForServiceWorkerReady() {
        return new Promise((resolve) => {
            if (chrome.runtime && chrome.runtime.id) {
                resolve();
            } else {
                const checkReady = () => {
                    if (chrome.runtime && chrome.runtime.id) {
                        resolve();
                    } else {
                        setTimeout(checkReady, 100);
                    }
                };
                checkReady();
            }
        });
    }
    
    async verifyRulesStatus() {
        if (!this.initialized) return;
        
        try {
            if (!chrome.declarativeNetRequest) return;
            
            const enabledRulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
            
            if (enabledRulesets.length === 0) {
                await this.enableNetworkRules();
            }
        } catch (error) {
            // Retry on service worker errors
            if (error.message?.includes('No SW') || error.message?.includes('service worker')) {
                setTimeout(() => this.verifyRulesStatus(), 3000);
            }
        }
    }
    
    setupEventListeners() {
        // Handle extension toggle from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
        
        // Listen for content script messages
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'elementHidden' && this.isEnabled) {
                this.stats.hiddenElements += message.count || 1;
                this.updateStats();
            } else if (message.action === 'networkBlocked' && this.isEnabled) {
                this.stats.blockedRequests += message.count || 1;
                this.updateStats();
            }
        });
        
        // Handle tab updates
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.handleTabUpdate(tabId, tab);
            }
        });
        
        // Install handler
        chrome.runtime.onInstalled.addListener(() => {
            this.handleInstall();
        });
    }
    
    async handleMessage(message, sender, sendResponse) {
        try {
            if (!this.initialized) {
                sendResponse({ error: 'Service worker not ready' });
                return;
            }
            
            switch (message.action) {
                case 'getStatus':
                    sendResponse({
                        isEnabled: this.isEnabled,
                        stats: this.stats,
                        hostname: sender.tab?.url ? new URL(sender.tab.url).hostname : null
                    });
                    break;
                    
                case 'toggleBlocking':
                    await this.toggleBlocking(message.enabled);
                    sendResponse({ success: true, isEnabled: this.isEnabled });
                    break;
                    
                case 'getStats':
                    sendResponse({ stats: this.stats });
                    break;
                    
                case 'resetStats':
                    await this.resetStats();
                    sendResponse({ success: true });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            sendResponse({ error: error.message });
        }
    }
    
    async toggleBlocking(enabled) {
        try {
            this.isEnabled = enabled;
            
            await chrome.storage.local.set({ isEnabled: this.isEnabled });
            
            if (this.isEnabled) {
                await this.enableNetworkRules();
            } else {
                await this.disableNetworkRules();
            }
            
            // Notify content scripts
            const tabs = await chrome.tabs.query({});
            tabs.forEach(tab => {
                if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
                    chrome.tabs.sendMessage(tab.id, {
                        action: 'toggleBlocking',
                        enabled: this.isEnabled
                    }).catch(() => {});
                }
            });
            
            this.updateBadge();
        } catch (error) {
            throw error;
        }
    }
    
    async enableNetworkRules() {
        try {
            if (!chrome.declarativeNetRequest || !this.initialized) return;
            
            const rulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
            const allRulesets = ['network_rules', 'cosmetic_rules'];
            
            const toEnable = allRulesets.filter(id => !rulesets.includes(id));
            if (toEnable.length > 0) {
                await chrome.declarativeNetRequest.updateEnabledRulesets({
                    enableRulesetIds: toEnable
                });
            }
        } catch (error) {
            if (error.message?.includes('No SW') || error.message?.includes('service worker')) {
                setTimeout(() => this.enableNetworkRules(), 2000);
            }
        }
    }
    
    async disableNetworkRules() {
        try {
            if (!chrome.declarativeNetRequest || !this.initialized) return;
            
            const rulesets = await chrome.declarativeNetRequest.getEnabledRulesets();
            if (rulesets.length > 0) {
                await chrome.declarativeNetRequest.updateEnabledRulesets({
                    disableRulesetIds: rulesets
                });
            }
        } catch (error) {
            if (error.message?.includes('No SW') || error.message?.includes('service worker')) {
                setTimeout(() => this.disableNetworkRules(), 2000);
            }
        }
    }
    
    async handleTabUpdate(tabId, tab) {
        if (!this.isEnabled || !tab.url || tab.url.startsWith('chrome://') || !this.initialized) {
            return;
        }
        
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    window.dispatchEvent(new CustomEvent('blockit-refresh'));
                }
            });
        } catch (e) {
            // Silently ignore tabs that can't be scripted
        }
    }
    
    handleInstall() {
        try {
            chrome.storage.local.set({
                isEnabled: true,
                stats: this.stats
            });
        } catch (error) {
            // Silent handling for installation errors
        }
    }
    
    updateBadge() {
        try {
            const text = this.isEnabled ? '' : 'OFF';
            const color = this.isEnabled ? '#4CAF50' : '#f44336';
            
            chrome.action.setBadgeText({ text });
            chrome.action.setBadgeBackgroundColor({ color });
            
            const title = this.isEnabled 
                ? `BlockIT Pro - Active (${this.stats.blockedRequests} blocked)`
                : 'BlockIT Pro - Disabled';
            chrome.action.setTitle({ title });
        } catch (error) {
            // Silent badge update errors
        }
    }
    
    async updateStats() {
        try {
            await chrome.storage.local.set({ stats: this.stats });
            this.updateBadge();
        } catch (error) {
            // Silent stats update errors
        }
    }
    
    async resetStats() {
        try {
            this.stats = {
                blockedRequests: 0,
                hiddenElements: 0,
                totalSaved: 0
            };
            await this.updateStats();
        } catch (error) {
            throw error;
        }
    }
}

// Initialize the service worker
new BlockITServiceWorker(); 