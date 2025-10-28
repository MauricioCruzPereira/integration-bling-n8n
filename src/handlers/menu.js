async function showMainMenu(bot, chatId, userName) {
    const menuText = `
👋 Olá, ${userName}!

🤖 *BOT DE IMPORTAÇÃO BLING*

📋 *Escolha uma opção:*

1️⃣ Enviar planilha
2️⃣ Ver integrações ativas
3️⃣ Cancelar

4️⃣ Verificar tokens
5️⃣ Renovar token manualmente

💡 *Digite o número da opção desejada*
    `.trim();

    await bot.sendMessage(chatId, menuText);
}

async function handleMenuChoice(bot, chatId, choice, setUserState) {
    switch(choice.trim()) {
        case '1':
            await bot.sendMessage(
                chatId,
                '📄 *ENVIAR PLANILHA*\n\n' +
                '✅ Formatos aceitos:\n' +
                '• CSV (.csv)\n' +
                '• Excel (.xlsx, .xls)\n\n' +
                '📤 Anexe seu arquivo agora!'
            );
            setUserState(chatId, 'awaiting_file');
            break;

        case '2':
            await showActiveIntegrations(bot, chatId);
            break;

        case '3':
            await bot.sendMessage(
                chatId,
                '❌ Operação cancelada!\n\n' +
                '💡 Digite /menu para voltar ao menu principal'
            );
            setUserState(chatId, 'initial');
            break;

        case '4':
            await bot.sendMessage(
                chatId,
                '🔍 Verificando tokens...\n\n' +
                '⏳ Aguarde, isso pode levar alguns segundos...'
            );
            await verifyTokens(bot, chatId);
            break;

        case '5':
            await startTokenRenewal(bot, chatId, setUserState);
            break;

        default:
            await bot.sendMessage(
                chatId,
                '❌ Opção inválida!\n\n' +
                '💡 Digite um número de 1 a 5'
            );
            break;
    }
}

async function showActiveIntegrations(bot, chatId) {
    const integrationsRepository = require('../repositories/integrations.repository');
    
    try {
        const phoneNumber = chatId.toString();
        const integrations = await integrationsRepository.findActiveByPhone(phoneNumber);
        
        if (!integrations || integrations.length === 0) {
            await bot.sendMessage(
                chatId,
                '❌ Nenhuma integração ativa encontrada!'
            );
            return;
        }

        let message = '🔗 *INTEGRAÇÕES ATIVAS*\n\n';
        integrations.forEach((int, index) => {
            message += `${index + 1}. ${int.name}\n`;
            message += `   ID: ${int.id.substring(0, 8)}...\n\n`;
        });
        
        await bot.sendMessage(chatId, message);
        
    } catch (error) {
        console.error('Erro ao buscar integrações:', error);
        await bot.sendMessage(
            chatId,
            '❌ Erro ao buscar integrações. Tente novamente.'
        );
    }
}

// ✅ NOVA FUNÇÃO: Verificar tokens
async function verifyTokens(bot, chatId) {
    const integrationsRepository = require('../repositories/integrations.repository');
    const blingRepository = require('../repositories/bling.repository');
    
    try {
        const phoneNumber = chatId.toString();
        const integrations = await integrationsRepository.findActiveByPhone(phoneNumber);
        
        if (!integrations || integrations.length === 0) {
            await bot.sendMessage(
                chatId,
                '❌ Nenhuma integração ativa encontrada!'
            );
            return;
        }

        let message = '🔍 *VERIFICAÇÃO DE TOKENS*\n\n';
        
        for (const integration of integrations) {
            console.log(`🔍 Testando: ${integration.name}`);
            
            // Testar token chamando endpoint do Bling
            const result = await blingRepository.testToken(integration.token);
            
            if (result.success) {
                message += `✅ ${integration.name}\n`;
                message += `   Status: Funcionando\n\n`;
            } else {
                message += `❌ ${integration.name}\n`;
                message += `   Status: Token inválido\n`;
                message += `   Erro: ${result.error}\n\n`;
            }
            
            // Delay entre testes
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        message += '━━━━━━━━━━━━━━━━━━━━━\n';
        message += '💡 Use a opção 5 para renovar tokens inválidos';
        
        await bot.sendMessage(chatId, message);
        
    } catch (error) {
        console.error('Erro ao verificar tokens:', error);
        await bot.sendMessage(
            chatId,
            '❌ Erro ao verificar tokens. Tente novamente.'
        );
    }
}

// ✅ NOVA FUNÇÃO: Iniciar renovação manual
async function startTokenRenewal(bot, chatId, setUserState) {
    const integrationsRepository = require('../repositories/integrations.repository');
    
    try {
        const phoneNumber = chatId.toString();
        const integrations = await integrationsRepository.findActiveByPhone(phoneNumber);
        
        if (!integrations || integrations.length === 0) {
            await bot.sendMessage(
                chatId,
                '❌ Nenhuma integração ativa encontrada!'
            );
            return;
        }

        let message = '🔄 *RENOVAR TOKEN MANUALMENTE*\n\n';
        message += '📋 Escolha a integração:\n\n';
        
        integrations.forEach((int, index) => {
            message += `${index + 1}. ${int.name}\n`;
        });
        
        message += '\n💡 Digite o número da integração';
        
        await bot.sendMessage(chatId, message);
        
        // Salvar integrações no estado
        setUserState(chatId, 'awaiting_integration_choice', { integrations });
        
    } catch (error) {
        console.error('Erro ao listar integrações:', error);
        await bot.sendMessage(
            chatId,
            '❌ Erro ao listar integrações. Tente novamente.'
        );
    }
}

// ✅ NOVA FUNÇÃO: Processar escolha de integração
async function handleIntegrationChoice(bot, chatId, choice, userState, setUserState) {
    const integrations = userState.data?.integrations;
    
    if (!integrations) {
        await bot.sendMessage(chatId, '❌ Erro interno. Tente novamente com /menu');
        setUserState(chatId, 'initial');
        return;
    }
    
    const index = parseInt(choice) - 1;
    
    if (isNaN(index) || index < 0 || index >= integrations.length) {
        await bot.sendMessage(
            chatId,
            '❌ Opção inválida!\n\n💡 Digite um número válido'
        );
        return;
    }
    
    const selectedIntegration = integrations[index];
    
    let message = `✅ Integração selecionada: *${selectedIntegration.name}*\n\n`;
    message += '📋 *PRÓXIMO PASSO:*\n\n';
    message += '1️⃣ Acesse o Bling\n';
    message += '2️⃣ Vá em Configurações → Aplicações\n';
    message += '3️⃣ Autorize novamente a aplicação\n';
    message += '4️⃣ Copie o CODE gerado\n';
    message += '5️⃣ Envie o CODE aqui\n\n';
    message += '⚠️ O CODE expira em poucos minutos!';
    
    await bot.sendMessage(chatId, message);
    
    setUserState(chatId, 'awaiting_code', { selectedIntegration });
}

// ✅ NOVA FUNÇÃO: Processar CODE
async function handleCode(bot, chatId, code, userState, setUserState) {
    const selectedIntegration = userState.data?.selectedIntegration;
    
    if (!selectedIntegration) {
        await bot.sendMessage(chatId, '❌ Erro interno. Tente novamente com /menu');
        setUserState(chatId, 'initial');
        return;
    }
    
    // ✅ ADICIONAR ESTES LOGS
    console.log('\n📋 INTEGRAÇÃO SELECIONADA:');
    console.log('   ID:', selectedIntegration.id);
    console.log('   Nome:', selectedIntegration.name);
    console.log('   Client ID:', selectedIntegration.client_id);
    console.log('   Client Secret:', selectedIntegration.client_secret ? 'presente' : 'AUSENTE');
    console.log('   Code recebido:', code.substring(0, 20) + '...\n');
    
    await bot.sendMessage(
        chatId,
        '🔄 Renovando token...\n\n⏳ Aguarde...'
    );
    
    const blingRepository = require('../repositories/bling.repository');
    const integrationsRepository = require('../repositories/integrations.repository');
    
    try {
        // Renovar token com o CODE
        const result = await blingRepository.renewTokenWithCode(
            code.trim(),
            selectedIntegration.client_id,
            selectedIntegration.client_secret
        );
        
        if (result.success) {
            // Salvar no banco
            await integrationsRepository.update(selectedIntegration.id, {
                token: result.data.access_token,
                refresh_token: result.data.refresh_token,
                updated_at: new Date().toISOString()
            });
            
            let message = '✅ *TOKEN RENOVADO COM SUCESSO!*\n\n';
            message += `🔗 Integração: ${selectedIntegration.name}\n`;
            message += `⏰ Expira em: ${result.data.expires_in} segundos\n\n`;
            message += '🎉 Sua integração está pronta para usar!';
            
            await bot.sendMessage(chatId, message);
            
        } else {
            let message = '❌ *ERRO AO RENOVAR TOKEN*\n\n';
            message += `🔗 Integração: ${selectedIntegration.name}\n`;
            message += `⚠️ Erro: ${result.error}\n`;
            if (result.details) {
                message += `📋 Detalhes: ${result.details}\n`;
            }
            message += '\n💡 Verifique se o CODE está correto e não expirou';
            
            await bot.sendMessage(chatId, message);
        }
        
    } catch (error) {
        console.error('Erro ao renovar token:', error);
        await bot.sendMessage(
            chatId,
            '❌ Erro ao renovar token. Tente novamente.'
        );
    }
    
    setUserState(chatId, 'initial');
}
module.exports = {
    showMainMenu,
    handleMenuChoice,
    handleIntegrationChoice,
    handleCode
};