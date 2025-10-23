const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { processSpreadsheet, groupProductsByCode, formatProduct } = require('../services/spreadsheet');
const { sendToWebhook } = require('../services/webhook');
const integrationsService = require('../services/integrations');

async function downloadTelegramFile(bot, fileId, token) {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const filename = file.file_path.split('/').pop();
    const tempPath = path.join(__dirname, '../../temp', `temp_${Date.now()}_${filename}`);
    
    // Criar pasta temp se não existir
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempPath, buffer);
    console.log('📁 Arquivo salvo:', tempPath);
    return tempPath;
}

function formatResultMessage(result, products) {
    let message = '';

    if (!result.success || !result.data || !result.data.resumo) {
        message = '╔═══════════════════════════════╗\n';
        message += '║   ❌ ERRO NA IMPORTAÇÃO   ║\n';
        message += '╚═══════════════════════════════╝\n\n';
        message += '😔 Não foi possível processar.\n\n';
        if (result.error) {
            message += '📝 *Erro:*\n`' + result.error + '`\n\n';
        }
        message += '💡 Digite /menu para tentar novamente.';
        return message;
    }

    const resumo = result.data.resumo;
    const detalhes = result.data.detalhes;

    if (resumo.erros === 0 && resumo.duplicados === 0) {
        message = '╔═══════════════════════════════╗\n';
        message += '║  🎉 IMPORTAÇÃO CONCLUÍDA! 🎉  ║\n';
        message += '╚═══════════════════════════════╝\n\n';
    } else if (resumo.erros === 0) {
        message = '╔═══════════════════════════════╗\n';
        message += '║  ✅ IMPORTAÇÃO FINALIZADA  ✅  ║\n';
        message += '╚═══════════════════════════════╝\n\n';
    } else if (resumo.sucessos > 0) {
        message = '╔═══════════════════════════════╗\n';
        message += '║  ⚠️  IMPORTAÇÃO PARCIAL  ⚠️   ║\n';
        message += '╚═══════════════════════════════╝\n\n';
    } else {
        message = '╔═══════════════════════════════╗\n';
        message += '║   ❌  IMPORTAÇÃO FALHOU  ❌   ║\n';
        message += '╚═══════════════════════════════╝\n\n';
    }

    message += '📊 *RESUMO GERAL*\n';
    message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n';
    message += '┃ 📦 Total: *' + resumo.total + '* envios\n';
    message += '┃ 🔗 Integrações: *' + resumo.totalIntegracoes + '*\n';
    message += '┣━━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n';
    message += '┃ ✅ Sucesso: *' + resumo.sucessos + '*\n';

    if (resumo.duplicados > 0) {
        message += '┃ 🔄 Duplicados: *' + resumo.duplicados + '*\n';
    }

    if (resumo.erros > 0) {
        message += '┃ ❌ Erros: *' + resumo.erros + '*\n';
    }

    message += '┃ 📈 Taxa: *' + resumo.taxaSucesso + '*\n';
    message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';

    if (resumo.sucessos > 0 && detalhes.sucessos) {
        message += '✅ *PRODUTOS CADASTRADOS* (' + resumo.sucessos + ')\n\n';
        detalhes.sucessos.slice(0, 5).forEach((p, i) => {
            message += '  ' + (i + 1) + '. ✓ *' + p.nome + '*\n';
            if (p.blingId) message += '     └─ ID: `' + p.blingId + '`\n';
            message += '\n';
        });
        if (resumo.sucessos > 5) {
            message += '  ... e mais *' + (resumo.sucessos - 5) + '* produto(s) ✓\n\n';
        }
    }

    if (resumo.erros > 0 && detalhes.erros) {
        message += '❌ *PRODUTOS COM ERRO* (' + resumo.erros + ')\n\n';
        detalhes.erros.slice(0, 3).forEach((p, i) => {
            message += '  ' + (i + 1) + '. ✗ *' + p.nome + '*\n';
            if (p.mensagem) {
                let errorMsg = p.mensagem.substring(0, 100);
                message += '     └─ ⚠️ ' + errorMsg + '\n';
            }
            message += '\n';
        });
    }

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    message += '⏰ ' + new Date().toLocaleString('pt-BR') + '\n';
    message += '💡 Digite /menu para nova importação';

    return message;
}

async function handleFileUpload(bot, msg, token) {
    const chatId = msg.chat.id;
    const document = msg.document;
    const fileName = document.file_name;

    try {
        if (!fileName || (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls'))) {
            await bot.sendMessage(chatId,
                '❌ *Formato inválido*\n\n' +
                'Envie apenas arquivos:\n' +
                '  • CSV (.csv)\n' +
                '  • Excel (.xlsx, .xls)\n\n' +
                '💡 Digite /menu para voltar',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        await bot.sendMessage(chatId,
            '📥 *Arquivo recebido!*\n\n' +
            '📄 Nome: `' + fileName + '`\n' +
            '⏳ Processando...',
            { parse_mode: 'Markdown' }
        );

        const integrations = await integrationsService.getActiveIntegrations();
        
        await bot.sendMessage(chatId,
            '🔗 *Integrações encontradas*\n\n' +
            '✅ ' + integrations.length + ' integração(ões) ativa(s)\n' +
            '📊 Lendo planilha...',
            { parse_mode: 'Markdown' }
        );

        const filePath = await downloadTelegramFile(bot, document.file_id, token);
        const rawData = processSpreadsheet(filePath);
        const groupedProducts = groupProductsByCode(rawData);
        const products = groupedProducts.map(g => formatProduct(g));

        await bot.sendMessage(chatId,
            '✅ *Planilha processada!*\n\n' +
            '📦 ' + products.length + ' produto(s) encontrado(s)\n' +
            '🚀 Enviando para ' + integrations.length + ' integração(ões)...\n\n' +
            '⏳ _Isso pode levar alguns minutos. Por favor, aguarde..._',
            { parse_mode: 'Markdown' }
        );

        const result = await sendToWebhook(products, chatId);
        fs.unlinkSync(filePath);

        const resultMessage = formatResultMessage(result, products);
        await bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ Erro:', error);
        await bot.sendMessage(chatId,
            '❌ *Erro ao processar arquivo*\n\n' +
            '```\n' + error.message + '\n```\n\n' +
            '💡 Digite /menu para tentar novamente',
            { parse_mode: 'Markdown' }
        );
    }
}

module.exports = { handleFileUpload, downloadTelegramFile };