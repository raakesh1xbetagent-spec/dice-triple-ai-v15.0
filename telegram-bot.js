// ============================================================
// telegram-bot.js (v15.2 - PRIMARY ONLY with NEXT prediction)
// 
// Features:
// - ONLY PRIMARY prediction display (simplified)
// - Shows NEXT prediction with confidence
// - Others: WAITING in one line
// - Shows retry count when applicable
// - CORRECT ✅ / WRONG ❌ with clean format
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
            console.log(`📊 Format: PRIMARY ONLY v15.2 with NEXT prediction`);
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
            { command: 'predict', description: '🎯 Get current PRIMARY prediction' },
            { command: 'stats', description: '📊 Show last 10 results statistics' },
            { command: 'history', description: '📜 Show last 10 PRIMARY prediction history' },
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
        if (isCorrect === true) return '✓';
        if (isCorrect === false) return '✗';
        return '⏳';
    }
    
    // ============================================================
    // v15.2 PRIMARY ONLY METHODS
    // ============================================================
    
    /**
     * Send prediction notification (called from server.js)
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
        
        await this.sendPrimaryPredictionNotification(predictionData);
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
        
        await this.sendPrimaryWaitingNotification(waitingData);
    }
    
    /**
     * Send correct notification (called from server.js)
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
            predictedGroup: predictedGroups.primary
        };
        
        await this.sendPrimaryCorrectNotification(predictedGroups, actualGroup, retryCount);
    }
    
    /**
     * Send wrong notification (called from server.js)
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
            predictedGroup: predictedGroups.primary
        };
        
        await this.sendPrimaryWrongNotification(predictedGroups, actualGroup, retryCount);
    }
    
    // ============================================================
    // v15.2 PRIMARY ONLY NOTIFICATION METHODS
    // ============================================================
    
    /**
     * Send PRIMARY prediction notification (active prediction without result)
     */
    async sendPrimaryPredictionNotification(predictionData) {
        const primary = predictionData?.primary;
        const stats = predictionData?.stats;
        
        const primaryPredicted = primary?.predictedGroup || 'WAITING';
        const primaryConfidence = primary?.confidence || 0;
        const primaryIcon = this.getGroupIcon(primaryPredicted);
        
        let reasonText = '';
        if (primary?.reason === 'UNIQUE_GROUP_FROM_DUPLICATE') {
            reasonText = '🎯 Unique group from duplicate';
        } else if (primary?.reason === 'HIGH_VOLUME_FROM_ALL_DIFFERENT') {
            reasonText = '📈 HIGH-VOLUME (all different)';
        } else if (primary?.reason === 'ALL_GROUPS_EQUAL') {
            reasonText = '⚖️ All groups equal';
        }
        
        let message = `📊 PRIMARY PREDICTOR v15.2 - ACTIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${primaryPredicted} (${primaryConfidence}%)
💡 ${reasonText || primary?.message || 'Smart selection based on frequency patterns'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOW=${stats?.LOW?.count || 0} | MED=${stats?.MEDIUM?.count || 0} | HIGH=${stats?.HIGH?.count || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Waiting for next result...`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: PRIMARY prediction sent (${primaryPredicted})`);
    }
    
    /**
     * Send PRIMARY waiting notification
     */
    async sendPrimaryWaitingNotification(waitingData) {
        const waitingReason = waitingData?.waitingReason || 'UNKNOWN';
        const stats = waitingData?.stats;
        const primary = waitingData?.primary;
        
        let waitingReasonText = '';
        if (waitingReason === 'ALL_GROUPS_EQUAL') {
            waitingReasonText = 'All three groups have equal frequency';
        } else if (waitingReason === 'DUPLICATE_MEDIAN') {
            waitingReasonText = 'Duplicate median - waiting for unique condition';
        } else if (waitingReason === 'INSUFFICIENT_DATA') {
            waitingReasonText = 'Need 10 results for analysis';
        } else {
            waitingReasonText = 'Waiting for unique median condition';
        }
        
        let primaryText = '';
        let showPrimaryWaiting = true;
        
        // Check if PRIMARY has a prediction even in waiting mode
        if (primary && primary.predictedGroup && primary.status === 'ACTIVE') {
            showPrimaryWaiting = false;
            primaryText = `\n🏆 PRIMARY: ${this.getGroupIcon(primary.predictedGroup)} ${primary.predictedGroup} (${primary.confidence}%)\n💡 ${primary.message || ''}`;
        }
        
        let message = '';
        
        if (showPrimaryWaiting) {
            message = `⏳ PRIMARY PREDICTOR v15.2 - WAITING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ⏳ WAITING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Reason: ${waitingReasonText}
📊 LOW=${stats?.LOW?.count || 0} | MED=${stats?.MEDIUM?.count || 0} | HIGH=${stats?.HIGH?.count || 0}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏳ Next prediction after 1 more result`;
        } else {
            message = `📊 PRIMARY PREDICTOR v15.2 - ACTIVE (Others Waiting)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${this.getGroupIcon(primary.predictedGroup)} ${primary.predictedGroup} (${primary.confidence}%)
💡 ${primary.message || ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Others: WAITING (Median/High-Vol/Low-Vol)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 LOW=${stats?.LOW?.count || 0} | MED=${stats?.MEDIUM?.count || 0} | HIGH=${stats?.HIGH?.count || 0}`;
        }
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: PRIMARY waiting sent (${waitingReason})`);
    }
    
    /**
     * Send PRIMARY correct notification
     */
    async sendPrimaryCorrectNotification(predictedGroups, actualGroup, retryCount) {
        const primaryPredicted = predictedGroups.primary;
        const primaryIcon = this.getGroupIcon(primaryPredicted);
        const actualIcon = this.getGroupIcon(actualGroup);
        
        // Get next prediction (from current prediction data)
        let nextPrediction = '?';
        let nextConfidence = 0;
        let nextIcon = '⚪';
        
        try {
            const data = await this.fetchAPI('/api/current-prediction');
            if (data && data.prediction && data.prediction.primary) {
                nextPrediction = data.prediction.primary.predictedGroup || '?';
                nextConfidence = data.prediction.primary.confidence || 0;
                nextIcon = this.getGroupIcon(nextPrediction);
            }
        } catch (e) {
            // Use fallback
            nextPrediction = primaryPredicted;
            nextConfidence = 85;
            nextIcon = primaryIcon;
        }
        
        const retryText = (retryCount && retryCount > 0) ? ` | 🔄 Retry: #${retryCount}` : '';
        
        const message = `✅ PRIMARY v15.2 - CORRECT!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${primaryPredicted} → ${actualIcon} ${actualGroup} ✓
🎯 NEXT: ${nextIcon} ${nextPrediction} (${nextConfidence}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Others: WAITING${retryText}`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: PRIMARY correct notification sent (${primaryPredicted}→${actualGroup})`);
    }
    
    /**
     * Send PRIMARY wrong notification
     */
    async sendPrimaryWrongNotification(predictedGroups, actualGroup, retryCount) {
        const primaryPredicted = predictedGroups.primary;
        const primaryIcon = this.getGroupIcon(primaryPredicted);
        const actualIcon = this.getGroupIcon(actualGroup);
        
        // Get next prediction (from current prediction data)
        let nextPrediction = '?';
        let nextConfidence = 0;
        let nextIcon = '⚪';
        
        try {
            const data = await this.fetchAPI('/api/current-prediction');
            if (data && data.prediction && data.prediction.primary) {
                nextPrediction = data.prediction.primary.predictedGroup || '?';
                nextConfidence = data.prediction.primary.confidence || 0;
                nextIcon = this.getGroupIcon(nextPrediction);
            }
        } catch (e) {
            // Use fallback
            nextPrediction = primaryPredicted;
            nextConfidence = 75;
            nextIcon = primaryIcon;
        }
        
        const retryText = (retryCount && retryCount > 0) ? ` | 🔄 Retry: #${retryCount}` : '';
        
        const message = `❌ PRIMARY v15.2 - WRONG!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY: ${primaryIcon} ${primaryPredicted} → ${actualIcon} ${actualGroup} ✗
🎯 NEXT: ${nextIcon} ${nextPrediction} (${nextConfidence}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Others: WAITING${retryText}`;
        
        await this.sendMessage(message);
        console.log(`📱 Telegram: PRIMARY wrong notification sent (${primaryPredicted}→${actualGroup})`);
    }
    
    // ============================================================
    // COMMAND HANDLERS (UPDATED for v15.2)
    // ============================================================
    
    /**
     * Send status message (for /status command)
     */
    async sendStatusMessage(aiStatus, prediction) {
        if (!this.isEnabled) return;
        
        const activeText = aiStatus.isActive ? '🟢 ACTIVE' : '⚪ WAITING';
        const accuracyText = aiStatus.accuracy ? `${aiStatus.accuracy.toFixed(1)}%` : 'N/A';
        const convWrong = aiStatus.consecutiveWrongCount || 0;
        
        let message = `🤖 PRIMARY AI STATUS v15.2
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
     * Send history message (for /history command) - PRIMARY only
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
            const statusIcon = isPrimaryCorrect === true ? '✅' : (isPrimaryCorrect === false ? '❌' : '⏳');
            historyText += `\n${i+1}. ${this.getGroupIcon(primaryGroup)} ${primaryGroup} → ${p.actualGroup || '?'} ${statusIcon}`;
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
        
        console.log('🔄 Setting up Telegram bot polling v15.2...');
        
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
     * Send start message (UPDATED for v15.2)
     */
    async sendStartMessage(chatId) {
        const message = `⚡ Lightning Dice Predictor v15.2
🤖 PRIMARY PREDICTOR STATISTICAL AI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 PRIMARY PREDICTION RULES:
📌 3 groups equal → WAITING
📌 2 groups equal → UNIQUE group
📌 All different → HIGH-VOLUME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 Commands:
/predict - Current PRIMARY prediction
/stats - 10-result statistics
/history - Last 10 PRIMARY predictions
/status - AI system status
/reset - Reset AI (admin)`;
        
        await this.sendMessageToChat(chatId, message);
    }
    
    /**
     * Send prediction command response
     */
    async sendPredictionCommand(chatId, data) {
        const prediction = data.currentPrediction;
        
        if (!prediction || prediction.status === 'WAITING' || prediction.waitingForData) {
            await this.sendPrimaryWaitingNotification(prediction);
            return;
        }
        
        await this.sendPrimaryPredictionNotification(prediction);
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
     * Send history command response
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
                await this.sendMessageToChat(chatId, '🔄 AI reset to WAITING mode (v15.2).');
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
