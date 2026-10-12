const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../www/parser.js');

// Fixtures reconstruídas dos cupons que o Tiago mostrou (valores de exemplo, formato real)
const ATACADAO = `ATACADAO S.A.
CNPJ: 75.315.333/0001-09
Emissão: 03/10/2026 10:15:22
CÓDIGO DESCRIÇÃO QTD UN VL UNIT VL ITEM
1 AR1043310 CEBOLA KG 0,842KG9 5,98 5,03
2 AR2200417 CR LEITE ITAMBE LTA 1X170G 2UND9 4,49 8,98
3 AR2200991 SAB DOVE 8X90G 1UND9 27,92 27,92
desconto sobre item 2,00
4 AR0034455 ARROZ TIO JOAO 5KG 3UND9 24,90 74,70
Qtde total de itens: 7
VALOR TOTAL R$ 114,63
`;

test('Atacadão: lê código AR…, unidade colada no 9 e embalagem', () => {
  const d = P.parseReceiptText(ATACADAO);
  const by = (n) => d.items.find((i) => i.name.includes(n));
  const cr = by('CR LEITE');
  assert.ok(cr, 'achou o creme de leite');
  assert.equal(cr.qty, 2); assert.equal(cr.unit, 'UND'); assert.equal(cr.unitPrice, 4.49); assert.equal(cr.total, 8.98);
  assert.equal(cr.scode, 'AR2200417'); assert.equal(cr.ean, '');
  assert.match(cr.name, /170G/); assert.equal(cr.pack, '1X170G');
  const dove = by('SAB DOVE'); assert.equal(dove.pack, '8X90G');
});

test('Atacadão: "desconto sobre item" vale para o item de cima', () => {
  const d = P.parseReceiptText(ATACADAO);
  const dove = d.items.find((i) => i.name.includes('DOVE'));
  assert.equal(dove.discount, 2); assert.equal(dove.total, 25.92);
  assert.equal(d.items.find((i) => i.name.includes('ARROZ')).discount, undefined);
});

test('Cupom: emissão, total e quantidade de itens', () => {
  const d = P.parseReceiptText(ATACADAO);
  assert.equal(d.date, '2026-10-03'); assert.equal(d.printedTotal, 114.63); assert.equal(d.printedCount, 7);
});

test('Conferências: soma com descontos fecha e itens batem', () => {
  const d = P.parseReceiptText(ATACADAO);
  const r = P.conferir(d);
  assert.ok(r.filter((x) => !x.ok).length === 0, JSON.stringify(r));
});

test('Conferências: acusam soma errada e item faltando', () => {
  const d = P.parseReceiptText(ATACADAO.replace(/\n4 AR0034455.*\n/, '\n'));
  const r = P.conferir(d);
  assert.ok(r.some((x) => x.kind === 'soma' && !x.ok));
  assert.ok(r.some((x) => x.kind === 'qtd' && !x.ok));
});

test('SMC: sequência + EAN + nome + qtd x unitário, com "Desconto Item"', () => {
  const t = `SUPERMERCADO SMC LTDA
CNPJ 12.345.678/0001-95
01 7891000100103 LEITE COND MOCOCA 395G 2 UN x 5,99 11,98
Desconto Item:001 1,00
02 7896034300819 REQUEIJAO DANONE 200G 1 UN x 8,49 8,49
VALOR TOTAL R$ 19,47
`;
  const d = P.parseReceiptText(t);
  assert.equal(d.items.length, 2);
  assert.equal(d.items[0].ean, '7891000100103'); assert.equal(d.items[0].discount, 1); assert.equal(d.items[0].total, 10.98);
  assert.equal(P.conferir(d).filter((x) => !x.ok).length, 0);
});

test('Chave de acesso de 44 dígitos é reconhecida mesmo em grupos de 4', () => {
  const k = '35261012345678000195650010000123451000123456';
  const d = P.parseReceiptText('MERCADO X\n' + k.replace(/(\d{4})/g, '$1 ').trim() + '\nVALOR TOTAL R$ 1,00');
  assert.equal(d.chave, k);
});

test('Nota repetida: mesmo mercado, dia, total e nomes vira aviso; nota diferente não', () => {
  const C = require('../www/core.js');
  const S = C.newState();
  const d1 = { date: '2026-10-03', marketName: 'Atacadão', marketCnpj: '75315333000109', items: [
    { name: 'CEBOLA KG', qty: 1, unit: 'KG', unitPrice: 5.03, total: 5.03 }, { name: 'ARROZ TIO JOAO 5KG', qty: 3, unit: 'UN', unitPrice: 24.9, total: 74.7 }] };
  C.addPurchase(S, Object.assign({ id: 'x1' }, d1));
  assert.ok(C.findSimilarPurchase(S, Object.assign({ id: 'outro' }, d1)), 'mesma compra por outro caminho');
  assert.equal(C.findSimilarPurchase(S, Object.assign({}, d1, { date: '2026-10-04' })), null);
  assert.equal(C.findSimilarPurchase(S, Object.assign({}, d1, { items: [{ name: 'LEITE', qty: 1, unit: 'UN', unitPrice: 79.73, total: 79.73 }] })), null);
});

test('Abreviações do cupom viram nomes legíveis; galinha livre = caipira', () => {
  const S = require('../www/std.js');
  assert.match(S.standardize('CR.LEITE ITAMBE LTA 300G', 'UN').name, /Creme de Leite/i);
  assert.match(S.standardize('AZ.VDE SOL 200G', 'UN').name, /Azeitona Verde/i);
  assert.match(S.standardize('SAB.INF. DOVE 90G', 'UN').name, /Sabonete Infantil/i);
  assert.match(S.standardize('PRESUNTO FAT. SADIA 200G', 'UN').name, /Fatiado/i);
  assert.equal(S.standardize('OVO GALINHA LIVRE 20 UN', 'UN').name, S.standardize('OVO CAIPIRA 20 UN', 'UN').name);
});

test('JSON cesta-certa-v1 de outra IA: cerca de código, aspas curvas, vírgula sobrando, contas refeitas', () => {
  const txt = 'Aqui está:\n```json\n{"formato":"cesta-certa-v1","mercado":"Atacadão","data":"03/10/2026","canal":"iFood","pedido":"9403","total_nota":30.0,"itens":[\n{"nome":"SAB DOVE 8X90G","qtd":1,"unidade":"UN","preco_unitario":27.92,"total":27.92,"desconto":2.00,"ean":"7891150056251"},\n{"nome":"CEBOLA","qtd":"0,842","unidade":"KG","total":"5,03"},\n]}\n```';
  const d = P.parseAny(txt);
  assert.equal(d.items.length, 2); assert.equal(d.date, '2026-10-03'); assert.equal(d.channel, 'ifood'); assert.equal(d.order, '9403');
  assert.equal(d.items[0].total, 25.92); assert.equal(d.items[0].discount, 2);
  assert.equal(d.items[1].qty, 0.842); assert.equal(d.items[1].unitPrice, 5.9739);
  assert.equal(P.parseCestaJSON('não é json'), null);
  assert.match(P.CESTA_PROMPT, /cesta-certa-v1/);
});

test('Pacote 8x90g: preço de cada unidade', () => {
  const S = require('../www/std.js');
  const r = S.packUnit('SAB DOVE 8X90G', 'UN', 27.92);
  assert.equal(r.n, 8); assert.equal(r.each, 3.49);
  assert.equal(S.packUnit('ARROZ 5KG', 'UN', 24.9), null);
});

/* Cupom real (Zeferino, 04/10/2026, 21 itens, total 244,12) fotografado em 3 partes; texto lido por um leitor local */
const ZEF = require('./fixtures/zeferino-ocr.json');
const zef = () => Object.values(ZEF).map((l) => P.parseReceiptText(l.join('\n')));

test('Cupom real: uma foto só já liga cada desconto ao item certo e lê os códigos', () => {
  const d = zef()[0]; // foto do topo (itens 1 a 19)
  assert.ok(d.items.length >= 18);
  const by = (n) => d.items.find((i) => i.name.includes(n));
  assert.equal(by('RTIL').discount, 6); assert.equal(by('RTIL').ean, '7898935886010');
  assert.equal(by('QJ').discount, 4.5); assert.ok(Math.abs(by('QJ').total - 15.24) < 0.011);
  assert.equal(d.items.filter((i) => i.discount > 0).length, 4);
});

test('Cupom real: juntar 3 fotos dá os 21 itens, 4 descontos e a soma fecha em 244,12', () => {
  const m = P.mergeReads(zef());
  assert.equal(m.items.length, 21);
  assert.equal(m.items.filter((i) => i.discount > 0).length, 4);
  assert.equal(m.printedTotal, 244.12);
  const sum = Math.round(m.items.reduce((a, i) => a + i.total, 0) * 100) / 100;
  assert.equal(sum, 244.12);
  assert.ok(P.conferir(m).every((c) => c.ok), JSON.stringify(P.conferir(m)));
  assert.equal(m.items.filter((i) => i.ean).length >= 6, true);
});

test('Juntar fotos: uma foto sozinha continua igual; sem itens devolve null', () => {
  const d = zef()[0];
  assert.equal(P.mergeReads([d]).items.length, d.items.length);
  assert.equal(P.mergeReads([{ items: [] }]), null);
});
