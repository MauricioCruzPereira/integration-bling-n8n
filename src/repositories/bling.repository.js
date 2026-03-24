const axios = require('axios');
const fs = require('fs');
const path = require('path');

class BlingRepository {
    constructor() {
        this.baseURL = 'https://api.bling.com.br/Api/v3';
    }

    /**
     * Testa se o token está válido usando a rota de produtos
     */
    async testToken(token) {
        try {
            const response = await axios.get(
                `${this.baseURL}/produtos`,
                {
                    params: { 
                        limite: 1
                    },
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
                        'Accept': '1.0',
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
     * Salva payload em arquivo para debug
     */
    savePayloadForDebug(productData, errorResponse = null) {
        try {
            const debugDir = path.join(process.cwd(), 'debug_payloads');
            if (!fs.existsSync(debugDir)) {
                fs.mkdirSync(debugDir, { recursive: true });
            }

            const timestamp = Date.now();
            const fileName = `payload_${timestamp}_${productData.codigo}.json`;
            const filePath = path.join(debugDir, fileName);

            const debugData = {
                timestamp: new Date().toISOString(),
                productCode: productData.codigo,
                productName: productData.nome,
                payload: productData,
                error: errorResponse || null
            };

            fs.writeFileSync(filePath, JSON.stringify(debugData, null, 2), 'utf-8');
            console.log(`   💾 Payload salvo em: ${filePath}`);

            return filePath;
        } catch (err) {
            console.error('   ⚠️ Erro ao salvar payload:', err.message);
            return null;
        }
    }

    /**
     * Cria um produto no Bling com sistema de retry e debug detalhado
     */
    async createProduct(productData, token, retries = 3) {
        // ✅ LOG DETALHADO DO PAYLOAD ANTES DE ENVIAR
        console.log('\n🔍 DEBUG - PAYLOAD:');
        console.log('   Nome:', productData.nome);
        console.log('   Código:', productData.codigo);
        console.log('   Preço:', productData.preco);
        console.log('   Formato:', productData.formato);
        console.log('   Tipo:', productData.tipo);
        console.log('   Situação:', productData.situacao);
        
        if (productData.variacoes) {
            console.log(`   Variações: ${productData.variacoes.length}`);
            productData.variacoes.slice(0, 2).forEach((v, i) => {
                console.log(`      ${i + 1}. Código: ${v.codigo} | Nome: ${v.variacao?.nome}`);
            });
        }
        
        // ✅ VALIDAÇÕES BÁSICAS ANTES DE ENVIAR
        const validationErrors = [];
        
        if (!productData.nome || productData.nome.trim() === '') {
            validationErrors.push('Nome vazio');
        }
        if (!productData.codigo || productData.codigo.trim() === '') {
            validationErrors.push('Código vazio');
        }
        if (!productData.preco || productData.preco <= 0) {
            validationErrors.push(`Preço inválido: ${productData.preco}`);
        }
        if (!['P', 'S'].includes(productData.tipo)) {
            validationErrors.push(`Tipo inválido: ${productData.tipo}`);
        }
        if (!['A', 'I'].includes(productData.situacao)) {
            validationErrors.push(`Situação inválida: ${productData.situacao}`);
        }
        if (!['S', 'V', 'E'].includes(productData.formato)) {
            validationErrors.push(`Formato inválido: ${productData.formato}`);
        }
        
        // ✅ VALIDAÇÃO ESPECÍFICA DE NCM
        if (productData.tributacao?.ncm) {
            const ncm = productData.tributacao.ncm.replace(/\D/g, ''); // Remove pontos
            if (ncm.length !== 8) {
                validationErrors.push(`NCM inválido (deve ter 8 dígitos): ${productData.tributacao.ncm}`);
            }
        }
        
        // ✅ VALIDAÇÃO ESPECÍFICA DE CEST
        if (productData.tributacao?.cest) {
            const cest = productData.tributacao.cest.replace(/\D/g, ''); // Remove pontos
            if (cest.length !== 7) {
                validationErrors.push(`CEST inválido (deve ter 7 dígitos): ${productData.tributacao.cest} (length: ${cest.length})`);
                console.log(`   🔍 CEST original: "${productData.tributacao.cest}"`);
                console.log(`   🔍 CEST sem pontos: "${cest}"`);
            }
        }
        
        if (validationErrors.length > 0) {
            console.error('❌ ERROS DE VALIDAÇÃO PRÉ-ENVIO:');
            validationErrors.forEach(err => console.error(`   - ${err}`));
            
            return {
                success: false,
                error: {
                    message: 'Validação falhou antes do envio',
                    details: validationErrors.join('; '),
                    status: 0
                }
            };
        }

        // ✅ EXIBIR JSON COMPLETO DA REQUEST
        console.log('\n📤 REQUEST COMPLETA SENDO ENVIADA:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(JSON.stringify(productData, null, 2));
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`   🔄 Tentativa ${attempt}/${retries}...`);
                }
                
                const response = await axios.post(
                    `${this.baseURL}/produtos`,
                    productData,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        timeout: 60000
                    }
                );

                return {
                    success: true,
                    data: response.data
                };

            } catch (error) {
                const isTimeout = error.code === 'ECONNABORTED' || error.response?.status === 504;
                const isRateLimit = error.response?.status === 429;
                const isServerError = error.response?.status >= 500;
                const isValidationError = error.response?.status === 400;
                const isLastAttempt = attempt === retries;
                
                // ✅ SE FOR ERRO 400, LOGAR DETALHES E SALVAR PAYLOAD
                if (isValidationError) {
                    console.error('\n❌ ERRO 400 - VALIDAÇÃO BLING:');
                    console.error('   Status:', error.response.status);
                    console.error('   Mensagem:', error.response?.data?.error?.message);
                    
                    // Tentar extrair campos com erro
                    if (error.response?.data?.error?.fields) {
                        console.error('   Campos com erro:');
                        error.response.data.error.fields.forEach(field => {
                            console.error(`      - ${field.field}: ${field.msg}`);
                        });
                    }
                    
                    // Salvar payload completo para análise
                    this.savePayloadForDebug(productData, error.response.data);
                    
                    // Não faz retry em erro de validação
                    return {
                        success: false,
                        error: {
                            message: error.response?.data?.error?.message || error.message,
                            details: error.response?.data?.error?.description || null,
                            fields: error.response?.data?.error?.fields || null,
                            status: error.response?.status || null,
                            isValidationError: true
                        }
                    };
                }
                
                // Retry apenas em casos específicos (não faz retry em 400)
                const shouldRetry = (isTimeout || isRateLimit || isServerError) && !isLastAttempt;

                if (shouldRetry) {
                    const waitTime = attempt * 2;
                    console.log(`   ⏱️ ${isTimeout ? 'Timeout' : isRateLimit ? 'Rate limit' : 'Erro servidor'} - aguardando ${waitTime}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                    continue;
                }

                console.error('❌ Erro ao criar produto no Bling:', error.message);

                // ✅ SALVAR PAYLOAD PARA DEBUG EM ERROS 500 TAMBÉM
                if (isServerError) {
                    console.error('   Status:', error.response?.status);
                    console.error('   Resposta Bling:', JSON.stringify(error.response?.data, null, 2));
                    this.savePayloadForDebug(productData, error.response?.data);
                }

                return {
                    success: false,
                    error: {
                        message: error.response?.data?.error?.message || error.message,
                        details: error.response?.data?.error?.description || null,
                        status: error.response?.status || null,
                        rawResponse: error.response?.data || null,
                        isTimeout: isTimeout,
                        isRateLimit: isRateLimit
                    }
                };
            }
        }
        
        return {
            success: false,
            error: {
                message: 'Todas as tentativas falharam',
                details: 'Número máximo de tentativas excedido',
                status: null
            }
        };
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