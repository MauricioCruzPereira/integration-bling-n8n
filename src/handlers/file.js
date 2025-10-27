const fs = require('fs');
const path = require('path');
const axios = require('axios');
const spreadsheetService = require('../services/spreadsheet.service');
const integrationsRepository = require('../repositories/integrations.repository');

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

    try {
        await bot.sendMessage(chatId, '⏳ Baixando planilha...');
        const filePath = await downloadFile(bot, fileId, fileName, token);
        console.log(`✅ Arquivo salvo: ${filePath}`);

        const phoneNumber = msg.from.id.toString();
        const integrations = await integrationsRepository.findActiveByPhone(phoneNumber);
        
        if (!integrations || integrations.length === 0) {
            await bot.sendMessage(chatId, '❌ Nenhuma integração ativa encontrada!\n\nUse /menu para configurar suas integrações.');
            return;
        }

        await bot.sendMessage(chatId, `✅ Planilha baixada!\n\n🔄 Processando e enviando para ${integrations.length} integração(ões)...\n\n⏳ Aguarde...`);

        const result = await spreadsheetService.processAndSend(filePath, integrations);

        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.error('Erro ao deletar arquivo temporário:', err);
        }

        if (result.success) {
            let message = `✅ ENVIO CONCLUÍDO\n\n`;
            message += `📊 Resumo:\n`;
            message += `• Total: ${result.total}\n`;
            message += `• Sucessos: ${result.sucessos}\n`;
            message += `• Erros: ${result.erros}\n`;
            message += `• Taxa: ${result.taxaSucesso}\n`;
            message += `• Duração: ${result.duracao}\n\n`;

            if (result.erros > 0) {
                message += `⚠️ Erros encontrados:\n`;
                result.detalhes.erros.slice(0, 5).forEach((erro, i) => {
                    message += `${i + 1}. ${erro.nome} (${erro.codigo})\n`;
                    message += `   └ ${erro.erro}\n`;
                });
                
                if (result.erros > 5) {
                    message += `\n...e mais ${result.erros - 5} erros\n`;
                }
            } else {
                message += `🎉 Todos os produtos foram enviados com sucesso!`;
            }

            // ✅ SEM parse_mode
            await bot.sendMessage(chatId, message);

        } else {
            await bot.sendMessage(chatId, `❌ Erro ao processar: ${result.error}`);
        }

    } catch (error) {
        console.error('❌ Erro ao processar arquivo:', error);
        await bot.sendMessage(chatId, '❌ Erro ao processar arquivo. Verifique os logs ou tente novamente.');
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
            responseType: 'stream'
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