const iconv = require('iconv-lite');

function fixEncoding(text) {
    if (!text || typeof text !== 'string') return text;

    try {
        const buffer = Buffer.from(text, 'binary');
        let decoded = iconv.decode(buffer, 'utf8');

        if (decoded.includes('�')) {
            decoded = iconv.decode(buffer, 'latin1');
        }

        if (decoded.includes('�')) {
            decoded = iconv.decode(buffer, 'win1252');
        }

        decoded = decoded.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        decoded = decoded.replace(/\s+/g, ' ').trim();

        return decoded;
    } catch (e) {
        console.error('❌ Erro ao corrigir encoding:', e.message);
        return text;
    }
}

module.exports = { fixEncoding };