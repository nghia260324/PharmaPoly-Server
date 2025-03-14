const diacritics = require('diacritics');

function removeDiacritics(str) {
    return diacritics.remove(str);
}

module.exports = { removeDiacritics };
