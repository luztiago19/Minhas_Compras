/* Tratamento de imagem para OCR de cupom térmico: remove sombra e iluminação desigual. Puro (sem DOM). */
(function (root) {
  'use strict';

  // gray: Uint8ClampedArray w*h (tons de cinza). Retorna novo array, com o papel perto de 255 e o texto escuro.
  function flattenGray(gray, w, h, opts) {
    opts = opts || {};
    const F = opts.factor || 4, R = opts.maxRadius || 8, B = opts.blurRadius || 8;
    const sw = Math.max(1, Math.floor(w / F)), sh = Math.max(1, Math.floor(h / F));

    // 1) reduz por média de área
    let s = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let sum = 0, n = 0;
        const y0 = y * F, x0 = x * F;
        for (let yy = y0; yy < Math.min(h, y0 + F); yy++) for (let xx = x0; xx < Math.min(w, x0 + F); xx++) { sum += gray[yy * w + xx]; n++; }
        s[y * sw + x] = sum / n;
      }
    }
    // 2) dilatação (máximo) separável: apaga os traços escuros e deixa só o papel
    const maxPass = (src, horiz) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          let m = 0;
          if (horiz) { for (let k = Math.max(0, x - R); k <= Math.min(sw - 1, x + R); k++) { const v = src[y * sw + k]; if (v > m) m = v; } }
          else { for (let k = Math.max(0, y - R); k <= Math.min(sh - 1, y + R); k++) { const v = src[k * sw + x]; if (v > m) m = v; } }
          out[y * sw + x] = m;
        }
      }
      return out;
    };
    s = maxPass(maxPass(s, true), false);
    // 3) suaviza (média móvel separável)
    const boxPass = (src, horiz) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          let sum = 0, n = 0;
          if (horiz) { for (let k = Math.max(0, x - B); k <= Math.min(sw - 1, x + B); k++) { sum += src[y * sw + k]; n++; } }
          else { for (let k = Math.max(0, y - B); k <= Math.min(sh - 1, y + B); k++) { sum += src[k * sw + x]; n++; } }
          out[y * sw + x] = sum / n;
        }
      }
      return out;
    };
    s = boxPass(boxPass(s, true), false);
    // 4) amplia o fundo (bilinear) e divide: pixel / fundo
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / F - 0.5)), y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / F - 0.5)), x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const bg = (s[y0 * sw + x0] * (1 - tx) + s[y0 * sw + x1] * tx) * (1 - ty) + (s[y1 * sw + x0] * (1 - tx) + s[y1 * sw + x1] * tx) * ty;
        out[y * w + x] = Math.min(255, (gray[y * w + x] * 255) / Math.max(1, bg));
      }
    }
    return out;
  }

  // Acha o retângulo do papel (a maior região clara) para descartar mesa, mão e fundo. Retorna null se não achar nada confiável.
  function cropToPaper(gray, w, h) {
    const F = 8, sw = Math.max(1, Math.floor(w / F)), sh = Math.max(1, Math.floor(h / F));
    let s = new Float32Array(sw * sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let sum = 0, n = 0;
      for (let yy = y * F; yy < Math.min(h, y * F + F); yy++) for (let xx = x * F; xx < Math.min(w, x * F + F); xx++) { sum += gray[yy * w + xx]; n++; }
      s[y * sw + x] = sum / n;
    }
    // Otsu
    const hist = new Float64Array(256); for (let i = 0; i < s.length; i++) hist[Math.max(0, Math.min(255, s[i] | 0))]++;
    let total = s.length, sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let wB = 0, sumB = 0, best = -1, thr = 128;
    for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break; sumB += t * hist[t]; const mB = sumB / wB, mF = (sumAll - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF); if (v > best) { best = v; thr = t; } }
    const mask = new Uint8Array(sw * sh); for (let i = 0; i < s.length; i++) mask[i] = s[i] > thr ? 1 : 0;
    // maior componente conexa (4 vizinhos)
    const lab = new Int32Array(sw * sh); let bestN = 0, box = null, id = 0; const stack = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || lab[i]) continue;
      id++; let n = 0, x0 = sw, y0 = sh, x1 = 0, y1 = 0; stack.push(i); lab[i] = id;
      while (stack.length) {
        const c = stack.pop(), cx = c % sw, cy = (c / sw) | 0; n++;
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        if (cx > 0 && mask[c - 1] && !lab[c - 1]) { lab[c - 1] = id; stack.push(c - 1); }
        if (cx < sw - 1 && mask[c + 1] && !lab[c + 1]) { lab[c + 1] = id; stack.push(c + 1); }
        if (cy > 0 && mask[c - sw] && !lab[c - sw]) { lab[c - sw] = id; stack.push(c - sw); }
        if (cy < sh - 1 && mask[c + sw] && !lab[c + sw]) { lab[c + sw] = id; stack.push(c + sw); }
      }
      if (n > bestN) { bestN = n; box = [x0, y0, x1, y1]; }
    }
    if (!box) return null;
    const bx0 = Math.max(0, (box[0] - 1) * F), by0 = Math.max(0, (box[1] - 1) * F), bx1 = Math.min(w, (box[2] + 2) * F), by1 = Math.min(h, (box[3] + 2) * F);
    const frac = ((bx1 - bx0) * (by1 - by0)) / (w * h);
    if (frac < 0.25 || frac > 0.95) return null; // pouco papel achado, ou já é a nota inteira
    return { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 };
  }

  const api = { flattenGray, cropToPaper };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ImgProc = api;
})(typeof self !== 'undefined' ? self : this);
