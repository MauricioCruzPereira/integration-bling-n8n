function parsePrice(value) {
    if (!value) return 0;

    let precoStr = value.toString().trim();
    precoStr = precoStr.replace(/[R$\s]/g, '');

    if (/^\d+\.\d{1,2}$/.test(precoStr)) {
        const valor = parseFloat(precoStr);
        return (valor && valor > 0) ? valor : 0;
    }

    if (precoStr.includes(',')) {
        precoStr = precoStr.replace(/\./g, '');
        precoStr = precoStr.replace(',', '.');
    }

    const valor = parseFloat(precoStr);
    return (valor && valor > 0) ? valor : 0;
}

// ✅ NOVA FUNÇÃO PARA PESO/DECIMAIS (aceita 0 e negativos)
function parseDecimal(value) {
    if (!value) return 0;

    let numStr = value.toString().trim();
    
    // Remove caracteres inválidos (mantém números, vírgula e ponto)
    numStr = numStr.replace(/[^\d,\.]/g, '');

    // Se já está no formato correto (com ponto decimal)
    if (/^\d+\.\d+$/.test(numStr)) {
        return parseFloat(numStr) || 0;
    }

    // Se tem vírgula (formato brasileiro)
    if (numStr.includes(',')) {
        numStr = numStr.replace(/\./g, ''); // Remove ponto de milhar
        numStr = numStr.replace(',', '.'); // Vírgula vira ponto decimal
    }

    return parseFloat(numStr) || 0;
}

module.exports = { parsePrice, parseDecimal };
