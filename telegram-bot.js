// ============================================================
// telegram-bot.js (v15.0 - TRIPLE PREDICTOR with PRIMARY)
// 
// Features:
// - NEW: PRIMARY PREDICTION display (smart selection)
// - Shows PRIMARY, MEDIAN, HIGH-VOLUME, LOW-VOLUME
// - Clean, compact format with PRIMARY highlighted
// - Rate limiting to avoid spam
// - Full command support (/predict, /stats, /history, /status, /reset)
// ============================================================

const axios = require('axios');
require('dotenv').config();

class TelegramBot {
    constructor(apiBaseUrl) {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.apiBaseUrl = apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:3000';
        
        this.isEnabled = !!(this.botToken && this.chatId);
        this.lastUpdateId = 0;
        this.pollingInterval = null;
        this.pollingAttempts = 0;
        this.maxPollingAttempts = 3;
        
        // Store last prediction result for context
        this.lastPredictionResult = {
            predictedGroup: null,
            actualGroup: null,
            isCorrect: null,
            retryCount: 0
        };
        
        // Store last notification to avoid spam
        this.lastNotification = {
            type: null,
            timestamp: 0,
            predictedGroup: null
        };
        
        console.log(`🤖 Telegram Bot initialized: ${this.isEnabled ? 'ENABLED' : 'DISABLED (missing token/chatId)'}`);
        
        if (this.isEnabled) {
            console.log(`📱 Chat ID: ${this.chatId}`);
            console.log(`🌐 API Base URL: ${this.apiBaseUrl}`);
            console.log(`📊 Format: TRIPLE PREDICTOR v15.0 with PRIMARY`);
        }
    }
    
    /**
     * Check if bot is enabled
     */
    isEnabled() {
        return this.isEnabled;
    }
    
    /**
     * Setup bot commands via Telegram API with retry
     */
    async setupBotCommands(retryCount = 0) {
        if (!this.isEnabled) return;
        
        const commands = [
            { command: 'start', description: '🤖 Start bot & get current status' },
            { command: 'predict', description: '🎯 Get current AI prediction (PRIMARY + triple)' },
            { command: 'stats', description: '📊 Show last 10 results statistics' },
            { command: 'history', description: '📜 Show last 10 prediction history' },
            { command: 'status', description: '🔍 Show AI system status' },
            { command: 'reset', description: '🔄 Reset AI state (admin only)' }
        ];
        
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/setMyCommands`;
            await axios.post(url, { commands });
            console.log('✅ Telegram bot commands registered');
        } catch (error) {
            console.error(`❌ Failed to register commands (attempt ${retryCount + 1}):`, error.message);
            if (retryCount < 3) {
                setTimeout(() => this.setupBotCommands(retryCount + 1), 5000);
            }
        }
    }
    
    /**
     * Delete webhook with retry logic
     */
    async deleteWebhook(retryCount = 0) {
        if (!this.isEnabled) return false;
        
        try {
            const deleteUrl = `https://api.telegram.org/bot${this.botToken}/deleteWebhook`;
            const response = await axios.post(deleteUrl, { 
                drop_pending_updates: true 
            }, {
                timeout: 10000
            });
            
            if (response.data && response.data.ok) {
                console.log('✅ Webhook deleted successfully');
                return true;
            } else {
                console.log('⚠️ Webhook delete response:', response.data);
                return false;
            }
        } catch (error) {
            console.log(`⚠️ Webhook delete error (attempt ${retryCount + 1}):`, error.message);
            
            if (retryCount < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.deleteWebhook(retryCount + 1);
            }
            return false;
        }
    }
    
    /**
     * Send message to Telegram
     */
    async sendMessage(text, parseMode = 'HTML') {
        if (!this.isEnabled) {
            return false;
        }
        
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            await axios.post(url, {
                chat_id: this.chatId,
                text: text,
                parse_mode: parseMode,
                disable_web_page_preview: true
            }, {
                timeout: 10000
            });
            return true;
        } catch (error) {
            console.error('❌ Telegram send error:', error.message);
            return false;
        }
    }
    
    /**
     * Get group icon
     */
    getGroupIcon(group) {
        if (group === 'LOW') return '🔴';
        if (group === 'MEDIUM') return '🟡';
        if (group === 'HIGH') return '🟢';
        return '⚪';
    }
    
    /**
     * Get result icon
     */
    getResultIcon(isCorrect) {
        if (isCorrect === true) return '✅';
        if (isCorrect === false) return '❌';
        return '⏳';
    }
    
    // ============================================================
    // v15.0 NEW METHODS WITH PRIMARY SUPPORT
    // ============================================================
    
    /**
     * Send prediction notification (called from server.js)
     * Now includes PRIMARY prediction
     */
    async sendPredictionNotification(predictionData) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        const primaryGroup = predictionData?.primary?.predictedGroup;
        if (this.lastNotification.type === 'prediction' && 
            this.lastNotification.predictedGroup === primaryGroup &&
            now - this.lastNotification.timestamp < 2000) {
            return;
        }
        
        this.lastNotification = {
            type: 'prediction',
            timestamp: now,
            predictedGroup: primaryGroup
        };
        
        const frequencies = predictionData?.stats;
        await this.sendTriplePredictionNotification(predictionData, {
            LOW: frequencies?.LOW?.count || 0,
            MEDIUM: frequencies?.MEDIUM?.count || 0,
            HIGH: frequencies?.HIGH?.count || 0
        });
    }
    
    /**
     * Send waiting notification (called from server.js)
     */
    async sendWaitingNotification(waitingData) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        if (this.lastNotification.type === 'waiting' && now - this.lastNotification.timestamp < 10000) {
            return;
        }
        
        this.lastNotification = {
            type: 'waiting',
            timestamp: now,
            predictedGroup: null
        };
        
        const frequencies = waitingData?.stats;
        await this.sendTripleWaitingNotification(waitingData, {
            LOW: frequencies?.LOW?.count || 0,
            MEDIUM: frequencies?.MEDIUM?.count || 0,
            HIGH: frequencies?.HIGH?.count || 0
        });
    }
    
    /**
     * Send correct notification for triple predictors (called from server.js)
     * Now includes PRIMARY correctness
     */
    async sendTripleCorrectNotification(predictedGroups, actualGroup, retryCount) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        if (this.lastNotification.type === 'correct' && now - this.lastNotification.timestamp < 3000) {
            return;
        }
        
        this.lastNotification = {
            type: 'correct',
            timestamp: now,
            predictedGroup: predictedGroups.primary || predictedGroups.median
        };
        
        const primaryIcon = this.getGroupIcon(predictedGroups.primary);
        const medianIcon = this.getGroupIcon(predictedGroups.median);
        const highVolIcon = this.getGroupIcon(predictedGroups.highVolume);
        const lowVolIcon = this.getGroupIcon(predictedGroups.lowVolume);
        const actualIcon = this.getGroupIcon(actualGroup);
        
        const message = `✅ TRIPLE PREDICTOR v15.0 - CORRECT!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${predictedGroups.primary} → ${actualIcon} ${actualGroup} ✓
📐 MEDIAN: ${medianIcon} ${predictedGroups.median} → ${actualIcon} ${actualGroup} ✓
📈 HIGH-VOL: ${highVolIcon} ${predictedGroups.highVolume} → ${actualIcon} ${actualGroup} ✓
📉 LOW-VOL: ${lowVolIcon} ${predictedGroups.lowVolume} → ${actualIcon} ${actualGroup} ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Shared Retry Count: ${retryCount || 0}`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: Triple correct notification sent (PRIMARY:${predictedGroups.primary}→${actualGroup})`);
    }
    
    /**
     * Send wrong notification for triple predictors (called from server.js)
     * Now includes PRIMARY correctness
     */
    async sendTripleWrongNotification(predictedGroups, actualGroup, retryCount) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        if (this.lastNotification.type === 'wrong' && now - this.lastNotification.timestamp < 3000) {
            return;
        }
        
        this.lastNotification = {
            type: 'wrong',
            timestamp: now,
            predictedGroup: predictedGroups.primary || predictedGroups.median
        };
        
        const primaryIcon = this.getGroupIcon(predictedGroups.primary);
        const medianIcon = this.getGroupIcon(predictedGroups.median);
        const highVolIcon = this.getGroupIcon(predictedGroups.highVolume);
        const lowVolIcon = this.getGroupIcon(predictedGroups.lowVolume);
        const actualIcon = this.getGroupIcon(actualGroup);
        
        const primaryStatus = predictedGroups.primary === actualGroup ? '✓' : '✗';
        const medianStatus = predictedGroups.median === actualGroup ? '✓' : '✗';
        const highVolStatus = predictedGroups.highVolume === actualGroup ? '✓' : '✗';
        const lowVolStatus = predictedGroups.lowVolume === actualGroup ? '✓' : '✗';
        
        const message = `❌ TRIPLE PREDICTOR v15.0 - WRONG!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${predictedGroups.primary} → ${actualIcon} ${actualGroup} ${primaryStatus}
📐 MEDIAN: ${medianIcon} ${predictedGroups.median} → ${actualIcon} ${actualGroup} ${medianStatus}
📈 HIGH-VOL: ${highVolIcon} ${predictedGroups.highVolume} → ${actualIcon} ${actualGroup} ${highVolStatus}
📉 LOW-VOL: ${lowVolIcon} ${predictedGroups.lowVolume} → ${actualIcon} ${actualGroup} ${lowVolStatus}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 Next Retry: #${retryCount}`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: Triple wrong notification sent (PRIMARY:${predictedGroups.primary}→${actualGroup})`);
    }
    
    // ============================================================
    // v15.0 UPDATED NOTIFICATION METHODS
    // ============================================================
    
    /**
     * Send TRIPLE PREDICTOR active prediction notification (without result)
     * UPDATED: Now shows PRIMARY as main prediction
     */
    async sendTriplePredictionNotification(predictionData, frequencies) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        const primaryGroup = predictionData?.primary?.predictedGroup;
        if (this.lastNotification.type === 'prediction' && 
            this.lastNotification.predictedGroup === primaryGroup &&
            now - this.lastNotification.timestamp < 2000) {
            return;
        }
        
        this.lastNotification = {
            type: 'prediction',
            timestamp: now,
            predictedGroup: primaryGroup
        };
        
        const primary = predictionData?.primary;
        const median = predictionData?.median;
        const highVolume = predictionData?.highVolume;
        const lowVolume = predictionData?.lowVolume;
        
        const primaryPredicted = primary?.predictedGroup || '?';
        const primaryConfidence = primary?.confidence || 0;
        const primaryReason = primary?.reason || '';
        
        const medianPredicted = median?.predictedGroup || '?';
        const medianConfidence = median?.confidence || 0;
        const highVolPredicted = highVolume?.predictedGroup || '?';
        const highVolConfidence = highVolume?.confidence || 0;
        const lowVolPredicted = lowVolume?.predictedGroup || '?';
        const lowVolConfidence = lowVolume?.confidence || 0;
        
        const primaryIcon = this.getGroupIcon(primaryPredicted);
        const medianIcon = this.getGroupIcon(medianPredicted);
        const highVolIcon = this.getGroupIcon(highVolPredicted);
        const lowVolIcon = this.getGroupIcon(lowVolPredicted);
        
        let reasonText = '';
        if (primaryReason === 'UNIQUE_GROUP_FROM_DUPLICATE') {
            reasonText = '🎯 Selected: Unique group from duplicate';
        } else if (primaryReason === 'HIGH_VOLUME_FROM_ALL_DIFFERENT') {
            reasonText = '📈 Selected: HIGH-VOLUME (all different)';
        } else {
            reasonText = primary?.message || '';
        }
        
        let message = `📊 TRIPLE PREDICTOR v15.0 - ACTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${primaryPredicted} (${primaryConfidence}%)
💡 ${reasonText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 MEDIAN: ${medianIcon} ${medianPredicted} (${medianConfidence}%)
📈 HIGH-VOL: ${highVolIcon} ${highVolPredicted} (${highVolConfidence}%)
📉 LOW-VOL: ${lowVolIcon} ${lowVolPredicted} (${lowVolConfidence}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOW=${frequencies?.LOW || 0} | MED=${frequencies?.MEDIUM || 0} | HIGH=${frequencies?.HIGH || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Waiting for next result...`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: Triple prediction sent (PRIMARY:${primaryPredicted})`);
    }
    
    /**
     * Send TRIPLE PREDICTOR waiting notification
     * UPDATED: Shows PRIMARY status as well
     */
    async sendTripleWaitingNotification(waitingData, frequencies) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        if (this.lastNotification.type === 'waiting' && now - this.lastNotification.timestamp < 10000) {
            return;
        }
        
        this.lastNotification = {
            type: 'waiting',
            timestamp: now,
            predictedGroup: null
        };
        
        let waitingReasonText = '';
        if (waitingData.waitingReason === 'ALL_GROUPS_EQUAL') {
            waitingReasonText = 'All groups equal';
        } else if (waitingData.waitingReason === 'DUPLICATE_MEDIAN') {
            waitingReasonText = 'Duplicate median';
        } else {
            waitingReasonText = 'No unique median';
        }
        
        // Check if PRIMARY has a prediction even in waiting mode
        const primary = waitingData?.primary;
        let primaryText = '';
        if (primary && primary.predictedGroup && primary.status !== 'WAITING') {
            primaryText = `\n🏆 PRIMARY: ${this.getGroupIcon(primary.predictedGroup)} ${primary.predictedGroup} (${primary.confidence}%)\n💡 ${primary.message || ''}`;
        }
        
        let message = `📊 TRIPLE PREDICTOR v15.0 - WAITING MODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 MEDIAN: ⏳ WAITING
📈 HIGH-VOL: ⏳ WAITING
📉 LOW-VOL: ⏳ WAITING${primaryText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Reason: ${waitingReasonText}
📊 LOW=${frequencies?.LOW || 0} | MED=${frequencies?.MEDIUM || 0} | HIGH=${frequencies?.HIGH || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Next prediction after 1 more result`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: Triple waiting sent (${waitingData.waitingReason})`);
    }
    
    /**
     * Send TRIPLE PREDICTOR result & next notification
     * UPDATED: Now includes PRIMARY prediction
     */
    async sendTripleResultNotification(predictionData, actualGroup, isPrimaryCorrect, isMedianCorrect, isHighVolCorrect, isLowVolCorrect, frequencies) {
        if (!this.isEnabled) return;
        
        // Rate limiting
        const now = Date.now();
        if (this.lastNotification.type === 'result' && now - this.lastNotification.timestamp < 3000) {
            return;
        }
        
        this.lastNotification = {
            type: 'result',
            timestamp: now,
            predictedGroup: predictionData?.primary?.predictedGroup || null
        };
        
        // Get prediction data
        const primary = predictionData?.primary;
        const median = predictionData?.median;
        const highVolume = predictionData?.highVolume;
        const lowVolume = predictionData?.lowVolume;
        
        const primaryPredicted = primary?.predictedGroup || '?';
        const primaryConfidence = primary?.confidence || 0;
        const medianPredicted = median?.predictedGroup || '?';
        const medianConfidence = median?.confidence || 0;
        const highVolPredicted = highVolume?.predictedGroup || '?';
        const highVolConfidence = highVolume?.confidence || 0;
        const lowVolPredicted = lowVolume?.predictedGroup || '?';
        const lowVolConfidence = lowVolume?.confidence || 0;
        
        const primaryIcon = this.getGroupIcon(primaryPredicted);
        const medianIcon = this.getGroupIcon(medianPredicted);
        const highVolIcon = this.getGroupIcon(highVolPredicted);
        const lowVolIcon = this.getGroupIcon(lowVolPredicted);
        const actualIcon = this.getGroupIcon(actualGroup);
        
        let primaryReasonText = '';
        if (primary?.reason === 'UNIQUE_GROUP_FROM_DUPLICATE') {
            primaryReasonText = '🎯 Unique from duplicate';
        } else if (primary?.reason === 'HIGH_VOLUME_FROM_ALL_DIFFERENT') {
            primaryReasonText = '📈 HIGH-VOLUME';
        }
        
        // Build the message
        let message = `📊 TRIPLE PREDICTOR v15.0 - RESULT & NEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${primaryPredicted} → ${actualIcon} ${actualGroup} ${this.getResultIcon(isPrimaryCorrect)} | NEXT: ${primaryIcon} ${primaryPredicted}(${primaryConfidence}%) ${primaryReasonText}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 MEDIAN: ${medianIcon} ${medianPredicted} → ${actualIcon} ${actualGroup} ${this.getResultIcon(isMedianCorrect)} | NEXT: ${medianIcon} ${medianPredicted}(${medianConfidence}%)
📈 HIGH-VOL: ${highVolIcon} ${highVolPredicted} → ${actualIcon} ${actualGroup} ${this.getResultIcon(isHighVolCorrect)} | NEXT: ${highVolIcon} ${highVolPredicted}(${highVolConfidence}%)
📉 LOW-VOL: ${lowVolIcon} ${lowVolPredicted} → ${actualIcon} ${actualGroup} ${this.getResultIcon(isLowVolCorrect)} | NEXT: ${lowVolIcon} ${lowVolPredicted}(${lowVolConfidence}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOW=${frequencies?.LOW || 0} | MED=${frequencies?.MEDIUM || 0} | HIGH=${frequencies?.HIGH || 0}`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: Triple result sent (PRIMARY:${primaryPredicted}→${actualGroup})`);
    }
    
    // ============================================================
    // COMMAND HANDLERS (UPDATED for v15.0)
    // ============================================================
    
    /**
     * Send status message (for /status command)
     */
    async sendStatusMessage(aiStatus, prediction) {
        if (!this.isEnabled) return;
        
        const activeText = aiStatus.isActive ? '🟢 ACTIVE' : '⚪ WAITING';
        const accuracyText = aiStatus.accuracy ? `${aiStatus.accuracy.toFixed(1)}%` : 'N/A';
        const convWrong = aiStatus.consecutiveWrongCount || 0;
        
        let message = `🤖 AI STATUS v15.0
━━━━━━━━━━━━━━━━━━━━━
📊 Total: ${aiStatus.totalPredictions || 0} | ✅ ${aiStatus.correctPredictions || 0}
📈 Accuracy: ${accuracyText}
━━━━━━━━━━━━━━━━━━━━━
🎯 Mode: ${activeText}
🔄 Consecutive Wrong: ${convWrong}
━━━━━━━━━━━━━━━━━━━━━
📊 LOW: ${aiStatus.currentFrequencies?.LOW || 0}
🟡 MEDIUM: ${aiStatus.currentFrequencies?.MEDIUM || 0}
🟢 HIGH: ${aiStatus.currentFrequencies?.HIGH || 0}`;
        
        if (aiStatus.currentPrimaryPrediction) {
            message += `\n🏆 PRIMARY: ${aiStatus.currentPrimaryPrediction}`;
        }
        
        if (aiStatus.waitingReason) {
            message += `\n⚠️ ${aiStatus.waitingReason}`;
        }
        
        await this.sendMessage(message);
    }
    
    /**
     * Send stats message (for /stats command)
     */
    async sendStatsMessage(stats) {
        if (!this.isEnabled) return;
        
        const message = `📊 LAST 10 STATISTICS
━━━━━━━━━━━━━━━━━━━━━
🔴 LOW: ${stats.LOW.count}/10 (${stats.LOW.percentage}%) ${stats.LOW.trend?.emoji || '⚖️'}
🟡 MEDIUM: ${stats.MEDIUM.count}/10 (${stats.MEDIUM.percentage}%) ${stats.MEDIUM.trend?.emoji || '⚖️'}
🟢 HIGH: ${stats.HIGH.count}/10 (${stats.HIGH.percentage}%) ${stats.HIGH.trend?.emoji || '⚖️'}`;
        
        await this.sendMessage(message);
    }
    
    /**
     * Send history message (for /history command)
     * UPDATED: Shows PRIMARY prediction
     */
    async sendHistoryMessage(predictions) {
        if (!this.isEnabled) return;
        
        if (!predictions || predictions.length === 0) {
            await this.sendMessage('📜 No prediction history yet.');
            return;
        }
        
        const last10 = predictions.slice(0, 10);
        let historyText = '';
        
        for (let i = 0; i < last10.length; i++) {
            const p = last10[i];
            const primaryGroup = p.predictedPrimary || p.predictedGroup;
            const isPrimaryCorrect = p.isPrimaryCorrect !== undefined ? p.isPrimaryCorrect : p.isCorrect;
            historyText += `\n${i+1}. 🏆 ${primaryGroup} → ${p.actualGroup || '?'} ${isPrimaryCorrect === true ? '✅' : (isPrimaryCorrect === false ? '❌' : '⏳')}`;
        }
        
        const correct = predictions.filter(p => {
            const isCorrect = p.isPrimaryCorrect !== undefined ? p.isPrimaryCorrect : p.isCorrect;
            return isCorrect === true;
        }).length;
        const total = predictions.filter(p => {
            const isCorrect = p.isPrimaryCorrect !== undefined ? p.isPrimaryCorrect : p.isCorrect;
            return isCorrect !== null;
        }).length;
        const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;
        
        const message = `📜 LAST 10 PRIMARY PREDICTIONS
━━━━━━━━━━━━━━━━━━━━━${historyText}
━━━━━━━━━━━━━━━━━━━━━
📊 PRIMARY Accuracy: ${accuracy}% (${correct}/${total})`;
        
        await this.sendMessage(message);
    }
    
    /**
     * Start polling for user commands
     */
    async startPolling() {
        if (!this.isEnabled) {
            console.log('⚠️ Telegram bot not enabled, skipping polling');
            return;
        }
        
        console.log('🔄 Setting up Telegram bot polling v15.0...');
        
        const webhookDeleted = await this.deleteWebhook();
        
        if (!webhookDeleted) {
            console.log('⚠️ Could not delete webhook, but continuing with polling...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            const testUrl = `https://api.telegram.org/bot${this.botToken}/getMe`;
            const response = await axios.get(testUrl, { timeout: 10000 });
            if (response.data && response.data.ok) {
                console.log(`✅ Bot connected: @${response.data.result.username}`);
            }
        } catch (error) {
            console.error('❌ Bot connection test failed:', error.message);
        }
        
        await this.setupBotCommands();
        
        this.pollingInterval = setInterval(async () => {
            await this.pollUpdates();
        }, 5000);
        
        console.log('✅ Telegram bot polling started (interval: 5s)');
    }
    
    /**
     * Poll for updates from Telegram
     */
    async pollUpdates() {
        if (!this.isEnabled) return;
        
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/getUpdates`;
            const response = await axios.get(url, {
                params: {
                    offset: this.lastUpdateId + 1,
                    timeout: 30,
                    allowed_updates: ['message']
                },
                timeout: 15000
            });
            
            if (response.data && response.data.ok) {
                const updates = response.data.result;
                
                for (const update of updates) {
                    if (update.update_id > this.lastUpdateId) {
                        this.lastUpdateId = update.update_id;
                    }
                    
                    if (update.message && update.message.text) {
                        const chatId = update.message.chat.id;
                        const text = update.message.text.trim();
                        const command = text.toLowerCase();
                        
                        await this.handleCommand(command, chatId);
                    }
                }
            }
        } catch (error) {
            if (error.response?.status === 409) {
                // Normal polling conflict, ignore
            } else if (error.response?.status === 404) {
                console.error('❌ Bot token invalid');
                this.isEnabled = false;
                this.stopPolling();
            } else if (Math.random() < 0.05) {
                console.error('Polling error:', error.message);
            }
        }
    }
    
    /**
     * Handle user commands
     */
    async handleCommand(command, chatId) {
        const data = await this.fetchAPI('/api/all-data');
        
        if (!data) {
            await this.sendMessageToChat(chatId, '⚠️ Unable to fetch data from server.');
            return;
        }
        
        switch(command) {
            case '/start':
                await this.sendStartMessage(chatId);
                break;
            case '/predict':
                await this.sendPredictionCommand(chatId, data);
                break;
            case '/stats':
                await this.sendStatsCommand(chatId, data);
                break;
            case '/history':
                await this.sendHistoryCommand(chatId, data);
                break;
            case '/status':
                await this.sendStatusCommand(chatId, data);
                break;
            case '/reset':
                await this.handleReset(chatId);
                break;
            default:
                if (command.startsWith('/')) {
                    await this.sendMessageToChat(chatId, `❓ Unknown: ${command}\nCommands: /predict, /stats, /history, /status, /reset`);
                }
        }
    }
    
    /**
     * Send message to specific chat
     */
    async sendMessageToChat(chatId, text, parseMode = 'HTML') {
        try {
            const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
            await axios.post(url, {
                chat_id: chatId,
                text: text,
                parse_mode: parseMode
            }, {
                timeout: 10000
            });
        } catch (error) {
            console.error('Error sending message:', error.message);
        }
    }
    
    /**
     * Fetch API data
     */
    async fetchAPI(endpoint) {
        try {
            const response = await axios.get(`${this.apiBaseUrl}${endpoint}`, {
                timeout: 8000
            });
            return response.data;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Send start message (UPDATED for v15.0)
     */
    async sendStartMessage(chatId) {
        const message = `⚡ Lightning Dice Predictor v15.0
🤖 TRIPLE PREDICTOR STATISTICAL AI with PRIMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY PREDICTION RULES:
📌 3 groups equal → WAITING
📌 2 groups equal → UNIQUE group
📌 All different → HIGH-VOLUME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PREDICTORS:
🏆 PRIMARY - Smart selection
📐 MEDIAN - Middle value group
📈 HIGH-VOL - Most frequent group
📉 LOW-VOL - Least frequent group
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 Commands:
/predict - Current prediction (PRIMARY + triple)
/stats - 10-result statistics
/history - Last 10 PRIMARY predictions
/status - AI system status
/reset - Reset AI (admin)`;
        
        await this.sendMessageToChat(chatId, message);
    }
    
    /**
     * Send prediction command response (UPDATED for v15.0)
     */
    async sendPredictionCommand(chatId, data) {
        const prediction = data.currentPrediction;
        
        if (!prediction || prediction.status === 'WAITING' || prediction.waitingForData) {
            const stats = prediction?.stats;
            const frequencies = {
                LOW: stats?.LOW?.count || 0,
                MEDIUM: stats?.MEDIUM?.count || 0,
                HIGH: stats?.HIGH?.count || 0
            };
            await this.sendTripleWaitingNotification(prediction, frequencies);
            return;
        }
        
        const frequencies = {
            LOW: prediction.stats?.LOW?.count || 0,
            MEDIUM: prediction.stats?.MEDIUM?.count || 0,
            HIGH: prediction.stats?.HIGH?.count || 0
        };
        
        await this.sendTriplePredictionNotification(prediction, frequencies);
    }
    
    /**
     * Send stats command response
     */
    async sendStatsCommand(chatId, data) {
        const prediction = data.currentPrediction;
        
        if (!prediction || !prediction.stats) {
            await this.sendMessageToChat(chatId, '⚠️ No statistics available yet.');
            return;
        }
        
        await this.sendStatsMessage(prediction.stats);
    }
    
    /**
     * Send history command response (UPDATED for v15.0)
     */
    async sendHistoryCommand(chatId, data) {
        const predictions = data.predictions || [];
        await this.sendHistoryMessage(predictions);
    }
    
    /**
     * Send status command response
     */
    async sendStatusCommand(chatId, data) {
        const aiStatus = data.aiStatus || {};
        const prediction = data.currentPrediction;
        await this.sendStatusMessage(aiStatus, prediction);
    }
    
    /**
     * Handle reset command
     */
    async handleReset(chatId) {
        try {
            const response = await axios.post(`${this.apiBaseUrl}/api/reset-ai`, {}, {
                timeout: 10000
            });
            if (response.data && response.data.success) {
                this.lastPredictionResult = {
                    predictedGroup: null,
                    actualGroup: null,
                    isCorrect: null,
                    retryCount: 0
                };
                await this.sendMessageToChat(chatId, '🔄 AI reset to WAITING mode (v15.0).');
            } else {
                await this.sendMessageToChat(chatId, '⚠️ Failed to reset AI.');
            }
        } catch (error) {
            await this.sendMessageToChat(chatId, '⚠️ Error resetting AI.');
        }
    }
    
    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('🛑 Telegram bot polling stopped');
        }
    }
}

module.exports = TelegramBot;
