const integrationsRepository = require('../repositories/integrations.repository');

class IntegrationsService {
    async getActiveIntegrations() {
        try {
            return await integrationsRepository.findActive();
        } catch (error) {
            console.error('❌ Erro ao buscar integrações:', error);
            throw error;
        }
    }

    async getIntegrationById(id) {
        try {
            return await integrationsRepository.findById(id);
        } catch (error) {
            console.error('❌ Erro ao buscar integração:', error);
            throw error;
        }
    }
}

module.exports = new IntegrationsService();