const TelegramBot = require('node-telegram-bot-api');
const XLSX = require('xlsx');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const iconv = require('iconv-lite');

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

function fixEncoding(text) {
    if (!text || typeof text !== 'string') return text;

    try {
        const buffer = Buffer.from(text, 'binary');
        let decoded = iconv.decode(buffer, 'utf8');

        if (decoded.includes('�')) {
            decoded = iconv.decode(buffer, 'latin1');
        }

        if (decoded.includes('�')) {
            decoded = iconv.decode(buffer, 'win1252');
        }

        decoded = decoded.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        decoded = decoded.replace(/\s+/g, ' ').trim();

        return decoded;
    } catch (e) {
        console.error('❌ Erro ao corrigir encoding:', e.message);
        return text;
    }
}

function parsePrice(value) {
    if (!value) return 0;

    let precoStr = value.toString().trim();

    // Remove R$, espaços
    precoStr = precoStr.replace(/[R$\s]/g, '');

    // ✅ VERIFICA SE JÁ É UM NÚMERO VÁLIDO (SEM VÍRGULA)
    // Exemplo: "140.90" já está correto
    if (/^\d+\.\d{1,2}$/.test(precoStr)) {
        const valor = parseFloat(precoStr);
        return (valor && valor > 0) ? valor : 0;
    }

    // ✅ SE TEM VÍRGULA, TRATA FORMATO BRASILEIRO
    // Remove pontos de milhar (1.250,00 → 1250,00)
    if (precoStr.includes(',')) {
        precoStr = precoStr.replace(/\./g, '');
        // Converte vírgula decimal em ponto (1250,00 → 1250.00)
        precoStr = precoStr.replace(',', '.');
    }

    const valor = parseFloat(precoStr);

    // Retorna 0 se não for um número válido ou se for negativo
    return (valor && valor > 0) ? valor : 0;
}

function expandVariations(row) {
    const variacaoNome = (row.variacaoNome || '').trim();

    // Se não tem variação, retorna apenas o produto principal
    if (!variacaoNome) {
        return [{
            ...row,
            variacaoNome: '',
            formato: 'S'
        }];
    }

    console.log('\n🔍 Expandindo variações para:', row.codigo);
    console.log('📝 String original:', variacaoNome);

    const variations = [];
    const attributes = {};

    // Parse da string: "Cor:Branco/Preto;Tamanho:20/21,22/23,24/25;Gênero:Menino"
    const parts = variacaoNome.split(';').filter(p => p.trim());

    parts.forEach(part => {
        const [key, values] = part.split(':').map(s => s.trim());
        if (key && values) {
            attributes[key] = values.split(',').map(v => v.trim()).filter(v => v);
        }
    });

    console.log('📊 Atributos parseados:', attributes);

    const variantKey = Object.keys(attributes).find(k => attributes[k].length > 1);

    if (!variantKey || attributes[variantKey].length === 0) {
        console.warn('⚠️ Nenhuma variação múltipla encontrada');
        return [{ ...row, variacaoNome: '', formato: 'S' }];
    }

    console.log('🎯 Atributo principal de variação:', variantKey);

    // ✅ GARANTIR QUE O PREÇO SEJA VÁLIDO
    const precoBase = parsePrice(row.preco);
    console.log('💰 Preço base do produto:', precoBase);

    // Primeiro item: Produto PAI
    variations.push({
        ...row,
        variacaoNome: '',
        formato: 'V',
        codigo: row.codigo,
        preco: precoBase // ✅ GARANTIR PREÇO NO PAI
    });

    // Demais itens: Variações
    attributes[variantKey].forEach((value, index) => {
        const varCode = `${row.codigo}-${String(index + 1).padStart(2, '0')}`;

        const varParts = [];
        Object.keys(attributes).forEach(key => {
            if (key === variantKey) {
                varParts.push(`${key}:${value}`);
            } else {
                varParts.push(`${key}:${attributes[key][0]}`);
            }
        });
        const varName = varParts.join(';');

        variations.push({
            ...row,
            codigo: varCode,
            variacaoNome: varName,
            formato: 'S',
            preco: precoBase // ✅ USAR PREÇO BASE PARSEADO
        });

        console.log(`  ✅ Variação ${index + 1}: ${varCode} - ${varName} - R$ ${precoBase}`);
    });

    console.log(`📦 Total de itens gerados: ${variations.length} (1 PAI + ${variations.length - 1} variações)\n`);

    return variations;
}

function processSpreadsheet(filePath) {
    console.log('📊 Processando planilha...');

    const workbook = XLSX.readFile(filePath, {
        raw: false,
        defval: '',
        codepage: 65001
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: '',
        blankrows: false
    });

    console.log('✅ Linhas lidas:', data.length);

    const fixedData = data.map((row, index) => {
        const fixedRow = {};

        Object.keys(row).forEach(key => {
            const value = row[key];

            if (typeof value === 'string') {
                const textFields = ['nome', 'marca', 'descricaoCurta', 'descricaoCompleta', 'categoria', 'variacaoNome', 'fornecedorNome'];
                fixedRow[key] = textFields.includes(key) ? fixEncoding(value) : value.trim();
            } else {
                fixedRow[key] = value;
            }
        });

        if (index < 3) {
            console.log(`📦 Linha ${index + 1}:`, {
                codigo: fixedRow.codigo,
                nome: fixedRow.nome?.substring(0, 50),
                preco: fixedRow.preco,
                variacaoNome: fixedRow.variacaoNome || 'produto simples'
            });
        }

        return fixedRow;
    });

    console.log('✅ Processado:', fixedData.length, 'linhas');

    // ✅ EXPANDE AS VARIAÇÕES APENAS UMA VEZ
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 EXPANDINDO VARIAÇÕES...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const expandedData = fixedData.flatMap(row => expandVariations(row));

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ EXPANSÃO CONCLUÍDA');
    console.log(`📊 Linhas originais: ${fixedData.length}`);
    console.log(`📦 Linhas expandidas: ${expandedData.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return expandedData; // ✅ RETORNA DADOS JÁ EXPANDIDOS
}

function groupProductsByCode(rows) {
    const grouped = {};

    rows.forEach((row, index) => {
        const codigo = (row.codigo || '').toString().trim();

        if (!codigo) {
            console.warn(`⚠️ Linha ${index + 1} sem código`);
            return;
        }

        // Extrai código pai (antes do primeiro hífen)
        const codigoPai = codigo.split('-')[0];
        const variacaoNome = (row.variacaoNome || '').trim();

        // ✅ PRODUTO PAI: primeira ocorrência do código OU linha sem variacaoNome
        if (!grouped[codigoPai]) {
            grouped[codigoPai] = {
                produto: row,
                variacoes: []
            };
            console.log(`✅ PRODUTO PAI: ${codigoPai} - ${row.nome?.substring(0, 40)}...`);
        }
        // ✅ VARIAÇÃO: linha com variacaoNome preenchido E código diferente do pai
        else if (variacaoNome && codigo !== codigoPai) {
            grouped[codigoPai].variacoes.push({
                row: row,
                variacaoNome: variacaoNome
            });
            console.log(`  ✅ Variação: ${codigo} - ${variacaoNome}`);
        }
        // ⚠️ Linha duplicada do produto pai (ignora)
        else if (!variacaoNome && codigo === codigoPai) {
            console.warn(`⚠️ Ignorando linha duplicada do produto pai: ${codigo}`);
        }
    });

    const result = Object.values(grouped);
    console.log('\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
    console.log(`📦 Produtos agrupados: ${result.length}`);
    result.forEach(g => {
        const totalVariacoes = g.variacoes.length;
        console.log(`   • ${g.produto.codigo}: ${totalVariacoes} variação(ões)`);
        if (totalVariacoes > 0 && totalVariacoes <= 5) {
            g.variacoes.forEach((v, i) => {
                console.log(`      ${i + 1}. ${v.variacaoNome}`);
            });
        } else if (totalVariacoes > 5) {
            g.variacoes.slice(0, 3).forEach((v, i) => {
                console.log(`      ${i + 1}. ${v.variacaoNome}`);
            });
            console.log(`      ... e mais ${totalVariacoes - 3} variações`);
        }
    });
    console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n');

    return result;
}

function formatProduct(group) {
    const produtoPai = group.produto;
    const variacoes = group.variacoes;

    // Parse de imagens adicionais
    let imagensExternas = [];
    if (produtoPai.imagensAdicionaisUrls) {
        imagensExternas = produtoPai.imagensAdicionaisUrls.split('|').filter(url => url.trim());
    }

    // ✅ CONVERSÃO DE PREÇO COM NOVA FUNÇÃO
    const precoProdutoPai = parsePrice(produtoPai.preco);
    console.log(`💰 Produto "${produtoPai.nome}" - Preço original: "${produtoPai.preco}" → Convertido: ${precoProdutoPai}`);

    // Dados base do produto (COMPLETO)
    const product = {
        nome: fixEncoding(produtoPai.nome) || '',
        codigo: produtoPai.codigo || '',
        preco: precoProdutoPai,
        tipo: produtoPai.tipo || 'P',
        situacao: produtoPai.situacao || 'A',
        formato: variacoes.length > 0 ? 'V' : 'S',
        unidade: produtoPai.unidade || 'UN',
        pesoLiquido: parseFloat(produtoPai.pesoLiquido) || 0,
        pesoBruto: parseFloat(produtoPai.pesoBruto) || 0,
        volumes: parseInt(produtoPai.volumes) || 1,
        itensPorCaixa: parseInt(produtoPai.itensPorCaixa) || 1,
        gtin: produtoPai.gtin || '',
        gtinEmbalagem: produtoPai.gtinTributario || '',
        tipoProducao: produtoPai.producao || 'P',
        condicao: produtoPai.situacao === 'I' ? 0 : 1,
        freteGratis: produtoPai.freteGratis === 'Sim',
        marca: fixEncoding(produtoPai.marca) || '',
        descricaoCurta: fixEncoding(produtoPai.descricaoCurta) || '',
        descricaoComplementar: fixEncoding(produtoPai.descricaoCompleta) || '',
        linkExterno: produtoPai.linkExterno || '',
        observacoes: produtoPai.estoqueObservacoes || '',
        descricaoHtml: fixEncoding(produtoPai.descricaoCompleta) || '',
        imagemURL: produtoPai.imagemPrincipalUrl || '',
        dimensoes: {
            largura: parseFloat(produtoPai.largura) || 0,
            altura: parseFloat(produtoPai.altura) || 0,
            profundidade: parseFloat(produtoPai.profundidade) || 0,
            unidadeMedida: 1  // 1 = Centímetros
        },
        categoria: {
            descricao: produtoPai.categoria || ''
        },
        estoque: produtoPai.depositoId ? {
            minimo: 0,
            maximo: 0,
            crossdocking: 0,
            localizacao: produtoPai.depositoNome || 'Geral'
        } : {},
        actionEstoque: produtoPai.estoqueQuantidade && parseInt(produtoPai.estoqueQuantidade) > 0 ? {
            deposito: {
                id: produtoPai.depositoId || null
            },
            operacao: 'B',  // B = Balanço
            quantidade: parseFloat(produtoPai.estoqueQuantidade) || 0,
            preco: parsePrice(produtoPai.estoquePrecoCompra),
            custo: parsePrice(produtoPai.estoqueCustoCompra),
            observacoes: produtoPai.estoqueObservacoes || ''
        } : undefined,
        fornecedor: produtoPai.fornecedorId ? {
            id: produtoPai.fornecedorId,
            nome: fixEncoding(produtoPai.fornecedorNome) || '',
            codigo: produtoPai.fornecedorCodigo || '',
            precoCusto: parsePrice(produtoPai.fornecedorPrecoCusto),
            precoCompra: parsePrice(produtoPai.fornecedorPrecoCompra)
        } : undefined,
        tributacao: {
            origem: parseInt(produtoPai.origem) || 0,
            ncm: produtoPai.ncm || '',
            cest: produtoPai.cest || '',
            codigoExcecaoTipi: produtoPai.codigoExcecaoTipi || '',
            unidadeMedida: produtoPai.unidade || 'UN'
        },
        midia: {
            video: {
                url: produtoPai.videoUrl || ''
            },
            imagens: {
                externas: imagensExternas,
                url: produtoPai.imagemPrincipalUrl || ''
            }
        }
    };

    // Se tem variações, adiciona no formato do Bling
    if (variacoes.length > 0) {
        // ✅ EXTRAIR TIPOS DE VARIAÇÃO ÚNICOS
        const tiposVariacao = new Set();
        variacoes.forEach(v => {
            // Parse do formato "cor:vermelho;tamanho:M"
            const parts = v.variacaoNome.split(';');
            parts.forEach(part => {
                const [tipo] = part.split(':');
                if (tipo) tiposVariacao.add(tipo.trim());
            });
        });

        // ✅ ADICIONAR CAMPO VARIACAO NO PRODUTO PAI (OBRIGATÓRIO!)
        if (tiposVariacao.size > 0) {
            const primeiroTipo = Array.from(tiposVariacao)[0];
            product.variacao = {
                nome: primeiroTipo.charAt(0).toUpperCase() + primeiroTipo.slice(1)
            };
        }

        product.variacoes = variacoes.map((v, index) => {
            const varRow = v.row;

            // Parse de imagens da variação
            let imagensExternasVar = [];
            if (varRow.imagensAdicionaisUrls) {
                imagensExternasVar = varRow.imagensAdicionaisUrls.split('|').filter(url => url.trim());
            }

            // ✅ CONVERSÃO DE PREÇO DA VARIAÇÃO COM FALLBACK PARA PREÇO DO PAI
            const precoVariacao = parsePrice(varRow.preco) || precoProdutoPai;
            console.log(`   💰 Variação ${index + 1} "${v.variacaoNome}" - Preço: ${precoVariacao}`);

            // ✅ OBJETO DA VARIAÇÃO COM TODOS OS CAMPOS NECESSÁRIOS
            const variacaoObj = {
                id: 0,
                nome: fixEncoding(varRow.nome) || fixEncoding(produtoPai.nome) || '',
                codigo: varRow.codigo || `${produtoPai.codigo}-VAR`,
                preco: precoVariacao, // ✅ PREÇO EXPLÍCITO
                tipo: 'P',
                situacao: varRow.situacao || 'A',
                formato: 'S',
                descricaoCurta: fixEncoding(varRow.descricaoCurta) || fixEncoding(produtoPai.descricaoCurta) || '',
                unidade: varRow.unidade || produtoPai.unidade || 'UN',
                pesoLiquido: parseFloat(varRow.pesoLiquido) || parseFloat(produtoPai.pesoLiquido) || 0,
                pesoBruto: parseFloat(varRow.pesoBruto) || parseFloat(produtoPai.pesoBruto) || 0,
                volumes: parseInt(varRow.volumes) || parseInt(produtoPai.volumes) || 1,
                itensPorCaixa: parseInt(varRow.itensPorCaixa) || parseInt(produtoPai.itensPorCaixa) || 1,
                gtin: varRow.gtin || '',
                gtinEmbalagem: varRow.gtinTributario || '',
                dimensoes: {
                    largura: parseFloat(varRow.largura) || parseFloat(produtoPai.largura) || 0,
                    altura: parseFloat(varRow.altura) || parseFloat(produtoPai.altura) || 0,
                    profundidade: parseFloat(varRow.profundidade) || parseFloat(produtoPai.profundidade) || 0,
                    unidadeMedida: 1
                },
                estoque: varRow.estoqueQuantidade && parseInt(varRow.estoqueQuantidade) > 0 ? {
                    saldo: parseFloat(varRow.estoqueQuantidade) || 0
                } : {},
                midia: {
                    imagens: {
                        externas: imagensExternasVar,
                        url: varRow.imagemPrincipalUrl || ''
                    }
                },
                variacao: {
                    nome: v.variacaoNome,
                    produtoPai: {
                        cloneInfo: true
                    }
                }
            };

            console.log(`   ✅ Variação ${index + 1} objeto criado:`, {
                codigo: variacaoObj.codigo,
                preco: variacaoObj.preco,
                formato: variacaoObj.formato
            });

            return variacaoObj;
        });
    }

    return product;
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
        return { success: true, data: response.data };

    } catch (error) {
        console.error('❌ Erro webhook:', error.message);
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
            if (p.integrationName) message += '     └─ Em: ' + p.integrationName + '\n';
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
                message += '     └─ ⚠️ ' + errorMsg + (p.mensagem.length > 100 ? '...' : '') + '\n';
            }
            message += '\n';
        });
        if (resumo.erros > 3) {
            message += '  ... e mais *' + (resumo.erros - 3) + '* erro(s)\n\n';
        }
    }

    message += '━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
    message += '⏰ ' + new Date().toLocaleString('pt-BR') + '\n';
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
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '┃  1️⃣  Enviar planilha       ┃\n' +
        '┃  2️⃣  Ver integrações ativas┃\n' +
        '┃  3️⃣  Cancelar              ┃\n' +
        '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n' +
        '💬 Digite o número da opção desejada';

    await bot.sendMessage(chatId, menuMessage, { parse_mode: 'Markdown' });
    setUserState(chatId, 'awaiting_menu_choice');
}

bot.onText(/\/start|\/menu/i, async (msg) => {
    const name = msg.from.first_name || 'usuário';
    await showMainMenu(msg.chat.id, name);
});

bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (msg.document) return;

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
                    resetUserState(chatId);
                } else if (msg.text === '3') {
                    await bot.sendMessage(chatId,
                        '👋 *Operação cancelada*\n\nAté logo! Digite /start para voltar.',
                        { parse_mode: 'Markdown' }
                    );
                    resetUserState(chatId);
                } else {
                    await bot.sendMessage(chatId,
                        '❌ Opção inválida\n\n' +
                        'Por favor, escolha 1, 2 ou 3',
                        { parse_mode: 'Markdown' }
                    );
                }
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

        // ✅ PROCESSAR PLANILHA (JÁ RETORNA EXPANDIDO)
        const filePath = await downloadTelegramFile(document.file_id);
        const rawData = processSpreadsheet(filePath);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 DADOS PROCESSADOS (JÁ EXPANDIDOS)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Total de linhas:', rawData.length);
        rawData.forEach((row, i) => {
            if (i < 10) {
                console.log(`Linha ${i + 1}:`, {
                    codigo: row.codigo,
                    nome: row.nome?.substring(0, 30),
                    formato: row.formato,
                    variacaoNome: row.variacaoNome || 'PRODUTO PAI'
                });
            }
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // ✅ AGRUPAR PRODUTOS
        const groupedProducts = groupProductsByCode(rawData);

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📦 PRODUTOS AGRUPADOS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        groupedProducts.forEach((group, i) => {
            console.log(`\nGrupo ${i + 1}:`);
            console.log('  Produto PAI:', {
                codigo: group.produto.codigo,
                nome: group.produto.nome?.substring(0, 40),
                formato: group.produto.formato
            });
            console.log('  Variações:', group.variacoes.length);
            group.variacoes.forEach((v, j) => {
                console.log(`    ${j + 1}. ${v.row.codigo} - ${v.variacaoNome}`);
            });
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // ✅ FORMATAR PRODUTOS
        const products = groupedProducts.map(g => formatProduct(g));

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ PRODUTOS FORMATADOS PARA ENVIO');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        products.forEach((p, i) => {
            console.log(`\nProduto ${i + 1}:`);
            console.log('  Código:', p.codigo);
            console.log('  Nome:', p.nome?.substring(0, 40));
            console.log('  Formato:', p.formato);
            console.log('  Tem Variações?', p.variacoes ? 'SIM (' + p.variacoes.length + ')' : 'NÃO');

            if (p.variacoes && p.variacoes.length > 0) {
                console.log('  Lista de Variações:');
                p.variacoes.forEach((v, j) => {
                    console.log(`    ${j + 1}. ${v.codigo} - ${v.variacao?.nome || 'SEM NOME'}`);
                });
            }
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // ✅ VERIFICAÇÃO DE PREÇOS
        console.log('🔍 VERIFICANDO PREÇOS FINAIS:');
        products.forEach((p, i) => {
            console.log(`\n${i + 1}. ${p.nome}`);
            console.log(`   💰 Preço: R$ ${p.preco.toFixed(2)}`);
            if (p.variacoes && p.variacoes.length > 0) {
                p.variacoes.forEach((v, j) => {
                    console.log(`      ${j + 1}. Variação "${v.variacao.nome}": R$ ${v.preco.toFixed(2)}`);
                });
            }
        });
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await bot.sendMessage(chatId,
            '✅ *Planilha processada!*\n\n' +
            '📦 ' + products.length + ' produto(s) encontrado(s)\n' +
            '🚀 Enviando para ' + integrations.length + ' integração(ões)...\n\n' +
            '⏳ _Isso pode levar alguns minutos. Por favor, aguarde..._',
            { parse_mode: 'Markdown' }
        );

        // ✅ PAYLOAD FINAL
        const payload = {
            timestamp: Date.now(),
            chatId: chatId,
            products: products,
            integrations: integrations
        };

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📤 PAYLOAD FINAL PARA WEBHOOK');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Produtos no payload:', payload.products.length);
        console.log('Primeira entrada:', JSON.stringify(payload.products[0], null, 2).substring(0, 500));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const result = await sendToWebhook(products, chatId);
        fs.unlinkSync(filePath);

        const resultMessage = formatResultMessage(result, products);
        await bot.sendMessage(chatId, resultMessage, { parse_mode: 'Markdown' });

        resetUserState(chatId);

    } catch (error) {
        console.error('❌ Erro:', error);
        console.error('Stack:', error.stack);
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