const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/core.js');
const Std = require('../www/std.js');

test('EAN: dígito verificador e tamanhos (8, 12, 13, 14)', () => {
  assert.equal(C.validEAN('7896034300819'), true);
  assert.equal(C.validEAN('07896034300819'), true, '14 dígitos com zero na frente vira EAN-13');
  assert.equal(C.cleanEAN('07896034300819'), '7896034300819');
  assert.equal(C.validEAN('7896034300818'), false, 'dígito verificador errado');
  assert.equal(C.gtinOK('96385074'), true, 'EAN-8');
  assert.equal(C.gtinOK('036000291452'), true, 'UPC-A de 12 dígitos');
  assert.equal(C.gtinOK('10012345678902'), true, 'GTIN-14');
  assert.equal(C.validEAN('12345'), false);
});

test('EAN: código interno do mercado nunca vale como EAN', () => {
  assert.equal(C.validEAN('00007129'), false, 'o bug do apk-3: 00007129 passava como EAN-8');
  assert.equal(C.validEAN('00000000007129'), false);
  assert.equal(C.internalCode('00007129'), '7129');
  assert.equal(C.internalCode('00000000007129'), '7129');
  assert.equal(C.internalCode('7896034300819'), '');
});

function draft(items, extra) { return Object.assign({ date: '2026-10-11', marketName: 'Atacadão', marketCnpj: '93209765059510', items }, extra || {}); }

test('produto aprende vários EANs e o código do mercado', () => {
  const S = C.newState();
  C.addPurchase(S, draft([{ name: 'IOG.FAZ.BELA VISTA 170G', qty: 3, unit: 'UN', unitPrice: 3.3, scode: 'AR096143', ean: '' }], { id: 'a' }));
  const p0 = S.products[0];
  assert.deepEqual(p0.eans || [], []);
  // segunda compra: mesmo produto lido pelo código do mercado, agora com o EAN escaneado
  const raw = { name: 'IOG.FAZ.BELA VISTA 170G', scode: 'AR096143', cnpj: '93209765059510' };
  const k = C.findKnown(S, raw);
  assert.equal(k.via, 'código do mercado');
  C.addPurchase(S, draft([{ name: 'IOG.FAZ.BELA VISTA 170G', qty: 9, unit: 'UN', unitPrice: 2.99, scode: 'AR096143', ean: '7896034300819' }], { id: 'b' }));
  assert.equal(S.products.length, 1);
  assert.ok(S.products[0].eans.includes('7896034300819'));
  // terceira vez: só o código do mercado, o EAN vem junto
  const k2 = C.findKnown(S, raw);
  assert.equal(k2.ean, '7896034300819');
  // EAN novo (embalagem nova) no mesmo produto
  C.addPurchase(S, draft([{ name: 'IOG.FAZ.BELA VISTA 170G', qty: 1, unit: 'UN', unitPrice: 3, scode: 'AR096143', ean: '7891000100103' }], { id: 'c' }));
  assert.deepEqual(S.products[0].eans.sort(), ['7891000100103', '7896034300819']);
  assert.equal(C.findKnown(S, { name: 'X', ean: '7891000100103' }).via, 'código de barras');
});

test('conflito de tamanho: o código diz um tamanho e a nota outro', () => {
  const S = C.newState();
  C.addPurchase(S, draft([{ name: 'REQUEIJAO DANONE 200G', qty: 1, unit: 'UN', unitPrice: 7.99, ean: '7891000100103' }], { id: 'a' }));
  const found = C.findKnown(S, { name: 'REQUEIJAO DANONE 180G', ean: '7891000100103' });
  const cf = C.sizeConflict(found, 'REQUEIJAO DANONE 180G');
  assert.ok(cf, 'deve avisar');
  assert.match(cf.code, /200 g/); assert.match(cf.note, /180 g/);
  assert.equal(C.sizeConflict(found, 'REQUEIJAO DANONE 200G'), null);
});

test('canal e pedido ficam gravados na compra e nos itens', () => {
  const S = C.newState();
  const r = C.addPurchase(S, draft([{ name: 'Ovo', qty: 1, unit: 'UN', unitPrice: 15.35 }], { id: 'z', channel: 'ifood', order: '9403' }));
  assert.equal(r.purchase.channel, 'ifood'); assert.equal(r.purchase.order, '9403');
  assert.equal(S.items[0].channel, 'ifood');
  const r2 = C.addPurchase(S, draft([{ name: 'Leite', qty: 1, unit: 'UN', unitPrice: 5 }], { id: 'y' }));
  assert.equal(r2.purchase.channel, 'loja', 'sem canal informado = loja física');
  assert.equal(C.channelLabel('ifood'), 'iFood');
});
