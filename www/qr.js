/* Leitor de QR code: câmera ao vivo (BarcodeDetector do Android, ou jsQR como plano B) e QR em foto. */
(function (root) {
  'use strict';
  const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  let jsqrP = null, detector, detectorTried = false;

  function loadJsQR() {
    if (root.jsQR) return Promise.resolve();
    if (!jsqrP) {
      jsqrP = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = JSQR_URL; s.onload = res;
        s.onerror = () => { jsqrP = null; rej(new Error('Não consegui carregar o leitor de QR. Verifique a internet.')); };
        document.head.appendChild(s);
      });
    }
    return jsqrP;
  }

  async function getDetector() {
    if (detectorTried) return detector;
    detectorTried = true;
    try {
      if ('BarcodeDetector' in root) {
        const f = await root.BarcodeDetector.getSupportedFormats();
        if (f.includes('qr_code')) detector = new root.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { detector = null; }
    return detector || null;
  }

  // Lê um QR de um canvas. Com BarcodeDetector (reconhecimento do Android) usa só ele; senão, jsQR.
  async function decodeCanvas(canvas) {
    const d = await getDetector();
    if (d) { try { const r = await d.detect(canvas); return r && r.length ? r[0].rawValue : null; } catch (e) { return null; } }
    await loadJsQR();
    const im = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const r = root.jsQR(im.data, im.width, im.height, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  }

  // Câmera ao vivo. Retorna uma função que desliga a câmera.
  async function start(video, onText, onError) {
    let stopped = false, stream = null, raf = 0, busy = false, last = 0;
    const stop = () => { stopped = true; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach((t) => t.stop()); try { video.srcObject = null; } catch (e) { /* ignora */ } };
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('sem câmera');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) { onError(e); return stop; }
    video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true;
    try { await video.play(); } catch (e) { /* alguns navegadores só tocam depois */ }
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const tick = async (t) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (busy || t - last < 200 || !video.videoWidth) return;
      busy = true; last = t;
      try {
        const sc = Math.min(1, 1280 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * sc); canvas.height = Math.round(video.videoHeight * sc);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const txt = await decodeCanvas(canvas);
        if (txt && !stopped) { stop(); onText(txt); return; }
      } catch (e) { if (/carregar/.test(e.message || '')) { stop(); onError(e); return; } }
      busy = false;
    };
    raf = requestAnimationFrame(tick);
    return stop;
  }

  // QR em uma foto: tenta a imagem inteira e depois janelas, porque em cupom o QR é pequeno
  async function decodeFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Imagem inválida')); i.src = url; });
      const sc = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(img.naturalWidth * sc), H = Math.round(img.naturalHeight * sc);
      const full = document.createElement('canvas'); full.width = W; full.height = H;
      full.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, W, H);
      let txt = await decodeCanvas(full);
      if (txt) return txt;
      const win = document.createElement('canvas');
      for (const [fw, fh] of [[0.7, 0.4], [0.5, 0.3]]) {
        const cw = Math.round(W * fw), ch = Math.round(H * fh), sx = Math.round(cw / 2), sy = Math.round(ch / 2);
        for (let y = 0; y < H; y += sy) for (let x = 0; x < W; x += sx) {
          const x0 = Math.min(x, W - cw), y0 = Math.min(y, H - ch);
          const k = Math.min(1, 900 / cw); win.width = Math.round(cw * k); win.height = Math.round(ch * k);
          win.getContext('2d', { willReadFrequently: true }).drawImage(full, x0, y0, cw, ch, 0, 0, win.width, win.height);
          txt = await decodeCanvas(win); if (txt) return txt;
        }
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }

  // Chave de acesso (44 dígitos) dentro do texto do QR
  function chaveDe(text) {
    const m = String(text || '').match(/(?:[?&]p=|chNFe=|^)(\d{44})(?!\d)/) || String(text || '').match(/(\d{44})(?!\d)/);
    return m ? m[1] : '';
  }

  root.QR = { start, decodeFile, chaveDe };
})(typeof self !== 'undefined' ? self : this);
