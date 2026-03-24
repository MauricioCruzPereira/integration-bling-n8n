const authService = require('../services/auth.service');

/**
 * Escapa caracteres especiais do Markdown
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/-/g, '\\-')
        .replace(/=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\./g, '\\.')
        .replace(/!/g, '\\!');
}

/**
 * Middleware de autenticação para o bot do Telegram
 */
async function authMiddleware(bot, msg, next) {
    const chatId = msg.chat.id;
    const user = msg.from;

    try {
        // Verifica se o usuário está autorizado
        const authResult = await authService.checkAuthorization(user);

        if (!authResult.authorized) {
            // ✅ Escapar dados do usuário
            const userId = escapeMarkdown(authResult.phone || 'N/A');
            const firstName = escapeMarkdown(user.first_name || 'N/A');

            // Usuário NÃO autorizado - bloqueia acesso
            const unauthorizedMessage = 
                '🚫 *ACESSO NEGADO*\n\n' +
                '❌ Você não tem permissão para usar este bot\\.\n\n' +
                '📋 *Para solicitar acesso:*\n' +
                '1\\. Envie seu ID de usuário para o administrador\n' +
                '2\\. Aguarde a liberação\n\n' +
                '🆔 *Seu ID:* `' + userId + '`\n' +
                '👤 *Nome:* ' + firstName + '\n' +
                '💡 _Copie seu ID e envie para o administrador_';

            await bot.sendMessage(chatId, unauthorizedMessage, { 
                parse_mode: 'MarkdownV2' // ✅ USAR MarkdownV2
            });
            
            console.log(`🚫 Acesso negado para: ${user.first_name} (ID: ${authResult.phone})`);
            return; // Bloqueia a execução
        }

        // Usuário autorizado - continua
        console.log(`✅ Acesso permitido: ${user.first_name} (${authResult.userData?.nome || 'Sem nome'})`);
        
        // Anexa dados do usuário na mensagem para uso posterior
        msg.authorizedUser = authResult.userData;
        
        // Chama o próximo handler
        if (next) next();
        
    } catch (error) {
        console.error('❌ Erro no middleware de autenticação:', error);
        
        // ✅ Mensagem de erro SEM Markdown
        await bot.sendMessage(chatId,
            '❌ ERRO AO VERIFICAR PERMISSÕES\n\n' +
            'Por favor, tente novamente mais tarde ou contate o administrador.'
        );
    }
}

module.exports = authMiddleware;
