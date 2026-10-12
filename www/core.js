/* Núcleo do app: regras de negócio puras (sem DOM), testáveis em Node. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function prettyName(s) {
    const small = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'C', 'COM', 'EM', 'P', 'PARA']);
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').split(' ').map((w, i) => {
      if (/^\d/.test(w)) return w.replace(/(\d)(kg|g|ml|l|un|und|lt|mg)\b/, (m, d, u) => d + (u === 'l' ? 'L' : u));
      if (i > 0 && small.has(w.toUpperCase())) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  // Aceita "1.234,56", "4,99", "4.99", "0.500"
  function num(s) {
    if (typeof s === 'number') return s;
    s = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    return parseFloat(s);
  }

  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const daysBetween = (a, b) => (parseDate(b) - parseDate(a)) / DAY;
  const toISO = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayISO = () => toISO(new Date());
  const addDays = (iso, n) => { const d = new Date(parseDate(iso) + n * DAY); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };

  // GTIN-14 com zero à esquerda vira EAN-13; códigos internos com muitos zeros não contam como EAN.
  const cleanEAN = (e) => { let d = String(e || '').replace(/\D/g, ''); while (d.length > 13 && d[0] === '0') d = d.slice(1); return d; };
  // dígito verificador GTIN (EAN-8, UPC-A de 12, EAN-13, GTIN-14): serve para confiar ou não num código digitado ou lido por OCR
  const gtinOK = (c) => {
    c = cleanEAN(c); if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(c)) return false;
    const d = c.split('').map(Number), chk = d.pop();
    let sum = 0; for (let i = d.length - 1, w = 3; i >= 0; i--, w = 4 - w) sum += d[i] * w;
    return (10 - (sum % 10)) % 10 === chk;
  };
  // zeros demais na frente: é código interno da loja preenchido com zeros, não código de barras
  const looksInternal = (d) => d.length >= 8 && (d.length === 8 ? /^0{4}/ : /^0{6}/).test(d);
  // código de barras válido: tamanho certo, dígito verificador certo e não parecer código interno
  const validEAN = (e) => { const d = cleanEAN(e); return gtinOK(d) && !looksInternal(d); };
  // código interno do mercado impresso com zeros na frente (ex.: 00000000007129 = código 7129 da loja). Devolve '' se for outra coisa.
  const internalCode = (e) => {
    const d = String(e || '').replace(/\D/g, '');
    return looksInternal(d) ? d.replace(/^0+/, '') : '';
  };
  const round = (n, d) => { const f = Math.pow(10, d); return Math.round((n + Number.EPSILON) * f) / f; };

  function resolveKey(aliases, ean, name) {
    let k = validEAN(ean) ? 'e:' + cleanEAN(ean) : 'n:' + norm(name);
    let guard = 0;
    while (aliases[k] && aliases[k] !== k && guard++ < 10) k = aliases[k];
    return k;
  }

  function marketKey(cnpj, name) {
    const d = String(cnpj || '').replace(/\D/g, '');
    return d.length === 14 ? d : 'm:' + norm(name);
  }

  const newState = () => ({
    purchases: [], items: [], products: [], aliases: {},
    settings: { horizon: 30, cover: 5, window: 12 },
    shop: { manual: [], checked: {}, offers: [] },
  });

  /* ---------- gravação de compras ---------- */

  const Std = root.Std || (typeof require !== 'undefined' ? require('./std.js') : null);
  const followAlias = (aliases, k) => { let g = 0; while (aliases[k] && aliases[k] !== k && g++ < 10) k = aliases[k]; return k; };

  /* Descobre a qual produto do catálogo um item pertence, e (se for novo) cria. Retorna o produto.
     Ordem: nome comum confirmado que já existe > código de barras > texto da nota já aprendido > nome comum igual > novo. */
  function resolveProduct(S, raw, stdName, info, confirmed) {
    const ean = validEAN(raw.ean) ? cleanEAN(raw.ean) : '';
    const eanKey = ean ? 'e:' + ean : '', textKey = 'n:' + norm(raw.name), nameKey = 'n:' + norm(stdName);
    const byKey = (k) => S.products.find((p) => p.key === k);
    const byName = S.products.find((p) => norm(p.name) === norm(stdName));
    let prod = null;
    if (confirmed && byName) prod = byName;
    if (!prod && eanKey) prod = byKey(followAlias(S.aliases, eanKey));
    const sKey = storeKey(raw);
    if (!prod && sKey) prod = byKey(followAlias(S.aliases, sKey));
    if (!prod) { const k = followAlias(S.aliases, textKey); if (k !== textKey) prod = byKey(k); }
    if (!prod && byName) prod = byName;
    if (!prod) {
      const key = eanKey ? followAlias(S.aliases, eanKey) : followAlias(S.aliases, nameKey);
      prod = { key, name: stdName, brand: String(raw.brand || '').trim() || info.brand || Std.brandIn(stdName), ean, eans: ean ? [ean] : [], unit: { kg: 'KG', l: 'L', dz: 'DZ', un: 'UN' }[info.base], base: info.base, pack: Std.sizeOf(stdName), ignore: false, count: null };
      S.products.push(prod);
    } else {
      if (confirmed && norm(prod.name) !== norm(stdName) && !byName) prod.name = stdName; // você renomeou o produto na conferência
      if (!prod.base) { prod.base = info.base; prod.pack = Std.sizeOf(prod.name); }
      if (!prod.brand) prod.brand = String(raw.brand || '').trim() || Std.brandIn(prod.name);
      if (ean && !prod.ean) prod.ean = ean;
    }
    if (ean) { prod.eans = Array.isArray(prod.eans) ? prod.eans : (prod.ean ? [prod.ean] : []); if (!prod.eans.includes(ean)) prod.eans.push(ean); }
    // de-para aprendido: este código de barras e este texto de nota apontam para o produto
    if (eanKey && eanKey !== prod.key) S.aliases[eanKey] = prod.key;
    if (sKey && sKey !== prod.key) S.aliases[sKey] = prod.key;
    if (textKey !== prod.key) S.aliases[textKey] = prod.key;
    return prod;
  }

  // código interno do mercado (ex.: "Código: 7129" na nota): vale só para aquele CNPJ, por isso a chave inclui a loja
  const storeKey = (raw) => { const d = String(raw.cnpj || '').replace(/\D/g, ''), c = String(raw.scode || raw.code || '').trim(); return d.length === 14 && c ? 's:' + d + ':' + c : ''; };
  const brandOf = (p) => (p && (p.brand || Std.brandIn(p.name))) || '';
  const genericKey = (p) => norm(Std.genericName(p.name, brandOf(p)));

  // Produto que o catálogo já conhece para este item (código de barras ou texto de nota aprendido), sem alterar nada
  function findKnown(S, raw) {
    const ean = validEAN(raw.ean) ? cleanEAN(raw.ean) : '', byKey = (k) => S.products.find((p) => p.key === k);
    if (ean) { const p = byKey(followAlias(S.aliases, 'e:' + ean)); if (p) return { product: p, via: 'código de barras' }; }
    const sk = storeKey(raw); if (sk) { const sp = byKey(followAlias(S.aliases, sk)); if (sp && sp.key !== sk) return { product: sp, via: 'código do mercado', ean: sp.ean || '' }; }
    const tk = 'n:' + norm(raw.name), k = followAlias(S.aliases, tk), p = byKey(k !== tk ? k : tk);
    return p ? { product: p, via: k !== tk ? 'correção anterior' : 'compra anterior' } : null;
  }

  // O código de barras aponta para um produto de tamanho diferente do que a nota diz? (a marca pode ter trocado a embalagem sem trocar o código, ou a leitura errou)
  function sizeConflict(found, rawName) {
    if (!found || found.via !== 'código de barras') return null;
    const a = Std.sizeOf(found.product.name), b = Std.sizeOf(rawName);
    if (!a || !b || Std.sameSize(found.product.name, rawName)) return null;
    return { code: Std.sizeLabel(a), note: Std.sizeLabel(b) };
  }

  const CHANNELS = { loja: 'Loja física', ifood: 'iFood', app: 'Outro app', site: 'Site do mercado' };
  const channelLabel = (c) => CHANNELS[c] || '';


  /* Nota repetida: além do id (chave), compara mercado + dia + total (±0,05) + 70% dos nomes iguais */
  function findSimilarPurchase(S, draft) {
    const cnpj = String(draft.marketCnpj || '').replace(/\D/g, '');
    const mk = marketKey(draft.marketCnpj, draft.marketName);
    const names = (draft.items || []).map((i) => norm(i.name)).filter(Boolean);
    const tot = isFinite(num(draft.total)) ? num(draft.total) : round((draft.items || []).reduce((a, i) => a + (isFinite(num(i.total)) ? num(i.total) : num(i.qty) * num(i.unitPrice)), 0) - (num(draft.discount) || 0), 2);
    for (const p of S.purchases) {
      if (draft.id && p.id === draft.id) continue;
      if (p.date !== draft.date) continue;
      const sameMarket = (cnpj.length === 14 && String(p.marketCnpj || '').replace(/\D/g, '') === cnpj) || p.marketKey === mk;
      if (!sameMarket || Math.abs(num(p.total) - tot) > 0.05) continue;
      const pn = S.items.filter((i) => i.purchaseId === p.id).map((i) => norm(i.name));
      const hit = names.filter((n) => pn.includes(n)).length;
      if (!names.length || hit / names.length >= 0.7) return p;
    }
    return null;
  }

  function addPurchase(S, draft) {
    const id = draft.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (S.purchases.some((p) => p.id === id)) return { duplicate: true, id };
    const mk = marketKey(draft.marketCnpj, draft.marketName), cnpjD = String(draft.marketCnpj || '').replace(/\D/g, '');
    const friendly = cnpjD.length === 14 && S.settings.marketNames && S.settings.marketNames[cnpjD];
    if (friendly) draft = Object.assign({}, draft, { marketName: friendly });
    const items = [];
    let total = 0;
    (draft.items || []).forEach((raw, i) => {
      const qty = num(raw.qty), unitPrice = num(raw.unitPrice);
      if (!(qty > 0) || !isFinite(unitPrice) || !String(raw.name || '').trim()) return;
      const t = isFinite(num(raw.total)) ? num(raw.total) : round(qty * unitPrice, 2);
      const unit = String(raw.unit || 'UN').toUpperCase();
      const info = Std.standardize(raw.name, unit);
      const confirmed = !!String(raw.std || '').trim();
      const brandIn = String(raw.brand || '').trim();
      let stdName = confirmed ? String(raw.std).trim() : info.name;
      if (brandIn) stdName = Std.withBrand(stdName, brandIn);
      const prod = resolveProduct(S, Object.assign({}, raw, { cnpj: cnpjD }), stdName, info, confirmed);
      const nz = Std.normalizeItem(raw.name, unit, qty, unitPrice, Object.assign({}, info, { base: prod.base || info.base }));
      total += t;
      items.push({
        id: id + '-' + i, purchaseId: id, date: draft.date, marketKey: mk, marketName: draft.marketName,
        productKey: prod.key, name: raw.name, ean: validEAN(raw.ean) ? cleanEAN(raw.ean) : '', qty: nz.qty, unit: nz.unit, unitPrice: nz.unitPrice, total: round(t, 2),
        promo: !!raw.promo, scode: String(raw.scode || raw.code || '').trim(), channel: draft.channel || 'loja',
        disc: round(num(raw.disc) || 0, 2), orig: { qty, unit, unitPrice: round(unitPrice, 4) },
      });
    });
    if (!items.length) return { empty: true, id };
    const purchase = {
      id, date: draft.date, marketKey: mk, marketName: draft.marketName, marketCnpj: String(draft.marketCnpj || '').replace(/\D/g, ''),
      city: draft.city || '', discount: round(num(draft.discount) || 0, 2), total: round(isFinite(num(draft.total)) && draft.total ? num(draft.total) : total, 2),
      source: draft.source || 'manual', demo: !!draft.demo, n: items.length,
      channel: draft.channel || 'loja', order: String(draft.order || '').trim(),
    };
    S.purchases.push(purchase);
    S.items.push(...items);
    return { purchase, items, id };
  }

  /* ---------- comparação com o melhor preço ---------- */
  function addMonthsISO(iso, m) { const d = new Date(parseDate(iso)); d.setUTCMonth(d.getUTCMonth() + m); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  // Para cada item da compra: o menor preço já pago pelo mesmo produto (outras compras) na janela de meses. months=0 -> todo o histórico.
  function compare(S, purchaseId, opts) {
    opts = opts || {};
    const today = opts.today || todayISO(), months = opts.months || 0, from = months ? addMonthsISO(today, -months) : '0000-01-01';
    const p = S.purchases.find((x) => x.id === purchaseId); if (!p) return null;
    const rows = S.items.filter((i) => i.purchaseId === purchaseId).map((it) => {
      let best = null, n = 0;
      for (const o of S.items) {
        if (o.productKey !== it.productKey || o.purchaseId === purchaseId || o.promo || o.date < from || o.date > today) continue;
        n++;
        if (!best || o.unitPrice < best.unitPrice - 1e-9 || (Math.abs(o.unitPrice - best.unitPrice) < 1e-9 && o.date > best.date)) best = o;
      }
      // item marcado como super promoção: fica fora da comparação; só mostra quanto economizou contra a média e o menor preço normais
      if (it.promo) {
        const base = S.items.filter((o) => o.productKey === it.productKey && o.purchaseId !== purchaseId && !o.promo && o.date <= today);
        const avg = base.length ? base.reduce((a, o) => a + o.unitPrice, 0) / base.length : 0;
        const ref = avg > it.unitPrice ? avg : 0;
        return { item: it, best, alt: null, n, status: 'promo', ideal: it.unitPrice, saving: 0, diff: 0, promoRef: ref ? round(ref, 4) : 0, promoMin: best ? best.unitPrice : 0, promoSave: ref ? round((ref - it.unitPrice) * it.qty, 2) : 0 };
      }
      const cheaper = !!best && best.unitPrice < it.unitPrice - 0.005;
      // mesma coisa em outra marca (mesmo nome sem a marca e mesmo tamanho) por menos
      let alt = null;
      const me = S.products.find((x) => x.key === it.productKey);
      if (me) {
        const gk = genericKey(me), others = new Set(S.products.filter((x) => x.key !== me.key && genericKey(x) === gk && Std.sameSize(x.name, me.name)).map((x) => x.key));
        if (others.size) for (const o of S.items) {
          if (!others.has(o.productKey) || o.promo || o.date < from || o.date > today) continue;
          if (o.unitPrice < it.unitPrice - 0.005 && (!alt || o.unitPrice < alt.unitPrice)) alt = o;
        }
        if (alt) { const ap = S.products.find((x) => x.key === alt.productKey); alt = { item: alt, brand: brandOf(ap), name: ap.name, save: Math.max(0, round(it.total - alt.unitPrice * it.qty, 2)) }; }
      }
      const ideal = cheaper ? best.unitPrice : it.unitPrice;
      const saving = cheaper ? Math.max(0, round(it.total - ideal * it.qty, 2)) : 0;
      return { item: it, best, alt, n, status: !best ? 'none' : cheaper ? 'cheaper' : 'best', ideal, saving, diff: cheaper ? (it.unitPrice - ideal) / ideal : 0 };
    });
    const saving = round(rows.reduce((a, r) => a + r.saving, 0), 2);
    const altSaving = round(rows.reduce((a, r) => a + (r.alt && r.status !== 'cheaper' ? r.alt.save : 0), 0), 2);
    const promoSaving = round(rows.reduce((a, r) => a + (r.promoSave || 0), 0), 2), promoCount = rows.filter((r) => r.status === 'promo').length;
    return { purchase: p, rows, months, from, paid: p.total, saving, altSaving, promoSaving, promoCount, ideal: round(p.total - saving, 2), covered: rows.filter((r) => r.n > 0).length };
  }


  /* ---------- painel: estatísticas do período ---------- */
  function dashboard(S, opts) {
    opts = opts || {};
    const today = opts.today || todayISO(), days = opts.days || 0, from = days ? addDays(today, -days) : '0000-01-01';
    const P = S.purchases.filter((p) => p.date >= from && p.date <= today);
    const ids = new Set(P.map((p) => p.id)), I = S.items.filter((i) => ids.has(i.purchaseId));
    const spent = round(P.reduce((a, p) => a + p.total, 0), 2);
    // mercados
    const mk = {};
    P.forEach((p) => { const m = (mk[p.marketKey] = mk[p.marketKey] || { key: p.marketKey, name: p.marketName, visits: 0, spent: 0, last: '' }); m.visits++; m.spent += p.total; if (p.date > m.last) m.last = p.date; });
    const markets = Object.values(mk).map((m) => Object.assign(m, { spent: round(m.spent, 2), avg: round(m.spent / m.visits, 2) })).sort((a, b) => b.visits - a.visits || b.spent - a.spent);
    // meses (os últimos 12 dentro do período, em ordem cronológica)
    const mo = {};
    P.forEach((p) => { const k = p.date.slice(0, 7); mo[k] = (mo[k] || 0) + p.total; });
    const months = Object.keys(mo).sort().slice(-12).map((k) => ({ month: k, spent: round(mo[k], 2) }));
    // produtos mais comprados (em quantas compras apareceu) e marcas
    const pr = {}, br = {};
    I.forEach((i) => {
      const p = S.products.find((x) => x.key === i.productKey); if (!p || p.ignore) return;
      const e = (pr[p.key] = pr[p.key] || { key: p.key, name: p.name, brand: brandOf(p), unit: i.unit, buys: new Set(), qty: 0, spent: 0 });
      e.buys.add(i.purchaseId); e.qty += i.qty; e.spent += i.total;
      const b = brandOf(p); if (b) { const g = (br[b] = br[b] || { brand: b, buys: new Set(), spent: 0, products: new Set() }); g.buys.add(i.purchaseId); g.spent += i.total; g.products.add(p.key); }
    });
    const products = Object.values(pr).map((e) => ({ key: e.key, name: e.name, brand: e.brand, unit: e.unit, times: e.buys.size, qty: round(e.qty, 3), spent: round(e.spent, 2) })).sort((a, b) => b.times - a.times || b.spent - a.spent);
    const brands = Object.values(br).map((g) => ({ brand: g.brand, times: g.buys.size, spent: round(g.spent, 2), n: g.products.size })).sort((a, b) => b.spent - a.spent);
    // dia da semana
    const wd = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ d, visits: 0, spent: 0 }));
    P.forEach((p) => { const w = wd[new Date(parseDate(p.date)).getUTCDay()]; w.visits++; w.spent += p.total; });
    // maiores altas e quedas (primeiro x último preço no período, mínimo 2 compras em dias diferentes)
    const by = {};
    I.forEach((i) => { if (!i.promo) (by[i.productKey] = by[i.productKey] || []).push(i); });
    const movers = [];
    Object.keys(by).forEach((k) => {
      const l = by[k].slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      const a = l[0], z = l[l.length - 1]; if (a.date === z.date || !(a.unitPrice > 0)) return;
      const p = S.products.find((x) => x.key === k); if (!p) return;
      movers.push({ key: k, name: p.name, from: a.unitPrice, to: z.unitPrice, chg: (z.unitPrice - a.unitPrice) / a.unitPrice, d0: a.date, d1: z.date, unit: z.unit });
    });
    const ups = movers.filter((m) => m.chg > 0.005).sort((a, b) => b.chg - a.chg), downs = movers.filter((m) => m.chg < -0.005).sort((a, b) => a.chg - b.chg);
    // economia possível: soma da comparação de cada compra do período com o melhor preço dos 12 meses anteriores
    let saving = 0;
    P.forEach((p) => { const r = compare(S, p.id, { months: 12, today }); if (r) saving += r.saving; });
    return { from, today, purchases: P.length, spent, avg: P.length ? round(spent / P.length, 2) : 0, saving: round(saving, 2), markets, months, products, brands, weekdays: wd.map((w) => Object.assign(w, { spent: round(w.spent, 2) })), ups, downs, nItems: I.length };
  }


  /* ---------- ofertas (folheto, banner, etiqueta) ---------- */
  // Compara um preço visto no mercado com o histórico: { product, unitPrice, unit, last, best, verdict, altBest }
  function evalOffer(S, o, opts) {
    opts = opts || {};
    const today = opts.today || todayISO(), months = opts.months || 12, from = addMonthsISO(today, -months);
    const unit = String(o.unit || 'UN').toUpperCase(), price = num(o.price);
    if (!String(o.name || '').trim() || !(price > 0)) return { verdict: 'vazio' };
    const info = Std.standardize(o.name, unit);
    let prod = null, via = '';
    const k = findKnown(S, { name: o.name, ean: o.ean }); if (k) { prod = k.product; via = k.via; }
    if (!prod) prod = S.products.find((p) => norm(p.name) === norm(info.name)) || null;
    if (!prod) { const m = Std.bestMatch(info.name, S.products.map((p) => p.name), 0.8); if (m) prod = S.products.find((p) => p.name === m.name) || null; if (prod) via = 'parecido'; }
    const nz = Std.normalizeItem(o.name, unit, 1, price, Object.assign({}, info, { base: (prod && prod.base) || info.base }));
    const res = { product: prod, via, name: prod ? prod.name : info.name, unitPrice: nz.unitPrice, unit: nz.unit, assumed: nz.assumed, last: null, best: null, verdict: 'novo', diff: 0, altBest: null };
    const brandName = (p) => brandOf(p);
    if (prod) {
      const its = S.items.filter((i) => i.productKey === prod.key && !i.promo && i.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1));
      res.last = its[0] || null;
      let best = null; its.forEach((i) => { if (i.date >= from && (!best || i.unitPrice < best.unitPrice)) best = i; });
      res.best = best;
      if (best || res.last) {
        const ref = best || res.last, p = nz.unitPrice;
        if (best && p < best.unitPrice - 0.005) { res.verdict = 'melhor'; res.diff = (p - best.unitPrice) / best.unitPrice; }
        else if (best && p <= best.unitPrice * 1.01 + 0.005) { res.verdict = 'igual'; res.diff = (p - best.unitPrice) / best.unitPrice; }
        else if (res.last && p < res.last.unitPrice - 0.005) { res.verdict = 'bom'; res.diff = (p - res.last.unitPrice) / res.last.unitPrice; }
        else { res.verdict = 'caro'; res.diff = (p - ref.unitPrice) / ref.unitPrice; }
      }
      // outra marca do mesmo produto, mais barata que a oferta
      const gk = genericKey(prod), others = new Set(S.products.filter((x) => x.key !== prod.key && genericKey(x) === gk && Std.sameSize(x.name, prod.name)).map((x) => x.key));
      S.items.forEach((i) => { if (others.has(i.productKey) && !i.promo && i.date >= from && i.unitPrice < nz.unitPrice - 0.005 && (!res.altBest || i.unitPrice < res.altBest.item.unitPrice)) res.altBest = { item: i, brand: brandName(S.products.find((x) => x.key === i.productKey)) }; });
    }
    return res;
  }
  // ofertas ainda válidas (ou recentes, sem validade: últimos 7 dias) por produto
  function activeOffers(S, today) {
    today = today || todayISO(); const out = {};
    ((S.shop && S.shop.offers) || []).forEach((o) => {
      const ok = o.validUntil ? o.validUntil >= today : o.date >= addDays(today, -7);
      if (!ok || !o.productKey) return;
      if (!out[o.productKey] || o.unitPrice < out[o.productKey].unitPrice) out[o.productKey] = o;
    });
    return out;
  }

  function removePurchase(S, id, keepProducts) {
    S.purchases = S.purchases.filter((p) => p.id !== id);
    S.items = S.items.filter((i) => i.purchaseId !== id);
    if (!keepProducts) pruneProducts(S);
  }

  function pruneProducts(S) {
    const used = new Set(S.items.map((i) => i.productKey));
    S.products = S.products.filter((p) => used.has(p.key));
  }

  function mergeProducts(S, src, dst) {
    if (src === dst) return;
    const names = new Set();
    S.items.forEach((i) => { if (i.productKey === src) { i.productKey = dst; names.add(norm(i.name)); if (i.ean) S.aliases['e:' + i.ean] = dst; } });
    names.forEach((n) => { S.aliases['n:' + n] = dst; });
    S.aliases[src] = dst;
    const sp = S.products.find((p) => p.key === src), dp = S.products.find((p) => p.key === dst);
    if (sp && dp) { const all = new Set([].concat(dp.eans || (dp.ean ? [dp.ean] : []), sp.eans || (sp.ean ? [sp.ean] : []))); dp.eans = Array.from(all); if (!dp.ean && dp.eans.length) dp.ean = dp.eans[0]; }
    S.products = S.products.filter((p) => p.key !== src);
  }

  // Pergunta "é super promoção?" quando o preço está muito abaixo do que você costuma pagar (ou é irreal, ex.: R$ 1,00)
  function promoHint(S, raw) {
    const price = num(raw.unitPrice), qty = num(raw.qty) || 1; if (!(price > 0)) return null;
    const k = findKnown(S, raw), prod = k ? k.product : S.products.find((p) => norm(p.name) === norm(raw.std || ''));
    if (prod) {
      const info = Std.standardize(raw.name || prod.name, raw.unit);
      const nz = Std.normalizeItem(raw.name || prod.name, raw.unit || 'UN', qty, price, Object.assign({}, info, { base: prod.base || info.base }));
      const hist = S.items.filter((i) => i.productKey === prod.key && !i.promo);
      if (hist.length >= 2) {
        const avg = hist.reduce((a, i) => a + i.unitPrice, 0) / hist.length;
        if (nz.unitPrice <= avg * 0.5) return { kind: 'hist', avg: round(avg, 2), pct: round((1 - nz.unitPrice / avg) * 100, 0) };
        return null;
      }
    }
    if (price <= 1 && String(raw.unit || 'UN').toUpperCase() === 'UN') return { kind: 'low' };
    return null;
  }

  /* ---------- mercados: nome que o usuário usa, por CNPJ ---------- */
  const cnpjD = (c) => String(c || '').replace(/\D/g, '');
  function cleanMarketName(razao) {
    const drop = new Set(['LTDA', 'LTDA.', 'S/A', 'SA', 'S.A.', 'S.A', 'EIRELI', 'ME', 'EPP', 'REDE', 'DISTRIBUIDORA', 'COMERCIO', 'COMÉRCIO', 'COMERCIAL', 'E', 'DE', 'DO', 'DA', 'DOS', 'DAS', '-']);
    const w = String(razao || '').trim().split(/\s+/).filter(Boolean);
    while (w.length > 1 && drop.has(w[w.length - 1].toUpperCase())) w.pop();
    while (w.length > 1 && drop.has(w[0].toUpperCase())) w.shift();
    return w.join(' ') || String(razao || '').trim();
  }
  // { name, known, fromRede, note } - nome sugerido para a loja desta nota
  function suggestMarket(S, cnpj, razao, city) {
    const d = cnpjD(cnpj), names = (S.settings && S.settings.marketNames) || {};
    if (d.length === 14 && names[d]) return { name: names[d], known: true };
    if (d.length === 14 && names['r:' + d.slice(0, 8)]) { const base = names['r:' + d.slice(0, 8)]; return { name: (base + (city ? ' ' + city : '')).trim(), known: false, fromRede: base }; }
    return { name: cleanMarketName(razao), known: false };
  }
  // guarda o nome para o CNPJ, aplica nas compras já salvas e lembra o nome-base da rede (mesma raiz de CNPJ)
  function setMarketName(S, cnpj, name) {
    const d = cnpjD(cnpj), nm = String(name || '').trim(); if (d.length !== 14 || !nm) return false;
    S.settings.marketNames = S.settings.marketNames || {};
    S.settings.marketNames[d] = nm;
    const r = 'r:' + d.slice(0, 8); if (!S.settings.marketNames[r]) S.settings.marketNames[r] = nm;
    S.purchases.forEach((p) => { if (p.marketCnpj === d) p.marketName = nm; });
    S.items.forEach((i) => { if (i.marketKey === d) i.marketName = nm; });
    return true;
  }
  // mês da compra pela chave de acesso (posições 3-6 = AAMM)
  function chaveMonth(chave) {
    const c = String(chave || '').replace(/\D/g, ''); if (c.length !== 44) return '';
    const yy = +c.slice(2, 4), mm = +c.slice(4, 6); if (mm < 1 || mm > 12) return '';
    return (2000 + yy) + '-' + pad(mm);
  }

  /* ---------- análise: preços, consumo, estoque ---------- */

  function analyze(S, today) {
    today = today || todayISO();
    const by = {};
    for (const it of S.items) (by[it.productKey] = by[it.productKey] || []).push(it);
    const out = {};
    for (const p of S.products) {
      const its = (by[p.key] || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      if (!its.length) continue;
      const pits0 = its.filter((i) => !i.promo), pits = pits0.length ? pits0 : its; // preços: sem super promoção (se só houver promoção, usa ela)
      const ev = [];
      for (const it of its) {
        const l = ev[ev.length - 1];
        if (l && l.date === it.date) l.qty += it.qty; else ev.push({ date: it.date, qty: it.qty });
      }
      let rate = null, interval = null;
      if (ev.length >= 2) {
        const span = Math.max(1, daysBetween(ev[0].date, ev[ev.length - 1].date));
        const consumed = ev.slice(0, -1).reduce((a, e) => a + e.qty, 0);
        rate = consumed / span;
        interval = span / (ev.length - 1);
      }
      let stock = 0, at = null;
      if (p.count) { stock = p.count.qty; at = p.count.date; }
      for (const e of ev) {
        if (p.count && e.date <= p.count.date) continue;
        if (at !== null && rate) stock = Math.max(0, stock - rate * daysBetween(at, e.date));
        stock += e.qty; at = e.date;
      }
      let est = 0;
      if (at !== null) est = rate ? Math.max(0, stock - rate * Math.max(0, daysBetween(at, today))) : stock;
      const daysLeft = rate ? est / rate : null;

      // preço por mercado (último preço de cada um)
      const mk = {};
      for (const it of pits) {
        const m = mk[it.marketKey] || (mk[it.marketKey] = { key: it.marketKey, name: it.marketName, sum: 0, n: 0, price: 0, date: '' });
        m.sum += it.unitPrice; m.n++; m.price = it.unitPrice; m.date = it.date; m.name = it.marketName;
      }
      const markets = Object.values(mk).map((m) => ({ key: m.key, name: m.name, price: m.price, date: m.date, avg: m.sum / m.n, n: m.n }));
      const fresh = markets.filter((m) => daysBetween(m.date, today) <= 180);
      const pool = fresh.length ? fresh : markets;
      const best = pool.reduce((a, b) => (b.price < a.price ? b : a), pool[0]);
      const last = pits[pits.length - 1], lastBuy = its[its.length - 1];
      // variação: último preço vs. preço da compra anterior (data diferente)
      let prev = null;
      for (let i = pits.length - 1; i >= 0; i--) if (pits[i].date < last.date) { prev = pits[i]; break; }
      const chg = prev ? (last.unitPrice - prev.unitPrice) / prev.unitPrice : null;
      const first = pits[0];
      const chgFirst = first.date < last.date ? (last.unitPrice - first.unitPrice) / first.unitPrice : null;
      const prices = pits.map((i) => i.unitPrice);
      out[p.key] = {
        p, its: pits, all: its, lastBuy, ev, rate, interval, est, daysLeft, last, markets, best, pool, chg, chgFirst,
        min: Math.min(...prices), max: Math.max(...prices), n: pits.length, qtyTotal: its.reduce((a, i) => a + i.qty, 0),
        intQty: ev.every((e) => Math.abs(e.qty - Math.round(e.qty)) < 1e-9),
      };
    }
    return out;
  }

  function roundQty(q, intQty) { return intQty ? Math.ceil(q - 1e-9) : Math.ceil(q * 10 - 1e-9) / 10; }

  // Lista automática: tudo que acaba antes do horizonte escolhido.
  function suggest(an, opts, today) {
    today = today || todayISO();
    const rows = [];
    for (const a of Object.values(an)) {
      if (a.p.ignore || !a.rate) continue;
      if (daysBetween(a.lastBuy.date, today) > Math.max(90, a.interval * 4)) continue; // produto parado
      if (a.daysLeft >= opts.horizon) continue;
      const q = roundQty(a.rate * opts.horizon - a.est, a.intQty);
      if (!(q > 0)) continue;
      const price = a.best ? a.best.price : a.last.unitPrice;
      rows.push({
        key: a.p.key, name: a.p.name, unit: a.last.unit, qty: q, daysLeft: a.daysLeft, est: a.est, rate: a.rate,
        urgent: a.daysLeft <= opts.cover, price, cost: q * price, market: a.best ? a.best.name : '',
      });
    }
    rows.sort((x, y) => x.daysLeft - y.daysLeft);
    return rows;
  }

  // Índice de preço por mercado (100 = sempre o mais barato nos produtos comparáveis)
  function marketIndex(an, today) {
    today = today || todayISO();
    const mk = {};
    const ensure = (m) => mk[m.key] || (mk[m.key] = { key: m.key, name: m.name, ratios: [], wins: 0, compared: 0, spent: 0, trips: new Set() });
    for (const a of Object.values(an)) {
      const pool = a.markets.filter((m) => daysBetween(m.date, today) <= 365);
      if (pool.length < 2) continue;
      const min = Math.min(...pool.map((m) => m.price));
      pool.forEach((m) => { const e = ensure(m); e.ratios.push(m.price / min); e.compared++; if (m.price === min) e.wins++; });
    }
    return Object.values(mk).map((e) => ({
      key: e.key, name: e.name, index: e.ratios.length ? (e.ratios.reduce((a, b) => a + b, 0) / e.ratios.length) * 100 : null,
      wins: e.wins, compared: e.compared,
    })).sort((a, b) => a.index - b.index);
  }

  /* ---------- dados de exemplo ---------- */

  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function demoDrafts(today) {
    const rnd = mulberry32(2026);
    const cat = [
      ['Leite Integral 1L', '7891000100103', 'UN', 5.19, 14, [6, 12], 0.06],
      ['Arroz Branco Tipo 1 5kg', '7896006711117', 'UN', 27.9, 35, [1, 2], 0.04],
      ['Feijão Carioca 1kg', '7896006744115', 'UN', 8.49, 30, [2, 3], 0.09],
      ['Café Torrado 500g', '7891910000197', 'UN', 18.9, 22, [1, 2], 0.12],
      ['Ovos Brancos 12un', '', 'UN', 11.9, 9, [1, 2], 0.08],
      ['Óleo de Soja 900ml', '7891107101621', 'UN', 7.29, 32, [2, 3], 0.03],
      ['Açúcar Refinado 1kg', '7891910000104', 'UN', 4.69, 28, [2, 4], 0.02],
      ['Macarrão Espaguete 500g', '7896022200011', 'UN', 4.39, 15, [3, 5], 0.04],
      ['Papel Higiênico 12 Rolos', '7891000500002', 'UN', 21.9, 24, [1, 2], 0.03],
      ['Detergente Líquido 500ml', '7891024030012', 'UN', 2.59, 18, [3, 5], 0.05],
      ['Sabão em Pó 1,6kg', '7891150050010', 'UN', 22.5, 45, [1], 0.04],
      ['Banana Prata', '', 'KG', 5.99, 7, [1.2, 1.8], 0.08],
      ['Peito de Frango', '', 'KG', 18.9, 10, [1.5, 2.5], 0.06],
      ['Carne Moída', '', 'KG', 36.9, 12, [1, 1.5], 0.1],
      ['Tomate', '', 'KG', 7.9, 8, [0.8, 1.2], 0.15],
      ['Pão de Forma 500g', '7891000800009', 'UN', 7.99, 8, [1, 2], 0.05],
      ['Manteiga 200g', '7891097100010', 'UN', 11.9, 20, [1, 2], 0.08],
      ['Queijo Mussarela', '', 'KG', 49.9, 14, [0.4, 0.6], 0.07],
      ['Iogurte Natural 170g', '7891000300017', 'UN', 2.79, 10, [4, 6], 0.05],
      ['Água Mineral 1,5L', '7891000900013', 'UN', 2.39, 12, [6, 12], 0.03],
      ['Refrigerante Cola 2L', '7894900011517', 'UN', 8.99, 16, [2, 3], 0.04],
      ['Sabonete 85g', '7891000600016', 'UN', 2.19, 30, [4, 6], 0.02],
      ['Creme Dental 90g', '7891000700015', 'UN', 4.99, 40, [2, 3], 0.03],
    ];
    const markets = [
      { name: 'Atacadão Centro', cnpj: '75315333000109', f: 0.93, w: 0.4, city: 'São Paulo' },
      { name: 'Mercado Bom Preço', cnpj: '47508411000156', f: 1.0, w: 0.4, city: 'São Paulo' },
      { name: 'Supermercado Estrela', cnpj: '61585865000151', f: 1.07, w: 0.2, city: 'São Paulo' },
    ];
    const start = addDays(today, -420);
    const last = {};
    const drafts = [];
    let d = start, n = 0;
    while (d <= addDays(today, -2)) {
      const r = rnd();
      let acc = 0, m = markets[0];
      for (const mm of markets) { acc += mm.w; if (r <= acc) { m = mm; break; } }
      const yrs = daysBetween(start, d) / 365;
      const items = [];
      cat.forEach(([name, ean, unit, base, cycle, qtys, infl]) => {
        const since = last[name] === undefined ? 999 : daysBetween(last[name], d);
        const due = last[name] === undefined ? rnd() < 0.6 : since >= cycle * (0.8 + 0.4 * rnd());
        if (!due) return;
        last[name] = d;
        const qty = qtys[Math.floor(rnd() * qtys.length)];
        const promo = rnd() < 0.08 ? 0.88 : 1;
        const price = round(base * Math.pow(1 + infl, yrs) * m.f * (1 + (rnd() - 0.5) * 0.06) * promo, 2);
        items.push({ name: name.toUpperCase(), ean, qty, unit, unitPrice: price, total: round(qty * price, 2) });
      });
      if (items.length) {
        drafts.push({ id: 'demo-' + (n++), date: d, marketName: m.name, marketCnpj: m.cnpj, city: m.city, source: 'xml', demo: true, items });
      }
      d = addDays(d, 5 + Math.floor(rnd() * 5));
    }
    return drafts;
  }

  const api = {
    promoHint, suggestMarket, setMarketName, cleanMarketName, chaveMonth, norm, prettyName, num, cleanEAN, gtinOK, internalCode, parseDate, daysBetween, toISO, todayISO, addDays, validEAN, round, resolveKey, marketKey,
    newState, addPurchase, findSimilarPurchase, findKnown, sizeConflict, channelLabel, CHANNELS, brandOf, genericKey, dashboard, evalOffer, activeOffers, compare, addMonthsISO, removePurchase, pruneProducts, mergeProducts, analyze, suggest, marketIndex, demoDrafts, roundQty,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Core = api;
})(typeof self !== 'undefined' ? self : this);
