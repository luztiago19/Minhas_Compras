/* Importadores de arquivo: XML (direto), PDF (texto embutido ou OCR) e imagem (OCR no aparelho). */
(function (root) {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const loaded = {};

  function loadScript(src) {
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src; s.onload = res;
        s.onerror = () => { delete loaded[src]; rej(new Error('Não foi possível carregar o leitor. Verifique a internet na primeira vez.')); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  }

  /* ---------- PDF ---------- */
  async function openPdf(file) {
    await loadScript(PDFJS);
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW;
    return root.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  }

  async function pdfText(pdf) {
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await (await pdf.getPage(p)).getTextContent();
      const rows = [];
      tc.items.forEach((it) => {
        if (!it.str || !it.str.trim()) return;
        const y = Math.round(it.transform[5] / 3);
        let row = rows.find((r) => Math.abs(r.y - y) <= 1);
        if (!row) { row = { y, parts: [] }; rows.push(row); }
        row.parts.push({ x: it.transform[4], s: it.str });
      });
      rows.sort((a, b) => b.y - a.y);
      pages.push(rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ')).join('\n'));
    }
    return pages.join('\n');
  }

  async function pdfToCanvases(pdf, max) {
    const out = [];
    for (let p = 1; p <= Math.min(pdf.numPages, max || 3); p++) {
      const page = await pdf.getPage(p);
      const vp = page.getViewport({ scale: 2.2 });
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      out.push(c);
    }
    return out;
  }

  /* ---------- OCR ---------- */
  let worker = null, onProg = null;
  async function getWorker() {
    await loadScript(TESS);
    if (!worker) {
      worker = await root.Tesseract.createWorker('por', 1, { logger: (m) => { if (onProg && m.status === 'recognizing text') onProg(m.progress); } });
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
    }
    return worker;
  }

  async function toCanvas(src) {
    if (src instanceof HTMLCanvasElement) return src;
    const url = URL.createObjectURL(src);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida')); i.src = url; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return c;
  }

  // Tira sombra e iluminação desigual (o que mais atrapalha o OCR em foto de cupom) e deixa o texto escuro sobre papel claro
  async function preprocess(src, opts) {
    opts = opts || {};
    const base = await toCanvas(src);
    const long = Math.max(base.width, base.height);
    const scale = long > 2800 ? 2800 / long : long < 1400 ? 1400 / long : 1;
    const c = document.createElement('canvas');
    c.width = Math.round(base.width * scale); c.height = Math.round(base.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(base, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    const gray = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) gray[p] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    // recorta o papel (descarta mesa, mão, fundo) antes de tratar a luz
    const box = opts.crop ? root.ImgProc.cropToPaper(gray, c.width, c.height) : null;
    let g = gray, W = c.width, H = c.height;
    if (box) {
      g = new Uint8ClampedArray(box.w * box.h);
      for (let y = 0; y < box.h; y++) g.set(gray.subarray((box.y + y) * c.width + box.x, (box.y + y) * c.width + box.x + box.w), y * box.w);
      W = box.w; H = box.h;
    }
    const flat = root.ImgProc.flattenGray(g, W, H);
    const out = document.createElement('canvas'); out.width = W; out.height = H;
    const octx = out.getContext('2d'), oimg = octx.createImageData(W, H), od = oimg.data;
    for (let i = 0, p = 0; i < od.length; i += 4, p++) { od[i] = od[i + 1] = od[i + 2] = flat[p]; od[i + 3] = 255; }
    octx.putImageData(oimg, 0, 0);
    out.cropped = !!box;
    return out;
  }

  async function ocrCanvas(canvas, progress) {
    onProg = progress || null;
    const w = await getWorker();
    const { data } = await w.recognize(canvas);
    return data.text || '';
  }
  async function ocr(src, progress, opts) { return ocrCanvas(await preprocess(src, opts), progress); }

  // Pontua uma leitura: fechar com o total impresso na nota vale mais que qualquer outra coisa
  function scoreDraft(d) {
    const n = d.items.length, sum = d.items.reduce((a, i) => a + i.total, 0) - (d.discount || 0), flagged = d.items.filter((i) => i.check).length;
    if (d.printedTotal > 0) {
      const diff = Math.abs(sum - d.printedTotal);
      if (diff < 0.005 && n) return { score: 100 + n, closed: true };
      return { score: n * 5 - Math.min(60, diff) - flagged * 2, closed: false };
    }
    return { score: n * 5 - flagged * 2, closed: false };
  }

  // Android (APK): OCR nativo do ML Kit na imagem original e na versão com a luz corrigida; fica com a melhor leitura
  async function readPhotoNative(file, progress) {
    let best = null;
    const srcs = [async () => toCanvas(file), async () => preprocess(file, { crop: false })];
    for (let t = 0; t < srcs.length; t++) {
      if (progress) progress(t / srcs.length);
      const text = await root.Native.ocrCanvas(await srcs[t]());
      const draft = root.Parser.parseAny(text);
      draft.rawText = draft.rawText || text;
      const sc = scoreDraft(draft);
      if (!best || sc.score > best.sc.score) best = { draft, sc };
      if (sc.closed) break;
    }
    best.draft.source = 'ocr';
    return best.draft;
  }

  // Foto: lê a imagem inteira; se o total não fecha, tenta de novo recortando o papel, e fica com a melhor leitura.
  async function readPhoto(file, progress) {
    if (root.Native && root.Native.canOcr) {
      try { const d = await readPhotoNative(file, progress); if (d.items.length) return d; } catch (e) { /* cai para o OCR do navegador */ }
    }
    const tries = [{ crop: false }, { crop: true }];
    let best = null;
    for (let t = 0; t < tries.length; t++) {
      const canvas = await preprocess(file, tries[t]);
      if (tries[t].crop && !canvas.cropped) continue;
      const text = await ocrCanvas(canvas, progress ? (p) => progress((t + p) / tries.length) : null);
      const draft = root.Parser.parseAny(text);
      const sc = scoreDraft(draft);
      if (!best || sc.score > best.sc.score) best = { draft, sc };
      if (sc.closed) break;
    }
    best.draft.source = 'ocr';
    return best.draft;
  }


  /* ---------- folheto / banner / etiqueta ---------- */
  // texto do folheto: ML Kit no aparelho (APK) ou Tesseract em modo de texto espalhado
  async function readFlyerText(file, progress) {
    const base = await toCanvas(file), long = Math.max(base.width, base.height), sc = long > 2400 ? 2400 / long : long < 1600 ? 1600 / long : 1;
    const c = document.createElement('canvas'); c.width = Math.round(base.width * sc); c.height = Math.round(base.height * sc);
    c.getContext('2d').drawImage(base, 0, 0, c.width, c.height);
    const count = (t) => (root.Flyer ? root.Flyer.parse(t).length : t.length);
    const srcs = [async () => c, async () => preprocess(c, { crop: false }), async () => invertedGray(c)];
    const plan = [[0, '3'], [0, '11'], [1, '3'], [2, '3'], [1, '11']]; // [imagem, modo de segmentação do Tesseract]
    let best = '', bs = -1, usedNative = false;
    for (let k = 0; k < plan.length; k++) {
      let t = '';
      const cv = await srcs[plan[k][0]]();
      if (root.Native && root.Native.canOcr && !(usedNative && plan[k][0] === 0)) { try { t = await root.Native.ocrCanvas(cv); } catch (e) { t = ''; } if (plan[k][0] === 0) usedNative = !!t; }
      if (!t || !t.trim()) {
        onProg = progress ? (p) => progress((k + p) / plan.length) : null;
        const w = await getWorker();
        await w.setParameters({ tessedit_pageseg_mode: plan[k][1] });
        try { const { data } = await w.recognize(cv); t = data.text || ''; } finally { await w.setParameters({ tessedit_pageseg_mode: '4' }); }
      }
      const n = count(t); if (n > bs) { bs = n; best = t; }
      if (n >= 4) break; // leitura boa o bastante
    }
    return best;
  }
  // cinza com contraste esticado (texto colorido sobre fundo colorido)
  function invertedGray(c) {
    const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0);
    const im = x.getImageData(0, 0, o.width, o.height), d = im.data;
    let lo = 255, hi = 0; const g = new Uint8ClampedArray(d.length / 4);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { g[p] = Math.min(d[i], d[i + 1], d[i + 2]); if (g[p] < lo) lo = g[p]; if (g[p] > hi) hi = g[p]; } // mínimo dos canais: vermelho/azul sobre amarelo fica escuro
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { const v = Math.max(0, Math.min(255, (g[p] - lo) * k)); d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(im, 0, 0); return o;
  }

  // Folheto em imagem ou PDF: devolve uma entrada por imagem/página { label, src (Blob ou canvas, gerado só quando pedido), text (camada de texto do PDF, se houver) }
  async function flyerSources(file, maxPages) {
    maxPages = maxPages || 12;
    if (!(/\.pdf$/i.test(file.name || '') || file.type === 'application/pdf')) return [{ label: file.name || 'imagem', get: async () => file, text: '' }];
    const pdf = await openPdf(file), n = Math.min(pdf.numPages, maxPages), out = [];
    for (let p = 1; p <= n; p++) {
      out.push({
        label: `${file.name || 'PDF'} · página ${p}/${pdf.numPages}`,
        text: await (async () => { try { const tc = await (await pdf.getPage(p)).getTextContent(); return pdfPageText(tc); } catch (e) { return ''; } })(),
        get: async () => { const page = await pdf.getPage(p), vp = page.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; return c; },
      });
    }
    return out;
  }
  function pdfPageText(tc) {
    const rows = [];
    tc.items.forEach((it) => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5] / 3);
      let row = rows.find((r) => Math.abs(r.y - y) <= 1);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x: it.transform[4], s: it.str });
    });
    rows.sort((a, b) => b.y - a.y);
    return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ')).join('\n');
  }

  // JPEG reduzido para enviar ao Claude
  async function toJpegBlob(file, max) {
    const base = await toCanvas(file), long = Math.max(base.width, base.height), sc = long > max ? max / long : 1;
    const c = document.createElement('canvas'); c.width = Math.round(base.width * sc); c.height = Math.round(base.height * sc);
    c.getContext('2d').drawImage(base, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Imagem inválida'))), 'image/jpeg', 0.85));
  }

  /* ---------- entrada única ---------- */
  // Retorna { kind: 'xml'|'text', draft, name }
  async function readFile(file, progress) {
    const name = file.name || 'arquivo';
    const lower = name.toLowerCase();
    if (lower.endsWith('.xml') || /xml/.test(file.type)) {
      const draft = root.Parser.parseNFeXML(await file.text());
      return { kind: 'xml', draft, name };
    }
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const pdf = await openPdf(file);
      let text = await pdfText(pdf);
      let source = 'pdf';
      if (text.replace(/\s/g, '').length < 60) {
        const parts = [];
        for (const c of await pdfToCanvases(pdf, 3)) parts.push(await ocr(c, progress));
        text = parts.join('\n'); source = 'ocr';
      }
      const draft = root.Parser.parseAny(text);
      draft.source = source;
      return { kind: 'text', draft, name };
    }
    if (/^image\//.test(file.type) || /\.(jpe?g|png|webp|heic)$/i.test(lower)) {
      const draft = await readPhoto(file, progress);
      return { kind: 'text', draft, name };
    }
    throw new Error('Formato não suportado: use XML, PDF ou imagem.');
  }

  // Busca a página pública da nota (só se o navegador permitir; senão o usuário cola o texto)
  async function fetchPage(url) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !/\.gov\.br$/.test(u.hostname)) throw new Error('Link não reconhecido');
    const r = await fetch(url);
    if (!r.ok) throw new Error('A página respondeu ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    doc.querySelectorAll('script,style').forEach((n) => n.remove());
    return doc.body ? doc.body.textContent : '';
  }

  root.Importers = { readFile, fetchPage, readFlyerText, toJpegBlob, flyerSources };
})(typeof self !== 'undefined' ? self : this);
