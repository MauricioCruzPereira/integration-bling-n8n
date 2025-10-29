const axios = require('axios');

class BlingRepository {
    constructor() {
        this.baseURL = 'https://api.bling.com.br/Api/v3';
    }

    /**
     * Testa se o token está válido
     */
    async testToken(token) {
        try {
            const response = await axios.get(
                `${this.baseURL}/produtos`,
                {
                    params: { limite: 1 },
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
                error: error.response?.data?.error?.message || error.message
            };
        }
    }

    /**
     * Renova token usando CODE
     */
    async renewTokenWithCode(code, clientId, clientSecret) {
        try {
            // Gerar Base64
            const credentials = `${clientId}:${clientSecret}`;
            const base64Credentials = Buffer.from(credentials).toString('base64');
            
            console.log('🔑 Renovando token com CODE...');
            console.log(`   Client ID: ${clientId}`);
            console.log(`   Base64: ${base64Credentials.substring(0, 20)}...`);
            console.log(`   Code: ${code.substring(0, 20)}...`);
            
            const response = await axios.post(
                'https://www.bling.com.br/Api/v3/oauth/token',
                new URLSearchParams({
                    'grant_type': 'authorization_code',
                    'code': code
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': '1.0',  // ✅ CORRIGIDO!
                        'Authorization': `Basic ${base64Credentials}`
                    },
                    timeout: 30000
                }
            );

            console.log('✅ Token renovado com sucesso!');
            console.log(`   Access Token: ${response.data.access_token.substring(0, 20)}...`);
            console.log(`   Refresh Token: ${response.data.refresh_token.substring(0, 20)}...`);
            console.log(`   Expires in: ${response.data.expires_in}s`);
            
            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            console.error('❌ Erro ao renovar token:', error.message);
            
            if (error.response) {
                console.error('   Status:', error.response.status);
                console.error('   Data:', error.response.data);
            }
            
            return {
                success: false,
                error: error.response?.data?.error?.type || error.response?.data?.error || error.message,
                details: error.response?.data?.error?.description || error.response?.data
            };
        }
    }

    /**
     * Cria um produto no Bling com retry
     */
    async createProduct(productData, token, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`   Tentativa ${attempt}/${retries}...`);
                
                const response = await axios.post(
                    `${this.baseURL}/produtos`,
                    productData,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        timeout: 60000  // ✅ AUMENTADO: 60 segundos
                    }
                );

                return {
                    success: true,
                    data: response.data
                };

            } catch (error) {
                const isTimeout = error.code === 'ECONNABORTED' || error.response?.status === 504;
                const isLastAttempt = attempt === retries;
                
                if (isTimeout && !isLastAttempt) {
                    console.log(`   ⏱️ Timeout - aguardando ${attempt * 2}s antes de tentar novamente...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 2000)); // Backoff exponencial
                    continue;
                }
                
                console.error('❌ Erro ao criar produto no Bling:', error.message);
                
                return {
                    success: false,
                    error: {
                        message: error.response?.data?.error?.message || error.message,
                        details: error.response?.data?.error?.description || null,
                        status: error.response?.status || null,
                        isTimeout: isTimeout
                    }
                };
            }
        }
    }

    /**
     * Busca produto por código
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