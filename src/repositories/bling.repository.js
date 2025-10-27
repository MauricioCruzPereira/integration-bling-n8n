const axios = require('axios');

class BlingRepository {
    constructor() {
        this.baseURL = 'https://api.bling.com.br/Api/v3';
    }

    /**
     * Cria um produto no Bling
     * @param {Object} productData - Dados do produto
     * @param {string} token - Token de autenticação
     * @returns {Promise<Object>}
     */
    async createProduct(productData, token) {
        try {
            const response = await axios.post(
                `${this.baseURL}/produtos`,
                productData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                }
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            console.error('❌ Erro ao criar produto no Bling:', error.message);
            
            return {
                success: false,
                error: {
                    message: error.response?.data?.error?.message || error.message,
                    details: error.response?.data?.error?.description || null,
                    status: error.response?.status || null
                }
            };
        }
    }

    /**
     * Busca produto por código
     * @param {string} codigo - Código do produto
     * @param {string} token - Token de autenticação
     * @returns {Promise<Object>}
     */
    async findProductByCode(codigo, token) {
        try {
            const response = await axios.get(
                `${this.baseURL}/produtos`,
                {
                    params: { codigo },
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    timeout: 10000
                }
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            return {
                success: false,
                error: error.response?.data || error.message
            };
        }
    }

    /**
     * Atualiza um produto existente
     * @param {number} productId - ID do produto
     * @param {Object} productData - Dados atualizados
     * @param {string} token - Token de autenticação
     * @returns {Promise<Object>}
     */
    async updateProduct(productId, productData, token) {
        try {
            const response = await axios.put(
                `${this.baseURL}/produtos/${productId}`,
                productData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    timeout: 30000
                }
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            return {
                success: false,
                error: {
                    message: error.response?.data?.error?.message || error.message,
                    details: error.response?.data?.error?.description || null
                }
            };
        }
    }
}

module.exports = new BlingRepository();