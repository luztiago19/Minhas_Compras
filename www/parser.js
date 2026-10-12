/* Leitura de notas: XML da NFC-e/NF-e (exato) e texto de PDF/OCR (heurístico). */
(function (root) {
  'use strict';
  const Core = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);
  const { num, norm, validEAN, gtinOK, cleanEAN, round } = Core;

  const UNITS = 'UN|UND|UNID|PC|PCT|CX|DZ|LT|FD|BD|KG|G|GR|L|ML|M|MT|PT|SC|BDJ|PAC';

  /* ---------- XML ---------- */

  function parseNFeXML(xml, DP) {
    DP = DP || root.DOMParser;
    const doc = new DP().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido');
    const one = (el, name) => (el ? el.getElementsByTagNameNS('*', name)[0] : null);
    const txt = (el, name) => { const n = one(el, name); return n ? n.textContent.trim() : ''; };
    const inf = one(doc, 'infNFe');
    if (!inf) throw new Error('Este XML não é uma NF-e/NFC-e');
    const chave = (inf.getAttribute('Id') || '').replace(/\D/g, '');
    const ide = one(inf, 'ide'), emit = one(inf, 'emit'), ender = one(emit, 'enderEmit');
    const date = (txt(ide, 'dhEmi') || txt(ide, 'dEmi')).slice(0, 10);
    const items = [];
    Array.from(inf.getElementsByTagNameNS('*', 'det')).forEach((det) => {
      const prod = one(det, 'prod');
      if (!prod) return;
      const qty = num(txt(prod, 'qCom'));
      const vProd = num(txt(prod, 'vProd'));
      const vDesc = num(txt(prod, 'vDesc')) || 0;
      const total = round(vProd - vDesc, 2);
      let ean = txt(prod, 'cEAN');
      if (!validEAN(ean)) ean = txt(prod, 'cEANTrib');
      items.push({
        name: txt(prod, 'xProd'), ean: validEAN(ean) ? ean : '', scode: txt(prod, 'cProd'), qty, unit: txt(prod, 'uCom').toUpperCase() || 'UN',
        unitPrice: qty > 0 ? round(total / qty, 4) : 0, total,
      });
    });
    const tot = one(one(inf, 'total'), 'ICMSTot');
    return {
      id: chave.length === 44 ? chave : undefined, date, marketName: txt(emit, 'xFant') || txt(emit, 'xNome'),
      marketCnpj: txt(emit, 'CNPJ'), city: txt(ender, 'xMun'), uf: txt(ender, 'UF'),
      total: tot ? num(txt(tot, 'vNF')) : null, source: 'xml', items,
    };
  }

  /* ---------- texto (PDF/OCR) ---------- */

  const SKIP = /\b(TOTAL|TROCO|DINHEIRO|CARTAO|CREDITO|DEBITO|PIX|CNPJ|CPF|SUBTOTAL|DESCONTO|ACRESCIMO|TRIBUTOS|QTD TOTAL|FORMA DE PAGAMENTO|VALOR PAGO|CONSUMIDOR|CHAVE DE ACESSO|PROTOCOLO|NFC|NFE|DANFE|SERIE|EMISSAO|AUTORIZACAO|ICMS|ITEM|CODIGO|DESCRICAO|VL UNIT|VL TOTAL|QTDE|UNID)\b/;

  // Confusões típicas do OCR em cupom térmico, só para tokens que deveriam ser números
  const DIGITISH = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', S: '5', s: '5', B: '8', Z: '2', G: '6' };
  const digitize = (t) => String(t).replace(/[OoDQIl|SsBZG]/g, (c) => DIGITISH[c]);
  const isDigitish = (t) => /^\d+$/.test(t) || (t.length >= 5 && (t.match(/[0-9OoDQIl|SsBZG?*]/g) || []).length / t.length >= 0.75 && /\d/.test(t));

  // Dígitos que o OCR costuma confundir em cupom térmico
  const CONF = { 0: [8, 6, 9], 1: [7], 2: [7], 3: [8, 9, 5], 4: [9], 5: [6, 3, 8], 6: [8, 5, 0], 7: [1, 2], 8: [3, 0, 6, 9], 9: [3, 8, 0, 4, 7] };

  // Se o total impresso na nota não fecha com a soma dos itens, tenta achar UM item com UM dígito trocado que faça fechar.
  // Só corrige quando a resposta é única; o item fica marcado para o usuário saber.
  function repairBySum(draft) {
    const target = draft.printedTotal;
    if (!(target > 0) || draft.items.length < 2) return;
    const sum = (arr) => round(arr.reduce((a, i) => a + i.total, 0), 2);
    if (Math.abs(sum(draft.items) - target) < 0.005) return;
    const found = [];
    draft.items.forEach((it, idx) => {
      const base = round(it.total + (it.discount || 0), 2), str = base.toFixed(2).replace('.', '');
      for (let j = 0; j < str.length; j++) {
        (CONF[+str[j]] || []).forEach((alt) => {
          const nb = round(parseInt(str.slice(0, j) + alt + str.slice(j + 1), 10) / 100, 2);
          const nt = round(nb - (it.discount || 0), 2);
          if (nt > 0 && Math.abs(sum(draft.items) - it.total + nt - target) < 0.005) found.push({ idx, nt, was: it.total });
        });
      }
    });
    let pick = found;
    // com mais de uma resposta possível, vale o item que já estava marcado como duvidoso (preço unitário ilegível)
    if (new Set(pick.map((f) => f.idx + ':' + f.nt)).size > 1) pick = pick.filter((f) => draft.items[f.idx].check);
    if (new Set(pick.map((f) => f.idx + ':' + f.nt)).size !== 1) return;
    const f = pick[0], it = draft.items[f.idx];
    it.total = f.nt; it.unitPrice = round(f.nt / it.qty, 4); it.check = false;
    it.note = 'Preço corrigido pela soma da nota (a leitura deu R$ ' + f.was.toFixed(2).replace('.', ',') + '). Confira.';
  }

  // Tira número de sequência, código e sobras do começo/fim do nome lido
  function cleanName(str) {
    let toks = String(str).trim().split(/\s+/);
    if (toks.length && toks[0].length <= 3 && !/[A-Za-zÀ-ÿ]{3}/.test(toks[0])) toks.shift(); else if (toks.length && /^\S{1,2}$/.test(toks[0])) toks.shift();
    while (toks.length && isDigitish(toks[0])) toks.shift();
    while (toks.length > 1 && /^\S$/.test(toks[toks.length - 1])) toks.pop();
    return toks.join(' ').replace(/[^A-Za-zÀ-ÿ0-9 .,%\/\-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Linha de item lida com erros: usa o que dá (total no fim, preço depois do "x", quantidade antes da unidade)
  function looseItem(line, seq) {
    const mt = line.match(/(\d+[.,]\d{2})\s*\S{0,2}$/);
    if (!mt) return null;
    const body = line.slice(0, mt.index).trim();
    const hasX = /[xX×«*]\s*\d/.test(body), hasUnit = /(?:^|[\s|!\d])(UN|UM|UH|KG|CX|PC|PCT)\b/i.test(body);
    if (!(hasX || (hasUnit && /^\S{1,3}\s/.test(body)))) return null;
    if (SKIP.test(norm(line))) return null;
    const total = num(mt[1]);
    // quantidade + unidade (+ marcador de multiplicação)
    let qty = 1, unit = 'UN', cut = body.length;
    const qm = body.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{1,3})?)\s*[|!I]?\s*(UN|UM|UH|KG|G|L|CX|PC|PCT|DZ|LT|FD|BD|PT|SC|MT)?\s*[xX×«*]\s*(?=\S)/i) ||
               body.match(/(?:^|\s)()\s*[|!I]?\s*(UN|UM|UH|KG|CX|PC|PCT)\s*[xX×«*]?\s*(?=\d)/i);
    let afterQty = body;
    if (!qm) { const xm = body.match(/\s[xX×«*]\s*(?=\d)/); if (xm) { cut = xm.index; afterQty = body.slice(xm.index + xm[0].length); } }
    if (qm) { qty = qm[1] ? num(qm[1]) : 1; unit = (qm[2] || 'UN').toUpperCase().replace(/^U[MH]$/, 'UN'); cut = qm.index; afterQty = body.slice(qm.index + qm[0].length); }
    if (!(qty > 0)) qty = 1;
    const um = afterQty.match(/(\d+[.,]\d{1,4})/);
    // nome: tira número de sequência e código (tokens só de dígitos, mesmo que OCR tenha trocado letras por números)
    let toks = body.slice(0, cut).trim().split(/\s+/);
    if (toks.length && toks[0].length <= 3 && !/[A-Za-zÀ-ÿ]{3}/.test(toks[0])) toks.shift(); else if (toks.length && /^\S{1,2}$/.test(toks[0])) toks.shift();
    const codeToks = [];
    while (toks.length && isDigitish(toks[0])) codeToks.push(toks.shift());
    const codeRaw = codeToks.join('');
    // só confia no código se foi lido só com dígitos E o dígito verificador fecha (letras trocadas por número não valem)
    const ean = /^\d{13,14}$/.test(codeRaw) && gtinOK(codeRaw) ? cleanEAN(codeRaw) : '';
    while (toks.length > 1 && /^\S$/.test(toks[toks.length - 1])) toks.pop();
    const name = toks.join(' ').replace(/[^A-Za-zÀ-ÿ0-9 .,%\/\-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[A-Za-zÀ-ÿ]{2}/.test(name)) return null;
    let unitPrice = um ? num(um[1]) : NaN;
    let check = false;
    if (!(isFinite(unitPrice) && Math.abs(qty * unitPrice - total) < 0.06)) { unitPrice = round(total / qty, 4); check = true; }
    else if (qty === 1) unitPrice = total;
    return { seq, name, ean, qty, unit, unitPrice, total, raw: name, check, loose: true };
  }


  /* Cupom do Atacadão: "NN AR123456 NOME DO PRODUTO 1X170G 2UND9 4,49 8,98" (a unidade vem colada num "9" e a embalagem junto do nome) */
  const atacRe = /^(?:(\d{1,3})\s+)?([A-Z]{0,3}\d{3,14})\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(UND|UN|KG|CX|PCT|PC|FD|DZ|BD|LT)\s?9?\s+(?:R\$\s*)?(\d+[.,]\d{2,4})\s+(?:R\$\s*)?(\d+[.,]\d{2})$/i;
  const packRe = /\b(\d{1,3})\s?[xX]\s?(\d+(?:[.,]\d+)?)\s?(G|KG|ML|L)\b/i;
  function atacItem(line) {
    const m = line.match(atacRe); if (!m) return null;
    let name = m[3].trim(), pack = '';
    const pm = name.match(packRe);
    if (pm) { pack = pm[1] + 'X' + pm[2].replace(',', '.') + pm[3].toUpperCase(); name = (name.slice(0, pm.index) + ' ' + (+pm[1] === 1 ? pm[2] + pm[3].toUpperCase() : pack) + ' ' + name.slice(pm.index + pm[0].length)).replace(/\s+/g, ' ').trim(); }
    if (!/[A-Za-zÀ-ÿ]{2}/.test(name)) return null;
    const code = m[2].toUpperCase(), digits = code.replace(/\D/g, '');
    const ean = /^\d{8,14}$/.test(code) && validEAN(code) ? cleanEAN(code) : '';
    const it = { seq: m[1] ? parseInt(m[1], 10) : undefined, name, ean, scode: ean ? '' : code, qty: num(m[4]), unit: m[5].toUpperCase(), unitPrice: num(m[6]), total: num(m[7]), raw: name };
    if (pack) it.pack = pack;
    return it;
  }
  // Conferências do cupom: cada uma devolve {ok, msg}; a tela mostra só as que falharam
  function conferir(draft) {
    const out = [], items = draft.items || [];
    items.forEach((it, k) => {
      const base = round(it.total + (it.discount || 0), 2);
      if (it.qty && it.unitPrice && Math.abs(round(it.qty * (it.unitPrice + (it.discount || 0) / it.qty), 2) - base) > 0.06 && Math.abs(it.qty * it.unitPrice - it.total) > 0.06) out.push({ ok: false, kind: 'conta', item: k, msg: `Item ${k + 1} (${it.name}): quantidade × preço não bate com o total.` });
    });
    const sum = round(items.reduce((a, i) => a + i.total, 0), 2);
    if (draft.printedTotal > 0) {
      const ok = Math.abs(sum - draft.printedTotal) < 0.06;
      out.push({ ok, kind: 'soma', msg: ok ? 'A soma dos itens (já com os descontos) fecha com o total da nota.' : `A soma dos itens (R$ ${sum.toFixed(2).replace('.', ',')}) não fecha com o total da nota (R$ ${draft.printedTotal.toFixed(2).replace('.', ',')}).` });
    }
    if (draft.printedCount > 0) {
      const q = round(items.reduce((a, i) => a + (i.unit === 'KG' ? 1 : i.qty), 0), 3);
      const ok = Math.abs(q - draft.printedCount) < 0.001;
      out.push({ ok, kind: 'qtd', msg: ok ? 'A quantidade de itens confere com a nota.' : `A nota diz ${draft.printedCount} itens e eu li ${q}. Pode faltar ou sobrar um item.` });
    }
    if (draft.chave && !/^\d{44}$/.test(draft.chave)) out.push({ ok: false, kind: 'chave', msg: 'A chave de acesso não tem 44 dígitos.' });
    return out;
  }


  /* ---------- JSON "cesta-certa-v1" (resposta de outra IA): leitura tolerante, contas refeitas aqui ---------- */
  const CESTA_PROMPT = `Leia a(s) imagem(ns) da nota fiscal / cupom / print do pedido e responda SOMENTE com um JSON (sem texto antes ou depois), neste formato:
{"formato":"cesta-certa-v1","mercado":"Nome do mercado","cnpj":"só números ou vazio","data":"AAAA-MM-DD","canal":"loja|ifood|app|site","pedido":"número do pedido ou vazio","total_nota":0.00,"cupom_app":0.00,"taxas":0.00,"total_pago":0.00,"itens":[{"nome":"nome como na nota","ean":"código de barras ou vazio","codigo":"código do mercado ou vazio","qtd":1,"unidade":"UN|KG|L","preco_unitario":0.00,"total":0.00,"desconto":0.00}]}
Regras: use ponto como separador decimal; "desconto" é o desconto do próprio item (positivo); não invente itens nem códigos; se não conseguir ler algo, deixe vazio ou 0. Não some nem arredonde: copie os valores impressos. "cupom_app" é o desconto do aplicativo (positivo) e "taxas" é serviço + entrega. Não inclua nome, CPF nem endereço do comprador.`;
  function parseCestaJSON(text) {
    let t = String(text || '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
    t = t.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1');
    let j; try { j = JSON.parse(t); } catch (e) { return null; }
    const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] != null && o[k] !== '') return o[k]; return ''; };
    const arr = pick(j, 'itens', 'items', 'produtos');
    if (!Array.isArray(arr) || !arr.length) return null;
    const d = { source: 'ia', items: [], marketName: String(pick(j, 'mercado', 'market', 'loja')).slice(0, 60), marketCnpj: String(pick(j, 'cnpj')).replace(/\D/g, ''), date: '', channel: '', order: String(pick(j, 'pedido', 'order')) };
    const dt = String(pick(j, 'data', 'date')); const m1 = dt.match(/(\d{4})-(\d{2})-(\d{2})/), m2 = dt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m1) d.date = m1[0]; else if (m2) d.date = `${m2[3]}-${m2[2]}-${m2[1]}`;
    const ch = String(pick(j, 'canal', 'channel')).toLowerCase(); if (/ifood/.test(ch)) d.channel = 'ifood'; else if (/app/.test(ch)) d.channel = 'app'; else if (/site/.test(ch)) d.channel = 'site';
    const tn = num(String(pick(j, 'total_nota', 'total')).replace(',', '.')); if (tn > 0) d.printedTotal = tn;
    const tp = num(String(pick(j, 'total_pago')).replace(',', '.')); if (tp > 0) d.paidTotal = tp;
    if (tp > 0) d.paid = tp;
    const cp = Math.abs(num(String(pick(j, 'cupom_app', 'cupom', 'descontos')).replace(',', '.'))); if (cp > 0) d.coupon = cp;
    const fe = Math.abs(num(String(pick(j, 'taxas', 'taxa')).replace(',', '.'))); if (fe > 0) d.fees = fe;
    arr.forEach((r, k) => {
      const name = String(pick(r, 'nome', 'name', 'descricao')).trim(); if (!name) return;
      const n = (x) => { const v = num(String(x).replace(',', '.')); return isFinite(v) ? v : NaN; };
      let qty = n(pick(r, 'qtd', 'qty', 'quantidade')); if (!(qty > 0)) qty = 1;
      const disc = Math.abs(n(pick(r, 'desconto', 'discount')) || 0);
      let unitPrice = n(pick(r, 'preco_unitario', 'unitPrice', 'preco')), total = n(pick(r, 'total', 'valor'));
      if (!isFinite(total) && isFinite(unitPrice)) total = round(qty * unitPrice, 2);
      if (!isFinite(unitPrice) && isFinite(total)) unitPrice = round(total / qty, 4);
      if (!isFinite(total)) return;
      const net = round(total - disc, 2); // recalcula: preço líquido = total - desconto do item
      const eanRaw = String(pick(r, 'ean', 'codigo_barras')).replace(/\D/g, '');
      const it = { seq: k + 1, name, ean: validEAN(eanRaw) ? cleanEAN(eanRaw) : '', scode: String(pick(r, 'codigo', 'code')).trim(), qty, unit: String(pick(r, 'unidade', 'unit') || 'UN').toUpperCase(), unitPrice: round(net / qty, 4), total: net, raw: name };
      if (disc > 0) it.discount = disc;
      if (!(Math.abs(qty * unitPrice - total) < 0.06)) { it.check = true; it.note = 'A conta quantidade × preço não bateu na resposta da IA. Confira.'; }
      d.items.push(it);
    });
    return d.items.length ? d : null;
  }

  /* ---------- print do pedido do iFood (texto lido da imagem) ---------- */
  const looksIfood = (t) => /ifood/i.test(t) || (/pedido/i.test(t) && /taxa\s+de\s+(?:entrega|servi[cç]o)/i.test(t) && /\bR\$\s*\d/.test(t));
  function parseIfoodText(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const d = { source: 'ifood', channel: 'ifood', items: [], marketName: '', marketCnpj: '', date: '', order: '' };
    const money = (l) => { const m = l.match(/(-?)\s*R?\$?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})\s*$/); return m ? { v: num(m[2]), neg: m[1] === '-' } : null; };
    const om = String(text).match(/pedido\s*(?:n[ºo°.]*\s*)?#?\s*(\d{3,})/i); if (om) d.order = om[1];
    const dm = String(text).match(/(\d{2})\/(\d{2})\/(20\d{2})/); if (dm) d.date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    let pendingName = null, inItems = false, sub = 0;
    const tail = /^(subtotal|taxa|total|descontos?|cupom|desconto|sacola|forma de pagamento|pagamento|cobran[cç]a|entrega|endere[cç]o)/i;
    for (const line of lines) {
      const m = money(line), label = line.replace(/-?\s*R?\$?\s*[\d.]+,\d{2}\s*$/, '').trim();
      if (/^subtotal/i.test(label) && m) { sub = m.v; inItems = false; continue; }
      if (/taxa\s+de\s+(entrega|servi[cç]o)|entrega|servi[cç]o/i.test(label) && m && !/^\d+\s*x/i.test(label)) { d.fees = round((d.fees || 0) + m.v, 2); inItems = false; continue; }
      if (/^(descontos?|cupom|desconto)/i.test(label) && m) { d.coupon = round((d.coupon || 0) + m.v, 2); inItems = false; continue; }
      if (/^total/i.test(label) && m) { d.paid = m.v; inItems = false; continue; }
      if (/itens do pedido|seus itens|^itens/i.test(line)) { inItems = true; continue; }
      if (!d.marketName && !inItems && /[A-Za-zÀ-ÿ]{4}/.test(line) && !/pedido|ifood|entregue|conclu[ií]do|^\d/i.test(line) && !m) { d.marketName = line.slice(0, 60); continue; }
      if (tail.test(label) && !/^\d+\s*x/i.test(label)) continue;
      const q = line.match(/^(\d+)\s*[xX×]\s+(.+)$/);
      if (q && !m) { pendingName = { qty: parseInt(q[1], 10), name: q[2].trim() }; continue; }
      if (q && m) { const nm = q[2].replace(/\s*R?\$?\s*[\d.]+,\d{2}\s*$/, '').trim(); const qty = parseInt(q[1], 10); d.items.push({ seq: d.items.length + 1, name: nm, ean: '', qty, unit: 'UN', unitPrice: round(m.v / qty, 4), total: m.v, raw: nm }); pendingName = null; continue; }
      if (m && !label && pendingName) { const pn = pendingName; d.items.push({ seq: d.items.length + 1, name: pn.name, ean: '', qty: pn.qty, unit: 'UN', unitPrice: round(m.v / pn.qty, 4), total: m.v, raw: pn.name }); pendingName = null; continue; }
      if (!m && inItems && /[A-Za-zÀ-ÿ]{3}/.test(line) && !/indispon[ií]vel/i.test(line)) pendingName = { qty: 1, name: line };
    }
    d.subtotal = sub;
    return d.items.length ? d : null;
  }
  // Une o texto do cupom/foto a um rascunho já lido pelo QR: completa EAN, código do mercado e descontos
  function mergeCupom(draft, cupom) {
    const out = { matched: 0, eans: 0, discounts: 0, total: draft.items.length };
    if (!cupom || !cupom.items || !cupom.items.length) return out;
    const used = new Set(), samePos = cupom.items.length === draft.items.length;
    draft.items.forEach((it, k) => {
      let c = null;
      const gross = (x) => round(x.total + (x.discount || 0), 2);
      // 1) mesma posição e mesmo valor bruto
      if (samePos && Math.abs(gross(cupom.items[k]) - gross(it)) < 0.011 && !used.has(k)) { c = cupom.items[k]; used.add(k); }
      // 2) mesmo valor bruto e mesma quantidade, ainda não usado
      if (!c) { const j = cupom.items.findIndex((x, n) => !used.has(n) && Math.abs(gross(x) - gross(it)) < 0.011 && Math.abs(x.qty - it.qty) < 0.0005); if (j >= 0) { c = cupom.items[j]; used.add(j); } }
      if (!c) return;
      out.matched++;
      if (c.ean && !it.ean) { it.ean = c.ean; out.eans++; }
      if (c.scode && !it.scode) it.scode = c.scode;
      if (c.discount > 0 && !(it.discount > 0)) {
        // a página da Fazenda traz o valor cheio: aplica o desconto do cupom ao item
        it.discount = c.discount; it.qd = c.discount;
        if (Math.abs(it.total - gross(c)) < 0.011) { it.total = round(it.total - c.discount, 2); it.unitPrice = round(it.total / it.qty, 4); }
        out.discounts++;
      }
    });
    if (cupom.date && !draft.date) draft.date = cupom.date;
    return out;
  }

  function parseReceiptText(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const draft = { source: 'ocr', items: [], rawText: text, marketName: '', marketCnpj: '', date: '', city: '' };

    // cabeçalho: CNPJ, nome do mercado, data
    const cnpjRe = /(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})-(\d{2})|CNPJ\D{0,3}(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})\b/i;
    for (let i = 0; i < Math.min(lines.length, 14); i++) {
      const raw = lines[i].match(cnpjRe), m = raw && (raw[1] ? raw.slice(1, 6) : raw.slice(6, 11));
      if (m && !draft.marketCnpj) {
        draft.marketCnpj = m.join('');
        const before = lines.slice(Math.max(0, i - 3), i).filter((l) => /[A-Za-zÀ-ÿ]{3}/.test(l) && !/^(CNPJ|CPF|DANFE|NFC)/i.test(l));
        const same = lines[i].replace(/CNPJ[:\s]*/i, '').replace(cnpjRe, '').trim();
        draft.marketName = (before[0] || (/[A-Za-zÀ-ÿ]{3}/.test(same) ? same : '')).slice(0, 60);
      }
    }
    if (!draft.marketName) draft.marketName = (lines.find((l) => /[A-Za-zÀ-ÿ]{4}/.test(l)) || '').slice(0, 60);
    const dm = String(text).match(/(\d{2})\s?\/\s?(\d{2})\s?\/\s?(20\d{2})/);
    if (dm && +dm[2] >= 1 && +dm[2] <= 12 && +dm[1] >= 1 && +dm[1] <= 31) draft.date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const tm = String(text).match(/VALOR\s*(?:TOTAL\s*(?:\(R\$\))?|PAGO|A PAGAR)?\s*(?:R\$)?\s*:?\s*(\d+[.,]\d{2})\s*$/im) || String(text).match(/VALOR:\s*(\d+[.,]\d{2})/i);
    if (tm) draft.printedTotal = num(tm[1]);

    const chm = String(text).replace(/(\d)\s+(?=\d{4}\b)/g, '$1').match(/\b(\d{44})\b/) || String(text).match(/((?:\d{4}\s){10}\d{4})/);
    if (chm) draft.chave = chm[1].replace(/\s/g, '');
    const em = String(text).match(/Emiss[ãa]o:?\s*(\d{2})\/(\d{2})\/(20\d{2})/i);
    if (em) draft.date = `${em[3]}-${em[2]}-${em[1]}`;
    const qt = String(text).match(/Qtde\.?\s*total\s*de\s*itens\s*:?\s*(\d+)/i);
    if (qt) draft.printedCount = parseInt(qt[1], 10);

    const st = '(?:\\s+[A-Z]{1,2}\\d{0,2})?'; // coluna ST do cupom (T06, F, I...)
    const qtyLineRe = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\s*[xX*]\\s*(?:R\\$\\s*)?(\\d+[.,]\\d{2,4})${st}\\s+(?:R\\$\\s*)?(\\d+[.,]\\d{2})$`, 'i');
    const fullRe = new RegExp(`^(?:(\\d{1,3})\\s+)?(?:(\\d{8,14})\\s+)?(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\s*[xX*]?\\s*(?:R\\$\\s*)?(\\d+[.,]\\d{2,4})${st}\\s+(?:R\\$\\s*)?(\\d+[.,]\\d{2})$`, 'i');
    const descRe = /^(?:(\d{1,3})\s+)?(?:(\d{8,14})\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .,%\/\-]{2,})$/;
    const push = (it) => { draft.items.push(Object.assign(it, { check: !!it.check || !(Math.abs(it.qty * it.unitPrice - it.total) < 0.06) })); };
    const applyDisc = (seq, amt) => {
      const it = (seq != null && draft.items.find((x) => x.seq === seq)) || draft.items[draft.items.length - 1];
      if (!it || !(amt > 0)) return;
      it.total = round(it.total - amt, 2); it.unitPrice = round(it.total / it.qty, 4); it.discount = round((it.discount || 0) + amt, 2);
    };

    let pending = null, discSeq = null, inTable = false, ended = false;
    for (const line of lines) {
      if (/^\W{0,3}desconto\s+sobre\s+(?:o\s+)?item/i.test(line)) { // linha logo abaixo do item: vale para o item de cima
        const am = line.match(/(\d+[.,]\d{2})\s*\S{0,2}$/); if (am) applyDisc(null, Math.abs(num(am[1]))); continue;
      }
      if (/^\W{0,3}Desc\w*.{0,14}?(?:ite[mn]|[íiIÍ]?t?e[nm])\s*[:;]/i.test(line)) {
        const am = line.match(/(\d+[.,]\d{2})\s*\S{0,2}$/);
        if (am) { applyDisc(null, Math.abs(num(am[1]))); discSeq = null; } else discSeq = true;
        continue;
      }
      if (discSeq && /^\S{0,2}\s*\d+[.,]\d{2}\s*\S{0,2}$/.test(line)) { applyDisc(null, Math.abs(num(line.replace(/[^\d.,]/g, '')))); discSeq = null; continue; }
      if (SKIP.test(norm(line)) && !fullRe.test(line)) {
        pending = null;
        const nl = norm(line);
        if (/\b(CODIGO|DESCRICAO|VL UNIT)\b/.test(nl)) inTable = true;
        if (draft.items.length && /\b(TOTAL|CONSUMIDOR|CHAVE|PROTOCOLO|AUTORIZACAO|CARTAO|CREDITO|DEBITO|PIX|DINHEIRO|TROCO)\b/.test(nl)) ended = true;
        continue;
      }
      const at = atacItem(line);
      if (at) { push(at); pending = null; continue; }
      let m = line.match(fullRe);
      if (m) {
        push({ seq: m[1] ? parseInt(m[1], 10) : undefined, name: m[3].trim(), ean: validEAN(m[2]) ? m[2] : '', qty: num(m[4]), unit: m[5].toUpperCase(), unitPrice: num(m[6]), total: num(m[7]), raw: m[3].trim() });
        pending = null; continue;
      }
      m = line.match(qtyLineRe);
      if (m && pending) {
        push({ seq: pending.seq, name: pending.name, ean: pending.ean, qty: num(m[1]), unit: m[2].toUpperCase(), unitPrice: num(m[3]), total: num(m[4]), raw: pending.name });
        pending = null; continue;
      }
      const lo = looseItem(line, draft.items.length + 1);
      if (lo) { push(lo); pending = null; continue; }
      m = line.match(descRe);
      if (m && /[A-Za-zÀ-ÿ]{3}/.test(m[3]) && !/\d+[.,]\d{2}$/.test(line)) { pending = { name: m[3].trim(), ean: validEAN(m[2]) ? m[2] : '', seq: m[1] ? parseInt(m[1], 10) : undefined }; continue; }
      // último recurso: "NOME DO PRODUTO   12,90" (assume quantidade 1, pede conferência)
      m = line.match(/^(?:(\d{1,3})\s+)?(?:\d{8,14}\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .,%\/\-]{3,}?)\s+(\d+[.,]\d{2})$/);
      if (m) {
        const total = num(m[3]);
        const nm = cleanName(m[2]);
        if (!ended && (inTable || draft.items.length) && /[A-Za-zÀ-ÿ]{2}/.test(nm)) push({ seq: draft.items.length + 1, name: nm, ean: '', qty: 1, unit: 'UN', unitPrice: total, total, raw: nm, check: true });
        pending = null;
      }
    }
    repairBySum(draft);
    return draft;
  }

  /* ---------- página da Fazenda (ConsultaQRCode da NFC-e de SP): texto copiado da página ---------- */

  function parseSefazText(text) {
    const raw = String(text || '');
    const f = raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    const draft = { source: 'page', items: [], rawText: raw, marketName: '', marketCnpj: '', date: '', city: '', discount: 0 };

    let chave = (raw.match(/[?&]p=(\d{44})/) || [])[1] || '';
    if (!chave) { const g = f.match(/((?:\d{4} ){10}\d{4})/); if (g) chave = g[1].replace(/ /g, ''); }
    if (chave.length === 44) draft.id = chave;

    let start = 0;
    const cm = f.match(/CNPJ:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
    if (cm) {
      draft.marketCnpj = cm[1].replace(/\D/g, '');
      draft.marketName = f.slice(0, cm.index).replace(/^.*ELETR[ÔO]NICA\s*/i, '').trim().slice(0, 70);
      const end = cm.index + cm[0].length;
      const am = f.slice(end).match(/^\s*(.*?,\s*[A-Z]{2})\s+/);
      if (am) {
        start = end + am[0].length;
        const parts = am[1].split(',').map((x) => x.trim()).filter(Boolean);
        if (parts.length >= 2) draft.city = parts[parts.length - 2];
      } else start = end;
    } else if (chave.length === 44) draft.marketCnpj = chave.slice(6, 20);

    const seg = f.slice(start);
    // Cobre a página (nome, Código, Qtde, Unit, Total) e o print dela lido por OCR (Vl. Total antes de Qtde, quantidade às vezes perdida)
    const tail = /\(\s*C[oó]digo:?\s*([^)]*?)\s*\)\s*(?:V[Il1]\.?\s*Total:?\s*)?Qtde\.?:?\s*([\d.,]*)\s*UN?:?\s*(\S*)\s*V[Il1]\.?\s*Unit\.?:?\s*([\d.,]+)\s*(?:V[Il1]\.?\s*Total:?\s*)?([\d.,]+)/gi;
    let m, last = 0;
    while ((m = tail.exec(seg))) {
      const name = seg.slice(last, m.index).trim().replace(/^(?:V[Il1]\.?\s*Total:?\s*)+/i, '').replace(/\s+[|!l]$/, ' I');
      last = tail.lastIndex;
      const unitPrice = num(m[4]), total = num(m[5]);
      let qty = m[2] ? num(m[2]) : NaN, guess = false;
      if (!isFinite(qty) || qty <= 0) { const r = unitPrice > 0 ? total / unitPrice : 1; qty = Math.abs(r - Math.round(r)) < 0.02 && r >= 1 ? Math.round(r) : 1; guess = !m[2]; }
      if (!name) continue;
      const bad = !(Math.abs(qty * unitPrice - total) < 0.06);
      draft.items.push({ name, ean: '', code: m[1].trim(), qty, unit: (m[3] || 'UN').toUpperCase().replace(/[^A-Z]/g, '') || 'UN', unitPrice, total, raw: name, check: bad || (guess && qty !== 1) });
    }
    const val = (re) => { const x = f.match(re); return x ? num(x[1]) : NaN; };
    const pm = Array.from(f.matchAll(/pagar\s*R\$:?\s*([\d.,]+)/gi)), pagar = pm.length ? num(pm[pm.length - 1][1]) : NaN;
    const desc = val(/Descontos?\s*R\$:?\s*([\d.,]+)/i), bruto = val(/Valor total\s*R\$:?\s*([\d.,]+)/i);
    draft.discount = isFinite(desc) ? desc : 0;
    if (isFinite(pagar)) draft.total = pagar;
    // total impresso já líquido (valor a pagar): é com ele que a soma dos itens menos o desconto precisa fechar
    if (isFinite(pagar)) draft.printedTotal = pagar; else if (isFinite(bruto)) draft.printedTotal = Math.round((bruto - draft.discount) * 100) / 100;
    const dm = f.match(/Emiss[aã]o:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
    if (dm) draft.date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    return draft;
  }


  /* ---------- DANFE (NF-e modelo 55, sem QR code) lido por OCR em modo "bloco" ---------- */
  const DANFE_UNIT = '(?:UND?|UNI|UNL|UN[A-Z]?|KG9?|BDJ?|PCT|LTA|CX|FD|PT|SC|GRF|LT|FR|L)';
  const looksDanfe = (t) => (String(t).match(/DADOS DO PRODUTO|C[ÁA]LCULO DO IMPOSTO|DESTINAT[ÁA]RIO|NATUREZA D[AO]\s*OPERA|PROTOCOLO\s*D?E?\s*AUTORIZA|FOLHA\s*\d\s*\/\s*\d/gi) || []).length >= 2 && /\b[1-7]\d{3}\b/.test(t);
  // valores possíveis de uma coluna numérica: como está escrita (vírgula, barra ou espaço no lugar da vírgula) e, com "noisy", tirando 1 dígito de ruído
  function numVariants(tok, dec) {
    const out = [], seen = new Set();
    const add = (v, noisy) => { if (!isFinite(v) || v <= 0) return; const k = v + '|' + noisy; if (seen.has(k)) return; seen.add(k); out.push({ v, noisy }); };
    const sm = tok.match(/^\D*(\d+)\s*[,\/.]+\s*(\d+)\D*$/);
    const D = tok.replace(/\D/g, '');
    if (sm) { if (dec === 3 && sm[2].length > 3) add(parseFloat(sm[1] + '.' + sm[2].slice(-3)), 0); add(parseFloat(sm[1] + '.' + sm[2]), 0); } else if (D && D.length <= 11) add(parseInt(D, 10) / Math.pow(10, dec), 0);
    if (D.length >= 3 && D.length <= 11) for (let i = 0; i < D.length; i++) add(parseInt(D.slice(0, i) + D.slice(i + 1), 10) / Math.pow(10, dec), 1);
    return out;
  }
  function parseDanfeRow(rest) {
    // colunas separadas por vãos de 3+ espaços: qtd, unitário, total, depois descontos/bases (ignorados)
    const cols = rest.replace(/[|\[\]()]/g, ' ').split(/\s{3,}/).map((x) => x.trim()).filter((x) => x).slice(0, 4);
    const qv = cols[0] ? numVariants(cols[0], 3) : [], uv = cols[1] ? numVariants(cols[1], 5) : [], tv = cols[2] ? numVariants(cols[2], 2) : [];
    const qOk = (x) => x.v > 0 && x.v < 1000, uOk = (x) => x.v > 0.01 && x.v < 5000;
    for (const maxNoise of [0, 1]) { // 1º: números como estão; 2º: tirando 1 dígito de ruído de um só número
      let best = null;
      for (const q of qv) { if (!qOk(q)) continue;
        for (const u of uv) { if (!uOk(u)) continue;
          for (const t of tv) {
            const nz = q.noisy + u.noisy + t.noisy; if (nz !== maxNoise) continue;
            const e = Math.abs(q.v * u.v - t.v);
            if (e <= 0.006 && (!best || e < best.e)) best = { e, qty: q.v, unitPrice: u.v, total: t.v, noisy: nz, ok: true };
          } } }
      if (best) return best;
    }
    // não fechou: usa qtd e unitário como estão, calcula o total e marca o item para conferência
    const q0 = qv.find((x) => !x.noisy && qOk(x)), u0 = uv.find((x) => !x.noisy && uOk(x)), t0 = tv.find((x) => !x.noisy && x.v > 0);
    let qty = q0 ? q0.v : NaN;
    if (!isFinite(qty) && u0 && t0) { const r = t0.v / u0.v; if (r >= 0.9 && r < 30 && u0.v >= 0.2) qty = r >= 1 ? Math.round(r) : r; } // sem a quantidade: estima pelo total
    if (!isFinite(qty)) qty = 1;
    return { qty, unitPrice: u0 ? u0.v : '', total: u0 ? Math.round(qty * u0.v * 100) / 100 : 0, noisy: 1, ok: false };
  }
  function parseDanfeText(text) {
    const raw = String(text || ''), lines = raw.split('\n');
    const f = raw.replace(/\s+/g, ' ');
    const draft = { source: 'ocr', danfe: true, items: [], rawText: raw, marketName: '', marketCnpj: '', date: '', city: '', discount: 0 };
    const g = f.match(/((?:\d{4} ){10}\d{4})/); if (g) { draft.id = g[1].replace(/ /g, ''); draft.marketCnpj = draft.id.slice(6, 20); }
    const cm = f.match(/CNPJ:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i); if (cm && !draft.marketCnpj) draft.marketCnpj = cm[1].replace(/\D/g, '');
    const dm = f.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/); if (dm && +dm[2] >= 1 && +dm[2] <= 12) draft.date = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const fm = f.match(/FOLHA\s*(\d+)\s*\/\s*(\d+)/i); if (fm) draft.folha = [+fm[1], +fm[2]];
    // total da nota: maior valor na linha do rótulo "VALOR TOTAL ... PRODUTOS" e na seguinte
    const li = lines.findIndex((l) => /VALOR\s+TOTA.*PRODUTOS/i.test(l));
    if (li >= 0) {
      const vals = (lines[li] + ' ' + (lines[li + 1] || '')).match(/\d{1,3}(?:\.\d{3})*,\d{2}\b/g) || [];
      const mx = Math.max(0, ...vals.map(num)); if (mx > 0) draft.printedTotal = mx;
    }
    const noise = /^(NRO|NNRO|NNW|WI|RN|NS)$/i;
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n];
      const m = line.match(new RegExp('[|/\\s)\\]\\[]\\s*([1-7]\\d{3})\\s*[|\\[\\s]*(' + DANFE_UNIT + ')\\b\\.?\\s*(.*)$', 'i'));
      if (!m) continue;
      const nums = parseDanfeRow(m[3]);
      let left = line.slice(0, m.index);
      left = left.replace(/[\s|(\[]*[A-Za-z]{0,2}\d{5,9}[\s|(\[\d/]*$/, '');
      const bar = Math.max(left.lastIndexOf('|'), left.lastIndexOf('['));
      if (bar >= 0 && bar < left.length - 4) left = left.slice(bar + 1);
      let w = left.trim().split(/\s+/);
      while (w.length > 1 && (/\d/.test(w[0]) || w[0].length < 3 || noise.test(w[0]) || (!/[AEIOUaeiou]/.test(w[0]) && w[0].length <= 4 && !/\./.test(w[0])))) w.shift();
      let name = w.join(' ').replace(/^(?:HF|RF)\s*\.\s*/i, '').replace(/(?<=[A-Za-z])\.(?=[A-Za-z])/g, ' ').replace(/^[^A-Za-z]+/, '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      // segunda linha do item: embalagem ("BDJ 1 X 1 20UND", "LTA 1 X 1 300G", "PCT 1 X 1 8X90G")
      for (let k = n + 1; k <= n + 2 && k < lines.length; k++) {
        if (new RegExp('[|/\\s)]\\s*[1-7]\\d{3}\\s*[|\\[\\s]*' + DANFE_UNIT + '\\b\\.?\\s+\\d', 'i').test(lines[k])) break;
        const pk = lines[k].match(/\b(?:UND?|UN|BDJ|PCT|LTA|CX|FD|GRF|SC|PT|FR)\s*\d+\s*[xX]\s*\d+\s+(\d[\d.,]*\s*(?:X\s*\d[\d.,]*\s*)?(?:UND|UN|G|GR|KG|ML|L))\b/i);
        if (pk) { if (!/\d\s*(?:G|GR|KG|ML|L|UN|UND|U)\b/i.test(name)) name += ' ' + pk[1].replace(/\s+/g, ''); break; }
      }
      const unitRaw = m[2].toUpperCase(), unit = /^KG/.test(unitRaw) ? 'KG' : unitRaw === 'L' || unitRaw === 'LT' ? 'L' : 'UN';
      const qty = round3(nums.qty);
      draft.items.push({ name, ean: '', qty, unit, unitPrice: nums.unitPrice === '' ? '' : Math.round(nums.unitPrice * 1e4) / 1e4, total: Math.round(nums.total * 100) / 100, raw: name, check: !nums.ok });
    }
    return draft;
  }
  const round3 = (n) => Math.round(n * 1000) / 1000;

  // Texto qualquer (OCR/PDF): reconhece o layout da página/print da Fazenda e usa o leitor certo
  const looksPage = (t) => /\(\s*C[oó]digo:?[^)]*\)/i.test(t) && /Unit/i.test(t) && /Qtde/i.test(t);
  function parseAny(text) {
    if (looksIfood(text) && !/cesta-certa-v1/.test(text)) { const f = parseIfoodText(text); if (f) return f; }
    if (/cesta-certa-v1/.test(text)) { const j = parseCestaJSON(text); if (j) return j; }
    if (looksPage(text)) { const d = parseSefazText(text); if (d.items.length) return d; }
    if (looksDanfe(text)) { const d = parseDanfeText(text); if (d.items.length) return d; }
    return parseReceiptText(text);
  }

  const api = { parseNFeXML, parseReceiptText, parseSefazText, parseDanfeText, looksDanfe, parseAny, looseItem, conferir, parseCestaJSON, CESTA_PROMPT, parseIfoodText, looksIfood, mergeCupom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parser = api;
})(typeof self !== 'undefined' ? self : this);
