const TelegramBot = require('node-telegram-bot-api');
const XLSX = require('xlsx');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const userStates = {};

async function getActiveIntegrations() {
    try {
        console.log('🔍 Buscando integrações ativas...');

        const { data, error } = await supabase
            .from('integrations')
            .select('id, name, token')
            .eq('is_active', true)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ Erro Supabase:', error);
            throw new Error('Falha ao buscar integrações: ' + error.message);
        }

        if (!data || data.length === 0) {
            throw new Error('⚠️ Nenhuma integração ativa encontrada');
        }

        console.log('✅ Integrações:', data.length);
        data.forEach((int, i) => {
            console.log(`   ${i + 1}. ${int.name}`);
        });

        return data;
    } catch (error) {
        console.error('❌ Erro crítico:', error);
        throw error;
    }
}

// ============================================
// MIDDLEWARE DE AUTORIZAÇÃO
// ============================================
async function checkAuthorization(msg) {
    const userId = msg.from.id;
    const username = msg.from.username || 'sem username';
    const name = msg.from.first_name || 'usuário';
    const chatId = msg.chat.id;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 Acesso de:');
    console.log('   ID:', userId);
    console.log('   Username:', username);
    console.log('   Nome:', name);

    try {
        const { data, error } = await supabase
            .from('numero_telefone_liberado')
            .select('*')
            .eq('numero', userId.toString())
            .eq('ativo', true)
            .single();
        console.log('dataSupBaseUsuario',data);
        if (error && error.code === 'PGRST116') {
            console.log('❌ Usuário não autorizado');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            await bot.sendMessage(chatId,
                '🚫 *Usuário não autorizado*\n\n' +
                'Você não tem permissão para usar este bot.\n\n' +
                '📱 Seu ID: `' + userId + '`\n\n' +
                '💡 Envie este ID para o administrador liberar seu acesso.',
                { parse_mode: 'Markdown' }
            );
            return false;
        }

        if (error) throw error;

        console.log('✅ Autorizado:', data.nome || name);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return true;

    } catch (error) {
        console.error('❌ Erro na verificação:', error);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await bot.sendMessage(chatId,
            '❌ *Erro ao verificar permissões*\n\n' +
            'Tente novamente mais tarde.',
            { parse_mode: 'Markdown' }
        );
        return false;
    }
}

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

async function downloadTelegramFile(fileId) {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const filename = file.file_path.split('/').pop();
    const tempPath = path.join(__dirname, `temp_${Date.now()}_${filename}`);
    fs.writeFileSync(tempPath, buffer);
    console.log('📁 Arquivo salvo:', tempPath);
    return tempPath;
}

function processSpreadsheet(filePath) {
    console.log('📊 Processando planilha...');
    const workbook = XLSX.readFile(filePath, { raw: false, defval: '', codepage: 65001 });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '', blankrows: false });
    console.log('✅ Processado:', data.length, 'linhas');
    return data;
}

function fixEncoding(text) {
    if (!text) return text;
    try {
        return Buffer.from(text, 'latin1').toString('utf8');
    } catch (e) {
        return text;
    }
}

function groupProductsByCode(rows) {
    const grouped = {};
    const seenVariations = new Set();

    rows.forEach(row => {
        const codigo = row.codigo;
        const ehPai = (row.ehPai || '').toUpperCase();

        if (!codigo || codigo.trim() === '') {
            console.warn('⚠️ Linha sem código ignorada');
            return;
        }

        if (ehPai === 'SIM' || !grouped[codigo]) {
            if (!grouped[codigo]) {
                grouped[codigo] = { produto: row, variacoes: [] };
            } else if (ehPai === 'SIM') {
                grouped[codigo].produto = row;
            }
        }

        if (ehPai === 'NAO' && row.variacaoTipo && row.variacaoValor) {
            const codigoPai = row.codigo.split('-')[0];

            const valorVariacao = row.variacaoValor.trim();
            if (!valorVariacao || valorVariacao === '' || valorVariacao === row.variacaoTipo) {
                console.warn('⚠️ Variação inválida ignorada:', row.variacaoCodigo);
                return;
            }

            const variacaoKey = `${codigoPai}-${row.variacaoTipo}-${valorVariacao}`;
            if (seenVariations.has(variacaoKey)) {
                console.warn('⚠️ Variação duplicada ignorada:', variacaoKey);
                return;
            }
            seenVariations.add(variacaoKey);

            if (!grouped[codigoPai]) {
                grouped[codigoPai] = {
                    produto: {
                        nome: row.nome.split(' - ')[0],
                        codigo: codigoPai,
                        preco: row.preco,
                        tipo: row.tipo,
                        situacao: row.situacao,
                        formato: 'V',
                        unidade: row.unidade,
                        pesoLiquido: row.pesoLiquido,
                        pesoBruto: row.pesoBruto,
                        marca: row.marca,
                        linkExterno: row.linkExterno,
                        altura: row.altura,
                        largura: row.largura,
                        profundidade: row.profundidade
                    },
                    variacoes: []
                };
            }

            grouped[codigoPai].variacoes.push({
                tipo: row.variacaoTipo,
                valor: valorVariacao,
                codigo: row.variacaoCodigo || row.codigo,
                preco: parseFloat(row.variacaoPreco) || parseFloat(row.preco) || 0,
                estoque: parseInt(row.variacaoEstoque) || 0,
                sku: row.variacaoSku || '',
                peso: parseFloat(row.variacaoPeso) || parseFloat(row.pesoLiquido) || 0,
                gtin: row.gtin || ''
            });
        }
    });

    const result = Object.values(grouped);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 Produtos agrupados:', result.length);
    result.forEach(g => {
        console.log(`   • ${g.produto.codigo}: ${g.variacoes.length} variação(ões)`);
        if (g.variacoes.length > 0) {
            g.variacoes.forEach((v, i) => {
                console.log(`      ${i + 1}. ${v.tipo}: ${v.valor}`);
            });
        }
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return result;
}

function processVariations(variacoesString) {
    if (!variacoesString || variacoesString.trim() === '') return null;
    try {
        const variations = variacoesString.split(';').map(v => {
            const parts = v.split(':');
            return {
                tipo: parts[0] ? parts[0].trim() : '',
                valor: parts[1] ? parts[1].trim() : '',
                codigo: parts[2] ? parts[2].trim() : '',
                preco: parseFloat(parts[3]) || 0
            };
        }).filter(v => v.tipo && v.valor);
        return variations.length > 0 ? variations : null;
    } catch (error) {
        console.error('❌ Erro variações:', error);
        return null;
    }
}

function formatProduct(group) {
    const row = group.produto;
    let variations = null;

    if (group.variacoes && group.variacoes.length > 0) {
        variations = group.variacoes;
    } else if (row.variacoes) {
        variations = processVariations(row.variacoes);
    }

    return {
        nome: fixEncoding(row.nome) || '',
        codigo: row.codigo || '',
        preco: parseFloat(row.preco) || 0,
        tipo: row.tipo || 'P',
        situacao: row.situacao || 'A',
        formato: row.formato || (variations ? 'V' : 'S'),
        unidade: row.unidade || 'UN',
        pesoLiquido: parseFloat(row.pesoLiquido) || 0,
        pesoBruto: parseFloat(row.pesoBruto) || 0,
        marca: fixEncoding(row.marca) || '',
        linkExterno: row.linkExterno || '',
        altura: parseFloat(row.altura) || 0,
        largura: parseFloat(row.largura) || 0,
        profundidade: parseFloat(row.profundidade) || 0,
        variacoes: variations
    };
}

async function sendToWebhook(products, chatId) {
    try {
        const integrations = await getActiveIntegrations();

        const payload = {
            timestamp: Date.now(),
            chatId: chatId,
            products: products,
            integrations: integrations
        };

        console.log('📤 Enviando para:', WEBHOOK_URL);
        console.log('📦 Produtos:', products.length);
        console.log('🔗 Integrações:', integrations.length);

        const response = await axios.post(WEBHOOK_URL, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 300000
        });

        console.log('✅ Status:', response.status);
        console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));

        return { success: true, data: response.data };

    } catch (error) {
        console.error('❌ Erro webhook:', error.message);
        if (error.response) {
            console.error('📊 Dados do erro:', error.response.data);
        }
        return {
            success: false,
            error: error.message,
            data: error.response?.data
        };
    }
}

function formatResultMessage(result, products) {
    let message = '';

    if (!result.success || !result.data || !result.data.resumo) {
        message = '╔═══════════════════════════╗\n';
        message += '║   ❌ ERRO NA IMPORTAÇÃO   ║\n';
        message += '╚═══════════════════════════╝\n\n';
        message += '😔 Não foi possível processar os produtos.\n\n';
        if (result.error) {
            message += '📝 *Detalhes do erro:*\n';
            message += '`' + result.error + '`\n\n';
        }
        message += '💡 *Dica:* Digite /menu para tentar novamente.';
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
    message += '┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n';
    message += '┃ 📦 Total: *' + resumo.total + '* envios\n';
    message += '┃ 🔗 Integrações: *' + resumo.totalIntegracoes + '*\n';
    message += '┣━━━━━━━━━━━━━━━━━━━━━━━━━━┫\n';
    message += '┃ ✅ Sucesso: *' + resumo.sucessos + '*\n';

    if (resumo.duplicados > 0) {
        message += '┃ 🔄 Duplicados: *' + resumo.duplicados + '*\n';
    }

    if (resumo.erros > 0) {
        message += '┃ ❌ Erros: *' + resumo.erros + '*\n';
    }

    message += '┃ 📈 Taxa: *' + resumo.taxaSucesso + '*\n';
    message += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';

    if (detalhes.porIntegracao && Object.keys(detalhes.porIntegracao).length > 0) {
        message += '🏢 *DETALHES POR INTEGRAÇÃO*\n\n';
        Object.entries(detalhes.porIntegracao).forEach(([nome, stats]) => {
            const totalIntegration = stats.sucessos + stats.erros + stats.duplicados;
            const percentSuccess = totalIntegration > 0
                ? ((stats.sucessos / totalIntegration) * 100).toFixed(0)
                : 0;

            message += '┌─ 🔗 *' + nome + '*\n';
            message += '│  ✅ ' + stats.sucessos + ' sucesso(s)\n';
            if (stats.duplicados > 0) message += '│  🔄 ' + stats.duplicados + ' duplicado(s)\n';
            if (stats.erros > 0) message += '│  ❌ ' + stats.erros + ' erro(s)\n';
            message += '└─ 📊 ' + percentSuccess + '% de sucesso\n\n';
        });
    }

    if (resumo.sucessos > 0 && detalhes.sucessos) {
        message += '✅ *PRODUTOS CADASTRADOS* (' + resumo.sucessos + ')\n\n';
        detalhes.sucessos.slice(0, 5).forEach((p, i) => {
            message += '  ' + (i + 1) + '. ✓ *' + p.nome + '*\n';
            if (p.integrationName) {
                message += '     └─ Em: ' + p.integrationName + '\n';
            }
            if (p.blingId) {
                message += '     └─ ID Bling: `' + p.blingId + '`\n';
            }
            message += '\n';
        });
        if (resumo.sucessos > 5) {
            message += '  ... e mais *' + (resumo.sucessos - 5) + '* produto(s) ✓\n\n';
        }
    }

    if (resumo.duplicados > 0 && detalhes.duplicados) {
        message += '🔄 *PRODUTOS JÁ EXISTENTES* (' + resumo.duplicados + ')\n\n';
        detalhes.duplicados.slice(0, 3).forEach((p, i) => {
            message += '  ' + (i + 1) + '. ↻ *' + p.nome + '*\n';
            if (p.integrationName) {
                message += '     └─ Em: ' + p.integrationName + '\n';
            }
            message += '     └─ _Este produto já estava cadastrado_\n\n';
        });
        if (resumo.duplicados > 3) {
            message += '  ... e mais *' + (resumo.duplicados - 3) + '* duplicado(s)\n\n';
        }
    }

    if (resumo.erros > 0 && detalhes.erros) {
        message += '❌ *PRODUTOS COM ERRO* (' + resumo.erros + ')\n\n';
        detalhes.erros.slice(0, 3).forEach((p, i) => {
            message += '  ' + (i + 1) + '. ✗ *' + p.nome + '*\n';
            if (p.integrationName) {
                message += '     └─ Em: ' + p.integrationName + '\n';
            }
            if (p.mensagem) {
                let errorMsg = p.mensagem
                    .replace(/\\u([0-9a-f]{4})/gi, (match, grp) => String.fromCharCode(parseInt(grp, 16)))
                    .replace(/\\/g, '')
                    .substring(0, 100);
                message += '     └─ ⚠️ ' + errorMsg + (p.mensagem.length > 100 ? '...' : '') + '\n';
            }
            message += '\n';
        });
        if (resumo.erros > 3) {
            message += '  ... e mais *' + (resumo.erros - 3) + '* erro(s)\n\n';
        }
    }

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    if (resumo.erros === 0 && resumo.duplicados === 0) {
        message += '🎊 *Perfeito!* Todos os produtos foram cadastrados com sucesso!\n\n';
    } else if (resumo.erros === 0) {
        message += '👍 *Ótimo!* Todos os produtos foram processados. Alguns já existiam no sistema.\n\n';
    } else if (resumo.sucessos > 0) {
        message += '⚠️ *Atenção:* Alguns produtos tiveram problemas. Revise os erros acima.\n\n';
    } else {
        message += '😞 *Ops!* Nenhum produto foi cadastrado. Verifique os erros e tente novamente.\n\n';
    }

    message += '⏰ ' + new Date().toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) + '\n';
    message += '💡 Digite /menu para nova importação';

    return message;
}

async function showMainMenu(chatId, name) {
    const menuMessage =
        '╔═══════════════════════════════╗\n' +
        '║   🤖 IMPORTADOR DE PRODUTOS   ║\n' +
        '╚═══════════════════════════════╝\n\n' +
        '👋 Olá, *' + name + '*!\n\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        '📋 *MENU PRINCIPAL*\n\n' +
        '┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n' +
        '┃  1️⃣  Enviar planilha       ┃\n' +
        '┃  2️⃣  Ver integrações ativas┃\n' +
        '┃  3️⃣  Cancelar              ┃\n' +
        '┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n' +
        '💬 Digite o número da opção desejada';

    await bot.sendMessage(chatId, menuMessage, { parse_mode: 'Markdown' });
    setUserState(chatId, 'awaiting_menu_choice');
}

// ============================================
// HANDLERS COM AUTORIZAÇÃO
// ============================================

bot.onText(/\/start|\/menu/i, async (msg) => {
    if (!await checkAuthorization(msg)) return;

    const name = msg.from.first_name || 'usuário';
    await showMainMenu(msg.chat.id, name);
});

bot.onText(/\/meuid/i, async (msg) => {
    const userId = msg.from.id;
    const username = msg.from.username || 'sem username';
    const name = msg.from.first_name || 'usuário';

    await bot.sendMessage(msg.chat.id,
        '📱 *Suas Informações*\n\n' +
        '🆔 User ID: `' + userId + '`\n' +
        '👤 Nome: ' + name + '\n' +
        '📝 Username: @' + username + '\n\n' +
        '💡 Envie este ID para o administrador liberar seu acesso.',
        { parse_mode: 'Markdown' }
    );
});

bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.document) return;

    if (!await checkAuthorization(msg)) return;

    const chatId = msg.chat.id;
    const userState = getUserState(chatId);

    try {
        if (msg.text && msg.text.match(/(oi|olá|hey|bom dia|boa tarde|boa noite)/i)) {
            const name = msg.from.first_name || 'usuário';
            await showMainMenu(chatId, name);
            return;
        }

        switch (userState.step) {
            case 'awaiting_menu_choice':
                if (msg.text === '1') {
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
                } else if (msg.text === '2') {
                    try {
                        await bot.sendChatAction(chatId, 'typing');
                        const integrations = await getActiveIntegrations();

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

                        intMsg += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
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
                    resetUserState(chatId);
                } else if (msg.text === '3') {
                    await bot.sendMessage(chatId,
                        '👋 *Operação cancelada*\n\n' +
                        'Até logo! Digite /start para voltar.',
                        { parse_mode: 'Markdown' }
                    );
                    resetUserState(chatId);
                } else {
                    await bot.sendMessage(chatId,
                        '❌ *Opção inválida*\n\n' +
                        'Por favor, escolha *1*, *2* ou *3*',
                        { parse_mode: 'Markdown' }
                    );
                }
                break;

            case 'awaiting_file':
                break;

            case 'processing':
                break;

            default:
                const name = msg.from.first_name || 'usuário';
                await showMainMenu(chatId, name);
                break;
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

bot.on('document', async (msg) => {
    if (!await checkAuthorization(msg)) return;

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

    try {
        const document = msg.document;
        const fileName = document.file_name;

        if (!fileName || (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls'))) {
            await bot.sendMessage(chatId,
                '❌ *Formato inválido*\n\n' +
                'Envie apenas arquivos:\n' +
                '  • CSV (.csv)\n' +
                '  • Excel (.xlsx, .xls)\n\n' +
                '💡 Digite /menu para voltar',
                { parse_mode: 'Markdown' }
            );
            resetUserState(chatId);
            return;
        }

        await bot.sendChatAction(chatId, 'typing');
        await bot.sendMessage(chatId,
            '📥 *Arquivo recebido!*\n\n' +
            '📄 Nome: `' + fileName + '`\n' +
            '⏳ Processando...',
            { parse_mode: 'Markdown' }
        );

        const integrations = await getActiveIntegrations();
        await bot.sendMessage(chatId,
            '🔗 *Integrações encontradas*\n\n' +
            '✅ ' + integrations.length + ' integração(ões) ativa(s)\n' +
            '📊 Lendo planilha...',
            { parse_mode: 'Markdown' }
        );

        const filePath = await downloadTelegramFile(document.file_id);
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

        resetUserState(chatId);

    } catch (error) {
        console.error('❌ Erro:', error);
        await bot.sendMessage(chatId,
            '❌ *Erro ao processar arquivo*\n\n' +
            '```\n' + error.message + '\n```\n\n' +
            '💡 Digite /menu para tentar novamente',
            { parse_mode: 'Markdown' }
        );
        resetUserState(chatId);
    }
});

bot.on('polling_error', (error) => console.error('❌ Polling:', error));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled:', error));

setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    Object.keys(userStates).forEach(userId => {
        if (now - userStates[userId].lastInteraction > oneHour) {
            delete userStates[userId];
        }
    });
}, 60 * 60 * 1000);

console.log('╔═══════════════════════════════╗');
console.log('║  🤖 BOT INICIADO COM SUCESSO  ║');
console.log('╚═══════════════════════════════╝');
console.log('');
console.log('📌 Node:', process.version);
console.log('🔗 Supabase:', SUPABASE_URL);
console.log('📡 Webhook:', WEBHOOK_URL);
console.log('⏰ Iniciado em:', new Date().toLocaleString('pt-BR'));
console.log('');