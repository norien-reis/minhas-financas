/*
 * store.js — armazenamento LOCAL no navegador.
 * Dados: localStorage (chave "controle-financeiro.v1").
 * Fotos: IndexedDB (banco "controle-financeiro-fotos"), comprimidas antes de salvar.
 * Nada é enviado para servidores.
 */
(function () {
  'use strict';
  const KEY = 'controle-financeiro.v1';
  const SCHEMA = 1;

  const DEFAULT_CATEGORIES = [
    { id: 'moradia', name: 'Moradia', icon: '🏠', color: '#7b8cde', essential: true },
    { id: 'alimentacao', name: 'Alimentação e mercado', icon: '🛒', color: '#5fb49c', essential: true },
    { id: 'transporte', name: 'Transporte', icon: '🚌', color: '#e0a458', essential: true },
    { id: 'saude', name: 'Saúde', icon: '💊', color: '#e07a7a', essential: true },
    { id: 'lazer', name: 'Lazer', icon: '🎉', color: '#b48ead', essential: false },
    { id: 'assinaturas', name: 'Assinaturas', icon: '📺', color: '#6aa9d8', essential: false },
    { id: 'educacao', name: 'Educação', icon: '📚', color: '#8fbf6f', essential: false },
    { id: 'compras', name: 'Compras', icon: '🛍️', color: '#d98bb3', essential: false },
    { id: 'emprestimos', name: 'Empréstimos', icon: '🏦', color: '#9a8c7a', essential: false },
    { id: 'outros', name: 'Outros', icon: '📦', color: '#a0a7b4', essential: false }
  ];

  function empty() {
    return {
      schema: SCHEMA, isDemo: false, createdAt: new Date().toISOString(),
      settings: { ocrConsent: false, lastBackup: null },
      categories: DEFAULT_CATEGORIES.map((c) => Object.assign({}, c)),
      incomes: [], expenses: [], cards: [], cardPurchases: [], invoicePayments: [],
      loans: [], goals: [], plan: [], budgets: {}
    };
  }

  function normalize(s) {
    const base = empty();
    Object.keys(base).forEach((k) => { if (s[k] === undefined) s[k] = base[k]; });
    s.settings = Object.assign({}, base.settings, s.settings || {});
    return s;
  }

  const Store = {
    KEY, DEFAULT_CATEGORIES, empty,
    state: null,
    storageOk: true,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.state = raw ? normalize(JSON.parse(raw)) : null;
      } catch (e) {
        this.storageOk = false;
        this.state = null;
      }
      return this.state;
    },
    save() {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
        return true;
      } catch (e) {
        this.storageOk = false;
        if (window.App) App.toast('Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado). Faça um backup.', 'erro');
        return false;
      }
    },
    replace(s) { this.state = normalize(s); this.save(); },

    /* ---------- Fotos (IndexedDB) ---------- */
    _db: null,
    db() {
      if (this._db) return this._db;
      this._db = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB indisponível'));
        const req = indexedDB.open('controle-financeiro-fotos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('fotos');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return this._db;
    },
    async tx(mode, fn) {
      const db = await this.db();
      return new Promise((resolve, reject) => {
        const t = db.transaction('fotos', mode);
        const st = t.objectStore('fotos');
        const r = fn(st);
        t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
        t.onerror = () => reject(t.error);
      });
    },
    async photoPut(blob, id) { id = id || 'foto_' + U.uid(); await this.tx('readwrite', (st) => st.put(blob, id)); return id; },
    async photoGet(id) {
      const db = await this.db();
      return new Promise((resolve, reject) => {
        const r = db.transaction('fotos').objectStore('fotos').get(id);
        r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
      });
    },
    async photoDel(id) { if (id) await this.tx('readwrite', (st) => st.delete(id)); },
    async photoClear() { await this.tx('readwrite', (st) => st.clear()); },
    async photoKeys() {
      const db = await this.db();
      return new Promise((resolve, reject) => {
        const r = db.transaction('fotos').objectStore('fotos').getAllKeys();
        r.onsuccess = () => resolve(r.result || []); r.onerror = () => reject(r.error);
      });
    },

    // Reduz a imagem (máx. 1400px, JPEG) para economizar espaço no aparelho.
    compressImage(file, max, quality) {
      max = max || 1400; quality = quality || 0.75;
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          c.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
      });
    },

    /* ---------- Backup ---------- */
    blobToDataURL(blob) {
      return new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.readAsDataURL(blob); });
    },
    async exportData(includePhotos) {
      const out = { app: 'controle-financeiro', schema: SCHEMA, exportedAt: new Date().toISOString(), data: this.state, photos: {} };
      if (includePhotos) {
        try {
          const keys = await this.photoKeys();
          for (const k of keys) { const b = await this.photoGet(k); if (b) out.photos[k] = await this.blobToDataURL(b); }
        } catch (e) { /* sem fotos */ }
      }
      return out;
    },
    validateBackup(obj) {
      if (!obj || obj.app !== 'controle-financeiro' || !obj.data) return 'Este arquivo não parece ser um backup desta ferramenta.';
      const d = obj.data;
      const arrays = ['incomes', 'expenses', 'cards', 'cardPurchases', 'invoicePayments', 'loans', 'goals', 'categories'];
      for (const a of arrays) if (d[a] !== undefined && !Array.isArray(d[a])) return 'Backup com formato inválido (' + a + ').';
      if (obj.schema > SCHEMA) return 'Backup criado por uma versão mais nova da ferramenta.';
      return null;
    },
    async importData(obj) {
      this.replace(obj.data);
      const photos = obj.photos || {};
      for (const k of Object.keys(photos)) {
        try { const b = await (await fetch(photos[k])).blob(); await this.photoPut(b, k); } catch (e) { /* ignora foto inválida */ }
      }
    }
  };
  window.Store = Store;
})();
