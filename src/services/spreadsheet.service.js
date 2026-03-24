const { processSpreadsheet, groupProductsByCode, formatProduct } = require('../utils/processor');
const blingService = require('./bling.service');

class SpreadsheetService {
    /**
     * Processa planilha e envia para o Bling
     * @param {string} filePath - Caminho da planilha
     * @param {Array} integrations - Integrações ativas
     * @returns {Promise<Object>}
     */
    async processAndSend(filePath, integrations) {
        try {
            console.log('\n🔄 Processando planilha...');
            
            // 1. Processar planilha
            const rows = processSpreadsheet(filePath);
            console.log(`✅ ${rows.length} linhas processadas`);

            // 2. Agrupar por código
            const groups = groupProductsByCode(rows);
            console.log(`✅ ${groups.length} produtos agrupados`);

            // 3. Formatar produtos
            const products = groups.map(group => formatProduct(group));
            console.log(`✅ ${products.length} produtos formatados`);

            // 4. Enviar para Bling
            const result = await blingService.sendProducts(products, integrations);

            return {
                success: true,
                ...result,
                reportPath: result.reportPath || null  // ✅ Incluir caminho do relatório
            };

        } catch (error) {
            console.error('❌ Erro ao processar planilha:', error);
            
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new SpreadsheetService();