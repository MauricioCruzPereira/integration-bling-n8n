const blingRepository = require('../repositories/bling.repository');

class BlingService {
    /**
     * Envia um produto para o Bling
     * @param {Object} product - Produto formatado
     * @param {Object} integration - Dados da integração
     * @returns {Promise<Object>}
     */
    async sendProduct(product, integration) {
        console.log(`\n📤 Enviando: ${product.nome} (${product.codigo})`);
        console.log(`   Integração: ${integration.name}`);
        console.log(`   Formato: ${product.formato} (${product.formato === 'V' ? 'Com Variações' : 'Simples'})`);

        const result = await blingRepository.createProduct(product, integration.token);

        if (result.success) {
            console.log(`✅ Sucesso! ID Bling: ${result.data.data.id}`);
            
            if (result.data.data.warnings && result.data.data.warnings.length > 0) {
                console.log(`⚠️ Avisos:`, result.data.data.warnings);
            }

            return {
                success: true,
                productCode: product.codigo,
                productName: product.nome,
                integrationName: integration.name,
                blingId: result.data.data.id,
                warnings: result.data.data.warnings || []
            };
        } else {
            console.error(`❌ Falha: ${result.error.message}`);
            
            if (result.error.details) {
                console.error(`   Detalhes: ${result.error.details}`);
            }

            return {
                success: false,
                productCode: product.codigo,
                productName: product.nome,
                integrationName: integration.name,
                error: result.error.message,
                details: result.error.details
            };
        }
    }

    /**
     * Envia múltiplos produtos para múltiplas integrações
     * @param {Array} products - Array de produtos
     * @param {Array} integrations - Array de integrações
     * @returns {Promise<Object>}
     */
    async sendProducts(products, integrations) {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('📦 INICIANDO ENVIO PARA O BLING');
    console.log('╚═══════════════════════════════════════╝');
    console.log(`   Produtos: ${products.length}`);
    console.log(`   Integrações: ${integrations.length}`);
    console.log(`   Total de envios: ${products.length * integrations.length}\n`);

    const results = [];
    const startTime = Date.now();

    for (const product of products) {
        for (const integration of integrations) {
            const result = await this.sendProduct(product, integration);
            results.push(result);

            // ✅ AUMENTADO: 2 segundos entre requisições
            await this.delay(2000);
        }
        
        // ✅ DELAY EXTRA: Entre produtos diferentes
        await this.delay(1000);
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const summary = this.generateSummary(results, duration);
    this.printSummary(summary);

    return summary;
    }

    /**
     * Gera resumo dos envios
     */
    generateSummary(results, duration) {
        const sucessos = results.filter(r => r.success);
        const erros = results.filter(r => !r.success);

        return {
            total: results.length,
            sucessos: sucessos.length,
            erros: erros.length,
            taxaSucesso: `${((sucessos.length / results.length) * 100).toFixed(1)}%`,
            duracao: `${duration}s`,
            detalhes: {
                sucessos: sucessos.map(r => ({
                    codigo: r.productCode,
                    nome: r.productName,
                    integracao: r.integrationName,
                    blingId: r.blingId,
                    warnings: r.warnings
                })),
                erros: erros.map(r => ({
                    codigo: r.productCode,
                    nome: r.productName,
                    integracao: r.integrationName,
                    erro: r.error,
                    detalhes: r.details
                }))
            }
        };
    }

    /**
     * Imprime resumo no console
     */
    printSummary(summary) {
        console.log('\n═══════════════════════════════════════');
        console.log('📊 RESUMO DO ENVIO');
        console.log('═══════════════════════════════════════');
        console.log(`✅ Sucessos: ${summary.sucessos}/${summary.total}`);
        console.log(`❌ Erros: ${summary.erros}/${summary.total}`);
        console.log(`📈 Taxa: ${summary.taxaSucesso}`);
        console.log(`⏱️ Duração: ${summary.duracao}`);
        console.log('═══════════════════════════════════════\n');

        if (summary.erros > 0) {
            console.log('❌ ERROS ENCONTRADOS:');
            summary.detalhes.erros.forEach((erro, i) => {
                console.log(`\n${i + 1}. ${erro.nome} (${erro.codigo})`);
                console.log(`   Integração: ${erro.integracao}`);
                console.log(`   Erro: ${erro.erro}`);
                if (erro.detalhes) {
                    console.log(`   Detalhes: ${erro.detalhes}`);
                }
            });
            console.log('\n');
        }
    }

    /**
     * Delay entre requisições
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new BlingService();