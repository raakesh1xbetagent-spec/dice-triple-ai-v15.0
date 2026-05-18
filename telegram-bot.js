/**
 * Telegram Bot Module - Stub Implementation
 * Provides interface for sending notifications to Telegram
 */

class TelegramBot {
    constructor(apiBaseUrl) {
        this.apiBaseUrl = apiBaseUrl;
        this.isEnabled = false; // Disabled by default if no token configured
        console.log('📱 Telegram Bot initialized (notifications disabled - no token configured)');
    }

    async sendPredictionNotification(prediction) {
        if (!this.isEnabled) return;
        console.log('📨 [Telegram] Prediction notification:', prediction);
    }

    async sendTriplePredictionNotification(prediction, options = {}) {
        if (!this.isEnabled) return;
        console.log('📨 [Telegram] Triple prediction notification:', prediction);
    }

    async sendWaitingNotification(waitingData) {
        if (!this.isEnabled) return;
        console.log('📨 [Telegram] Waiting notification:', waitingData);
    }

    async sendTripleWaitingNotification(waitingData, options = {}) {
        if (!this.isEnabled) return;
        console.log('📨 [Telegram] Triple waiting notification:', waitingData);
    }

    async sendTripleCorrectNotification(predictedGroups, actualGroup, retryCount) {
        if (!this.isEnabled) return;
        console.log('📨 [Telegram] Triple correct notification:', { predictedGroups, actualGroup, retryCount });
    }

    async sendTripleWrongNotification(prediction, actualResult, retryData) {
        if (!this.isEnabled) return;
        console.log('📨 [Telegram] Triple wrong notification:', { prediction, actualResult, retryData });
    }
}

module.exports = TelegramBot;
