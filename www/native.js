/* Ponte com o Android (Capacitor): leitor de QR do Google e OCR do ML Kit. No navegador/PWA não faz nada. */
(function (root) {
  'use strict';
  const C = root.Capacitor;
  const isNative = !!(C && C.isNativePlatform && C.isNativePlatform());
  const plugin = (name) => {
    if (!isNative) return null;
    try { return (C.Plugins && C.Plugins[name]) || (C.registerPlugin && C.registerPlugin(name)) || null; } catch (e) { return null; }
  };
  const CAM = plugin('Camera'), BS = plugin('BarcodeScanner'), TR = plugin('CapacitorPluginMlKitTextRecognition');

  // QR com a câmera nativa (leitor do Google). Retorna o texto, ou null se o usuário cancelou.
  // Lança Error com .code = 'install' (módulo do Google sendo baixado) ou 'unsupported'.
  async function scanQR() {
    if (!BS) throw Object.assign(new Error('sem leitor nativo'), { code: 'unsupported' });
    try {
      const a = await BS.isGoogleBarcodeScannerModuleAvailable();
      if (a && a.available === false) { await BS.installGoogleBarcodeScannerModule(); throw Object.assign(new Error('instalando'), { code: 'install' }); }
    } catch (e) { if (e.code === 'install') throw e; }
    try {
      const r = await BS.scan({ formats: ['QR_CODE'] });
      const b = r && r.barcodes && r.barcodes[0];
      return b ? (b.rawValue || b.displayValue || null) : null;
    } catch (e) {
      if (/cancel/i.test(String((e && e.message) || e))) return null;
      throw Object.assign(new Error(String((e && e.message) || e)), { code: 'unsupported' });
    }
  }

  // Código de barras de produto (EAN/UPC) com a câmera. Retorna só os dígitos, ou null se cancelou.
  async function scanEAN() {
    if (!BS) throw new Error('sem leitor nativo');
    try {
      const r = await BS.scan({ formats: ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'] });
      const b = r && r.barcodes && r.barcodes[0];
      return b ? String(b.rawValue || b.displayValue || '').replace(/\D/g, '') || null : null;
    } catch (e) { if (/cancel/i.test(String((e && e.message) || e))) return null; throw e; }
  }

  // Monta linhas a partir das caixas de texto do ML Kit (nome e preço do mesmo item ficam na mesma linha)
  function rowsFromBlocks(blocks) {
    const lines = [];
    (blocks || []).forEach((b) => (b.lines || []).forEach((l) => { if (l && l.text && l.boundingBox) lines.push(l); }));
    if (!lines.length) return '';
    lines.sort((a, b) => (a.boundingBox.top + a.boundingBox.bottom) - (b.boundingBox.top + b.boundingBox.bottom));
    const rows = [];
    lines.forEach((l) => {
      const bb = l.boundingBox, cy = (bb.top + bb.bottom) / 2, h = Math.max(1, bb.bottom - bb.top);
      const r = rows[rows.length - 1];
      if (r && Math.abs(cy - r.cy) < Math.max(r.h, h) * 0.55) { r.parts.push(l); r.cy = (r.cy * (r.parts.length - 1) + cy) / r.parts.length; r.h = Math.max(r.h, h); }
      else rows.push({ cy, h, parts: [l] });
    });
    return rows.map((r) => r.parts.sort((a, b) => a.boundingBox.left - b.boundingBox.left).map((p) => p.text.trim()).join('   ')).join('\n');
  }

  // OCR de uma imagem (canvas). Retorna o texto já organizado em linhas.
  async function ocrCanvas(canvas) {
    if (!TR) throw new Error('sem OCR nativo');
    const max = 2600, sc = Math.min(1, max / Math.max(canvas.width, canvas.height));
    let c = canvas;
    if (sc < 1) { c = document.createElement('canvas'); c.width = Math.round(canvas.width * sc); c.height = Math.round(canvas.height * sc); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); }
    const b64 = c.toDataURL('image/jpeg', 0.92).replace(/^data:image\/jpeg;base64,/, '');
    const r = await TR.detectText({ base64Image: b64, rotation: 0 });
    return rowsFromBlocks(r && r.blocks) || (r && r.text) || '';
  }

  // Câmera nativa: tira a foto e devolve um File (null se cancelou). Lança erro se não houver câmera/permissão.
  async function takePhoto() {
    if (!CAM) throw new Error('sem câmera nativa');
    try {
      const r = await CAM.getPhoto({ quality: 92, resultType: 'base64', source: 'CAMERA', correctOrientation: true, saveToGallery: false });
      if (!r || !r.base64String) return null;
      const bin = atob(r.base64String), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new File([u8], 'foto-' + Date.now() + '.jpg', { type: 'image/' + (r.format === 'png' ? 'png' : 'jpeg') });
    } catch (e) {
      if (/cancel/i.test(String((e && e.message) || e))) return null;
      throw e;
    }
  }

  root.Native = { isNative, canCamera: !!CAM, takePhoto, canScan: !!BS, canOcr: !!TR, scanQR, scanEAN, ocrCanvas, rowsFromBlocks };
})(typeof self !== 'undefined' ? self : this);
