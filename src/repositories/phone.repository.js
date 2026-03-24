const supabase = require('../config/supabase');

class PhoneRepository {
    async findByNumber(numero) {
        const { data, error } = await supabase
            .from('numero_telefone_liberado')
            .select('*')
            .eq('numero', numero)
            .eq('ativo', true)
            .single();

        if (error) {
            if (error.code === 'PGRST116') return null; // Not found
            throw new Error('Erro ao buscar número: ' + error.message);
        }

        return data;
    }

    async findAll() {
        const { data, error } = await supabase
            .from('numero_telefone_liberado')
            .select('*')
            .eq('ativo', true)
            .order('created_at', { ascending: false });

        if (error) throw new Error('Erro ao listar números: ' + error.message);
        return data || [];
    }

    async create(numero, nome = null) {
        const { data, error } = await supabase
            .from('numero_telefone_liberado')
            .insert({
                numero: numero,
                nome: nome,
                ativo: true
            })
            .select()
            .single();

        if (error) throw new Error('Erro ao criar número: ' + error.message);
        return data;
    }

    async update(id, updates) {
        const { data, error } = await supabase
            .from('numero_telefone_liberado')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error('Erro ao atualizar número: ' + error.message);
        return data;
    }

    async deactivate(numero) {
        const { data, error } = await supabase
            .from('numero_telefone_liberado')
            .update({
                ativo: false,
                updated_at: new Date().toISOString()
            })
            .eq('numero', numero)
            .select()
            .single();

        if (error) throw new Error('Erro ao desativar número: ' + error.message);
        return data;
    }

    async delete(numero) {
        const { error } = await supabase
            .from('numero_telefone_liberado')
            .delete()
            .eq('numero', numero);

        if (error) throw new Error('Erro ao deletar número: ' + error.message);
        return true;
    }
}

module.exports = new PhoneRepository();