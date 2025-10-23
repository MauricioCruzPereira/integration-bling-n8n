const axios = require('axios');
const { getActiveIntegrations } = require('./integrations');

async function sendToWebhook(products, chatId) {
    try {
        const integrations = await getActiveIntegrations();

        const payload = {
            timestamp: Date.now(),
            chatId: chatId,
            products: products,
            integrations: integrations
        };

        const response = await axios.post(process.env.WEBHOOK_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000
        });

        return { success: true, data: response.data };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            data: error.response?.data
        };
    }
}

module.exports = { sendToWebhook };