/* Folheto / banner / etiqueta: transforma o texto lido (OCR) ou o JSON do Claude em uma lista de ofertas { name, price, unit }. Puro, sem DOM. */
(function (root) {
  'use strict';
  const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const NOISE = /\b(OFERTAS?|PROMOCAO|PROMO|LEVE|PAGUE|VALIDO|VALIDADE|ATE|ESTOQUE|ENQUANTO|DURAREM|SOMENTE|SO|APENAS|CADA|DE|POR|PRECO|ESPECIAL|IMPERDIVEL|SEMANA|FINAL|TERCA|QUARTA|QUINTA|SEXTA|SABADO|DOMINGO|SEGUNDA|LOJA|LOJAS|CONFIRA|APROVEITE|CLIENTE|CARTAO|CLUBE|LIMITE|UNIDADES|ECONOMIZE)\b/g;
  const PRICE = /(?:R\s*\$\s*)?(\d{1,3}(?:\.\d{3})*|\d{1,3})\s*[,.]\s*(\d{2})(?!\d)/g;
  const money = (a, b) => parseFloat(String(a).replace(/\./g, '') + '.' + b);

  function findPrices(line) {
    const out = []; let m; PRICE.lastIndex = 0;
    while ((m = PRICE.exec(line))) { const v = money(m[1], m[2]); if (v >= 0.2 && v <= 2000) out.push({ v, raw: m[0], at: m.index }); }
    if (!out.length) { // "12 99" ou "R$ 12 99" (preço grande e centavos separados)
      const g = line.match(/(?:R\s*\$\s*)(\d{1,3})\s+(\d{2})(?!\d)/) || line.match(/^\D{0,4}(\d{1,3})\s+(\d{2})\D{0,4}$/);
      if (g) { const v = money(g[1], g[2]); if (v >= 0.2 && v <= 2000) out.push({ v, raw: g[0], at: g.index }); }
    }
    return out;
  }
  const unitOf = (s) => (/\b(KG|KILO|QUILO|QUILOGRAMA)\b|\/\s*KG|\bKG\b/.test(strip(s)) ? 'KG' : /\bLT?\b|\bLITRO/.test(strip(s)) && !/\d\s*L\b/.test(strip(s)) ? 'L' : 'UN');
  function cleanName(s) {
    s = String(s || '').replace(/R\s*\$/gi, ' ').replace(/[|_*•·■□●◆►»«=~^`´"“”<>{}\[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
    const w = strip(s).replace(NOISE, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    return { text: s, letters: (w.match(/[A-Z]/g) || []).length, words: w.split(' ').filter((x) => /[A-Z]{2,}/.test(x)).length };
  }
  const titleFix = (s) => s.replace(/\s+/g, ' ').replace(/\b(KG|LT)\b\.?$/i, '').replace(/[-–/ ]+$/, '').trim();

  function parse(text) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const items = []; let pending = [], orphan = null;
    const push = (name, price, ctx) => { name = titleFix(name); if (name.replace(/[^A-Za-zÀ-ú]/g, '').length < 3) return; items.push({ name, price, unit: unitOf(ctx || name) }); };
    lines.forEach((line) => {
      const pr = findPrices(line);
      if (pr.length) {
        let rest = line; pr.forEach((p) => { rest = rest.replace(p.raw, ' '); });
        const c = cleanName(rest), price = pr[pr.length - 1].v;
        if (c.letters >= 4 && c.words >= 1) {
          let name = c.text;
          if (c.letters < 8 && pending.length) name = pending.pop() + ' ' + name;
          push(name, price, line); pending = []; orphan = null;
        } else if (pending.length) { push(pending.slice(-2).join(' '), price, line + ' ' + pending.join(' ')); pending = []; orphan = null; }
        else orphan = { price, ctx: line };
      } else {
        const c = cleanName(line);
        if (c.letters < 4 || c.words < 1) return;
        if (orphan) { push(c.text, orphan.price, orphan.ctx + ' ' + line); orphan = null; }
        else { pending.push(c.text); if (pending.length > 2) pending.shift(); }
      }
    });
    return items;
  }

  // valida o JSON devolvido pelo Claude
  function fromJSON(j) {
    j = j || {};
    const num = (v) => (typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')));
    const items = (Array.isArray(j.items) ? j.items : []).map((i) => ({
      name: String(i && i.name || '').trim(), price: num(i && i.price), unit: /^(KG|L|DZ)$/i.test(i && i.unit) ? String(i.unit).toUpperCase() : 'UN', note: String(i && i.note || '').trim(),
    })).filter((i) => i.name && isFinite(i.price) && i.price > 0);
    const vu = /^\d{4}-\d{2}-\d{2}$/.test(String(j.validUntil || '')) ? j.validUntil : '';
    return { market: String(j.market || '').trim(), validUntil: vu, kind: /^(folheto|etiqueta|banner)$/i.test(j.kind) ? String(j.kind).toLowerCase() : '', items };
  }
  const PROMPT = 'Esta imagem é um folheto, banner ou etiqueta de preço de um supermercado brasileiro. Leia TODOS os produtos com preço que aparecem. ' +
    'Responda somente com JSON no formato {"market": nome do mercado ou "", "validUntil": "AAAA-MM-DD" ou "", "kind": "folheto"|"etiqueta"|"banner", "items": [{"name": "produto com marca e tamanho como aparece, ex: Manteiga Presidente 200g", "price": número em reais, "unit": "KG" se o preço é por quilo, "L" por litro, "DZ" por dúzia, senão "UN", "note": observação curta como leve 3 pague 2, ou ""}]}. ' +
    'Se houver preço "de" e "por", use o preço "por". Não invente itens ilegíveis.';

  const api = { parse, fromJSON, findPrices, PROMPT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Flyer = api;
})(typeof self !== 'undefined' ? self : this);
