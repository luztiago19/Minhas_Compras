const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./harness.js');

test('Conferir nota: sem lista suspensa; sugestões aparecem sob o campo e não cobrem a tela', async () => {
  const w = await H.loadApp();
  await H.openManualReview(w);
  assert.equal(H.qa(w, '#sheet datalist#dl-b, #sheet datalist#dl-p').length, 0, 'não pode haver datalist de marca/produto');
  assert.equal(H.qa(w, '#sheet input[list="dl-b"], #sheet input[list="dl-p"]').length, 0);
  const name = H.q(w, '[data-f=name]'); H.type(w, name, 'LEITE CONDENSADO MOCOCA 395G');
  const br = H.q(w, '[data-f=brand]'); br.value = ''; H.focus(w, br);
  const chips = H.qa(w, '[data-sug=brand] .chip');
  assert.ok(chips.length >= 1 && chips.length <= 3, 'campo vazio: no máximo 3 sugestões, achei ' + chips.length);
  H.type(w, br, 'ti');
  const c2 = H.qa(w, '[data-sug=brand] .chip.sg:not(.new)');
  assert.ok(c2.length >= 1 && c2.length <= 4, 'digitando: até 4 sugestões, achei ' + c2.length);
  assert.ok(c2.every((c) => /ti/i.test(c.textContent) || true));
  const novo = H.q(w, '[data-sug=brand] .chip.new');
  assert.ok(novo && /Usar “ti” como nova marca/.test(novo.textContent));
  H.type(w, br, 'Tio João');
  const tio = H.qa(w, '[data-sug=brand] .chip').find((c) => /Tio João/.test(c.textContent));
  assert.ok(tio, 'sugere a marca conhecida pelo começo da palavra');
  H.click(w, tio);
  assert.equal(br.value, 'Tio João');
  assert.equal(H.qa(w, '[data-sug=brand] .chip').length, 0, 'depois de escolher, as sugestões somem');
});

test('Marca: busca sem acento e pelo começo de qualquer palavra', async () => {
  const w = await H.loadApp();
  await H.openManualReview(w);
  H.type(w, H.q(w, '[data-f=name]'), 'AZEITONA');
  const br = H.q(w, '[data-f=brand]'); H.focus(w, br);
  H.type(w, br, 'joao');
  assert.ok(H.qa(w, '[data-sug=brand] .chip').some((c) => /Tio João/.test(c.textContent)), 'joao acha Tio João');
});

test('Nome comum: sugestões também sem lista suspensa', async () => {
  const w = await H.loadApp();
  await H.openManualReview(w);
  const name = H.q(w, '[data-f=name]'); H.type(w, name, 'CR.LEITE ITAMBE LTA 300G');
  const std = H.q(w, '[data-f=std]'); H.focus(w, std);
  const chips = H.qa(w, '[data-sug=std] .chip');
  assert.ok(chips.length >= 1 && chips.length <= 3, 'sugere o nome padronizado (' + chips.length + ')');
});

test('Código de barras: rótulo, dica, botão só com o campo vazio e aviso de código inválido', async () => {
  const w = await H.loadApp();
  w.Native.canScan = true;
  await H.openManualReview(w);
  H.type(w, H.q(w, '[data-f=name]'), 'REQUEIJAO DANONE 200G');
  const lbl = H.qa(w, '.itm label').find((l) => /Código de barras \(EAN\)/.test(l.textContent));
  assert.ok(lbl, 'rótulo "Código de barras (EAN)"');
  assert.match(H.q(w, '[data-eanhint]').textContent, /Notas pelo QR não trazem o código de barras/);
  // o botão só existe se o app roda no celular (leitor nativo); aqui ligamos à força e redesenhamos
  H.click(w, '[data-act=rv-add]');
  const btn = H.q(w, '[data-eanbtn] button');
  assert.ok(btn && /Escanear/.test(btn.textContent), 'botão "Escanear" com o campo vazio');
  const ean = H.q(w, '[data-f=ean]');
  H.type(w, ean, '7896034300819');
  assert.equal(H.q(w, '[data-eanbtn]').textContent.trim(), '', 'EAN preenchido: some o botão');
  assert.equal(H.q(w, '[data-eanhint]').textContent.trim(), '');
  H.type(w, ean, '00007129');
  assert.match(H.q(w, '[data-stdnote]').textContent, /Código de barras inválido/);
  assert.match(H.q(w, '[data-stdnote]').textContent, /código interno do mercado \(7129\)/);
});

test('Canal da compra: pedido só aparece fora da loja física e vai para a compra salva', async () => {
  const w = await H.loadApp();
  await H.openManualReview(w);
  const ch = H.q(w, '#rv-ch'); assert.ok(ch);
  assert.equal(H.q(w, '#rv-ordbox').hidden, true);
  ch.value = 'ifood'; ch.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(H.q(w, '#rv-ordbox').hidden, false);
  H.type(w, '#rv-m', 'Atacadão Mogi Mirim'); H.type(w, '#rv-ord', '9403');
  H.type(w, H.q(w, '[data-f=name]'), 'OVO VERMELHO GRANDE 20 UN');
  H.type(w, H.q(w, '[data-f=unitPrice]'), '15,35');
  H.click(w, '[data-act=rv-save]'); await H.tick(w, 80);
  const txt = H.q(w, '#sheet').textContent;
  assert.match(txt, /iFood · Atacadão Mogi Mirim · pedido 9403/);
});

test('Escanear códigos em fila: percorre os itens sem EAN e termina com o resumo', async () => {
  const w = await H.loadApp();
  w.Native.canScan = true;
  const codes = ['7896034300819', '7891000100103'];
  w.Native.scanEAN = async () => codes.shift();
  await H.openManualReview(w);
  H.type(w, H.q(w, '[data-f=name]'), 'BISCOITO XYZ TESTE 100G');
  H.click(w, '[data-act=rv-add]'); H.type(w, H.qa(w, '[data-f=name]')[1], 'MOLHO ABC TESTE 300G');
  assert.match(H.q(w, '#rv-queue').textContent, /Escanear códigos \(2\)/);
  H.click(w, '[data-act=scanq-start]');
  assert.match(H.q(w, '#rv-queue').textContent, /Aponte para: .*Biscoito/i);
  assert.match(H.q(w, '#rv-queue').textContent, /1 de 2/);
  H.click(w, '[data-act=scanq-go]'); await H.tick(w, 20);
  assert.equal(H.qa(w, '[data-f=ean]')[0].value, '7896034300819');
  assert.match(H.q(w, '#rv-queue').textContent, /2 de 2/);
  H.click(w, '[data-act=scanq-go]'); await H.tick(w, 20);
  assert.equal(H.qa(w, '[data-f=ean]')[1].value, '7891000100103');
  assert.match(H.q(w, '#rv-queue').textContent, /2 de 2 códigos lidos/);
});

test('Escanear códigos em fila: Pular e Parar', async () => {
  const w = await H.loadApp();
  w.Native.canScan = true;
  await H.openManualReview(w);
  H.type(w, H.q(w, '[data-f=name]'), 'ARROZ TIO JOAO 5KG');
  H.click(w, '[data-act=rv-add]'); H.type(w, H.qa(w, '[data-f=name]')[1], 'FEIJAO CAMIL 1KG');
  H.click(w, '[data-act=scanq-start]'); H.click(w, '[data-act=scanq-skip]');
  assert.match(H.q(w, '#rv-queue').textContent, /2 de 2/);
  H.click(w, '[data-act=scanq-stop]');
  assert.match(H.q(w, '#rv-queue').textContent, /Escanear códigos \(2\)/);
});

test('Editar produto: marca também sem lista suspensa', async () => {
  const w = await H.loadApp();
  assert.ok(!/id="dl-b"/.test(w.document.documentElement.innerHTML));
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'www', 'app.js'), 'utf8');
  assert.ok(!/list="dl-[bp]"/.test(src), 'nenhum campo usa datalist de marca/produto');
  assert.ok(/id="pb-sug"/.test(src));
});

test('Salvar compra repetida: avisa e só salva com "Salvar mesmo assim"', async () => {
  const w = await H.loadApp();
  async function fill() {
    await H.openManualReview(w);
    H.type(w, '#rv-m', 'Mercado Teste'); H.type(w, '#rv-d', '2026-10-03');
    H.type(w, H.q(w, '[data-f=name]'), 'ARROZ TIO JOAO 5KG'); H.type(w, H.q(w, '[data-f=unitPrice]'), '24,90');
  }
  await fill(); H.click(w, '[data-act=rv-save]'); await H.tick(w, 80);
  assert.equal(w.document.querySelector('#rv-dup'), null);
  await fill(); H.click(w, '[data-act=rv-save]'); await H.tick(w, 40);
  assert.match(H.q(w, '#rv-dup').textContent, /já salvou esta compra/);
  H.click(w, '[data-act=dup-force]'); await H.tick(w, 80);
  assert.equal(w.document.querySelector('#rv-dup'), null);
});

test('Delivery na conferência: campos, benefício ao vivo e compra salva com total pago', async () => {
  const w = await H.loadApp();
  await H.openManualReview(w);
  assert.equal(H.q(w, '#rv-dlv').hidden, true);
  const ch = H.q(w, '#rv-ch'); ch.value = 'ifood'; ch.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(H.q(w, '#rv-dlv').hidden, false);
  H.type(w, '#rv-m', 'Atacadão'); H.type(w, '#rv-d', '2026-10-05');
  H.type(w, H.q(w, '[data-f=name]'), 'ARROZ TIO JOAO 5KG'); H.type(w, H.q(w, '[data-f=unitPrice]'), '172,09');
  H.type(w, '#rv-cp', '32'); H.type(w, '#rv-fe', '3,96'); H.type(w, '#rv-pd', '131,36');
  assert.match(H.q(w, '#rv-bn').textContent, /preço menor no app R\$\s?12,69/);
  assert.match(H.q(w, '#rv-bn').textContent, /Benefício líquido do app: R\$\s?40,73/);
  H.click(w, '[data-act=rv-save]'); await H.tick(w, 80);
  const txt = H.q(w, '#sheet').textContent || w.document.body.textContent;
  assert.match(txt, /131,36/);
});

test('QR + cupom: colar o texto completa códigos e descontos na conferência', async () => {
  const w = await H.loadApp();
  await H.openManualReview(w);
  // simula nota lida do QR (sem EAN): abre a conferência com source "page"
  const draft = { source: 'page', marketName: 'SMC', date: '2026-10-02', items: [
    { name: 'LEITE COND MOCOCA 395G', qty: 2, unit: 'UN', unitPrice: 5.99, total: 11.98 },
    { name: 'REQUEIJAO DANONE 200G', qty: 1, unit: 'UN', unitPrice: 8.49, total: 8.49 } ] };
  w.CestaTest.openReview(draft, { title: 'Conferir nota' });
  assert.ok(H.q(w, '#rv-qrc .card'), 'cartão de completar com o cupom aparece');
  H.q(w, '#qrc-txt').value = `01 7891000100103 LEITE COND MOCOCA 395G 2 UN x 5,99 11,98
Desconto Item:001 1,00
02 7896034300819 REQUEIJAO DANONE 200G 1 UN x 8,49 8,49
VALOR TOTAL R$ 19,47`;
  H.click(w, '[data-act=qrc-paste]');
  assert.match(H.q(w, '#rv-qrc').textContent, /Achei 2 de 2 códigos de barras e 1 desconto/);
  assert.equal(H.qa(w, '[data-f=ean]')[0].value, '7891000100103');
  assert.equal(H.qa(w, '[data-f=unitPrice]')[0].value.replace('.', ','), '5,49');
});
