const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const authMiddleware = require('./middleware/auth.middleware');
const { showMainMenu, handleMenuChoice } = require('./handlers/menu');
const { handleFileUpload } = require('./handlers/file');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
// ✅ CONFIGURAÇÕES OTIMIZADAS
const bot = new TelegramBot(TELEGRAM_TOKEN, { 
    polling: {
        interval: 1000,
        autoStart: true,
        params: {
            timeout: 10
        }
    },
    request: {
        agentOptions: {
            keepAlive: true,
            keepAliveMsecs: 30000
        },
        timeout: 60000 // 60 segundos
    }
});

const userStates = {};

function resetUserState(userId) {
    userStates[userId] = { step: 'initial', lastInteraction: Date.now() };
}

function getUserState(userId) {
    if (!userStates[userId]) resetUserState(userId);
    return userStates[userId];
}

function setUserState(userId, step) {
    userStates[userId] = { step: step, lastInteraction: Date.now() };
}

// ✅ APLICAR MIDDLEWARE DE AUTENTICAÇÃO EM TODOS OS COMANDOS
bot.onText(/\/start|\/menu/i, async (msg) => {
    await authMiddleware(bot, msg, async () => {
        const name = msg.from.first_name || 'usuário';
        await showMainMenu(bot, msg.chat.id, name);
        setUserState(msg.chat.id, 'awaiting_menu_choice');
    });
});

// ✅ MENSAGENS DE TEXTO COM AUTENTICAÇÃO
bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.document) return;

    await authMiddleware(bot, msg, async () => {
        const chatId = msg.chat.id;
        const userState = getUserState(chatId);

        try {
            if (msg.text && msg.text.match(/(oi|olá|hey|bom dia|boa tarde|boa noite)/i)) {
                const name = msg.from.first_name || 'usuário';
                await showMainMenu(bot, chatId, name);
                setUserState(chatId, 'awaiting_menu_choice');
                return;
            }

            if (userState.step === 'awaiting_menu_choice') {
                await handleMenuChoice(bot, chatId, msg.text, setUserState);
                if (msg.text !== '1') {
                    resetUserState(chatId);
                }
            } else {
                const name = msg.from.first_name || 'usuário';
                await showMainMenu(bot, chatId, name);
                setUserState(chatId, 'awaiting_menu_choice');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            await bot.sendMessage(chatId,
                '❌ *Erro inesperado*\n\n' +
                '```\n' + error.message + '\n```\n\n' +
                '💡 Digite /menu para reiniciar',
                { parse_mode: 'Markdown' }
            );
            resetUserState(chatId);
        }
    });
});

// ✅ UPLOAD DE ARQUIVO COM AUTENTICAÇÃO
bot.on('document', async (msg) => {
    await authMiddleware(bot, msg, async () => {
        const chatId = msg.chat.id;
        const userState = getUserState(chatId);

        if (userState.step !== 'awaiting_file') {
            await bot.sendMessage(chatId,
                '⚠️ *Atenção*\n\n' +
                'Por favor, escolha a opção *1* no menu primeiro\n\n' +
                '💡 Digite /menu para começar',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        setUserState(chatId, 'processing');
        await handleFileUpload(bot, msg, TELEGRAM_TOKEN);
        resetUserState(chatId);
    });
});

// ✅ LIMPEZA DE ESTADOS ANTIGOS
setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    Object.keys(userStates).forEach(userId => {
        if (now - userStates[userId].lastInteraction > oneHour) {
            delete userStates[userId];
        }
    });
}, 60 * 60 * 1000);

// ✅ TRATAMENTO DE ERROS
// Adicionar após a inicialização do bot:

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
