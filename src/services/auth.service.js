const phoneRepository = require('../repositories/phone.repository');

class AuthService {
    /**
     * Verifica se o usuário tem permissão para usar o bot
     * @param {object} user - Objeto do usuário do Telegram
     * @returns {Promise<{authorized: boolean, phone: string|null, userData: object|null}>}
     */
    async checkAuthorization(user) {
        try {
            const userIdentifier = user.id.toString();
            
            // Busca no banco se esse ID está autorizado
            const phoneRecord = await phoneRepository.findByNumber(userIdentifier);

            if (phoneRecord) {
                console.log(`✅ Usuário autorizado: ${user.first_name} (ID: ${userIdentifier})`);
                return {
                    authorized: true,
                    phone: userIdentifier,
                    userData: phoneRecord
                };
            }

            console.log(`❌ Usuário NÃO autorizado: ${user.first_name} (ID: ${userIdentifier})`);
            return {
                authorized: false,
                phone: userIdentifier,
                userData: null
            };
        } catch (error) {
            console.error('❌ Erro ao verificar autorização:', error);
            return {
                authorized: false,
                phone: user?.id?.toString() || null,
                userData: null
            };
        }
    }

    /**
     * Registra um novo usuário autorizado
     */
    async authorizeUser(userId, name = null) {
        try {
            return await phoneRepository.create(userId.toString(), name);
        } catch (error) {
            console.error('❌ Erro ao autorizar usuário:', error);
            throw error;
        }
    }

    /**
     * Remove autorização de um usuário
     */
    async unauthorizeUser(userId) {
        try {
            return await phoneRepository.deactivate(userId.toString());
        } catch (error) {
            console.error('❌ Erro ao desautorizar usuário:', error);
            throw error;
        }
    }

    /**
     * Lista todos os usuários autorizados
     */
    async listAuthorizedUsers() {
        try {
            return await phoneRepository.findAll();
        } catch (error) {
            console.error('❌ Erro ao listar usuários:', error);
            throw error;
        }
    }
}

module.exports = new AuthService();