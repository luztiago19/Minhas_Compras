const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const P = require('../www/parser.js'), C = require('../www/core.js');
const txt = fs.readFileSync(path.join(__dirname, 'fixtures', 'zeferino-ia.json'), 'utf8');

test('IA: cupom Zeferino lido pelo prompt fecha com o total', () => {
  const d = P.parseCestaJSON(txt);
  assert.equal(d.items.length, 21);
  assert.equal(d.printedTotal, 244.12);
  assert.equal(d.items.filter((i) => i.discount).length, 4);
  const soma = Math.round(d.items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  assert.equal(soma, 244.12);
  assert.ok(P.conferir(d).every((r) => r.ok));
});

test('IA: EAN-8 e preço por kg impresso são mantidos', () => {
  const d = P.parseCestaJSON(txt);
  const by = (n) => d.items.find((i) => i.name.startsWith(n));
  assert.equal(by('BOMBOM LACTA OURO').ean, '78939318');
  assert.equal(by('PASTILHA').ean, '78945456');
  assert.equal(by('FARINHA').unitPrice, 172.9);
  assert.equal(by('QJO PARMES').unitPrice, Math.round((19.74 - 4.5) / 0.152 * 10000) / 10000); // com desconto: líquido
});

test('EAN-8 com zeros na frente vira EAN-8; código interno continua interno', () => {
  assert.equal(C.cleanEAN('00000078939318'), '78939318');
  assert.equal(C.validEAN('00000078939318'), true);
  assert.equal(C.validEAN('00000000003866'), false);
  assert.equal(C.cleanEAN('07891000390030'), '7891000390030');
});
