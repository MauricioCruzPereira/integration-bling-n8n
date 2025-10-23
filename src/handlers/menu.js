const integrationsService = require('../services/integrations');

async function showMainMenu(bot, chatId, name) {
    const menuMessage =
        '╔═══════════════════════════════╗\n' +
        '║   🤖 IMPORTADOR DE PRODUTOS   ║\n' +
        '╚═══════════════════════════════╝\n\n' +
        '👋 Olá, *' + name + '*!\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📋 *MENU PRINCIPAL*\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '┃  1️⃣  Enviar planilha       ┃\n' +
        '┃  2️⃣  Ver integrações ativas┃\n' +
        '┃  3️⃣  Cancelar              ┃\n' +
        '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n' +
        '💬 Digite o número da opção desejada';

    await bot.sendMessage(chatId, menuMessage, { parse_mode: 'Markdown' });
}

async function handleMenuChoice(bot, chatId, choice, setUserState) {
    if (choice === '1') {
        const instructionMsg =
            '╔═══════════════════════════════╗\n' +
            '║   📎 ENVIAR PLANILHA          ║\n' +
            '╚═══════════════════════════════╝\n\n' +
            '📄 *Formatos aceitos:*\n' +
            '  • CSV (.csv)\n' +
            '  • Excel (.xlsx, .xls)\n\n' +
            '⚡ *Próximo passo:*\n' +
            '  Anexe seu arquivo agora!\n\n' +
            '💡 _Digite /menu para cancelar_';
        await bot.sendMessage(chatId, instructionMsg, { parse_mode: 'Markdown' });
        setUserState(chatId, 'awaiting_file');
    } 
    else if (choice === '2') {
        try {
            await bot.sendChatAction(chatId, 'typing');
            const integrations = await integrationsService.getActiveIntegrations();

            let intMsg =
                '╔═══════════════════════════════╗\n' +
                '║  🔗 INTEGRAÇÕES ATIVAS        ║\n' +
                '╚═══════════════════════════════╝\n\n';

            integrations.forEach((int, i) => {
                intMsg += '┌─ *Integração ' + (i + 1) + '*\n';
                intMsg += '│  🏢 Nome: ' + int.name + '\n';
                intMsg += '│  🆔 ID: `' + int.id.substring(0, 8) + '...`\n';
                intMsg += '│  🔑 Token: `' + int.token.substring(0, 15) + '...`\n';
                intMsg += '└─ ✅ Status: *Ativa*\n\n';
            });

            intMsg += '━━━━━━━━━━━━━━━━━━━━━━━\n\n';
            intMsg += '📊 Total: *' + integrations.length + '* integração(ões)\n';
            intMsg += '📤 Os produtos serão enviados para todas!\n\n';
            intMsg += '💡 Digite /menu para voltar';

            await bot.sendMessage(chatId, intMsg, { parse_mode: 'Markdown' });
        } catch (error) {
            await bot.sendMessage(chatId,
                '❌ *Erro ao buscar integrações*\n\n' +
                '```\n' + error.message + '\n```\n\n' +
                '💡 Digite /menu para voltar',
                { parse_mode: 'Markdown' }
            );
        }
    } 
    else if (choice === '3') {
        await bot.sendMessage(chatId,
            '👋 *Operação cancelada*\n\nAté logo! Digite /start para voltar.',
            { parse_mode: 'Markdown' }
        );
    } 
    else {
        await bot.sendMessage(chatId,
            '❌ Opção inválida\n\n' +
            'Por favor, escolha 1, 2 ou 3',
            { parse_mode: 'Markdown' }
        );
    }
}

module.exports = { showMainMenu, handleMenuChoice };