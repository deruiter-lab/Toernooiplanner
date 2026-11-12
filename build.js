// Bouwt index.html (één zelfstandig bestand) uit de bronnen in src/.
// Gebruik: node build.js
const fs = require('fs');
const lees = f => fs.readFileSync(__dirname + '/src/' + f, 'utf8');
const engine = lees('engine.js').replace("if (typeof module !== 'undefined') module.exports = ENGINE;", '');
const voorbeeld = lees('voorbeeld.js').replace("if (typeof module !== 'undefined') module.exports = VOORBEELD;", '');
const html = lees('head.html').replace('/*ENGINE*/', engine).replace('/*SAMPLE*/', voorbeeld)
  + '<script>\n' + lees('app.js') + '\n</script>\n</body>\n</html>\n';
fs.writeFileSync(__dirname + '/index.html', html);
console.log('index.html gebouwd (' + html.length + ' tekens)');
