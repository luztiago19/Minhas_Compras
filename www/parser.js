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
    if (looksPage(text)) { const d = parseSefazText(text); if (d.items.length) return d; }
    if (looksDanfe(text)) { const d = parseDanfeText(text); if (d.items.length) return d; }
    return parseReceiptText(text);
  }

  const api = { parseNFeXML, parseReceiptText, parseSefazText, parseDanfeText, looksDanfe, parseAny, looseItem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Parser = api;
})(typeof self !== 'undefined' ? self : this);
