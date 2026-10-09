/* Cesta Certa: telas e fluxo do app. */
(function () {
  'use strict';
  const C = Core;
  const S = C.newState();
  let tab = 'compras', persistent = true, AN = null, RV = null;
  const ui = { q: '', pview: 'produtos', sort: 'az', stockFilter: 'todos', hist: '5', curKey: '', dperiod: 365, dsel: null, dq: '' };
  const armed = {};

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (n) => (isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—');
  const fq = (n) => (Math.round(n * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pct = (x) => (x > 0 ? '+' : '') + (x * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const fdate = (iso) => { const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y.slice(2); };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const monthLabel = (ym) => { const [y, m] = ym.split('-'); return MESES[+m - 1] + ' de ' + y; };
  const ulabel = (u) => (u === 'UN' ? 'un' : String(u || '').toLowerCase());
  const today = () => C.todayISO();

  const ICON = {
    compras: '<path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    precos: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    painel: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    estoque: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    ajustes: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10M20 18h0"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    camera: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    type: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
    share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  };
  const svg = (n, cls) => `<svg class="${cls || 'icon'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  const an = () => AN || (AN = C.analyze(S, today()));
  const dirty = () => { AN = null; };

  /* ---------- persistência ---------- */
  async function persist() {
    try {
      await DB.replace({
        purchases: S.purchases, items: S.items, products: S.products,
        meta: [{ k: 'aliases', v: S.aliases }, { k: 'settings', v: S.settings }, { k: 'shop', v: S.shop }],
      });
    } catch (e) { toast('Não consegui salvar neste aparelho'); }
  }
  async function persistMeta() {
    try { await DB.replace({ meta: [{ k: 'aliases', v: S.aliases }, { k: 'settings', v: S.settings }, { k: 'shop', v: S.shop }] }); } catch (e) { /* ignora */ }
  }
  async function load() {
    const r = await DB.open();
    persistent = r.persistent;
    const [pu, it, pr, me] = await Promise.all(DB.STORES.map((s) => DB.all(s)));
    S.purchases = pu; S.items = it; S.products = pr;
    me.forEach((m) => {
      if (m.k === 'aliases') S.aliases = m.v || {};
      if (m.k === 'settings') Object.assign(S.settings, m.v || {});
      if (m.k === 'shop') S.shop = Object.assign({ manual: [], checked: {} }, m.v || {});
    });
  }

  /* ---------- utilidades de UI ---------- */
  let toastT = null;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3000);
  }
  const verLabel = () => 'Versão ' + (self.APP_VERSION || '?') + (self.APP_BUILD ? ' · build ' + self.APP_BUILD : ' · web');
  function openSheet(title, html, opts) {
    const sh = $('#sheet');
    sh.innerHTML = `<div class="scrim" ${opts && opts.lock ? '' : 'data-act="close"'}></div><div class="panel" role="dialog" aria-label="${esc(title)}"><div class="grab"><h2>${esc(title)}</h2>${opts && opts.lock ? '' : '<button class="x" data-act="close" aria-label="Fechar">×</button>'}</div>${html}</div>`;
    sh.hidden = false; document.body.style.overflow = 'hidden';
  }
  document.addEventListener('focusin', (e) => {
    const el = e.target; if (!el || !el.closest || !el.closest('#sheet') || !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
    setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {} }, 320);
  });
  let stopCam = null, camTok = 0, qrPending = null;
  function closeSheet() { camTok++; if (stopCam) { stopCam(); stopCam = null; } const sh = $('#sheet'); sh.hidden = true; sh.innerHTML = ''; document.body.style.overflow = ''; if (RV && RV.photoUrl) { try { URL.revokeObjectURL(RV.photoUrl); } catch (e) { /* ok */ } } RV = null; OF = null; }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return Promise.reject(new Error('sem clipboard'));
  }
  const empty = (title, text, btns) => `<div class="empty"><h2>${esc(title)}</h2><p>${text}</p>${btns || ''}</div>`;

  /* ---------- gráfico ---------- */
  function lineChart(series, opt) {
    opt = opt || {};
    const fmtV = opt.fmt || ((v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const W = 360, H = 190, pl = 44, pr = 10, pt = 10, pb = 24;
    const ms = (d) => C.parseDate(d);
    const all = series.flatMap((s) => s.pts);
    let d0 = Math.min(...all.map((p) => ms(p.d))), d1 = Math.max(...all.map((p) => ms(p.d)));
    if (d0 === d1) { d0 -= 864e5 * 3; d1 += 864e5 * 3; }
    let v0 = Math.min(...all.map((p) => p.v)), v1 = Math.max(...all.map((p) => p.v));
    const padV = (v1 - v0) * 0.12 || Math.abs(v1) * 0.1 || 1; v0 = opt.signed ? v0 - padV : Math.max(0, v0 - padV); v1 += padV;
    const X = (d) => pl + ((ms(d) - d0) / (d1 - d0)) * (W - pl - pr);
    const Y = (v) => pt + (1 - (v - v0) / (v1 - v0)) * (H - pt - pb);
    let g = '';
    for (let i = 0; i <= 3; i++) {
      const v = v0 + ((v1 - v0) * i) / 3, y = Y(v);
      g += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"/><text x="${pl - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmtV(v)}</text>`;
    }
    const fm = (t) => { const d = new Date(t); return String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCFullYear()).slice(2); };
    [0, 0.5, 1].forEach((f, i) => { g += `<text x="${(pl + f * (W - pl - pr)).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}">${fm(d0 + f * (d1 - d0))}</text>`; });
    if (opt.signed && v0 < 0 && v1 > 0) g += `<line class="zero" x1="${pl}" x2="${W - pr}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
    series.forEach((s, i) => {
      const pts = s.pts.map((p) => `${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`);
      const lp = s.pts[s.pts.length - 1];
      g += `<polyline class="ln" style="stroke:var(--m${i + 1})" points="${pts.join(' ')}"/>`;
      g += `<circle cx="${X(lp.d).toFixed(1)}" cy="${Y(lp.v).toFixed(1)}" r="3.5" style="fill:var(--m${i + 1})"/>`;
      if (opt.dots) s.pts.forEach((p) => { g += `<circle class="pt" cx="${X(p.d).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="5" style="fill:var(--m${i + 1})"><title>${esc(s.name)} · ${fdate(p.d)} · ${fmtV(p.v)}</title></circle>`; });
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico de preços">${g}</svg>`;
  }

  /* ---------- telas ---------- */
  const views = {};

  views.compras = (top, main) => {
    top.innerHTML = `<div><h1>Compras</h1><div class="sub">${persistent ? 'Salvo neste aparelho' : 'Modo temporário: os dados somem ao fechar'} · ${verLabel()}</div></div><button class="btn primary" data-act="import">${svg('plus', 'icon')}Importar</button>`;
    if (!S.purchases.length) {
      main.innerHTML = empty('Nenhuma compra ainda', 'Importe notas baixadas do portal da Fazenda (XML ou PDF), tire foto de um cupom ou digite uma compra. Com 2 ou 3 notas o app já começa a comparar preços.',
        `<button class="btn primary" data-act="import">${svg('plus', 'icon')}Importar notas</button><button class="btn" data-act="demo">Ver com dados de exemplo</button>`);
      return;
    }
    const t = today(), from = C.addDays(t, -30);
    const last30 = S.purchases.filter((p) => p.date >= from);
    const sum30 = last30.reduce((a, p) => a + p.total, 0);
    const byMonth = {};
    S.purchases.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).forEach((p) => { (byMonth[p.date.slice(0, 7)] = byMonth[p.date.slice(0, 7)] || []).push(p); });
    const prodCount = S.products.length;
    let h = `<div class="summary"><div><div class="k">Gasto em 30 dias</div><div class="v big">${brl(sum30)}</div></div><div><div class="k">Compras</div><div class="v">${last30.length}</div></div><div><div class="k">Produtos</div><div class="v">${prodCount}</div></div></div>`;
    Object.keys(byMonth).sort().reverse().forEach((ym) => {
      const list = byMonth[ym];
      h += `<div class="group-h"><span>${monthLabel(ym)}</span><span class="mono">${brl(list.reduce((a, p) => a + p.total, 0))}</span></div><div class="list">`;
      list.forEach((p) => {
        h += `<button class="row" data-act="purchase" data-id="${esc(p.id)}"><div class="grow"><div class="t">${esc(p.marketName || 'Sem nome')}</div><div class="s">${fdate(p.date)} · ${p.n} ${p.n === 1 ? 'item' : 'itens'}${p.demo ? ' · exemplo' : ''}</div></div><div class="r price">${brl(p.total)}</div></button>`;
      });
      h += '</div>';
    });
    main.innerHTML = h;
  };

  function productRows() {
    const q = C.norm(ui.q);
    let list = Object.values(an()).filter((a) => !q || C.norm(a.p.name).includes(q));
    const nn = (v, dir) => (v == null ? (dir > 0 ? -Infinity : Infinity) : v);
    if (ui.sort === 'az') list.sort((a, b) => a.p.name.localeCompare(b.p.name, 'pt-BR'));
    if (ui.sort === 'up') list.sort((a, b) => nn(b.chg, 1) - nn(a.chg, 1));
    if (ui.sort === 'down') list.sort((a, b) => nn(a.chg, -1) - nn(b.chg, -1));
    if (ui.sort === 'freq') list.sort((a, b) => b.n - a.n);
    return list;
  }
  function priceListHTML() {
    const list = productRows();
    if (!list.length) return `<div class="note" style="padding:16px 4px">Nenhum produto encontrado.</div>`;
    return '<div class="list">' + list.map((a) => {
      const badge = a.chg == null ? '' : `<span class="badge ${a.chg > 0.005 ? 'up' : a.chg < -0.005 ? 'down' : 'flat'}">${pct(a.chg)}</span>`;
      const sub = a.pool.length > 1 ? `Mais barato: ${esc(a.best.name)} · ${brl(a.best.price)}` : `${a.n} ${a.n === 1 ? 'compra' : 'compras'} · ${esc(a.last.marketName)}`;
      return `<button class="row" data-act="product" data-key="${esc(a.p.key)}"><div class="grow"><div class="t">${esc(a.p.name)}</div><div class="s">${sub}</div></div><div class="r"><div class="price">${brl(a.last.unitPrice)}</div><div style="margin-top:3px">${badge}</div></div></button>`;
    }).join('') + '</div>';
  }

  views.precos = (top, main) => {
    top.innerHTML = `<div><h1>Preços</h1><div class="sub">${Object.keys(an()).length} produtos acompanhados</div></div>`;
    if (!S.purchases.length) { main.innerHTML = empty('Sem histórico de preços', 'Importe a primeira nota para começar o banco de preços.', `<button class="btn primary" data-act="import">${svg('plus', 'icon')}Importar notas</button>`); return; }
    let h = `<div class="seg"><button data-act="pview" data-v="produtos" class="${ui.pview === 'produtos' ? 'on' : ''}">Produtos</button><button data-act="pview" data-v="ofertas" class="${ui.pview === 'ofertas' ? 'on' : ''}">Ofertas</button><button data-act="pview" data-v="mercados" class="${ui.pview === 'mercados' ? 'on' : ''}">Mercados</button></div>`;
    if (ui.pview === 'produtos') {
      const chips = [['az', 'A–Z'], ['up', 'Maior alta'], ['down', 'Maior queda'], ['freq', 'Mais comprados']];
      h += `<input id="q" class="in" type="search" placeholder="Buscar produto" value="${esc(ui.q)}" autocomplete="off"><div class="chips">${chips.map((c) => `<button class="chip ${ui.sort === c[0] ? 'on' : ''}" data-act="sort" data-v="${c[0]}">${c[1]}</button>`).join('')}</div><div id="plist">${priceListHTML()}</div>`;
    } else if (ui.pview === 'ofertas') {
      h += offersPane();
    } else {
      const idx = C.marketIndex(an(), today());
      const spent = {}, from = C.addDays(today(), -365);
      S.purchases.forEach((p) => { if (p.date >= from) { const e = spent[p.marketKey] || (spent[p.marketKey] = { n: 0, t: 0 }); e.n++; e.t += p.total; } });
      h += `<div class="note">Cada mercado é comparado com o menor preço achado para os mesmos produtos. 100 significa que ele foi sempre o mais barato.</div>`;
      if (!idx.length) h += `<div class="note warn">Ainda não há produtos comprados em mais de um mercado.</div>`;
      h += '<div class="stack">' + idx.map((m, i) => {
        const e = spent[m.key] || { n: 0, t: 0 };
        return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><div class="t" style="font-weight:700">${esc(m.name)}</div><div class="mono" style="font:600 22px var(--f-data)">${m.index.toFixed(1)}</div></div><div class="idx"><i style="width:${Math.min(100, (100 / m.index) * 100).toFixed(0)}%;background:var(--m${(i % 5) + 1})"></i></div><div class="note" style="margin-top:8px">Mais barato em ${m.wins} de ${m.compared} produtos comparados<br>${e.n} ${e.n === 1 ? 'compra' : 'compras'} · ${brl(e.t)} em 12 meses</div></div>`;
      }).join('') + '</div>';
    }
    main.innerHTML = h;
  };



  /* ---------- ofertas: folheto, banner, etiqueta ---------- */
  let OF = null, sampleNS = null, sampleImg = false;
  (async () => { try { if (typeof claude !== 'undefined' && claude.use) { sampleNS = await claude.use('sample'); if (sampleNS) { const l = await sampleNS.limits(); sampleImg = !!(l && l.images); } } } catch (e) { sampleNS = null; } })();
  const verdictInfo = (ev) => {
    const lp = (i) => `${brl(i.unitPrice)} em ${esc(i.marketName)} (${fdate(i.date)})`;
    let badge, line = '';
    if (ev.verdict === 'melhor') { badge = `<span class="badge down">melhor preço ${pct(ev.diff)}</span>`; line = `Menor que o melhor dos últimos 12 meses: ${lp(ev.best)}`; }
    else if (ev.verdict === 'igual') { badge = '<span class="badge down">igual ao melhor</span>'; line = `Igual ao menor preço: ${lp(ev.best)}`; }
    else if (ev.verdict === 'bom') { badge = `<span class="badge warn">abaixo do último ${pct(ev.diff)}</span>`; line = `Último pago: ${lp(ev.last)}` + (ev.best ? ` · menor: ${lp(ev.best)}` : ''); }
    else if (ev.verdict === 'caro') { const ref = ev.best || ev.last; badge = `<span class="badge up">${pct(ev.diff)} vs. menor</span>`; line = `Já pagou menos: ${lp(ref)}`; }
    else if (ev.verdict === 'novo') { badge = '<span class="badge flat">sem histórico</span>'; line = ev.product ? 'Produto conhecido, sem compra nos últimos 12 meses' : 'Produto que você ainda não comprou'; }
    else badge = '';
    const alt = ev.altBest ? `<div class="s">Outra marca: ${esc(ev.altBest.brand || 'sem marca')} saiu por ${lp(ev.altBest.item)}</div>` : '';
    const as = ev.assumed ? '<div class="s">Considerei 1 dúzia por unidade (ovos).</div>' : '';
    const std = ev.unit && ev.unit !== 'UN' && ev.unitPrice ? ` · ${brl(ev.unitPrice)} por ${ulabel(ev.unit)}` : '';
    return { badge, html: `<div class="s">${ev.product ? esc(ev.name) : ''}${std}</div><div class="s">${line}</div>${alt}${as}` };
  };
  function evalRow(o) { return C.evalOffer(S, { name: o.name, price: C.num(o.price), unit: o.unit }, { today: today() }); }
  function offerRowHTML(o, n) {
    const v = verdictInfo(evalRow(o));
    return `<div class="itm" data-o="${n}"><div class="l1"><input class="in nm" data-of="name" value="${esc(o.name)}" placeholder="Produto" aria-label="Produto"><button class="x" data-act="of-del" data-i="${n}" aria-label="Remover">×</button></div>
      <div class="l2"><input class="in num" data-of="price" inputmode="decimal" value="${esc(String(o.price === '' ? '' : String(o.price).replace('.', ',')))}" placeholder="Preço" aria-label="Preço"><select class="in" data-of="unit" aria-label="Preço por">${[['UN', 'por un.'], ['KG', 'por kg'], ['L', 'por L'], ['DZ', 'por dúzia']].map((u) => `<option value="${u[0]}" ${o.unit === u[0] ? 'selected' : ''}>${u[1]}</option>`).join('')}</select><span class="sub" data-ob>${v.badge}</span></div>
      ${o.note ? `<div class="note">${esc(o.note)}</div>` : ''}<div class="stdnote note" data-ov>${v.html}</div></div>`;
  }
  function offerSummary() {
    const c = { melhor: 0, igual: 0, bom: 0, caro: 0, novo: 0 };
    OF.items.forEach((o) => { const v = evalRow(o).verdict; if (c[v] != null) c[v]++; });
    const parts = [];
    if (c.melhor + c.igual) parts.push(`<b>${c.melhor + c.igual}</b> no melhor preço`); if (c.bom) parts.push(`${c.bom} abaixo do último pago`); if (c.caro) parts.push(`${c.caro} mais caro${c.caro > 1 ? 's' : ''} que já pagou`); if (c.novo) parts.push(`${c.novo} sem histórico`);
    return parts.length ? parts.join(' · ') : 'Nenhum item ainda';
  }
  function drawOffer() {
    const ok = OF.items.length > 0;
    $('#of-body').innerHTML = `
      <div class="card stack">
        <label class="lbl" for="of-m">Mercado</label><input id="of-m" class="in" list="dl-m" value="${esc(OF.market)}" placeholder="Onde é a oferta?" autocomplete="off">
        <div class="two"><div><label class="lbl" for="of-v">Válida até</label><input id="of-v" class="in" type="date" value="${esc(OF.validUntil)}"></div>
        <div><div class="lbl">Tipo</div><div class="chips">${[['folheto', 'Folheto'], ['etiqueta', 'Etiqueta'], ['banner', 'Banner']].map((k) => `<button class="chip ${OF.kind === k[0] ? 'on' : ''}" data-act="of-kind" data-v="${k[0]}">${k[1]}</button>`).join('')}</div></div></div></div>
      <div class="note ok" id="of-sum">${offerSummary()}</div>
      ${OF.msg ? `<div class="note ${OF.msgWarn ? 'warn' : ''}">${OF.msg}</div>` : ''}
      <div id="of-items" class="stack">${OF.items.map(offerRowHTML).join('')}</div>
      <button class="btn block" data-act="of-add">${svg('plus', 'icon')}Adicionar item</button>
      <div class="foot"><button class="btn" data-act="of-more">Outra foto</button><button class="btn primary" data-act="of-save" ${ok ? '' : 'disabled'}>Salvar ofertas</button></div>`;
  }
  function openOffer() {
    OF = OF || { items: [], market: '', validUntil: '', kind: 'folheto', msg: '' };
    const names = Array.from(new Set(S.purchases.map((p) => p.marketName).filter(Boolean)));
    openSheet('Ofertas e preços', `<datalist id="dl-m">${names.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <div class="stack"><div class="note">Fotografe um folheto, banner ou a etiqueta de preço no mercado. O app lê os produtos e já compara com o que você pagou.</div>
        ${Native.canCamera ? `<button class="btn block" data-act="cam-offer" style="justify-content:flex-start;padding:14px">${svg('camera', 'icon')}<span style="text-align:left"><b>Tirar foto agora</b><br><span style="font-weight:400;font-size:13px">Abre a câmera (folheto, banner ou etiqueta de preço)</span></span></button>` : `<div class="pick"><div class="btn block" style="justify-content:flex-start;padding:14px">${svg('camera', 'icon')}<span style="text-align:left"><b>Tirar foto agora</b><br><span style="font-weight:400;font-size:13px">Abre a câmera (folheto, banner ou etiqueta de preço)</span></span></div><input id="f-offer-cam" type="file" accept="image/*" capture="environment" aria-label="Tirar foto do folheto, banner ou etiqueta"></div>`}
        <div class="pick"><div class="btn block primary" style="justify-content:flex-start;padding:14px">${svg('file', 'icon')}<span style="text-align:left"><b>Foto, imagem ou PDF do folheto</b><br><span style="font-weight:400;font-size:13px">Câmera, galeria ou arquivo. Várias páginas de uma vez (PDF até 12 páginas)</span></span></div><input id="f-offer" type="file" accept="image/*,.pdf,application/pdf" multiple aria-label="Foto ou PDF do folheto, banner ou etiqueta"></div>
        ${sampleNS && sampleImg ? `<label class="check-line"><input type="checkbox" id="of-ai" ${ui.ofAI === false ? '' : 'checked'}> Ler com o Claude (mais preciso em folhetos; usa sua cota de uso)</label>` : '<div class="note">Leitura por OCR no aparelho. Em folhetos muito coloridos, confira os itens.</div>'}
        <div id="of-prog" class="note" hidden></div>
        <div id="of-body" class="stack"></div></div>`);
    drawOffer();
  }
  async function processOffers(files) {
    files = Array.from(files); if (!files.length) return;
    if (!$('#of-body')) openOffer(); else if (!OF) OF = { items: [], market: '', validUntil: '', kind: 'folheto', msg: '' };
    OF.msg = ''; OF.msgWarn = false;
    const prog = $('#of-prog'), say = (t) => { if (prog) { prog.hidden = !t; prog.textContent = t; } };
    const useAI = !!(sampleNS && sampleImg && ui.ofAI !== false);
    let added = 0;
    const srcs = [];
    for (const f of files) { try { say('Abrindo ' + (f.name || 'arquivo') + '…'); (await Importers.flyerSources(f)).forEach((x) => srcs.push(x)); } catch (e) { OF.msg = 'Não consegui abrir ' + esc(f.name || 'o arquivo') + ': ' + esc(e.message || e); OF.msgWarn = true; } }
    for (let i = 0; i < srcs.length; i++) {
      const tag = srcs.length > 1 ? ` (${i + 1}/${srcs.length})` : '', sr = srcs[i];
      try {
        let items = [], meta = {};
        if (useAI) {
          say('Claude está lendo a imagem' + tag + '…');
          try {
            const blob = await Importers.toJpegBlob(await sr.get(), 1800);
            const j = await sampleNS.json(Flyer.PROMPT, { images: [blob], modelTier: 'default', cache: false });
            const r = Flyer.fromJSON(j); items = r.items; meta = r;
          } catch (e) { OF.msg = 'Não consegui usar o Claude (' + esc((e && e.message) || e) + '). Usei o OCR do aparelho.'; OF.msgWarn = true; }
        }
        if (!items.length && sr.text) items = Flyer.parse(sr.text); // PDF digital: usa o texto do próprio arquivo
        if (items.length < 3) { say('Lendo o texto da imagem' + tag + '…'); const txt = await Importers.readFlyerText(await sr.get(), (p) => say('Lendo o texto' + tag + '… ' + Math.round(p * 100) + '%')); const it2 = Flyer.parse(txt); if (it2.length > items.length) items = it2; }
        if (meta.market && !OF.market) OF.market = meta.market;
        if (meta.validUntil && !OF.validUntil) OF.validUntil = meta.validUntil;
        if (meta.kind) OF.kind = meta.kind;
        items.forEach((o) => { if (OF.items.some((x) => C.norm(x.name) === C.norm(o.name) && C.num(x.price) === C.num(o.price))) return; OF.items.push({ name: o.name, price: o.price, unit: o.unit || 'UN', note: o.note || '' }); added++; });
      } catch (e) { OF.msg = 'Não consegui ler a imagem: ' + esc(e.message || e); OF.msgWarn = true; }
    }
    say('');
    if (!added && !OF.msg) { OF.msg = 'Não encontrei produtos com preço nessa imagem. Tente chegar mais perto, com boa luz, ou adicione os itens à mão.'; OF.msgWarn = true; }
    else if (added && !OF.msgWarn) OF.msg = `${added} ${added > 1 ? 'itens lidos' : 'item lido'}. Confira nomes e preços antes de salvar.`;
    drawOffer();
  }
  async function saveOffers() {
    const valid = OF.items.filter((o) => String(o.name).trim() && C.num(o.price) > 0);
    if (!valid.length) return toast('Nenhum item com preço');
    const market = OF.market.trim() || 'Mercado sem nome';
    S.shop.offers = S.shop.offers || [];
    const stamp = Date.now().toString(36);
    valid.forEach((o, i) => {
      const ev = evalRow(o);
      S.shop.offers.push({ id: 'o' + stamp + i, market, marketKey: C.marketKey('', market), date: today(), validUntil: OF.validUntil || '', kind: OF.kind, name: String(o.name).trim(), productKey: ev.product ? ev.product.key : '', unitPrice: ev.unitPrice, unit: ev.unit, price: C.num(o.price), origUnit: o.unit, verdict: ev.verdict });
    });
    OF = null; await persistMeta(); closeSheet(); render(true); toast(valid.length + ' ofertas salvas');
  }
  function offersPane() {
    const list = (S.shop.offers || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    let h = `<button class="btn block primary" data-act="offer" style="padding:14px">${svg('camera', 'icon')}Fotografar folheto, banner ou etiqueta</button>`;
    if (!list.length) return h + '<div class="note">Nada salvo ainda. Tire a foto de um folheto e o app já compara cada produto com o seu histórico de preços.</div>';
    const t = today(), by = {};
    list.forEach((o) => { const k = o.market + '|' + o.date; (by[k] = by[k] || { market: o.market, date: o.date, validUntil: o.validUntil, kind: o.kind, items: [] }).items.push(o); });
    h += Object.values(by).map((g) => {
      const expired = g.validUntil ? g.validUntil < t : g.date < C.addDays(t, -7);
      return `<div class="card stack"><div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><div class="t" style="font-weight:700">${esc(g.market)}</div><span class="badge ${expired ? 'flat' : 'down'}">${expired ? 'vencida' : 'válida'}</span></div>
        <div class="note">${esc(g.kind || 'oferta')} de ${fdate(g.date)}${g.validUntil ? ' · até ' + fdate(g.validUntil) : ''}</div>
        <div class="list">${g.items.map((o) => { const ev = C.evalOffer(S, { name: o.name, price: o.price, unit: o.origUnit || o.unit }, { today: t }); const v = verdictInfo(ev); return `<div class="row"><div class="grow"><div class="t">${esc(o.name)}</div>${v.html}</div><div class="r"><div class="price">${brl(o.price)}</div><div style="margin-top:3px">${v.badge}</div><button class="x" data-act="of-rm" data-id="${esc(o.id)}" aria-label="Remover oferta">×</button></div></div>`; }).join('')}</div></div>`;
    }).join('');
    return h;
  }

  /* ---------- painel ---------- */
  const monthName = (k) => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+k.slice(5, 7) - 1] + '/' + k.slice(2, 4);
  const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const brl0 = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');
  function hbars(rows, color) { // rows: {label, sub, v, text}
    const mx = Math.max(...rows.map((r) => r.v), 1e-9);
    return `<div class="hbars">${rows.map((r) => `<div class="hb"><div class="hl"><span class="t">${esc(r.label)}</span><span class="s">${esc(r.text)}</span></div><div class="bar"><i style="width:${Math.max(2, (r.v / mx) * 100).toFixed(1)}%;background:var(${color || '--m1'})"></i></div>${r.sub ? `<div class="hs">${esc(r.sub)}</div>` : ''}</div>`).join('')}</div>`;
  }
  function monthBars(months) {
    const mx = Math.max(...months.map((m) => m.spent), 1);
    return `<div class="vbars" role="img" aria-label="Gasto por mês">${months.map((m) => `<div class="vb" title="${monthName(m.month)}: ${brl(m.spent)}"><span class="vv">${brl0(m.spent).replace('R$ ', '')}</span><div class="col"><i style="height:${Math.max(3, (m.spent / mx) * 100).toFixed(1)}%"></i></div><span class="vl">${monthName(m.month).slice(0, 3)}</span></div>`).join('')}</div>`;
  }
  // gráfico de variação: 1 produto = R$ por mercado; 2 ou mais = variação % desde a primeira compra de cada um
  function trendHTML() {
    const A = an();
    if (ui.dsel === null) { const d = C.dashboard(S, { days: ui.dperiod, today: today() }); ui.dsel = d.products.filter((p) => A[p.key] && A[p.key].its.length > 1).slice(0, 1).map((p) => p.key); }
    ui.dsel = ui.dsel.filter((k) => A[k]);
    const sel = ui.dsel, q = C.norm(ui.dq || '');
    const results = q ? S.products.filter((p) => A[p.key] && !sel.includes(p.key) && C.norm(p.name + ' ' + C.brandOf(p)).includes(q)).slice(0, 6) : [];
    let chart = '', legend = '', note = '';
    if (sel.length === 1) {
      const a = A[sel[0]], byM = {};
      a.its.forEach((i) => { (byM[i.marketKey] = byM[i.marketKey] || { name: i.marketName, pts: [] }).pts.push({ d: i.date, v: i.unitPrice }); });
      const ser = Object.values(byM).sort((x, y) => y.pts.length - x.pts.length).slice(0, 5);
      chart = lineChart(ser, { dots: true }); legend = ser.map((x, i) => `<span><i style="background:var(--m${i + 1})"></i>${esc(x.name)}</span>`).join('');
      note = `R$ por ${ulabel(a.last.unit)}, em cada mercado.` + (a.chgFirst != null ? ` Desde a primeira compra: <b>${pct(a.chgFirst)}</b>.` : '');
    } else if (sel.length > 1) {
      const ser = sel.slice(0, 5).map((k) => { const a = A[k], f = a.its[0].unitPrice; return { name: a.p.name, pts: a.its.map((i) => ({ d: i.date, v: ((i.unitPrice - f) / f) * 100 })) }; });
      chart = lineChart(ser, { signed: true, dots: true, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v) + '%' });
      legend = ser.map((x, i) => `<span><i style="background:var(--m${i + 1})"></i>${esc(x.name)}</span>`).join('');
      note = 'Variação do preço (%) desde a primeira compra de cada produto, para comparar produtos de preços diferentes.';
    }
    return `<div class="card stack"><div class="lbl">Variação de preço</div>
      <div class="chips">${sel.map((k) => `<button class="chip on" data-act="dsel-del" data-key="${esc(k)}">${esc(A[k].p.name)} ×</button>`).join('')}</div>
      <input id="dq" class="in" type="search" placeholder="Buscar produto para o gráfico…" value="${esc(ui.dq || '')}" autocomplete="off" aria-label="Buscar produto">
      ${results.length ? `<div class="chips">${results.map((p) => `<button class="chip" data-act="dsel-add" data-key="${esc(p.key)}">+ ${esc(p.name)}</button>`).join('')}</div>` : q ? '<div class="note">Nenhum produto com compras encontrado.</div>' : ''}
      ${sel.length >= 5 ? '<div class="note">No máximo 5 produtos por vez.</div>' : ''}
      ${chart ? `${chart}<div class="legend">${legend}</div><div class="note">${note}</div>` : '<div class="note">Escolha um produto acima. Com 2 ou mais compras dele, o gráfico aparece.</div>'}</div>`;
  }
  function painelBody() {
    const d = C.dashboard(S, { days: ui.dperiod, today: today() });
    const chips = [[30, '30 dias'], [90, '90 dias'], [365, '12 meses'], [0, 'Tudo']];
    const head = `<div class="chips" role="group" aria-label="Período">${chips.map((c) => `<button class="chip ${ui.dperiod === c[0] ? 'on' : ''}" data-act="dperiod" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>`;
    if (!d.purchases) return head + empty('Sem compras neste período', 'Escolha um período maior ou importe mais notas.');
    const kpi = `<div class="kpis"><div><div class="k">Gasto</div><div class="v">${brl(d.spent)}</div></div><div><div class="k">Compras</div><div class="v">${d.purchases}</div></div><div><div class="k">Ticket médio</div><div class="v">${brl(d.avg)}</div></div><div><div class="k">Economia possível</div><div class="v ok">${brl(d.saving)}</div></div></div>`;
    const mk = hbars(d.markets.slice(0, 6).map((m) => ({ label: m.name, text: m.visits + (m.visits === 1 ? ' visita' : ' visitas'), v: m.visits, sub: `${brl(m.spent)} no total · ${brl(m.avg)} por visita · última em ${fdate(m.last)}` })));
    const pr = hbars(d.products.slice(0, 8).map((p) => ({ label: p.name, text: p.times + (p.times === 1 ? ' compra' : ' compras'), v: p.times, sub: `${fq(p.qty)} ${ulabel(p.unit)} · ${brl(p.spent)}` })), '--m2');
    const spend = hbars(d.products.slice().sort((a, b) => b.spent - a.spent).slice(0, 6).map((p) => ({ label: p.name, text: brl(p.spent), v: p.spent })), '--m3');
    const br = d.brands.length ? `<div class="card stack"><div class="lbl">Marcas mais compradas</div>${hbars(d.brands.slice(0, 6).map((b) => ({ label: b.brand, text: brl(b.spent), v: b.spent, sub: `${b.times} ${b.times === 1 ? 'compra' : 'compras'} · ${b.n} ${b.n === 1 ? 'produto' : 'produtos'}` })), '--m4')}</div>` : '';
    const wd = d.weekdays, wmax = Math.max(...wd.map((w) => w.visits));
    const wdays = `<div class="vbars wd" role="img" aria-label="Compras por dia da semana">${wd.map((w) => `<div class="vb" title="${WD[w.d]}: ${w.visits} compras, ${brl(w.spent)}"><span class="vv">${w.visits}</span><div class="col"><i style="height:${Math.max(3, wmax ? (w.visits / wmax) * 100 : 0).toFixed(1)}%;${w.visits === wmax && wmax ? '' : 'opacity:.55'}"></i></div><span class="vl">${WD[w.d]}</span></div>`).join('')}</div>`;
    const mv = (arr, up) => arr.slice(0, 4).map((m) => `<div class="row" data-act="product" data-key="${esc(m.key)}"><div class="grow"><div class="t">${esc(m.name)}</div><div class="s">${brl(m.from)} → ${brl(m.to)} por ${ulabel(m.unit)} · ${fdate(m.d0)} a ${fdate(m.d1)}</div></div><div class="r"><span class="badge ${up ? 'up' : 'down'}">${pct(m.chg)}</span></div></div>`).join('');
    return head + kpi
      + `<div class="card stack"><div class="lbl">Gasto por mês</div>${monthBars(d.months)}</div>`
      + trendHTML()
      + `<div class="card stack"><div class="lbl">Mercados mais visitados</div>${mk}</div>`
      + `<div class="card stack"><div class="lbl">Produtos mais comprados</div>${pr}</div>`
      + `<div class="card stack"><div class="lbl">Onde vai o dinheiro</div>${spend}</div>`
      + br
      + `<div class="card stack"><div class="lbl">Dia da semana das compras</div>${wdays}</div>`
      + (d.ups.length ? `<div class="lbl">Maiores altas de preço</div><div class="list">${mv(d.ups, true)}</div>` : '')
      + (d.downs.length ? `<div class="lbl">Maiores quedas de preço</div><div class="list">${mv(d.downs, false)}</div>` : '');
  }
  views.painel = (top, main) => {
    top.innerHTML = '<div><h1>Painel</h1><div class="sub">Seus hábitos de compra em números</div></div>';
    if (!S.purchases.length) { main.innerHTML = empty('Nada para mostrar ainda', 'Importe algumas notas e o painel mostra produtos mais comprados, mercados mais visitados e a variação dos preços.', `<button class="btn primary" data-act="import">${svg('plus', 'icon')}Importar notas</button>`); return; }
    main.innerHTML = `<div id="dash" class="stack">${painelBody()}</div>`;
  };

  views.lista = (top, main) => {
    const hz = S.settings.horizon;
    const rows = C.suggest(an(), { horizon: hz, cover: S.settings.cover }, today());
    top.innerHTML = `<div><h1>Lista de compras</h1><div class="sub">Para durar ${hz} dias</div></div><button class="btn" data-act="share" aria-label="Compartilhar lista">${svg('share', 'icon')}</button>`;
    const chips = [7, 15, 30, 60, 90];
    let h = `<div class="chips">${chips.map((d) => `<button class="chip ${d === hz ? 'on' : ''}" data-act="horizon" data-v="${d}">${d} dias</button>`).join('')}</div>`;
    const total = rows.reduce((a, r) => a + r.cost, 0);
    const offs = C.activeOffers(S, today()), offB = (r) => { const f = offs[r.key]; return f && f.unitPrice < r.price - 0.005 ? `<div class="s"><span class="badge down">oferta ${brl(f.unitPrice)} em ${esc(f.market)}${f.validUntil ? ' até ' + fdate(f.validUntil) : ''}</span></div>` : ''; };
    const row = (r) => {
      const on = !!S.shop.checked[r.key];
      return `<div class="row ${on ? 'done' : ''}"><button class="check ${on ? 'on' : ''}" data-act="tick" data-key="${esc(r.key)}" aria-label="Marcar ${esc(r.name)}">${svg('check', 'icon')}</button><div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${r.daysLeft < 1 ? 'acabou' : 'dura ~' + Math.round(r.daysLeft) + ' d'} · ${esc(r.market)} ${brl(r.price)}</div>${offB(r)}</div><div class="r"><div class="price">${fq(r.qty)} ${ulabel(r.unit)}</div><div class="s mono">${brl(r.cost)}</div></div></div>`;
    };
    if (rows.length) {
      h += `<div class="summary" style="grid-template-columns:1fr 1.4fr"><div><div class="k">Itens</div><div class="v">${rows.length}</div></div><div><div class="k">Estimado (menor preço)</div><div class="v big">${brl(total)}</div></div></div>`;
      const urgent = rows.filter((r) => r.urgent), rest = rows.filter((r) => !r.urgent);
      if (urgent.length) h += `<div class="group-h"><span>Acabando</span><span>${urgent.length}</span></div><div class="list">${urgent.map(row).join('')}</div>`;
      if (rest.length) h += `<div class="group-h"><span>Para reforçar o estoque</span><span>${rest.length}</span></div><div class="list">${rest.map(row).join('')}</div>`;
    } else {
      h += `<div class="note warn">${Object.values(an()).some((a) => a.rate) ? 'Nada acaba nesse prazo. Aumente os dias para ver uma compra maior.' : 'A lista automática aparece quando o app vê o mesmo produto em 2 compras ou mais.'}</div>`;
    }
    const man = S.shop.manual;
    h += `<div class="group-h"><span>Adicionados por você</span><span>${man.length}</span></div>`;
    if (man.length) h += `<div class="list">${man.map((m) => `<div class="row ${S.shop.checked[m.id] ? 'done' : ''}"><button class="check ${S.shop.checked[m.id] ? 'on' : ''}" data-act="tick" data-key="${esc(m.id)}" aria-label="Marcar ${esc(m.name)}">${svg('check', 'icon')}</button><div class="grow"><div class="t">${esc(m.name)}</div></div><div class="r price">${fq(m.qty)} ${ulabel(m.unit)}</div><button class="x" data-act="mdel" data-id="${esc(m.id)}" aria-label="Remover">×</button></div>`).join('')}</div>`;
    h += `<form id="madd" class="card" style="display:grid;grid-template-columns:1fr 70px auto;gap:8px"><input id="mn" class="in" placeholder="Item avulso" autocomplete="off" required><input id="mq" class="in num" inputmode="decimal" value="1" aria-label="Quantidade"><button class="btn" type="submit">Adicionar</button></form>`;
    const nChecked = Object.keys(S.shop.checked).filter((k) => S.shop.checked[k]).length;
    if (nChecked) h += `<button class="btn primary block" data-act="register">Registrar compra com ${nChecked} ${nChecked === 1 ? 'item marcado' : 'itens marcados'}</button>`;
    main.innerHTML = h;
  };

  views.estoque = (top, main) => {
    top.innerHTML = `<div><h1>Estoque</h1><div class="sub">Estimado pelo seu ritmo de compra</div></div>`;
    const all = Object.values(an());
    if (!all.length) { main.innerHTML = empty('Estoque vazio', 'O estoque é calculado a partir das compras importadas.', `<button class="btn primary" data-act="import">${svg('plus', 'icon')}Importar notas</button>`); return; }
    const cover = S.settings.cover;
    const withRate = all.filter((a) => a.rate && !a.p.ignore).sort((a, b) => a.daysLeft - b.daysLeft);
    const low = withRate.filter((a) => a.daysLeft <= cover);
    const f = ui.stockFilter;
    const shown = f === 'baixo' ? low : f === 'ok' ? withRate.filter((a) => a.daysLeft > cover) : withRate;
    let h = `<div class="chips">${[['todos', 'Todos (' + withRate.length + ')'], ['baixo', 'Acabando (' + low.length + ')'], ['ok', 'Em dia']].map((c) => `<button class="chip ${f === c[0] ? 'on' : ''}" data-act="sfilter" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>`;
    const row = (a) => {
      const d = a.daysLeft, cls = d <= cover ? 'low' : d <= 14 ? 'mid' : '';
      return `<button class="row" data-act="stock" data-key="${esc(a.p.key)}"><div class="grow"><div class="t">${esc(a.p.name)}</div><div class="s">~${fq(a.est)} ${ulabel(a.last.unit)} em casa${a.p.count ? ' · contado em ' + fdate(a.p.count.date) : ''}</div><div class="cover ${cls}"><i style="width:${Math.max(3, Math.min(100, (d / 30) * 100)).toFixed(0)}%"></i></div></div><div class="r"><div class="price">${d < 1 ? '<1' : Math.round(d)}</div><div class="s">dias</div></div></button>`;
    };
    h += shown.length ? `<div class="list">${shown.map(row).join('')}</div>` : `<div class="note">Nenhum produto nesta faixa.</div>`;
    const noRate = all.filter((a) => !a.rate && !a.p.ignore), ign = all.filter((a) => a.p.ignore);
    if (noRate.length) h += `<div class="group-h"><span>Aguardando a 2ª compra</span><span>${noRate.length}</span></div><div class="list">${noRate.map((a) => `<button class="row" data-act="stock" data-key="${esc(a.p.key)}"><div class="grow"><div class="t">${esc(a.p.name)}</div><div class="s">Comprado ${fdate((a.lastBuy || a.last).date)} · ${fq(a.qtyTotal)} ${ulabel(a.last.unit)}</div></div></button>`).join('')}</div>`;
    if (ign.length) h += `<div class="group-h"><span>Ignorados na lista</span><span>${ign.length}</span></div><div class="list">${ign.map((a) => `<button class="row" data-act="stock" data-key="${esc(a.p.key)}"><div class="grow"><div class="t">${esc(a.p.name)}</div></div><span class="badge flat">ignorado</span></button>`).join('')}</div>`;
    main.innerHTML = h;
  };

  views.ajustes = (top, main) => {
    top.innerHTML = `<div><h1>Ajustes</h1></div>`;
    const hasDemo = S.purchases.some((p) => p.demo);
    const cv = [3, 5, 7, 10];
    main.innerHTML = `
      <div class="card stack"><div class="lbl">Aviso de reposição</div><div class="note">Um produto entra em “Acabando” quando o estoque estimado dura menos que:</div>
        <div class="chips">${cv.map((d) => `<button class="chip ${S.settings.cover === d ? 'on' : ''}" data-act="cover" data-v="${d}">${d} dias</button>`).join('')}</div></div>
      <div class="card stack"><div class="lbl">Backup</div><div class="note">Seus dados ficam só neste aparelho. Exporte um backup de vez em quando.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="export">Baixar backup</button><button class="btn" data-act="exportcopy">Copiar backup</button><div class="pick"><div class="btn">Restaurar backup</div><input id="bk" type="file" accept=".json,application/json" aria-label="Escolher arquivo de backup"></div></div></div>
      <div class="card stack"><div class="lbl">Dados de exemplo</div><div class="note">Cerca de 14 meses de compras fictícias em 3 mercados, para testar o app.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="demo">Carregar exemplo</button>${hasDemo ? '<button class="btn" data-act="undemo">Remover exemplo</button>' : ''}</div></div>
      <div class="card stack"><div class="lbl">Apagar tudo</div><div class="note">Remove compras, produtos e lista deste aparelho.</div><button class="btn danger" data-act="wipe">Apagar todos os dados</button></div>
      <div class="note" style="text-align:center">Cesta Certa ${verLabel()} · ${persistent ? 'dados salvos no aparelho' : 'modo temporário (sem armazenamento)'}</div>`;
  };

  function renderTabs() {
    const tabs = [['compras', 'Compras'], ['precos', 'Preços'], ['painel', 'Painel'], ['lista', 'Lista'], ['estoque', 'Estoque'], ['ajustes', 'Ajustes']];
    $('#tabs').innerHTML = tabs.map((t) => `<button class="${tab === t[0] ? 'on' : ''}" data-act="tab" data-v="${t[0]}" ${tab === t[0] ? 'aria-current="page"' : ''}>${svg(t[0])}${t[1]}</button>`).join('');
  }
  function render(keepScroll) {
    const y = window.scrollY;
    views[tab]($('#top'), $('#view'));
    renderTabs();
    window.scrollTo(0, keepScroll ? y : 0);
  }

  /* ---------- folhas: compra, produto, estoque ---------- */
  const winMonths = () => (S.settings.window == null ? 12 : S.settings.window);
  const winLabel = (m) => (m ? 'últimos ' + m + ' meses' : 'todo o histórico');
  // Compara cada item da compra com o menor preço pago pelo mesmo produto em outras compras, dentro da janela escolhida
  function cmpHTML(id) {
    const m = winMonths(), r = C.compare(S, id, { months: m, today: today() }); if (!r) return '';
    const chips = [[3, '3 meses'], [6, '6 meses'], [12, '12 meses'], [0, 'Tudo']];
    const rows = r.rows.map((x) => {
      const i = x.item, b = x.best;
      let line, badge;
      if (x.status === 'promo') { line = x.promoRef ? `Fora da comparação · normalmente ${brl(x.promoRef)}${x.promoMin ? ' (menor já pago ' + brl(x.promoMin) + ')' : ''}` : 'Fora da comparação'; badge = '<span class="badge acc">super promoção</span>'; }
      else if (x.status === 'none') { line = 'Sem outra compra deste produto no período'; badge = '<span class="badge flat">sem histórico</span>'; }
      else if (x.status === 'best') { line = `Menor preço do período · outro: ${brl(b.unitPrice)} em ${esc(b.marketName)} (${fdate(b.date)})`; badge = '<span class="badge down">menor preço</span>'; }
      else { line = `Menor: ${brl(b.unitPrice)} em ${esc(b.marketName)} (${fdate(b.date)})`; badge = `<span class="badge up">${pct(x.diff)}</span>`; }
      const altLine = x.alt ? `<div class="s">Outra marca: ${esc(x.alt.brand || x.alt.name)} saiu por ${brl(x.alt.item.unitPrice)} em ${esc(x.alt.item.marketName)} (${fdate(x.alt.item.date)})</div>` : '';
      return `<div class="row"><div class="grow"><div class="t">${esc(prettyOf(i.productKey, i.name))}</div><div class="s mono">${fq(i.qty)} ${ulabel(i.unit)} × ${brl(i.unitPrice)}${i.disc > 0 ? ' · desc. −' + brl(i.disc) : ''}</div><div class="s">${line}</div>${altLine}</div><div class="r"><div class="price">${brl(i.total)}</div><div style="margin-top:3px">${badge}</div></div></div>`;
    }).join('');
    const none = r.covered === 0;
    return `<div class="card stack"><div class="lbl">Comparação com o melhor preço · ${winLabel(m)}</div>
        <div class="leader"><span class="n">Você pagou</span><span class="dots"></span><span class="v">${brl(r.paid)}</span></div>
        <div class="leader best"><span class="n">Nos melhores preços</span><span class="dots"></span><span class="v">${brl(r.ideal)}</span></div>
        <div class="leader"><span class="n">Economia possível</span><span class="dots"></span><span class="v">${brl(r.saving)}</span></div>
        ${r.promoCount ? `<div class="note">Super promoções nesta compra: ${r.promoCount} ${r.promoCount === 1 ? 'item' : 'itens'}, fora da comparação de preços${r.promoSaving > 0 ? `. Você economizou cerca de <b>${brl(r.promoSaving)}</b> contra o preço médio de sempre` : ''}.</div>` : ''}
        ${r.altSaving > 0 ? `<div class="note">Trocando de marca em alguns itens, daria para economizar mais ${brl(r.altSaving)}.</div>` : ''}
        <div class="note">${none ? 'Ainda não há outra compra desses produtos no período. Com mais notas, a comparação aparece aqui.' : `${r.covered} de ${r.rows.length} itens têm preço de outras compras no período. Os demais entram pelo valor que você pagou.`}</div>
        <div class="chips" role="group" aria-label="Período da comparação">${chips.map((c) => `<button class="chip ${m === c[0] ? 'on' : ''}" data-act="cmpwin" data-v="${c[0]}">${c[1]}</button>`).join('')}</div></div>
      <div class="list">${rows}</div>`;
  }
  function openPurchase(id) {
    const p = S.purchases.find((x) => x.id === id); if (!p) return;
    ui.curPurchase = id;
    openSheet(p.marketName || 'Compra', `
      <div class="note">${fdate(p.date)}${p.city ? ' · ' + esc(p.city) : ''} · ${p.source === 'xml' ? 'XML da nota' : p.source === 'page' ? 'página da Fazenda' : p.source === 'pdf' ? 'PDF' : p.source === 'ocr' ? 'foto/OCR' : 'digitada'}</div>
      <div id="cmp" class="stack">${cmpHTML(id)}</div>
      ${p.discount ? `<div class="leader"><span class="n">Desconto sem item</span><span class="dots"></span><span class="v">−${brl(p.discount)}</span></div>` : ''}
      <div class="leader"><span class="n"><b>Total pago</b></span><span class="dots"></span><span class="v">${brl(p.total)}</span></div>
      <div class="foot"><button class="btn danger" data-act="pdel" data-id="${esc(id)}">Excluir</button><button class="btn" data-act="pedit" data-id="${esc(id)}">Editar</button></div>`);
  }
  const prettyOf = (key, fallback) => { const p = S.products.find((x) => x.key === key); return p ? p.name : C.prettyName(fallback); };

  function histHTML(key) {
    const a = an()[key]; if (!a) return '';
    const all = (a.all || a.its).slice().sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)); // mais recente primeiro
    const from = C.addDays(today(), -365), f = ui.hist;
    const list = f === '5' ? all.slice(0, 5) : f === 'ano' ? all.filter((i) => i.date >= from) : all;
    const city = {}; S.purchases.forEach((p) => { city[p.id] = p.city; });
    const chips = [['5', 'Últimas 5'], ['ano', 'Último ano'], ['tudo', 'Tudo (' + all.length + ')']];
    const rows = list.map((i) => {
      const older = all.slice(all.indexOf(i) + 1).find((o) => !o.promo), chg = older && !i.promo ? (i.unitPrice - older.unitPrice) / older.unitPrice : null;
      const b = i.promo ? '<span class="badge acc">super promoção</span>' : chg == null ? '' : `<span class="badge ${chg > 0.005 ? 'up' : chg < -0.005 ? 'down' : 'flat'}">${pct(chg)}</span>`;
      const c = city[i.purchaseId];
      return `<div class="row"><div class="grow"><div class="t">${esc(i.marketName)}</div><div class="s">${fdate(i.date)} · ${fq(i.qty)} ${ulabel(i.unit)}${c ? ' · ' + esc(c) : ''}</div></div><div class="r"><div class="price">${brl(i.unitPrice)}</div><div style="margin-top:3px">${b}</div></div></div>`;
    }).join('');
    const prices = (list.filter((i) => !i.promo).length ? list.filter((i) => !i.promo) : list).map((i) => i.unitPrice);
    return `<div class="group-h"><span>Histórico de compras</span><span>${list.length} de ${all.length}</span></div>
      <div class="chips">${chips.map((c) => `<button class="chip ${f === c[0] ? 'on' : ''}" data-act="hist" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>
      ${list.length ? `<div class="note">Menor ${brl(Math.min(...prices))} · maior ${brl(Math.max(...prices))} · a variação compara com a compra anterior</div><div class="list">${rows}</div>` : '<div class="note">Nenhuma compra nesse período.</div>'}`;
  }

  // mesma coisa em outras marcas (mesmo nome sem a marca, mesmo tamanho)
  function brandsCard(a) {
    const gk = C.genericKey(a.p), A = an();
    const alts = S.products.filter((p) => p.key !== a.p.key && A[p.key] && C.genericKey(p) === gk && Std.sameSize(p.name, a.p.name));
    if (!alts.length) return '';
    const list = [a.p].concat(alts).map((p) => ({ p, a: A[p.key] })).sort((x, y) => x.a.last.unitPrice - y.a.last.unitPrice);
    const cheapest = list[0].a.last.unitPrice;
    return `<div class="card"><div class="lbl" style="margin-bottom:4px">Outras marcas deste produto</div>${list.map((x) => `<div class="leader ${x.a.last.unitPrice === cheapest ? 'best' : ''}"><span class="n">${esc(C.brandOf(x.p) || 'Sem marca')}${x.p.key === a.p.key ? ' <span class="note">(este)</span>' : ''} <span class="note">${esc(x.a.last.marketName)} · ${fdate(x.a.last.date)}</span></span><span class="dots"></span><span class="v">${brl(x.a.last.unitPrice)}${x.a.last.unitPrice > cheapest ? ' <span class="badge up">' + pct((x.a.last.unitPrice - cheapest) / cheapest) + '</span>' : ' <span class="badge down">menor</span>'}</span></div>`).join('')}</div>`;
  }
  function openProduct(key) {
    ui.curKey = key;
    const a = an()[key]; if (!a) return;
    const unit = ulabel(a.last.unit);
    const byMarket = {};
    a.its.forEach((i) => { (byMarket[i.marketKey] = byMarket[i.marketKey] || { name: i.marketName, pts: [] }).pts.push({ d: i.date, v: i.unitPrice }); });
    const series = Object.values(byMarket).sort((x, y) => y.pts.length - x.pts.length).slice(0, 5);
    const avg = a.its.reduce((s, i) => s + i.unitPrice, 0) / a.its.length;
    const mk = a.markets.slice().sort((x, y) => x.price - y.price);
    const cheapest = mk[0].price;
    const others = S.products.filter((p) => p.key !== key).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
    const badge = a.chg == null ? '' : `<span class="badge ${a.chg > 0.005 ? 'up' : a.chg < -0.005 ? 'down' : 'flat'}">${pct(a.chg)} vs. compra anterior</span>`;
    openSheet(a.p.name, `
      <div><div class="price" style="font-size:32px;font-weight:600">${brl(a.last.unitPrice)} <span class="note">por ${unit}</span></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">${badge}<span class="note">${esc(a.last.marketName)} · ${fdate(a.last.date)}</span></div></div>
      <div class="summary" style="grid-template-columns:repeat(3,1fr)"><div><div class="k">Mínimo</div><div class="v">${brl(a.min)}</div></div><div><div class="k">Média</div><div class="v">${brl(avg)}</div></div><div><div class="k">Máximo</div><div class="v">${brl(a.max)}</div></div></div>
      ${a.chgFirst != null ? `<div class="note">Desde ${fdate(a.its[0].date)}: <b>${pct(a.chgFirst)}</b> (${brl(a.its[0].unitPrice)} → ${brl(a.last.unitPrice)})</div>` : ''}
      ${a.its.length > 1 ? `<div class="card stack">${lineChart(series.map((s) => ({ name: s.name, pts: s.pts })))}<div class="legend">${series.map((s, i) => `<span><i style="background:var(--m${i + 1})"></i>${esc(s.name)}</span>`).join('')}</div></div>` : ''}
      <div class="card"><div class="lbl" style="margin-bottom:4px">Último preço em cada mercado</div>${mk.map((m) => `<div class="leader ${m.price === cheapest ? 'best' : ''}"><span class="n">${esc(m.name)} <span class="note">${fdate(m.date)}</span></span><span class="dots"></span><span class="v">${brl(m.price)}${m.price > cheapest ? ' <span class="badge up">' + pct((m.price - cheapest) / cheapest) + '</span>' : ' <span class="badge down">menor</span>'}</span></div>`).join('')}</div>
      <div id="hist" class="stack">${histHTML(key)}</div>
      ${a.rate ? `<div class="note">Seu consumo: ~${fq(a.rate * 30)} ${unit} por mês · você compra a cada ~${Math.round(a.interval)} dias.</div>` : ''}
      ${brandsCard(a)}
      <div class="card stack"><div class="lbl">Nome do produto</div><div style="display:flex;gap:8px"><input id="pn" class="in" value="${esc(a.p.name)}"><button class="btn" data-act="rename" data-key="${esc(key)}">Salvar</button></div>
        <div class="lbl" style="margin-top:6px">Marca</div><input id="pb" class="in" list="dl-b" value="${esc(C.brandOf(a.p))}" placeholder="Sem marca / genérico" autocomplete="off"><datalist id="dl-b">${allBrands().map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
        <div class="lbl" style="margin-top:6px">Unir com outro produto</div><div class="note">Use quando o mesmo item aparece com dois nomes.</div>
        <div style="display:flex;gap:8px"><select id="mg" class="in"><option value="">Escolher…</option>${others.map((p) => `<option value="${esc(p.key)}">${esc(p.name)}</option>`).join('')}</select><button class="btn" data-act="merge" data-key="${esc(key)}">Unir</button></div></div>`);
  }

  function openStock(key) {
    const a = an()[key]; if (!a) return;
    const unit = ulabel(a.last.unit);
    openSheet(a.p.name, `
      <div class="summary" style="grid-template-columns:1fr 1fr"><div><div class="k">Em casa (estimado)</div><div class="v big">${fq(a.est)} ${unit}</div></div><div><div class="k">Dura cerca de</div><div class="v big">${a.daysLeft == null ? '—' : Math.round(a.daysLeft) + ' d'}</div></div></div>
      ${a.rate ? `<div class="note">Consumo médio ~${fq(a.rate)} ${unit}/dia (${fq(a.rate * 30)} por mês). Compra a cada ~${Math.round(a.interval)} dias.</div>` : '<div class="note">Com uma segunda compra o app calcula o ritmo de consumo.</div>'}
      <div class="card stack"><div class="lbl">Quanto você tem em casa agora?</div><div class="note">Uma contagem corrige a estimativa. As próximas compras somam em cima dela.</div>
        <div style="display:flex;gap:8px"><input id="cnt" class="in num" inputmode="decimal" placeholder="0" value="${a.p.count ? fq(a.p.count.qty) : ''}" aria-label="Quantidade em casa"><button class="btn primary" data-act="count" data-key="${esc(key)}">Salvar</button></div>
        ${a.p.count ? `<button class="btn sm" data-act="uncount" data-key="${esc(key)}">Voltar para a estimativa</button>` : ''}</div>
      <button class="btn block" data-act="ignore" data-key="${esc(key)}">${a.p.ignore ? 'Voltar a incluir na lista automática' : 'Não incluir na lista automática'}</button>
      <button class="btn block" data-act="product" data-key="${esc(key)}">Ver histórico de preços</button>`);
  }

  /* ---------- importação ---------- */
  function openImport() {
    openSheet('Importar compras', `
      <div class="stack">
        <button class="btn block primary" data-act="scan" style="justify-content:flex-start;padding:14px">${svg('qr', 'icon')}<span style="text-align:left"><b>Escanear QR code da nota</b><br><span style="font-weight:400;font-size:13px">Aponte a câmera para o QR do cupom</span></span></button>
        <div class="pick"><div class="btn block" style="justify-content:flex-start;padding:14px">${svg('file', 'icon')}<span style="text-align:left"><b>Arquivos da Fazenda</b><br><span class="note">XML (exato) ou PDF da NFC-e, vários de uma vez</span></span></div>
          <input id="f-doc" type="file" accept=".xml,.pdf,text/xml,application/xml,application/pdf" multiple aria-label="Escolher arquivos XML ou PDF"></div>
        ${Native.canCamera ? `<button class="btn block" data-act="cam-nota" style="justify-content:flex-start;padding:14px">${svg('camera', 'icon')}<span style="text-align:left"><b>Tirar foto da nota</b><br><span class="note">Abre a câmera. Lê o texto no aparelho (OCR) e pede conferência</span></span></button>` : `<div class="pick"><div class="btn block" style="justify-content:flex-start;padding:14px">${svg('camera', 'icon')}<span style="text-align:left"><b>Tirar foto da nota</b><br><span class="note">Abre a câmera. Lê o texto no aparelho (OCR) e pede conferência</span></span></div>
          <input id="f-cam" type="file" accept="image/*" capture="environment" aria-label="Tirar foto da nota"></div>`}
        <div class="pick"><div class="btn block" style="justify-content:flex-start;padding:14px">${svg('file', 'icon')}<span style="text-align:left"><b>Foto ou print da galeria</b><br><span class="note">Escolha uma ou várias imagens já salvas</span></span></div>
          <input id="f-img" type="file" accept="image/*" multiple aria-label="Escolher foto da nota na galeria"></div>
        <button class="btn block" data-act="paste" style="justify-content:flex-start;padding:14px">${svg('link', 'icon')}<span style="text-align:left"><b>Link ou texto da nota (QR code)</b><br><span class="note">Abra a nota pelo QR code, copie o texto e cole aqui</span></span></button>
        <button class="btn block" data-act="offer" style="justify-content:flex-start;padding:14px">${svg('camera', 'icon')}<span style="text-align:left"><b>Folheto, banner ou etiqueta</b><br><span class="note">Lê os preços e compara com o seu histórico</span></span></button>
        <button class="btn block" data-act="manual" style="justify-content:flex-start;padding:14px">${svg('type', 'icon')}<span style="text-align:left"><b>Digitar manualmente</b><br><span class="note">Para compras sem nota</span></span></button>
        <div class="note">Dica: no portal da Fazenda do seu estado (ou no app de nota fiscal do consumidor) baixe o XML das notas com seu CPF. O XML traz código de barras, o que junta o mesmo produto em mercados diferentes.</div>
      </div>`);
  }

  const govHost = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /\.gov\.br$/.test(x.hostname); } catch (e) { return false; } };
  function openPaste() {
    const q = qrPending, cnpj = q && q.chave ? q.chave.slice(6, 20).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
    const top = q
      ? `<div class="card stack"><div class="lbl">QR code lido</div><div class="note">Nota do CNPJ ${esc(cnpj)}. O app não consegue abrir a página da Fazenda sozinho, então siga estes passos:</div>
          ${govHost(q.url) ? `<a class="btn block primary" href="${esc(q.url)}" target="_blank" rel="noopener">1. Abrir a nota na Fazenda</a>` : '<div class="note warn">O link do QR não é de um site da Fazenda, por segurança não vou abrir.</div>'}
          <div class="note">2. Na página, toque e segure no texto, escolha “Selecionar tudo” e “Copiar”.</div>
          <button class="btn block" data-act="paste-clip">3. Voltar aqui e tocar em Colar texto copiado</button></div>`
      : `<div class="note">Abra a nota pelo QR code, toque e segure no texto, escolha “Selecionar tudo” e “Copiar”. Depois toque em Colar texto copiado. Se colar só o link, o app tenta abrir a página sozinho.</div>
         <button class="btn block" data-act="paste-clip">Colar texto copiado</button>`;
    openSheet(q ? 'Nota do QR code' : 'Colar nota', `<div class="stack">${top}
      <textarea id="pt" class="in" rows="6" placeholder="Ou cole aqui o texto da nota ou o link" style="min-height:120px"></textarea><div id="pt-err" class="note warn" hidden></div></div>
      <div class="foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" data-act="paste-go">Ler nota</button></div>`);
  }

  /* ---------- leitor de QR code ---------- */
  async function nativeScan() {
    try {
      const t = await Native.scanQR();
      if (t) onQrText(t);
    } catch (e) {
      if (e.code === 'install') toast('Instalando o leitor do Google (precisa de internet). Tente de novo em instantes.');
      else openScanner(true);
    }
  }
  function openScanner(web) {
    if (!web && Native.canScan) { nativeScan(); return; }
    openSheet('Escanear QR code', `<div class="stack"><div class="scan"><video id="cam" playsinline muted></video><div class="scanbox"></div></div>
      <div id="scan-msg" class="note">Aponte para o QR code do cupom e aproxime até ele ficar nítido. A leitura é automática.</div>
      <div class="pick"><div class="btn block">${svg('camera', 'icon')} Tirar foto do QR code</div><input id="f-qr" type="file" accept="image/*" capture="environment" aria-label="Tirar foto do QR code"></div></div>
      <div class="foot"><button class="btn" data-act="close">Cancelar</button></div>`);
    const tok = ++camTok;
    QR.start($('#cam'), onQrText, (e) => {
      const m = $('#scan-msg'); if (!m) return;
      m.className = 'note warn';
      m.textContent = e && e.name === 'NotAllowedError' ? 'A câmera está bloqueada. Permita o acesso nas configurações do navegador, ou tire uma foto do QR code abaixo.'
        : e && /carregar/.test(e.message || '') ? e.message : 'Não consegui abrir a câmera aqui (ela só funciona no app instalado, em https). Tire uma foto do QR code abaixo.';
    }).then((fn) => { if (tok !== camTok || $('#sheet').hidden) fn(); else stopCam = fn; });
  }
  function onQrText(text) {
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignora */ }
    const chave = QR.chaveDe(text);
    if (!chave) { toast('Esse QR code não é de uma nota fiscal'); openScanner(); return; }
    if (S.purchases.some((p) => p.id === chave)) { closeSheet(); toast('Essa nota já foi importada'); return; }
    const um = String(text).match(/https?:\/\/\S+/);
    qrPending = { chave, url: um ? um[0] : '' };
    tryQrFetch();
  }
  async function tryQrFetch() {
    const q = qrPending;
    if (!govHost(q.url)) { openPaste(); return; }
    openSheet('Lendo a nota', '<div class="note">QR code lido. Abrindo a nota na Fazenda…</div>', { lock: true });
    try {
      const text = await Promise.race([Importers.fetchPage(q.url), new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), 8000))]);
      const d = Parser.parseSefazText(text + '\n' + q.url);
      if (!d.items.length) throw new Error('sem itens');
      d.id = d.id || q.chave; if (!d.date) guessDate(d);
      qrPending = null; closeSheet(); refineDraft(d); openReview(d, { title: 'Conferir nota' });
    } catch (e) { openPaste(); }
  }
  async function pasteClip() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t || !t.trim()) return toast('Não há nada copiado');
      $('#pt').value = t; readPasted();
    } catch (e) { toast('O navegador não deixou colar sozinho. Toque no campo e use Colar.'); }
  }

  async function readPasted() {
    const v = ($('#pt').value || '').trim(), err = $('#pt-err'), btn = $('[data-act="paste-go"]');
    const fail = (m) => { err.textContent = m; err.hidden = false; btn.textContent = 'Ler nota'; btn.disabled = false; };
    err.hidden = true;
    if (!v) return fail('Cole o texto da nota ou o link.');
    let text = v;
    const um = v.match(/https?:\/\/\S+/);
    if (um && v.replace(um[0], '').trim().length < 20) {
      btn.textContent = 'Abrindo…'; btn.disabled = true;
      try { text = (await Importers.fetchPage(um[0])) + '\n' + um[0]; } catch (e) { return fail('O app não conseguiu abrir a página. Use o QR code do cupom, ou abra o link no navegador, copie o texto da nota e cole aqui.'); }
    }
    let d = Parser.parseSefazText(text);
    if (!d.items.length) { const g = Parser.parseReceiptText(text); if (g.items.length) d = Object.assign(g, { id: d.id, source: 'pdf' }); }
    if (!d.items.length) {
      if (um && v.replace(um[0], '').trim().length < 20) return fail('Abri o link, mas a Fazenda não mostrou os itens. Links só com a chave de acesso (chNFe=...) pedem verificação no navegador. Use o botão de QR code, que abre a nota completa, ou tire um print da nota aberta e importe como foto.');
      return fail('Não achei itens nesse texto. Confira se copiou a nota inteira.');
    }
    if (!d.date) guessDate(d);
    if (qrPending) { if (!d.id) d.id = qrPending.chave; if (!d.marketCnpj) d.marketCnpj = qrPending.chave.slice(6, 20); qrPending = null; }
    refineDraft(d);
    openReview(d, { title: 'Conferir nota' });
  }

  async function processFiles(files) {
    files = Array.from(files); if (!files.length) return;
    openSheet('Lendo notas', `<div class="stack"><div class="note" id="pg-t">Preparando…</div><div class="bar"><i id="pg-b"></i></div><div class="note" id="pg-s"></div></div>`, { lock: true });
    const stat = { added: 0, dup: 0, fail: [] }, queue = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const t = $('#pg-t'); if (t) t.textContent = `Arquivo ${i + 1} de ${files.length}: ${f.name}`;
      const b = $('#pg-b'); if (b) b.style.width = ((i / files.length) * 100).toFixed(0) + '%';
      try {
        const r = await Importers.readFile(f, (p) => { const s = $('#pg-s'); if (s) s.textContent = 'Reconhecendo texto… ' + Math.round(p * 100) + '%'; });
        if (r.kind === 'xml') {
          const res = C.addPurchase(S, r.draft);
          if (res.duplicate) stat.dup++; else if (res.empty) stat.fail.push(f.name); else stat.added++;
        } else { if (r.draft.source === 'ocr' && r.draft.photoFile === undefined) r.draft.photoFile = f; queue.push({ draft: r.draft, name: f.name }); }
      } catch (e) {
        const isDoc = /\.xml$/i.test(f.name || '');
        if (isDoc) stat.fail.push(f.name + ' (' + e.message + ')');
        else { stat.manual = (stat.manual || 0) + 1; queue.push({ draft: { items: [], source: 'ocr', marketName: '', readError: (e && e.message) || String(e), photoFile: f }, name: f.name }); }
      }
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0));
    }
    dirty(); if (stat.added) await persist();
    closeSheet(); render();
    const parts = [];
    if (stat.added) parts.push(stat.added + ' importada' + (stat.added > 1 ? 's' : ''));
    if (stat.dup) parts.push(stat.dup + ' já existia' + (stat.dup > 1 ? 'm' : ''));
    if (stat.fail.length) parts.push(stat.fail.length + ' com erro');
    if (stat.manual) parts.push(stat.manual + ' para preencher à mão');
    if (parts.length) toast(parts.join(' · '));
    if (stat.fail.length) console.warn('Falhas na importação:', stat.fail);
    reviewQueue(mergeDanfe(queue), 0);
  }
  // várias folhas da mesma DANFE (mesma chave, ou folha 1/2 + 2/2) viram uma compra só
  function mergeDanfe(queue) {
    const by = {}, out = [];
    queue.forEach((q) => {
      const d = q.draft, key = d.danfe ? (d.id || (d.folha ? 'f' + d.folha[1] + ':' + (d.marketCnpj || '') : '')) : '';
      if (!key) { out.push(q); return; }
      const g = by[key];
      if (!g) { by[key] = q; d.folhas = 1; out.push(q); return; }
      const gd = g.draft; gd.items = gd.items.concat(d.items); gd.printedTotal = gd.printedTotal || d.printedTotal; gd.id = gd.id || d.id; gd.date = gd.date || d.date; gd.marketCnpj = gd.marketCnpj || d.marketCnpj; gd.folhas = (gd.folhas || 1) + 1; gd.rawText = (gd.rawText || '') + '\n' + (d.rawText || '');
    });
    return out;
  }

  // Compara nomes lidos por OCR com os produtos que você já comprou (código de barras, correção aprendida, nome parecido)
  function bigrams(str) { const t = C.norm(str).replace(/ /g, ''), m = new Map(); for (let i = 0; i < t.length - 1; i++) { const b = t.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); } return m; }
  function dice(a, b) { let inter = 0, ta = 0, tb = 0; a.forEach((v) => { ta += v; }); b.forEach((v) => { tb += v; }); a.forEach((v, k) => { if (b.has(k)) inter += Math.min(v, b.get(k)); }); return ta + tb ? (2 * inter) / (ta + tb) : 0; }
  const knownByName = (n) => S.products.find((p) => C.norm(p.name) === C.norm(n));
  // Sugere o nome comum do item: produto que já conheço > nome padronizado igual > parecido (mesmo tamanho) > nome padronizado novo
  function suggestStd(it, ocr) {
    suggestStd0(it, ocr);
    if (it.brandAuto !== false) { const p = knownByName(it.std); it.brand = (p && C.brandOf(p)) || Std.brandIn(it.std) || Std.brandIn(it.name) || ''; }
  }
  const allBrands = () => Array.from(new Set(Std.brandNames().concat(S.products.map((p) => C.brandOf(p)).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let _voc = null;
  const ocrVocab = () => _voc || (_voc = Std.vocabOf(S.products.map((p) => p.name)));
  function suggestStd0(it, ocr) {
    const info = Std.standardize(ocr ? Std.ocrFix(it.name, null, ocrVocab()) : it.name, it.unit);
    delete it.via; delete it.sim; it.stdAuto = true;
    const k = C.findKnown(S, it);
    if (k) { it.std = k.product.name; it.via = k.via; return; }
    const ex = knownByName(info.name); if (ex) { it.std = ex.name; return; }
    const m = Std.bestMatch(info.name, S.products.map((p) => p.name));
    if (m) { it.std = m.name; it.sim = m.name; return; }
    if (ocr && S.products.length) { // nome lido por OCR pode estar torto: compara com os produtos que você já tem
      const bg = bigrams(it.name); let best = null, bs = 0, second = 0;
      S.products.forEach((p) => { const sc = dice(bg, bigrams(p.name)); if (sc > bs) { second = bs; bs = sc; best = p; } else if (sc > second) second = sc; });
      if (best && bs >= 0.62 && bs - second >= 0.06) { it.std = best.name; it.sim = best.name; it.name = best.name; return; }
    }
    it.std = info.name;
  }
  function refineDraft(d) { _voc = null; const ocr = d.source === 'ocr' || d.source === 'pdf'; d.items.forEach((it) => suggestStd(it, ocr)); }

  // Sem data na nota: usa o mês da chave de acesso quando dá; o dia você confere
  function guessDate(d) {
    const cm = C.chaveMonth(d.id || (qrPending && qrPending.chave)), t = today();
    d.dateGuess = true;
    if (cm && cm !== t.slice(0, 7)) { d.date = cm + '-01'; d.dateMsg = `Pela chave da nota, a compra foi em ${cm.slice(5)}/${cm.slice(0, 4)}. Não achei o dia: confira.`; }
    else { d.date = t; d.dateMsg = cm ? 'A página da Fazenda não mostra a data. Coloquei a de hoje (o mês confere com a chave da nota). Confira o dia.' : 'Não consegui ler a data da nota. Coloquei a de hoje, confira.'; }
  }
  const itemsOfPurchase = (p) => S.items.filter((i) => i.purchaseId === p.id).map((i) => { const o = i.orig || i; return { name: i.name, std: prettyOf(i.productKey, i.name), brand: C.brandOf(S.products.find((x) => x.key === i.productKey)), brandAuto: false, keepStd: true, ean: i.ean, scode: i.scode || '', promo: !!i.promo, qty: o.qty, unit: o.unit, unitPrice: o.unitPrice, total: i.total, disc: i.disc || 0 }; });
  function reviewQueue(q, i) {
    if (i >= q.length) return;
    const d = q[i].draft;
    if (!d.date) guessDate(d);
    refineDraft(d);
    openReview(d, { title: `Conferir nota${q.length > 1 ? ' (' + (i + 1) + '/' + q.length + ')' : ''}`, skip: true, onDone: () => setTimeout(() => reviewQueue(q, i + 1), 150) });
  }

  /* ---------- revisão / digitação de compra ---------- */
  function openReview(draft, opts) {
    opts = opts || {};
    const items = (draft.items && draft.items.length ? draft.items : [{ name: '', qty: 1, unit: 'UN', unitPrice: '' }]).map((i) => Object.assign({}, i));
    items.forEach((i) => { if (i.std === undefined) suggestStd(i, false); else if (i.stdAuto === undefined) i.stdAuto = !i.keepStd; });
    items.forEach((i) => { i.disc0 = i.disc || 0; });
    const dt = C.round(C.num(draft.discount) || 0, 2);
    RV = { draft, items, opts, discTotal: dt, drows: dt > 0 ? [{ item: null, amt: '' }] : [] };
    const markets = Array.from(new Set(S.purchases.map((p) => p.marketName))).sort();
    const cnpjOk = String(draft.marketCnpj || '').replace(/\D/g, '').length === 14;
    const mk = cnpjOk ? C.suggestMarket(S, draft.marketCnpj, draft.marketName, draft.city) : { name: draft.marketName || '', known: true };
    RV.mk = mk; RV.razao = draft.marketName || '';
    const names = S.products.map((p) => p.name).sort();
    const warn = draft.source === 'ocr' || draft.source === 'pdf';
    openSheet(opts.title || 'Nova compra', `
      ${draft.readError ? `<div class="note warn">Não consegui ler esta imagem (${esc(draft.readError)}). Veja a foto abaixo e preencha os itens, ou pule.</div>` : (draft.source === 'ocr' && draft.photoFile === undefined && !(draft.items && draft.items.length)) ? '<div class="note warn">Não encontrei itens na leitura. Adicione os itens à mão.</div>' : ''}
      ${draft.folha && draft.folha[1] > (draft.folhas || 1) ? `<div class="note warn">Esta nota tem ${draft.folha[1]} folhas e vieram ${draft.folhas || 1}. Faltam itens: se tem as outras folhas, importe todas de uma vez (selecione as fotos juntas). Se importar depois, os itens são somados a esta compra.</div>` : ''}
      ${draft.photoFile ? `<details ${draft.readError || !(draft.items && draft.items.length) || (draft.items || []).some((i) => i.check) ? 'open' : ''}><summary class="note">Foto da nota</summary><img id="rv-photo" alt="Foto da nota" style="max-width:100%;border-radius:10px"></details>` : ''}
      ${draft.source === 'page' ? `<div class="note warn">Nota lida da página da Fazenda. Os nomes vêm como o mercado cadastrou e não há código de barras. Confira antes de salvar.</div>` : warn ? `<div class="note warn">Confira os itens lidos. Linhas em amarelo têm números que não fecham.</div>` : ''}
      <div id="rv-sum" class="rvsum"></div>
      <div class="field"><label for="rv-m">Mercado</label><input id="rv-m" class="in" list="dl-m" value="${esc(mk.name || draft.marketName || '')}" placeholder="Nome do mercado" autocomplete="off">${cnpjOk && !mk.known ? `<div class="note" id="rv-mnote">${mk.fromRede ? 'Parece outra loja da rede ' + esc(mk.fromRede) + '. Confirme ou ajuste o nome.' : 'Nome vindo da razão social. Digite o nome que você usa (ex.: SMC): vou lembrar para este CNPJ.'}</div>` : ''}</div>
      <div class="field"><label for="rv-d">Data</label><input id="rv-d" class="in" type="date" value="${esc(draft.date || today())}">${draft.dateGuess ? `<div class="note warn">${esc(draft.dateMsg || 'Não consegui ler a data da nota. Coloquei a de hoje, confira.')}</div>` : ''}</div>
      <datalist id="dl-m">${markets.map((m) => `<option value="${esc(m)}">`).join('')}</datalist><datalist id="dl-p">${names.map((m) => `<option value="${esc(m)}">`).join('')}</datalist><datalist id="dl-b">${allBrands().map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
      <div id="rv-items"></div>
      <button class="btn sm" data-act="rv-add" style="align-self:flex-start">${svg('plus', 'icon')} Adicionar item</button>
      <div id="rv-discbox"></div>
      <div class="leader"><span class="n"><b>Total a pagar</b></span><span class="dots"></span><span class="v" id="rv-tot"></span></div>
      ${draft.printedTotal ? '<div id="rv-chk" class="note"></div>' : ''}
      ${draft.rawText ? `<details><summary class="note">Texto lido da nota</summary><pre class="note" style="white-space:pre-wrap">${esc(draft.rawText)}</pre></details>` : ''}
      <div class="foot end">${opts.skip ? '<button class="btn" data-act="rv-skip">Pular</button>' : '<button class="btn" data-act="close">Cancelar</button>'}<button class="btn primary" data-act="rv-save">Salvar compra</button></div>`, { lock: !!opts.skip });
    drawItems(); drawDisc();
    if (cnpjOk && !mk.known && !mk.fromRede && typeof fetch === 'function') {
      const rvRef = RV, cn = String(draft.marketCnpj).replace(/\D/g, '');
      Promise.race([fetch('https://brasilapi.com.br/api/cnpj/v1/' + cn).then((r) => (r.ok ? r.json() : null)), new Promise((r) => setTimeout(() => r(null), 5000))]).then((j) => {
        const fan = j && String(j.nome_fantasia || '').trim(); if (!fan || RV !== rvRef) return;
        const inp = $('#rv-m'); if (!inp || inp.value !== mk.name) return; // você já mexeu no nome
        inp.value = fan.replace(/\b([A-ZÀ-Ý])([A-ZÀ-Ý]+)\b/g, (m, x, y) => (m.length > 3 ? x + y.toLowerCase() : m));
        const nt = $('#rv-mnote'); if (nt) nt.textContent = 'Nome fantasia do CNPJ: ' + inp.value + '. Ajuste se usa outro nome (ex.: SMC).';
      }).catch(() => {});
    }
    if (draft.photoFile) { try { RV.photoUrl = URL.createObjectURL(draft.photoFile); const im = $('#rv-photo'); if (im) im.src = RV.photoUrl; } catch (e) { /* sem prévia */ } }
  }
  const $$all = (q) => Array.from(document.querySelectorAll(q));
  const itemTotal = (i) => { const q = C.num(i.qty), p = C.num(i.unitPrice); return isFinite(q * p) ? q * p : 0; };
  function stdNote(i) {
    const ex = knownByName(i.std), info = Std.standardize(i.name, i.unit);
    let chip;
    if (!String(i.std || '').trim()) chip = '<span class="badge flat">Informe o nome comum</span>';
    else if (ex) chip = `<span class="badge down">${i.via ? 'Reconhecido · ' + esc(i.via) : 'Já no seu catálogo'}</span>`;
    else if (i.sim && i.sim === i.std) chip = '<span class="badge warn">Parecido com um produto seu, confirme</span>';
    else chip = '<span class="badge acc">Produto novo</span>';
    const base = ex && ex.base ? ex.base : info.base, q = C.num(i.qty), p = C.num(i.unitPrice);
    let line = '';
    if (q > 0 && isFinite(p)) {
      const nz = Std.normalizeItem(i.name, i.unit, q, p, Object.assign({}, info, { base }));
      if (base === 'dz') line = `${fq(nz.qty)} dz a ${brl(nz.unitPrice)} por dúzia`;
      else if (base === 'kg') line = `${fq(nz.qty)} kg a ${brl(nz.unitPrice)} por kg`;
      else if (base === 'l') line = `${fq(nz.qty)} L a ${brl(nz.unitPrice)} por L`;
      else { const pu = Std.perUnit(i.std || info.name, nz.unitPrice); line = `${brl(nz.unitPrice)} por embalagem` + (pu ? ` · ${brl(pu.value)} por ${pu.unit}` : ''); }
    }
    if (String(i.ean || '').trim() && !C.validEAN(i.ean)) chip += ' <span class="badge warn">Código de barras inválido</span>';
    return chip + (line ? ` <span>Padrão: ${line}</span>` : '') + (info.assumed && base === 'dz' ? `<div class="note warn">Não achei a quantidade de ovos no nome (considerei 1 dúzia por unidade). Quantos ovos vêm em cada um?<div class="chips">${[6, 10, 12, 15, 18, 20, 24, 30].map((n) => `<button class="chip" data-act="egg-n" data-i="${RV ? RV.items.indexOf(i) : -1}" data-n="${n}">${n}</button>`).join('')}</div></div>` : '');
  }
  function promoHintHTML(i) {
    if (i.promo) return '';
    const h = C.promoHint(S, i); if (!h) return '';
    return h.kind === 'hist' ? `<span class="badge warn">Preço ${h.pct}% abaixo do que você costuma pagar (média ${brl(h.avg)}). É super promoção? Marque acima.</span>` : '<span class="badge warn">Preço muito baixo. É super promoção? Marque acima.</span>';
  }
  function drawItems() {
    $('#rv-items').innerHTML = RV.items.map((i, n) => `
      <div class="itm ${i.check ? 'check' : ''}" data-i="${n}">
        <div class="l1"><input class="in nm" data-f="name" value="${esc(i.name)}" placeholder="Produto como veio na nota" aria-label="Produto como veio na nota" autocomplete="off"><button class="x" data-act="rv-del" data-i="${n}" aria-label="Remover item">×</button></div>
        ${i.note ? `<div class="note warn">${esc(i.note)}</div>` : ''}
        <div class="l2"><input class="in num" data-f="qty" inputmode="decimal" value="${esc(i.qty)}" aria-label="Quantidade" placeholder="Qtd"><input class="in" data-f="unit" value="${esc(i.unit || 'UN')}" aria-label="Unidade" placeholder="Un"><input class="in num" data-f="unitPrice" inputmode="decimal" value="${esc(i.unitPrice === '' ? '' : String(i.unitPrice).replace('.', ','))}" aria-label="Preço unitário" placeholder="Preço un."><span class="sub" data-sub>${brl(itemTotal(i))}</span></div>
        <div class="note" data-discnote ${i.disc > 0 ? '' : 'hidden'}>Desconto no item: −${brl(i.disc || 0)}</div>
        <div class="stdrow"><label for="std-${n}">Nome comum</label><input id="std-${n}" class="in" data-f="std" list="dl-p" value="${esc(i.std || '')}" placeholder="Nome padrão do produto" autocomplete="off"></div>
        <div class="stdrow"><label for="br-${n}">Marca</label><input id="br-${n}" class="in" data-f="brand" list="dl-b" value="${esc(i.brand || '')}" placeholder="Sem marca / genérico" autocomplete="off"></div>
        <div class="stdrow"><label for="ean-${n}">Cód. barras</label><div class="eanrow"><input id="ean-${n}" class="in" data-f="ean" inputmode="numeric" value="${esc(i.ean || '')}" placeholder="EAN (opcional)" autocomplete="off">${Native.canScan ? `<button class="btn sm" data-act="rv-ean-scan" data-i="${n}" aria-label="Escanear código de barras">${svg('qr', 'icon')}</button>` : ''}</div></div>
        <label class="promo"><input type="checkbox" data-f="promo" ${i.promo ? 'checked' : ''}> <span>Super promoção <span class="note">(preço fora do normal: não entra na comparação)</span></span></label>
        <div class="note" data-promohint>${promoHintHTML(i)}</div>
        <div class="note stdnote" data-stdnote>${stdNote(i)}</div>
      </div>`).join('');
    fillDsel();
    updTotal();
  }

  /* descontos por item: uma linha por item (item + valor); o "+" cria a próxima linha até fechar o desconto total da nota */
  const discOf = (it) => RV.drows.reduce((a, r) => a + (r.item === it && C.num(r.amt) > 0 ? C.num(r.amt) : 0), 0);
  const discDist = () => C.round(RV.drows.reduce((a, r) => a + (r.item && C.num(r.amt) > 0 ? C.num(r.amt) : 0), 0), 2);
  const discRest = () => (RV.discTotal > 0 ? Math.max(0, C.round(RV.discTotal - discDist(), 2)) : 0);
  function discStatus() {
    const dist = discDist(), tot = RV.discTotal;
    if (!(tot > 0)) return { cls: 'note', t: dist > 0 ? 'Descontos nos itens: ' + brl(dist) : '' };
    if (Math.abs(dist - tot) < 0.005) return { cls: 'note ok', t: '✓ Todo o desconto da nota está distribuído (' + brl(dist) + ').' };
    if (dist < tot) return { cls: 'note warn', t: 'Distribuído ' + brl(dist) + ' de ' + brl(tot) + '. Falta ' + brl(tot - dist) + ': toque no + para outro item.' };
    return { cls: 'note warn', t: 'Passou ' + brl(dist - tot) + ' do desconto total da nota (' + brl(tot) + ').' };
  }
  function paintDiscStatus() { const ph = discRest() > 0 ? String(discRest()).replace('.', ',') : '0,00'; $$all('input[data-d=amt]').forEach((el) => { el.placeholder = ph; }); const e = $('#disc-st'); if (e) { const st = discStatus(); e.className = st.cls; e.textContent = st.t; e.hidden = !st.t; } }
  const itemOpts = (sel) => '<option value="">Escolha o item</option>' + RV.items.map((i, n) => `<option value="${n}" ${RV.items[n] === sel ? 'selected' : ''}>${n + 1}. ${esc(String(i.name).slice(0, 26))}</option>`).join('');
  function fillDsel() { $$all('select[data-d=sel]').forEach((el, n) => { el.innerHTML = itemOpts(RV.drows[n] && RV.drows[n].item); }); }
  function drawDisc() {
    const box = $('#rv-discbox'); if (!box) return;
    if (!RV.drows.length && !(RV.discTotal > 0)) { box.innerHTML = '<button class="btn sm" data-act="drow-add" data-n="-1" style="align-self:flex-start">' + svg('plus', 'icon') + ' Adicionar desconto em um item</button>'; return; }
    const rows = RV.drows.map((r, n) => `<div class="drow" data-n="${n}"><button class="btn plus" data-act="drow-add" data-n="${n}" aria-label="Adicionar desconto em outro item">+</button><select class="in" data-d="sel" aria-label="Item com desconto">${itemOpts(r.item)}</select><input class="in num" data-d="amt" inputmode="decimal" placeholder="${discRest() > 0 ? esc(String(discRest()).replace('.', ',')) : '0,00'}" value="${esc(r.amt)}" aria-label="Valor do desconto"><button class="x" data-act="drow-del" data-n="${n}" aria-label="Remover desconto">×</button></div>`).join('');
    box.innerHTML = `<div class="card stack"><div class="lbl">Descontos</div>
      <div class="note">A página da Fazenda informa só o desconto total. O cupom impresso mostra o item (ex.: “Desconto Item:002”). Escolha o item e o valor; toque no + para adicionar outro item até fechar o total.</div>
      <div class="field"><label for="rv-disc">Desconto total da nota (R$)</label><input id="rv-disc" class="in num" inputmode="decimal" value="${esc(String(RV.discTotal).replace('.', ','))}"></div>
      <div class="dlist">${rows}</div>
      ${RV.drows.length ? '' : '<button class="btn sm" data-act="drow-add" data-n="-1" style="align-self:flex-start">' + svg('plus', 'icon') + ' Adicionar item com desconto</button>'}
      <div id="disc-st" class="note"></div></div>`;
    paintDiscStatus();
  }
  // aplica as linhas de desconto nos preços dos itens (preço original menos desconto / quantidade)
  function recalcDisc(force) {
    RV.items.forEach((it, n) => {
      const d = C.round(discOf(it), 2), q = C.num(it.qty) || 1;
      it.disc = C.round((it.disc0 || 0) + d, 2);
      if (!force && Math.abs(d - (it._dd || 0)) < 1e-9) return;
      if (it.u0 === undefined || !(it._dd > 0)) it.u0 = C.num(it.unitPrice);
      it._dd = d;
      if (isFinite(it.u0)) { it.unitPrice = d > 0 ? C.round(it.u0 - d / q, 4) : it.u0; if (d > 0) it.check = false; }
      const row = document.querySelectorAll('.itm')[n]; if (!row) return;
      const pi = $('[data-f=unitPrice]', row); if (pi && isFinite(C.num(it.unitPrice))) pi.value = String(it.unitPrice).replace('.', ',');
      const sb = $('[data-sub]', row); if (sb) sb.textContent = brl(itemTotal(it));
      const sn = $('[data-stdnote]', row); if (sn) sn.innerHTML = stdNote(it);
      const dn = $('[data-discnote]', row); if (dn) { dn.hidden = !(it.disc > 0); dn.textContent = 'Desconto no item: −' + brl(it.disc); }
      row.classList.toggle('check', !!it.check);
    });
    updTotal(); paintDiscStatus();
  }
  function updTotal() {
    const t = $('#rv-tot'); if (!t) return;
    const tot = RV.items.reduce((a, i) => a + itemTotal(i), 0) - discRest();
    t.textContent = brl(tot);
    const sm = $('#rv-sum');
    if (sm) {
      const nItems = RV.items.filter((i) => String(i.name).trim()).length, pt0 = RV.draft.printedTotal, dd = pt0 ? C.round(tot - pt0, 2) : 0;
      sm.className = 'rvsum' + (pt0 && Math.abs(dd) >= 0.005 ? ' warn' : '');
      sm.innerHTML = `<span><b>${nItems}</b> ${nItems === 1 ? 'item' : 'itens'}</span><span>Total lido <b>${brl(tot)}</b></span>` + (pt0 ? (Math.abs(dd) < 0.005 ? '<span>✓ confere com a nota</span>' : `<span>${dd < 0 ? 'faltam ' + brl(-dd) : 'sobram ' + brl(dd)} para fechar ${brl(pt0)}</span>`) : '');
    }
    const ck = $('#rv-chk'), pt = RV.draft.printedTotal;
    if (ck && pt) {
      const diff = C.round(tot - pt, 2);
      ck.className = 'note' + (Math.abs(diff) < 0.005 ? '' : ' warn');
      ck.textContent = Math.abs(diff) < 0.005 ? 'Confere com o total impresso na nota (' + brl(pt) + ').' : 'Total impresso na nota: ' + brl(pt) + '. Diferença de ' + brl(Math.abs(diff)) + ': algum preço está errado.';
    }
  }

  async function saveReview() {
    const mName = $('#rv-m').value.trim(), date = $('#rv-d').value;
    if (!mName) return toast('Informe o mercado');
    if (!date) return toast('Informe a data');
    const valid = RV.items.filter((i) => String(i.name).trim() && C.num(i.qty) > 0 && isFinite(C.num(i.unitPrice)));
    if (!valid.length) return toast('Adicione ao menos um item com quantidade e preço');
    const d = RV.draft, replaceId = RV.opts.replaceId;
    const draft = {
      id: replaceId || d.id, date, marketName: mName, marketCnpj: d.marketCnpj, city: d.city, source: d.source || 'manual',
      items: valid.map((i) => ({ name: String(i.name).trim(), std: String(i.std || '').trim(), brand: String(i.brand || '').trim(), ean: String(i.ean || '').replace(/\D/g, ''), scode: i.scode || i.code || '', promo: !!i.promo, qty: C.num(i.qty), unit: String(i.unit || 'UN').trim(), unitPrice: C.num(i.unitPrice), total: C.num((C.num(i.qty) * C.num(i.unitPrice)).toFixed(2)), disc: i.disc || 0 })),
    };
    const disc = discRest();
    draft.discount = disc; draft.total = C.round(draft.items.reduce((a, i) => a + i.total, 0) - disc, 2);
    let merged = false;
    if (!replaceId && d.danfe && d.id) { // outra folha de uma DANFE já salva: soma os itens à mesma compra
      const old = S.purchases.find((x) => x.id === d.id);
      if (old) { draft.items = itemsOfPurchase(old).concat(draft.items); draft.discount = C.round((old.discount || 0) + disc, 2); draft.total = C.round(draft.items.reduce((a, i) => a + C.num(i.total), 0) - draft.discount, 2); draft.marketName = old.marketName; draft.date = old.date; C.removePurchase(S, d.id, true); merged = true; }
    }
    if (replaceId) C.removePurchase(S, replaceId, true);
    if (String(d.marketCnpj || '').replace(/\D/g, '').length === 14) C.setMarketName(S, d.marketCnpj, mName);
    const res = C.addPurchase(S, draft);
    if (res.duplicate) return toast('Essa nota já foi importada');
    C.pruneProducts(S);
    dirty(); await persist();
    const done = RV.opts.onDone, wasShop = RV.opts.fromShop;
    if (wasShop) { S.shop.checked = {}; await persistMeta(); }
    closeSheet(); render(true);
    if (done) { toast(merged ? 'Itens somados à compra já salva' : 'Compra salva'); done(true); } else { openPurchase(res.id); toast('Compra salva'); }
  }

  /* ---------- lista: registrar compra e compartilhar ---------- */
  function shopItems() {
    const rows = C.suggest(an(), { horizon: S.settings.horizon, cover: S.settings.cover }, today());
    const list = rows.map((r) => ({ key: r.key, name: r.name, qty: r.qty, unit: r.unit, price: r.price, market: r.market }));
    S.shop.manual.forEach((m) => list.push({ key: m.id, name: m.name, qty: m.qty, unit: m.unit || 'UN', price: null, market: '' }));
    return list;
  }
  function registerShop() {
    const sel = shopItems().filter((r) => S.shop.checked[r.key]);
    if (!sel.length) return;
    const cnt = {}; sel.forEach((r) => { if (r.market) cnt[r.market] = (cnt[r.market] || 0) + 1; });
    const market = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || '';
    const items = sel.map((r) => { const p = S.products.find((x) => x.key === r.key); return { name: p ? p.name : r.name, std: p ? p.name : undefined, brand: p ? C.brandOf(p) : '', brandAuto: !!p, keepStd: !!p, ean: p ? p.ean : '', qty: r.qty, unit: r.unit, unitPrice: r.price == null ? '' : r.price }; });
    openReview({ marketName: market, date: today(), items, source: 'manual' }, { title: 'Registrar compra', fromShop: true });
  }
  async function shareList() {
    const rows = shopItems();
    if (!rows.length) return toast('A lista está vazia');
    const text = `Lista de compras (${S.settings.horizon} dias)\n` + rows.map((r) => `- ${fq(r.qty)} ${ulabel(r.unit)} ${r.name}`).join('\n');
    if (navigator.share) { try { await navigator.share({ title: 'Lista de compras', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text).then(() => toast('Lista copiada'), () => openSheet('Lista de compras', `<textarea class="in" rows="10" readonly>${esc(text)}</textarea><div class="note">Selecione e copie o texto.</div>`));
  }

  /* ---------- backup ---------- */
  const backupJSON = () => JSON.stringify({ v: 1, app: 'cesta-certa', purchases: S.purchases, items: S.items, products: S.products, aliases: S.aliases, settings: S.settings, shop: S.shop });
  async function restore(file) {
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.purchases) || !Array.isArray(j.items) || !Array.isArray(j.products)) throw new Error('arquivo inválido');
      S.purchases = j.purchases; S.items = j.items; S.products = j.products; S.aliases = j.aliases || {};
      Object.assign(S.settings, j.settings || {}); S.shop = Object.assign({ manual: [], checked: {} }, j.shop || {});
      dirty(); await persist(); render(); toast('Backup restaurado');
    } catch (e) { toast('Não consegui ler o backup: ' + e.message); }
  }

  /* ---------- ações (delegação de cliques) ---------- */
  const actions = {
    tab: (el) => { tab = el.dataset.v; closeSheet(); render(); },
    close: () => closeSheet(),
    import: () => openImport(),
    'egg-n': (el) => { const i = RV && RV.items[+el.dataset.i]; if (!i) return; i.name = String(i.name).trim() + ' ' + el.dataset.n + 'U'; if (i.stdAuto !== false) suggestStd(i, false); drawItems(); },
    'rv-ean-scan': async (el) => { try { const code = await Native.scanEAN(); const i = RV && RV.items[+el.dataset.i]; if (!code || !i) return; i.ean = code; if (i.stdAuto !== false) suggestStd(i, false); drawItems(); } catch (e) { toast('Não consegui ler o código de barras'); } },
    'cam-nota': async () => { try { const f = await Native.takePhoto(); if (f) { closeSheet(); processFiles([f]); } } catch (e) { toast('Não consegui abrir a câmera: ' + ((e && e.message) || e)); } },
    'cam-offer': async () => { try { const f = await Native.takePhoto(); if (f) processOffers([f]); } catch (e) { toast('Não consegui abrir a câmera: ' + ((e && e.message) || e)); } },
    paste: () => { qrPending = null; openPaste(); },
    scan: () => openScanner(),
    'paste-clip': () => pasteClip(),
    'paste-go': () => readPasted(),
    manual: () => openReview({ marketName: '', date: today(), items: [], source: 'manual' }, { title: 'Nova compra' }),
    purchase: (el) => openPurchase(el.dataset.id),
    pdel: async (el) => {
      if (!armed.pdel) { armed.pdel = 1; el.textContent = 'Toque de novo para excluir'; setTimeout(() => { armed.pdel = 0; if (el.isConnected) el.textContent = 'Excluir'; }, 4000); return; }
      armed.pdel = 0; C.removePurchase(S, el.dataset.id); dirty(); await persist(); closeSheet(); render(true); toast('Compra excluída');
    },
    pedit: (el) => {
      const p = S.purchases.find((x) => x.id === el.dataset.id); if (!p) return;
      const items = itemsOfPurchase(p);
      openReview({ marketName: p.marketName, marketCnpj: p.marketCnpj, city: p.city, date: p.date, items, source: p.source, discount: p.discount || 0 }, { title: 'Editar compra', replaceId: p.id });
    },
    product: (el) => openProduct(el.dataset.key),
    hist: (el) => { ui.hist = el.dataset.v; const h = $('#hist'); if (h) h.innerHTML = histHTML(ui.curKey); },
    stock: (el) => openStock(el.dataset.key),
    pview: (el) => { ui.pview = el.dataset.v; render(true); },
    sort: (el) => { ui.sort = el.dataset.v; render(true); },
    sfilter: (el) => { ui.stockFilter = el.dataset.v; render(true); },
    horizon: async (el) => { S.settings.horizon = +el.dataset.v; await persistMeta(); render(true); },
    cover: async (el) => { S.settings.cover = +el.dataset.v; await persistMeta(); render(true); },
    tick: async (el) => { const k = el.dataset.key; if (S.shop.checked[k]) delete S.shop.checked[k]; else S.shop.checked[k] = true; await persistMeta(); render(true); },
    mdel: async (el) => { S.shop.manual = S.shop.manual.filter((m) => m.id !== el.dataset.id); delete S.shop.checked[el.dataset.id]; await persistMeta(); render(true); },
    register: () => registerShop(),
    share: () => shareList(),
    offer: () => openOffer(),
    'of-kind': (el) => { OF.kind = el.dataset.v; drawOffer(); },
    'of-add': () => { OF.items.push({ name: '', price: '', unit: 'UN', note: '' }); drawOffer(); const l = document.querySelectorAll('#of-items .nm'); if (l.length) l[l.length - 1].focus(); },
    'of-del': (el) => { OF.items.splice(+el.dataset.i, 1); drawOffer(); },
    'of-more': () => { const f = $('#f-offer'); if (f) f.click(); },
    'of-save': () => saveOffers(),
    'of-rm': async (el) => { S.shop.offers = (S.shop.offers || []).filter((o) => o.id !== el.dataset.id); await persistMeta(); render(true); },
    dperiod: (el) => { ui.dperiod = +el.dataset.v; ui.dsel = null; const d = $('#dash'); if (d) d.innerHTML = painelBody(); },
    'dsel-add': (el) => { if ((ui.dsel || []).length < 5) ui.dsel = (ui.dsel || []).concat(el.dataset.key); ui.dq = ''; const d = $('#dash'); if (d) d.innerHTML = painelBody(); },
    'dsel-del': (el) => { ui.dsel = (ui.dsel || []).filter((k) => k !== el.dataset.key); const d = $('#dash'); if (d) d.innerHTML = painelBody(); },
    rename: async (el) => {
      const v = $('#pn').value.trim(); const p = S.products.find((x) => x.key === el.dataset.key);
      if (!v || !p) return; p.name = v; const bv = ($('#pb') || {}).value; if (bv !== undefined) p.brand = bv.trim(); dirty(); await persist(); closeSheet(); render(true); toast('Nome atualizado');
    },
    merge: async (el) => {
      const dst = $('#mg').value; if (!dst) return toast('Escolha o produto');
      C.mergeProducts(S, el.dataset.key, dst); dirty(); await persist(); closeSheet(); render(true); toast('Produtos unidos');
    },
    count: async (el) => {
      const q = C.num($('#cnt').value); const p = S.products.find((x) => x.key === el.dataset.key);
      if (!isFinite(q) || q < 0 || !p) return toast('Informe uma quantidade');
      p.count = { qty: q, date: today() }; dirty(); await persist(); closeSheet(); render(true); toast('Contagem salva');
    },
    uncount: async (el) => { const p = S.products.find((x) => x.key === el.dataset.key); if (p) p.count = null; dirty(); await persist(); closeSheet(); render(true); },
    ignore: async (el) => { const p = S.products.find((x) => x.key === el.dataset.key); if (p) p.ignore = !p.ignore; dirty(); await persist(); closeSheet(); render(true); },
    demo: async () => {
      let n = 0; C.demoDrafts(today()).forEach((d) => { if (!C.addPurchase(S, d).duplicate) n++; });
      dirty(); await persist(); tab = 'compras'; render(); toast(n + ' compras de exemplo carregadas');
    },
    undemo: async () => {
      S.purchases.filter((p) => p.demo).forEach((p) => C.removePurchase(S, p.id, true)); C.pruneProducts(S); dirty(); await persist(); render(true); toast('Exemplos removidos');
    },
    wipe: async (el) => {
      if (!armed.wipe) { armed.wipe = 1; el.textContent = 'Toque de novo para apagar tudo'; setTimeout(() => { armed.wipe = 0; if (el.isConnected) el.textContent = 'Apagar todos os dados'; }, 4000); return; }
      armed.wipe = 0; const keep = S.settings; Object.assign(S, C.newState()); S.settings = keep; dirty(); await persist(); render(); toast('Dados apagados');
    },
    export: () => {
      try {
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([backupJSON()], { type: 'application/json' }));
        a.download = 'cesta-certa-' + today() + '.json'; document.body.appendChild(a); a.click(); a.remove(); toast('Backup gerado');
      } catch (e) { toast('Use “Copiar backup”'); }
    },
    exportcopy: () => copyText(backupJSON()).then(() => toast('Backup copiado'), () => openSheet('Backup', `<textarea class="in" rows="10" readonly>${esc(backupJSON())}</textarea><div class="note">Selecione tudo e copie.</div>`)),
    'drow-add': (el) => {
      const n = +el.dataset.n, rest = discRest();
      RV.drows.splice(n + 1, 0, { item: null, amt: '' });
      drawDisc(); const rows = $$all('.drow'); const sel = rows[n + 1] && $('select', rows[n + 1]); if (sel) sel.focus();
    },
    'drow-del': (el) => { RV.drows.splice(+el.dataset.n, 1); recalcDisc(); drawDisc(); },
    cmpwin: async (el) => { S.settings.window = +el.dataset.v; await persistMeta(); const c = $('#cmp'); if (c) c.innerHTML = cmpHTML(ui.curPurchase); },
    'rv-add': () => { RV.items.push({ name: '', std: '', stdAuto: true, qty: 1, unit: 'UN', unitPrice: '' }); drawItems(); fillDsel(); const last = document.querySelectorAll('.itm .nm'); if (last.length) last[last.length - 1].focus(); },
    'rv-del': (el) => { const it = RV.items[+el.dataset.i]; RV.drows.forEach((r) => { if (r.item === it) r.item = null; }); RV.items.splice(+el.dataset.i, 1); drawItems(); recalcDisc(true); drawDisc(); },
    'rv-save': () => saveReview(),
    'rv-skip': () => { const d = RV && RV.opts.onDone; closeSheet(); if (d) d(false); },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const fn = actions[el.dataset.act]; if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'rv-disc') { RV.discTotal = Math.max(0, C.num(t.value) || 0); updTotal(); paintDiscStatus(); return; }
    if (t.dataset && t.dataset.d === 'amt' && RV) { const r = RV.drows[+t.closest('.drow').dataset.n]; if (r) { r.amt = t.value; recalcDisc(); } return; }
    if (t.dataset && t.dataset.of && OF) {
      const row = t.closest('.itm'), o = OF.items[+row.dataset.o]; o[t.dataset.of] = t.value;
      const v = verdictInfo(evalRow(o)); $('[data-ob]', row).innerHTML = v.badge; $('[data-ov]', row).innerHTML = v.html; const sm = $('#of-sum'); if (sm) sm.innerHTML = offerSummary(); return;
    }
    if (t.id === 'of-m' && OF) { OF.market = t.value; return; }
    if (t.id === 'of-v' && OF) { OF.validUntil = t.value; return; }
    if (t.id === 'dq') { ui.dq = t.value; const d = $('#dash'); if (d) { d.innerHTML = painelBody(); const n = $('#dq'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } } return; }
    if (t.id === 'q') { ui.q = t.value; const l = $('#plist'); if (l) l.innerHTML = priceListHTML(); return; }
    if (t.dataset && t.dataset.f && RV) {
      const row = t.closest('.itm'); if (!row) return; const i = RV.items[+row.dataset.i];
      if (t.type === 'checkbox') { i[t.dataset.f] = t.checked; const ph = $('[data-promohint]', row); if (ph) ph.innerHTML = promoHintHTML(i); return; }
      i[t.dataset.f] = t.value;
      if (t.dataset.f === 'unitPrice') { if (i._dd > 0) i.u0 = C.num(t.value) + i._dd / (C.num(i.qty) || 1); else delete i.u0; }
      if (t.dataset.f === 'qty' && i._dd > 0) { i.unitPrice = C.round(i.u0 - i._dd / (C.num(t.value) || 1), 4); const pi = $('[data-f=unitPrice]', row); if (pi) pi.value = String(i.unitPrice).replace('.', ','); }
      if (t.dataset.f === 'std') { i.stdAuto = false; delete i.via; if (i.brandAuto !== false) { i.brand = Std.brandIn(i.std) || ''; const bi = $('[data-f=brand]', row); if (bi) bi.value = i.brand; } }
      if (t.dataset.f === 'brand') { i.brandAuto = false; if (i.stdAuto && String(i.brand).trim()) { i.std = Std.withBrand(i.std, i.brand); const si = $('[data-f=std]', row); if (si) si.value = i.std; } }
      if ((t.dataset.f === 'name' || t.dataset.f === 'unit' || t.dataset.f === 'ean') && i.stdAuto) { suggestStd(i, false); const si = $('[data-f=std]', row); if (si) si.value = i.std; const bi = $('[data-f=brand]', row); if (bi) bi.value = i.brand || ''; }
      const s2 = $('[data-sub]', row); if (s2) s2.textContent = brl(itemTotal(i));
      const sn = $('[data-stdnote]', row); if (sn) sn.innerHTML = stdNote(i);
      const ph2 = $('[data-promohint]', row); if (ph2) ph2.innerHTML = promoHintHTML(i);
      updTotal();
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'f-offer' || t.id === 'f-offer-cam') { const files = t.files; processOffers(files); return; }
    if (t.id === 'of-ai') { ui.ofAI = t.checked; return; }
    if (t.id === 'of-v' && OF) { OF.validUntil = t.value; return; }
    if (t.id === 'f-doc' || t.id === 'f-img' || t.id === 'f-cam') { const files = t.files; closeSheet(); processFiles(files); }
    if (t.dataset && t.dataset.d === 'sel' && RV) { const r = RV.drows[+t.closest('.drow').dataset.n]; if (r) { r.item = RV.items[+t.value] || null; recalcDisc(); } }
    if (t.id === 'bk' && t.files[0]) restore(t.files[0]);
    if (t.id === 'f-qr' && t.files[0]) {
      const m = $('#scan-msg'); if (m) { m.className = 'note'; m.textContent = 'Procurando o QR code na foto…'; }
      QR.decodeFile(t.files[0]).then((txt) => {
        if (txt) onQrText(txt);
        else { const m2 = $('#scan-msg'); if (m2) { m2.className = 'note warn'; m2.textContent = 'Não achei um QR code legível nessa foto. Chegue mais perto, deixe só o QR no quadro e tente de novo.'; } }
      }).catch((e) => { const m2 = $('#scan-msg'); if (m2) { m2.className = 'note warn'; m2.textContent = e.message || 'Não consegui ler a foto.'; } });
    }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'madd') {
      e.preventDefault();
      const n = $('#mn').value.trim(), q = C.num($('#mq').value);
      if (!n || !(q > 0)) return;
      S.shop.manual.push({ id: 'm' + Date.now().toString(36), name: n, qty: q, unit: 'UN' });
      persistMeta(); render(true);
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden && !RV) closeSheet(); });

  /* ---------- início ---------- */
  load().then(() => { render(); }).catch(() => { persistent = false; render(); });
  if (!Native.isNative && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
