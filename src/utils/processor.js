const XLSX = require('xlsx');
const { fixEncoding } = require('./encoding');
const { expandVariations } = require('./variations');
const { parsePrice, parseDecimal } = require('./price');

// ✅ FUNÇÕES AUXILIARES PARA NCM E CEST
function sanitizeNCM(ncm) {
    if (!ncm) return '';
    // Remove tudo que não é número
    const cleaned = String(ncm).replace(/\D/g, '');
    // NCM deve ter exatamente 8 dígitos
    if (cleaned.length === 8) {
        return cleaned;
    }
    // Se não tem 8 dígitos, retorna vazio para não causar erro
    console.log(`   ⚠️ NCM inválido ignorado: "${ncm}" (${cleaned.length} dígitos)`);
    return '';
}

function sanitizeCEST(cest) {
    if (!cest) return '';
    // Remove tudo que não é número
    const cleaned = String(cest).replace(/\D/g, '');
    // CEST deve ter exatamente 7 dígitos
    if (cleaned.length === 7) {
        return cleaned;
    }
    // Se não tem 7 dígitos, retorna vazio para não causar erro
    console.log(`   ⚠️ CEST inválido ignorado: "${cest}" (${cleaned.length} dígitos)`);
    return '';
}

function processSpreadsheet(filePath) {
    const workbook = XLSX.readFile(filePath, {
        raw: true,  // ✅ Mantém valores originais como string
        defval: '',
        codepage: 65001,
        cellDates: false,  // ✅ Desabilita conversão de datas
        cellText: false,    // ✅ Não força formatação de texto
        dateNF: 'yyyy-mm-dd' // ✅ Formato de data esperado (caso tenha datas reais)
    });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, {
        raw: true,  // ✅ Mantém formato original
        defval: '',
        blankrows: false,
        dateNF: 'yyyy-mm-dd'  // ✅ Formato de data
    });

    const fixedData = data.map(row => {
        const fixedRow = {};
        Object.keys(row).forEach(key => {
            const value = row[key];
            if (typeof value === 'string') {
                const textFields = ['nome', 'marca', 'descricaoCurta', 'descricaoCompleta', 'categoria', 'variacaoNome', 'fornecedorNome'];
                fixedRow[key] = textFields.includes(key) ? fixEncoding(value) : value.trim();
            } else {
                fixedRow[key] = String(value).trim();
            }
        });
        return fixedRow;
    });

    return fixedData.flatMap(row => expandVariations(row));
}

function groupProductsByCode(rows) {
    const grouped = {};

    rows.forEach(row => {
        const codigo = (row.codigo || '').toString().trim();
        if (!codigo) return;

        const codigoPai = codigo.split('-')[0];
        const variacaoNome = (row.variacaoNome || '').trim();

        if (!grouped[codigoPai]) {
            grouped[codigoPai] = { produto: row, variacoes: [] };
        } else if (variacaoNome && codigo !== codigoPai) {
            grouped[codigoPai].variacoes.push({ row: row, variacaoNome: variacaoNome });
        }
    });

    return Object.values(grouped);
}

function processImageUrls(urlsString) {
    if (!urlsString || typeof urlsString !== 'string') return [];
    
    const separator = urlsString.includes('|') ? '|' : ',';
    
    return urlsString
        .split(separator)
        .map(url => url.trim())
        .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')))
        .map(url => ({ link: url }));
}

function formatProduct(group) {
    const produtoPai = group.produto;
    const variacoes = group.variacoes;
    const precoProdutoPai = parsePrice(produtoPai.preco);

    console.log(`\n📦 Produto: "${produtoPai.nome}"`);
    console.log(`   Código: ${produtoPai.codigo}`);
    console.log(`   Preço: R$ ${precoProdutoPai.toFixed(2)}`);

    // ✅ PROCESSAR IMAGENS
    const imagemPrincipal = (produtoPai.imagemPrincipalUrl || '').trim();
    const imagensAdicionais = processImageUrls(produtoPai.imagensAdicionaisUrls || '');
    
    const todasImagens = [];
    if (imagemPrincipal) {
        todasImagens.push({ link: imagemPrincipal });
    }
    todasImagens.push(...imagensAdicionais);

    if (todasImagens.length > 0) {
        console.log(`   🖼️ Imagens: ${todasImagens.length}`);
        todasImagens.forEach((img, i) => {
            console.log(`      ${i + 1}. ${img.link}`);
        });
    }

    const product = {
        nome: fixEncoding(produtoPai.nome) || '',
        codigo: produtoPai.codigo || '',
        preco: precoProdutoPai,
        tipo: produtoPai.tipo || 'P',
        situacao: produtoPai.situacao || 'A',
        formato: variacoes.length > 0 ? 'V' : 'S',
        unidade: produtoPai.unidade || 'UN',
        pesoLiquido: parseDecimal(produtoPai.pesoLiquido),
        pesoBruto: parseDecimal(produtoPai.pesoBruto),
        volumes: parseInt(produtoPai.volumes) || 1,
        itensPorCaixa: parseInt(produtoPai.itensPorCaixa) || 1,
        gtin: produtoPai.gtin || '',
        gtinEmbalagem: produtoPai.gtinTributario || '',
        marca: fixEncoding(produtoPai.marca) || '',
        descricaoCurta: (fixEncoding(produtoPai.descricaoCurta) || '').substring(0, 5000), // ✅ Limita a 5000 caracteres
        freteGratis: produtoPai.freteGratis === 'S' || produtoPai.freteGratis === 'Sim',
        dimensoes: {
            largura: parseDecimal(produtoPai.largura),
            altura: parseDecimal(produtoPai.altura),
            profundidade: parseDecimal(produtoPai.profundidade),
            unidadeMedida: 1
        },
        tributacao: {
            origem: parseInt(produtoPai.origem) || 0,
            ncm: sanitizeNCM(produtoPai.ncm),
            cest: sanitizeCEST(produtoPai.cest),
            unidadeMedida: produtoPai.unidade || 'UN'
        }
    };

    // ✅ ADICIONAR IMAGENS NO PRODUTO PAI
    if (todasImagens.length > 0) {
        product.midia = {
            video: [],
            imagens: {
                imagensURL: todasImagens
            }
        };
        console.log('   ✅ Imagens adicionadas ao produto PAI');
    }

    if (variacoes.length > 0) {
        const tiposVariacao = new Set();
        variacoes.forEach(v => {
            const parts = v.variacaoNome.split(';');
            parts.forEach(part => {
                const [tipo] = part.split(':');
                if (tipo) tiposVariacao.add(tipo.trim());
            });
        });

        if (tiposVariacao.size > 0) {
            const primeiroTipo = Array.from(tiposVariacao)[0];
            product.variacao = {
                nome: primeiroTipo.charAt(0).toUpperCase() + primeiroTipo.slice(1)
            };
        }

        product.variacoes = variacoes.map((v, index) => {
            const varRow = v.row;

            console.log(`   ✅ Variação ${index + 1}: ${v.variacaoNome}`);
            console.log(`      Código: ${varRow.codigo}`);

            const variacaoObj = {
                id: 0,
                codigo: varRow.codigo,
                preco: parsePrice(varRow.preco) || precoProdutoPai,
                tipo: 'P',
                situacao: 'A',
                formato: 'S',
                unidade: varRow.unidade || produtoPai.unidade || 'UN',
                pesoLiquido: parseDecimal(varRow.pesoLiquido) || parseDecimal(produtoPai.pesoLiquido),
                pesoBruto: parseDecimal(varRow.pesoBruto) || parseDecimal(produtoPai.pesoBruto),
                volumes: parseInt(varRow.volumes) || parseInt(produtoPai.volumes) || 1,
                itensPorCaixa: parseInt(varRow.itensPorCaixa) || parseInt(produtoPai.itensPorCaixa) || 1,
                gtin: varRow.gtin || '',
                dimensoes: {
                    largura: parseDecimal(varRow.largura) || parseDecimal(produtoPai.largura),
                    altura: parseDecimal(varRow.altura) || parseDecimal(produtoPai.altura),
                    profundidade: parseDecimal(varRow.profundidade) || parseDecimal(produtoPai.profundidade),
                    unidadeMedida: 1
                },
                variacao: {
                    nome: v.variacaoNome,
                    produtoPai: {
                        id: 0
                    }
                }
            };

            // ✅ ADICIONAR IMAGENS NAS VARIAÇÕES TAMBÉM!
            if (todasImagens.length > 0) {
                variacaoObj.midia = {
                    imagens: {
                        externas: [],
                        imagensURL: todasImagens  // ← MESMAS IMAGENS DO PAI!
                    }
                };
                console.log(`      🖼️ ${todasImagens.length} imagem(ns) adicionadas`);
            } else {
                variacaoObj.midia = {
                    imagens: {
                        externas: []
                    }
                };
            }

            return variacaoObj;
        });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return product;
}

module.exports = { processSpreadsheet, groupProductsByCode, formatProduct };