const fs = require('fs');
const path = require('path');
const axios = require('axios');
const spreadsheetService = require('../services/spreadsheet.service');
const integrationsRepository = require('../repositories/integrations.repository');

// ✅ FUNÇÃO AUXILIAR: Enviar mensagem longa em partes
async function sendLongMessage(bot, chatId, message, maxLength = 4000) {
    if (message.length <= maxLength) {
        try {
            await bot.sendMessage(chatId, message);
            return;
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error.message);
            await bot.sendMessage(chatId, '⚠️ Processamento concluído, mas houve erro ao enviar detalhes.');
            return;
        }
    }

    // Dividir em partes
    const parts = [];
    let currentPart = '';
    const lines = message.split('\n');

    for (const line of lines) {
        if ((currentPart + line + '\n').length > maxLength) {
            if (currentPart) parts.push(currentPart);
            currentPart = line + '\n';
        } else {
            currentPart += line + '\n';
        }
    }
    
    if (currentPart) parts.push(currentPart);

    // Enviar cada parte
    for (let i = 0; i < parts.length; i++) {
        try {
            const header = i === 0 ? '' : `📄 Continuação (${i + 1}/${parts.length}):\n\n`;
            await bot.sendMessage(chatId, header + parts[i]);
            await new Promise(resolve => setTimeout(resolve, 500)); // Delay entre mensagens
        } catch (error) {
            console.error(`Erro ao enviar parte ${i + 1}:`, error.message);
        }
    }
}

async function handleFileUpload(bot, msg, token) {
    const chatId = msg.chat.id;
    const document = msg.document;
    
    if (!document) {
        await bot.sendMessage(chatId, '❌ Nenhum arquivo detectado.');
        return;
    }

    const fileName = document.file_name;
    const fileId = document.file_id;
    
    console.log(`📄 Arquivo recebido: ${fileName}`);

    const ext = path.extname(fileName).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
        await bot.sendMessage(chatId, '❌ Formato inválido! Envie um arquivo .csv ou .xlsx');
        return;
    }

    let progressMsg;
    
    try {
        // 1. Baixar arquivo
        progressMsg = await bot.sendMessage(chatId, '⏳ Baixando planilha...');
        const filePath = await downloadFile(bot, fileId, fileName, token);
        console.log(`✅ Arquivo salvo: ${filePath}`);

        // 2. Buscar integrações
        const phoneNumber = msg.from.id.toString();
        const integrations = await integrationsRepository.findActiveByPhone(phoneNumber);
        
        if (!integrations || integrations.length === 0) {
            await bot.editMessageText(
                '❌ Nenhuma integração ativa encontrada!\n\nUse /menu para configurar.',
                { chat_id: chatId, message_id: progressMsg.message_id }
            );
            return;
        }

        // 3. Atualizar progresso
        await bot.editMessageText(
            `✅ Planilha baixada!\n\n🔄 Processando ${integrations.length} integração(ões)...\n\n⏳ Isso pode levar alguns minutos...`,
            { chat_id: chatId, message_id: progressMsg.message_id }
        );

        // 4. Processar
        const result = await spreadsheetService.processAndSend(filePath, integrations);

        // 5. Limpar arquivo
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Erro ao deletar arquivo:', err);
        }

        // 6. Deletar mensagem de progresso
        try {
            await bot.deleteMessage(chatId, progressMsg.message_id);
        } catch (err) {
            console.error('Erro ao deletar mensagem:', err);
        }

        // 7. Enviar resultado
        if (result.success) {
            let message = `✅ ENVIO CONCLUÍDO\n\n`;
            message += `📊 Resumo:\n`;
            message += `• Total: ${result.total}\n`;
            message += `• Sucessos: ${result.sucessos}\n`;
            message += `• Erros: ${result.erros}\n`;
            message += `• Taxa: ${result.taxaSucesso}\n`;
            message += `• Duração: ${result.duracao}\n`;

            // ✅ LIMITAR ERROS EXIBIDOS
            if (result.erros > 0) {
                message += `\n⚠️ Erros encontrados:\n`;
                const maxErros = Math.min(result.erros, 3); // Máximo 3 erros
                
                result.detalhes.erros.slice(0, maxErros).forEach((erro, i) => {
                    const nomeSimplificado = erro.nome.substring(0, 50); // Limitar nome
                    message += `${i + 1}. ${nomeSimplificado}${erro.nome.length > 50 ? '...' : ''}\n`;
                    message += `   Código: ${erro.codigo}\n`;
                    message += `   Erro: ${erro.erro}\n\n`;
                });
                
                if (result.erros > maxErros) {
                    message += `...e mais ${result.erros - maxErros} erros\n\n`;
                    message += `💡 Consulte os logs para detalhes completos.`;
                }
            } else {
                message += `\n🎉 Todos os produtos foram enviados com sucesso!`;
            }

            // ✅ ENVIAR COM PROTEÇÃO
            await sendLongMessage(bot, chatId, message);

        } else {
            await bot.sendMessage(chatId, `❌ Erro: ${result.error}`);
        }

    } catch (error) {
        console.error('❌ Erro ao processar:', error);
        
        try {
            if (progressMsg) {
                await bot.deleteMessage(chatId, progressMsg.message_id);
            }
        } catch (err) {}
        
        await bot.sendMessage(
            chatId, 
            '❌ Erro ao processar arquivo.\n\n💡 Verifique os logs ou tente novamente.'
        );
    }
}

async function downloadFile(bot, fileId, fileName, token) {
    try {
        const file = await bot.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const filePath = path.join(tempDir, `${timestamp}_${fileName}`);

        const response = await axios({
            method: 'GET',
            url: fileUrl,
            responseType: 'stream',
            timeout: 60000 // 60 segundos
        });

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });

    } catch (error) {
        console.error('Erro ao baixar arquivo:', error);
        throw new Error('Falha ao baixar arquivo do Telegram');
    }
}

module.exports = {
    handleFileUpload
};