/* Armazenamento local (IndexedDB) com plano B em memória. */
(function (root) {
  'use strict';
  const STORES = ['purchases', 'items', 'products', 'meta'];
  let db = null, mem = false;
  const memory = { purchases: [], items: [], products: [], meta: [] };

  function open() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('mercado', 1); } catch (e) { mem = true; return resolve({ persistent: false }); }
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('purchases', { keyPath: 'id' });
        d.createObjectStore('items', { keyPath: 'id' });
        d.createObjectStore('products', { keyPath: 'key' });
        d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => { db = req.result; resolve({ persistent: true }); };
      req.onerror = () => { mem = true; resolve({ persistent: false }); };
      req.onblocked = () => { mem = true; resolve({ persistent: false }); };
    });
  }

  function all(store) {
    if (mem || !db) return Promise.resolve(memory[store].slice());
    return new Promise((res, rej) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }

  // Substitui o conteúdo de vários stores numa única transação.
  function replace(map) {
    const names = Object.keys(map);
    if (mem || !db) { names.forEach((n) => { memory[n] = map[n].slice(); }); return Promise.resolve(); }
    return new Promise((res, rej) => {
      const tx = db.transaction(names, 'readwrite');
      names.forEach((n) => { const s = tx.objectStore(n); s.clear(); map[n].forEach((v) => s.put(v)); });
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }

  root.DB = { open, all, replace, STORES };
})(typeof self !== 'undefined' ? self : this);
