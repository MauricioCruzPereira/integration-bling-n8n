const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const authMiddleware = require('./middleware/auth.middleware');
const { showMainMenu, handleMenuChoice, handleIntegrationChoice, handleCode } = require('./handlers/menu');
const { handleFileUpload } = require('./handlers/file');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

const userStates = {};

function resetUserState(userId) {
    userStates[userId] = { step: 'initial', lastInteraction: Date.now(), data: null };
}

function getUserState(userId) {
    if (!userStates[userId]) resetUserState(userId);
    return userStates[userId];
}

function setUserState(userId, step, data = null) {
    userStates[userId] = { step: step, lastInteraction: Date.now(), data: data };
}

// Comando /start e /menu
bot.onText(/\/start|\/menu/i, async (msg) => {
    await authMiddleware(bot, msg, async () => {
        const name = msg.from.first_name || 'usuário';
        await showMainMenu(bot, msg.chat.id, name);
        setUserState(msg.chat.id, 'awaiting_menu_choice');
    });
});

// Mensagens de texto
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.document) return;

    await authMiddleware(bot, msg, async () => {
        const chatId = msg.chat.id;
        const userState = getUserState(chatId);

        try {
            // Saudações
            if (msg.text && msg.text.match(/(oi|olá|hey|bom dia|boa tarde|boa noite)/i)) {
                const name = msg.from.first_name || 'usuário';
                await showMainMenu(bot, chatId, name);
                setUserState(chatId, 'awaiting_menu_choice');
                return;
            }

            // Menu principal
            if (userState.step === 'awaiting_menu_choice') {
                await handleMenuChoice(bot, chatId, msg.text, setUserState);
                if (!['1', '5'].includes(msg.text.trim())) {
                    resetUserState(chatId);
                }
            }
            // Escolher integração para renovar
            else if (userState.step === 'awaiting_integration_choice') {
                await handleIntegrationChoice(bot, chatId, msg.text, userState, setUserState);
            }
            // Receber CODE
            else if (userState.step === 'awaiting_code') {
                await handleCode(bot, chatId, msg.text, userState, setUserState);
            }
            // Estado desconhecido
            else {
                const name = msg.from.first_name || 'usuário';
                await showMainMenu(bot, chatId, name);
                setUserState(chatId, 'awaiting_menu_choice');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            await bot.sendMessage(chatId, '❌ Erro inesperado. Digite /menu para reiniciar');
            resetUserState(chatId);
        }
    });
});

// Upload de arquivo
bot.on('document', async (msg) => {
    await authMiddleware(bot, msg, async () => {
        const chatId = msg.chat.id;
        const userState = getUserState(chatId);

        if (userState.step !== 'awaiting_file') {
            await bot.sendMessage(chatId, '⚠️ Escolha a opção 1 no menu primeiro!\n\n💡 Digite /menu');
            return;
        }

        setUserState(chatId, 'processing');
        await handleFileUpload(bot, msg, TELEGRAM_TOKEN);
        resetUserState(chatId);
    });
});

// Limpeza de estados
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    Object.keys(userStates).forEach(userId => {
        if (now - userStates[userId].lastInteraction > oneHour) {
            delete userStates[userId];
        }
    });
}, 60 * 60 * 1000);

// ✅ TRATAMENTO ROBUSTO DE ERROS
bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error.code);
    
    if (error.code === 'EFATAL' || error.code === 'ECONNRESET') {
        console.log('🔄 Reconectando em 5 segundos...');
        setTimeout(() => {
            console.log('✅ Tentando reconectar...');
        }, 5000);
    }
});

bot.on('error', (error) => {
    console.error('❌ Bot error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

console.log('╔═══════════════════════════════╗');
console.log('║  🤖 BOT INICIADO COM SUCESSO  ║');
console.log('╚═══════════════════════════════╝');
console.log('📌 Node:', process.version);
console.log('📡 Webhook:', process.env.WEBHOOK_URL);
console.log('⏰ Iniciado em:', new Date().toLocaleString('pt-BR'));
