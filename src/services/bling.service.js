const blingRepository = require('../repositories/bling.repository');
const fs = require('fs');
const path = require('path');

class BlingService {
    /**
     * Envia um produto para o Bling
     */
    async sendProduct(product, integration) {
        console.log(`\n📤 Enviando: ${product.nome} (${product.codigo})`);
        console.log(`   Integração: ${integration.name}`);
        console.log(`   Formato: ${product.formato} (${product.formato === 'V' ? 'Com Variações' : 'Simples'})`);
        
        if (product.variacoes) {
            console.log(`   📊 ${product.variacoes.length} variação(ões)`);
        }

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
            // Identificar tipo de erro
            const isTimeout = result.error.isTimeout || result.error.status === 504;
            const isRateLimit = result.error.isRateLimit || result.error.status === 429;
            const isValidationError = result.error.isValidationError || result.error.status === 400;
            const isDuplicate = result.error.message?.toLowerCase().includes('duplicado') || 
                               result.error.message?.toLowerCase().includes('já existe');
            
            // ✅ EMOJI E TIPO DO ERRO
            let errorType = 'ERRO GERAL';
            let errorEmoji = '❌';
            
            if (isDuplicate) {
                errorType = 'ITEM DUPLICADO';
                errorEmoji = '🔄';
            } else if (isValidationError) {
                errorType = 'ERRO DE VALIDAÇÃO';
                errorEmoji = '🔴';
                
                // Identificar erros específicos
                const errorMsg = result.error.message?.toLowerCase() || '';
                const errorDetails = result.error.details?.toLowerCase() || '';
                
                if (errorMsg.includes('cest') || errorDetails.includes('cest')) {
                    errorType = 'CEST INVÁLIDO';
                    errorEmoji = '📋';
                } else if (errorMsg.includes('ncm') || errorDetails.includes('ncm')) {
                    errorType = 'NCM INVÁLIDO';
                    errorEmoji = '📋';
                } else if (errorMsg.includes('preço') || errorMsg.includes('preco')) {
                    errorType = 'PREÇO INVÁLIDO';
                    errorEmoji = '💰';
                } else if (errorMsg.includes('código') || errorMsg.includes('codigo')) {
                    errorType = 'CÓDIGO INVÁLIDO';
                    errorEmoji = '🏷️';
                }
            } else if (isTimeout) {
                errorType = 'TIMEOUT';
                errorEmoji = '⏱️';
            } else if (isRateLimit) {
                errorType = 'RATE LIMIT';
                errorEmoji = '🚦';
            }
            
            console.error(`${errorEmoji} ${errorType}: ${result.error.message}`);
            
            if (result.error.fields && result.error.fields.length > 0) {
                console.error(`   📋 Campos com problema:`);
                result.error.fields.forEach(field => {
                    console.error(`      - ${field.field}: ${field.msg}`);
                });
            }
            
            if (result.error.details) {
                console.error(`   Detalhes: ${result.error.details}`);
            }

            return {
                success: false,
                productCode: product.codigo,
                productName: product.nome,
                integrationName: integration.name,
                error: result.error.message,
                details: result.error.details,
                fields: result.error.fields || null,
                errorType: errorType,
                errorEmoji: errorEmoji,
                isTimeout: isTimeout,
                isRateLimit: isRateLimit,
                isValidationError: isValidationError,
                isDuplicate: isDuplicate
            };
        }
    }

    /**
     * Envia múltiplos produtos para múltiplas integrações
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

                await this.delay(2000);
            }
            
            if (products.indexOf(product) < products.length - 1) {
                await this.delay(1000);
            }
        }

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        const summary = this.generateSummary(results, duration);
        this.printSummary(summary);
        
        // ✅ GERAR ARQUIVO TXT COM ERROS
        let reportPath = null;
        if (summary.erros > 0) {
            reportPath = this.generateErrorReport(summary);
            if (reportPath) {
                console.log(`\n📄 Relatório de erros salvo em: ${reportPath}`);
            }
        }

        return {
            ...summary,
            reportPath: reportPath  // ✅ Adicionar caminho do relatório no retorno
        };
    }

    /**
     * Gera resumo dos envios
     */
    generateSummary(results, duration) {
        const sucessos = results.filter(r => r.success);
        const erros = results.filter(r => !r.success);
        const timeouts = erros.filter(r => r.isTimeout);
        const rateLimits = erros.filter(r => r.isRateLimit);
        const validationErrors = erros.filter(r => r.isValidationError);
        const duplicates = erros.filter(r => r.isDuplicate);

        // Agrupar erros por tipo
        const errorsByType = {};
        erros.forEach(erro => {
            const type = erro.errorType || 'OUTROS';
            if (!errorsByType[type]) {
                errorsByType[type] = [];
            }
            errorsByType[type].push(erro);
        });

        return {
            total: results.length,
            sucessos: sucessos.length,
            erros: erros.length,
            timeouts: timeouts.length,
            rateLimits: rateLimits.length,
            validationErrors: validationErrors.length,
            duplicates: duplicates.length,
            errorsByType: errorsByType,
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
                    detalhes: r.details,
                    fields: r.fields || null,
                    tipo: r.errorType,
                    emoji: r.errorEmoji
                }))
            }
        };
    }

    /**
     * ✅ GERA RELATÓRIO TXT COM ERROS
     */
    generateErrorReport(summary) {
        try {
            const reportDir = path.join(process.cwd(), 'relatorios');
            if (!fs.existsSync(reportDir)) {
                fs.mkdirSync(reportDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
            const fileName = `erros_${timestamp}.txt`;
            const filePath = path.join(reportDir, fileName);

            let report = '';
            report += '═══════════════════════════════════════════════════════════════\n';
            report += '           RELATÓRIO DE ERROS - IMPORTAÇÃO BLING\n';
            report += '═══════════════════════════════════════════════════════════════\n\n';
            
            report += `Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`;
            report += `Duração: ${summary.duracao}\n\n`;
            
            report += '─────────────────────────────────────────────────────────────\n';
            report += '  RESUMO\n';
            report += '─────────────────────────────────────────────────────────────\n\n';
            
            report += `Total de envios: ${summary.total}\n`;
            report += `✓ Sucessos: ${summary.sucessos} (${summary.taxaSucesso})\n`;
            report += `✗ Erros: ${summary.erros}\n\n`;
            
            if (summary.duplicates > 0) {
                report += `  → Itens duplicados: ${summary.duplicates}\n`;
            }
            if (summary.validationErrors > 0) {
                report += `  → Erros de validação: ${summary.validationErrors}\n`;
            }
            if (summary.timeouts > 0) {
                report += `  → Timeouts: ${summary.timeouts}\n`;
            }
            if (summary.rateLimits > 0) {
                report += `  → Rate limits: ${summary.rateLimits}\n`;
            }
            
            report += '\n═══════════════════════════════════════════════════════════════\n';
            report += '  ERROS POR TIPO\n';
            report += '═══════════════════════════════════════════════════════════════\n\n';
            
            // Agrupar e listar por tipo
            Object.keys(summary.errorsByType).forEach(type => {
                const errosDoTipo = summary.errorsByType[type];
                report += `\n┌─ ${type} (${errosDoTipo.length})\n`;
                report += '│\n';
                
                errosDoTipo.forEach((erro, index) => {
                    report += `├─ ${index + 1}. ${erro.productName || erro.nome || 'N/A'}\n`;
                    report += `│  Código: ${erro.productCode || erro.codigo || 'N/A'}\n`;
                    report += `│  Integração: ${erro.integrationName || erro.integracao || 'N/A'}\n`;
                    report += `│  Erro: ${erro.error || erro.erro || 'N/A'}\n`;

                    if (erro.details || erro.detalhes) {
                        report += `│  Detalhes: ${erro.details || erro.detalhes}\n`;
                    }

                    if (erro.fields && erro.fields.length > 0) {
                        report += `│  Campos com problema:\n`;
                        erro.fields.forEach(field => {
                            report += `│    • ${field.field || field.msg}: ${field.msg || ''}\n`;
                        });
                    }

                    report += '│\n';
                });
                
                report += '└─────────────────────────────────────────────────────────────\n';
            });
            
            report += '\n═══════════════════════════════════════════════════════════════\n';
            report += '  LISTA COMPLETA DE ERROS\n';
            report += '═══════════════════════════════════════════════════════════════\n\n';
            
            summary.detalhes.erros.forEach((erro, index) => {
                report += `${index + 1}. ${erro.nome}\n`;
                report += `   Código: ${erro.codigo}\n`;
                report += `   Tipo: ${erro.tipo}\n`;
                report += `   Erro: ${erro.erro}\n`;
                
                if (erro.detalhes) {
                    report += `   Detalhes: ${erro.detalhes}\n`;
                }
                
                if (erro.fields && erro.fields.length > 0) {
                    report += `   Campos:\n`;
                    erro.fields.forEach(field => {
                        report += `     - ${field.field}: ${field.msg}\n`;
                    });
                }
                
                report += '\n';
            });
            
            report += '═══════════════════════════════════════════════════════════════\n';
            report += `  Relatório gerado em: ${new Date().toLocaleString('pt-BR')}\n`;
            report += '═══════════════════════════════════════════════════════════════\n';

            fs.writeFileSync(filePath, report, 'utf-8');
            
            return filePath;
        } catch (error) {
            console.error('⚠️ Erro ao gerar relatório:', error.message);
            return null;
        }
    }

    /**
     * Imprime resumo no console
     */
    printSummary(summary) {
        console.log('\n╔═══════════════════════════════════════╗');
        console.log('📊 RESUMO DO ENVIO');
        console.log('╚═══════════════════════════════════════╝');
        console.log(`✅ Sucessos: ${summary.sucessos}/${summary.total}`);
        console.log(`❌ Erros: ${summary.erros}/${summary.total}`);
        
        // ✅ EXIBIR ERROS POR TIPO
        if (summary.errorsByType && Object.keys(summary.errorsByType).length > 0) {
            console.log('\n📋 Erros por tipo:');
            Object.keys(summary.errorsByType).forEach(type => {
                const count = summary.errorsByType[type].length;
                const emoji = summary.errorsByType[type][0]?.emoji || '❌';
                console.log(`   ${emoji} ${type}: ${count}`);
            });
        }
        
        console.log(`\n📈 Taxa: ${summary.taxaSucesso}`);
        console.log(`⏱️ Duração: ${summary.duracao}`);
        console.log('╚═══════════════════════════════════════╝\n');

        if (summary.erros > 0 && summary.erros <= 5) {
            console.log('❌ ERROS ENCONTRADOS:');
            summary.detalhes.erros.forEach((erro, i) => {
                console.log(`\n${i + 1}. ${erro.emoji} ${erro.tipo}: ${erro.nome}`);
                console.log(`   Código: ${erro.codigo}`);
                console.log(`   Erro: ${erro.erro}`);
                
                if (erro.fields && erro.fields.length > 0) {
                    console.log(`   Campos:`);
                    erro.fields.forEach(field => {
                        console.log(`      - ${field.field}: ${field.msg}`);
                    });
                }
            });
            console.log('\n');
        } else if (summary.erros > 5) {
            console.log(`❌ ${summary.erros} erros encontrados (muitos para exibir aqui)`);
            console.log('💡 Consulte o arquivo de relatório para detalhes completos\n');
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