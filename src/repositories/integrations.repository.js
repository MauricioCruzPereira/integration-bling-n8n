const supabase = require('../config/supabase');

class IntegrationsRepository {
    async findActive() {
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
    }

    async findById(id) {
        const { data, error } = await supabase
            .from('integrations')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error('Integração não encontrada: ' + error.message);
        return data;
    }

    async create(integration) {
        const { data, error } = await supabase
            .from('integrations')
            .insert(integration)
            .select()
            .single();

        if (error) throw new Error('Erro ao criar integração: ' + error.message);
        return data;
    }

    async update(id, updates) {
        const { data, error } = await supabase
            .from('integrations')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error('Erro ao atualizar integração: ' + error.message);
        return data;
    }

    async delete(id) {
        const { error } = await supabase
            .from('integrations')
            .delete()
            .eq('id', id);

        if (error) throw new Error('Erro ao deletar integração: ' + error.message);
        return true;
    }
}

module.exports = new IntegrationsRepository();