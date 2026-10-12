const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../www/core.js');

const mk = (over) => Object.assign({ date: '2026-10-05', marketName: 'Atacadão', marketCnpj: '75315333000109', items: [] }, over);

test('Sacola entra no gasto, mas não é produto de estoque', () => {
  const S = C.newState();
  C.addPurchase(S, mk({ id: 'a', items: [{ name: 'SAC INST.BIO', qty: 1, unit: 'UN', unitPrice: 0.19, total: 0.19 }, { name: 'ARROZ TIO JOAO 5KG', qty: 1, unit: 'UN', unitPrice: 24.9, total: 24.9 }] }));
  C.addPurchase(S, mk({ id: 'b', date: '2026-10-12', items: [{ name: 'SAC INST.BIO', qty: 1, unit: 'UN', unitPrice: 0.19, total: 0.19 }, { name: 'ARROZ TIO JOAO 5KG', qty: 1, unit: 'UN', unitPrice: 24.9, total: 24.9 }] }));
  const bag = S.products.find((p) => p.bag);
  assert.ok(bag && bag.ignore, 'produto da sacola fica ignorado');
  const sug = C.suggest(C.analyze(S, '2026-10-20'), { horizon: 30, cover: 5 }, '2026-10-20');
  assert.ok(!sug.some((r) => /sac/i.test(r.name)), 'sacola não vai para a lista');
  assert.equal(C.dashboard(S, { today: '2026-10-20' }).spent, 50.18);
});

test('Desconto por quantidade: guarda prateleira e desconto; Painel soma a economia', () => {
  const S = C.newState();
  C.addPurchase(S, mk({ id: 'q', date: '2026-10-11', items: [{ name: 'CR LEITE ITAMBE LTA 300G', qty: 3, unit: 'UN', unitPrice: 6.4, total: 19.2, qd: 1.5 }] }));
  const it = S.items[0];
  assert.equal(it.qd, 1.5); assert.equal(it.shelf, 6.9); assert.equal(it.qdMin, 3);
  const d = C.dashboard(S, { today: '2026-10-20' });
  assert.equal(d.qdSaving, 1.5);
  const h = C.qtyDiscounts(S, '2026-10-20', 90);
  const k = Object.values(h)[0];
  assert.equal(k.qty, 3); assert.equal(k.shelf, 6.9); assert.equal(k.perUnit, 0.5);
});

test('Delivery: total pago manda no gasto; benefício = cupom + preço menor no app - taxas', () => {
  const S = C.newState();
  const r = C.addPurchase(S, mk({ id: 'd', channel: 'ifood', order: '9403', coupon: 32, fees: 3.96, paid: 131.36, items: [{ name: 'ARROZ TIO JOAO 5KG', qty: 1, unit: 'UN', unitPrice: 172.09, total: 172.09 }] }));
  const p = r.purchase;
  assert.equal(p.total, 172.09); assert.equal(C.spentOf(p), 131.36);
  assert.equal(C.appLower(p), 12.69); assert.equal(C.benefitOf(p), 40.73);
  const d = C.dashboard(S, { today: '2026-10-20' });
  assert.equal(d.spent, 131.36); assert.equal(d.benefit, 40.73); assert.equal(d.fees, 3.96);
});

test('Variação de preço só dentro do mesmo canal', () => {
  const S = C.newState();
  const item = (q) => ({ name: 'IOGURTE NATURAL BATAVO 170G', qty: 1, unit: 'UN', unitPrice: q, total: q });
  C.addPurchase(S, mk({ id: '1', date: '2026-09-01', items: [item(3.0)] }));
  C.addPurchase(S, mk({ id: '2', date: '2026-10-01', channel: 'ifood', items: [item(4.5)] }));
  const a = Object.values(C.analyze(S, '2026-10-20'))[0];
  assert.equal(a.chg, null, 'o iFood não é comparado com a loja');
  C.addPurchase(S, mk({ id: '3', date: '2026-10-10', items: [item(3.3)] }));
  const b = Object.values(C.analyze(S, '2026-10-20'))[0];
  assert.ok(Math.abs(b.chg - 0.1) < 1e-6, 'loja contra loja: 3,00 → 3,30');
});

test('Delivery × loja: mesmo produto e mercado em até 14 dias', () => {
  const S = C.newState();
  C.addPurchase(S, mk({ id: 'l', date: '2026-10-11', items: [{ name: 'REQUEIJAO DANONE 200G', qty: 1, unit: 'UN', unitPrice: 7.99, total: 7.99 }] }));
  C.addPurchase(S, mk({ id: 'i', date: '2026-10-05', channel: 'ifood', items: [{ name: 'REQUEIJAO DANONE 200G', qty: 1, unit: 'UN', unitPrice: 9.93, total: 9.93 }] }));
  const r = C.deliveryVsStore(S);
  assert.equal(r.pairs, 1); assert.equal(r.extra, 1.94); assert.equal(r.deliveryItems, 1);
});

test('Encolhimento: 200 g → 180 g com o mesmo preço', () => {
  const S = C.newState();
  C.addPurchase(S, mk({ id: 'a', date: '2026-08-01', items: [{ name: 'BISCOITO MARILAN 200G', qty: 1, unit: 'UN', unitPrice: 5.0, total: 5.0 }] }));
  C.addPurchase(S, mk({ id: 'b', date: '2026-10-01', items: [{ name: 'BISCOITO MARILAN 180G', qty: 1, unit: 'UN', unitPrice: 5.0, total: 5.0 }] }));
  const r = C.shrinkAlerts(S);
  assert.equal(r.length, 1);
  assert.equal(r[0].from, '200 g'); assert.equal(r[0].to, '180 g'); assert.ok(Math.abs(r[0].up - 0.111) < 0.001);
});

const P = require('../www/parser.js');

test('Print do pedido do iFood: itens, taxas, cupom e total pago', () => {
  const t = `iFood
Pedido Nº 9403
Atacadão Mogi Mirim
05/10/2026
Itens do pedido
2x Creme de leite Itambé 300g
R$ 13,80
1x Cebola kg
R$ 5,03
3x Arroz Tio João 5kg R$ 74,70
Subtotal R$ 93,53
Taxa de entrega R$ 2,99
Taxa de serviço R$ 0,97
Descontos -R$ 32,00
Total R$ 65,49`;
  const d = P.parseAny(t);
  assert.equal(d.channel, 'ifood'); assert.equal(d.order, '9403'); assert.equal(d.date, '2026-10-05');
  assert.equal(d.marketName, 'Atacadão Mogi Mirim');
  assert.equal(d.items.length, 3);
  assert.equal(d.items[0].qty, 2); assert.equal(d.items[0].total, 13.8); assert.equal(d.items[0].unitPrice, 6.9);
  assert.equal(d.items[2].total, 74.7);
  assert.equal(d.fees, 3.96); assert.equal(d.coupon, 32); assert.equal(d.paid, 65.49);
});

test('JSON de IA com cupom, taxas e total pago', () => {
  const d = P.parseCestaJSON('{"formato":"cesta-certa-v1","mercado":"Atacadão","data":"2026-10-05","canal":"ifood","cupom_app":32,"taxas":3.96,"total_pago":131.36,"itens":[{"nome":"ARROZ","qtd":1,"total":172.09}]}');
  assert.equal(d.coupon, 32); assert.equal(d.fees, 3.96); assert.equal(d.paid, 131.36); assert.equal(d.channel, 'ifood');
});

test('QR + cupom: completa EAN e descontos pelos valores', () => {
  const qr = { items: [
    { name: 'LEITE COND', qty: 2, unitPrice: 5.99, total: 11.98 },
    { name: 'REQUEIJAO', qty: 1, unitPrice: 8.49, total: 8.49 },
    { name: 'SAB DOVE', qty: 1, unitPrice: 27.92, total: 27.92 } ] };
  const cup = P.parseReceiptText(`SMC
CNPJ 12.345.678/0001-95
01 7891000100103 LEITE COND MOCOCA 395G 2 UN x 5,99 11,98
Desconto Item:001 1,00
02 7896034300819 REQUEIJAO DANONE 200G 1 UN x 8,49 8,49
VALOR TOTAL R$ 19,47`);
  const r = P.mergeCupom(qr, cup);
  assert.equal(r.matched, 2); assert.equal(r.eans, 2); assert.equal(r.discounts, 1);
  assert.equal(qr.items[0].ean, '7891000100103'); assert.equal(qr.items[0].total, 10.98); assert.equal(qr.items[0].qd, 1);
  assert.equal(qr.items[2].ean, undefined);
});
