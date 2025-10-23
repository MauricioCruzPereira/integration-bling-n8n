const { parsePrice } = require('./price');

function expandVariations(row) {
    const variacaoNome = (row.variacaoNome || '').trim();

    if (!variacaoNome) {
        return [{ ...row, variacaoNome: '', formato: 'S' }];
    }

    const variations = [];
    const attributes = {};
    const parts = variacaoNome.split(';').filter(p => p.trim());

    parts.forEach(part => {
        const [key, values] = part.split(':').map(s => s.trim());
        if (key && values) {
            attributes[key] = values.split(',').map(v => v.trim()).filter(v => v);
        }
    });

    const variantKey = Object.keys(attributes).find(k => attributes[k].length > 1);

    if (!variantKey || attributes[variantKey].length === 0) {
        return [{ ...row, variacaoNome: '', formato: 'S' }];
    }

    const precoBase = parsePrice(row.preco);

    // Produto PAI
    variations.push({
        ...row,
        variacaoNome: '',
        formato: 'V',
        codigo: row.codigo,
        preco: precoBase
    });

    // Variações com SKU correto
    attributes[variantKey].forEach((value, index) => {
        // ✅ SKU: 009.022.328-20/21 (com o valor do tamanho)
        const varCode = `${row.codigo}-${value}`;
        
        const varParts = [];
        Object.keys(attributes).forEach(key => {
            if (key === variantKey) {
                varParts.push(`${key}:${value}`);
            } else {
                varParts.push(`${key}:${attributes[key][0]}`);
            }
        });
        
        const varName = varParts.join(';');

        variations.push({
            ...row,
            codigo: varCode,
            variacaoNome: varName,
            formato: 'S',
            preco: precoBase
        });
    });

    return variations;
}

module.exports = { expandVariations };
