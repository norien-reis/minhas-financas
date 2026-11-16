/* util.js — formatação pt-BR, conversão de valores e utilidades de DOM. */
(function () {
  'use strict';
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  const U = {
    money(cents) { return brl.format((cents || 0) / 100); },
    // "1.234,56" | "1234,56" | "1234.56" | "R$ 12" → centavos (inteiro) ou null
    parseMoney(str) {
      if (str === null || str === undefined) return null;
      let s = String(str).replace(/[R$\s]/g, '').trim();
      if (!s) return null;
      const neg = s.startsWith('-'); s = s.replace('-', '');
      if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
      else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
      else if (/^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', ''); // "1.500" = mil e quinhentos
      const v = Number(s);
      if (!isFinite(v)) return null;
      return Math.round(v * 100) * (neg ? -1 : 1);
    },
    moneyInput(cents) {
      if (cents === null || cents === undefined || cents === '') return '';
      return (cents / 100).toFixed(2).replace('.', ',');
    },
    date(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return d + '/' + m + '/' + y; },
    dateShort(iso) { if (!iso) return ''; const [, m, d] = iso.split('-'); return d + '/' + m; },
    monthLabel(ym) { const [y, m] = ym.split('-'); return MONTHS[+m - 1] + ' de ' + y; },
    monthShort(ym) { const [y, m] = ym.split('-'); return MONTHS[+m - 1].slice(0, 3) + '/' + y.slice(2); },
    monthName(ym) { return MONTHS[+ym.split('-')[1] - 1]; },
    esc(s) {
      return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    $(sel, root) { return (root || document).querySelector(sel); },
    $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    pct(x) { return Math.round(x * 100) + '%'; },
    plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); },
    relDays(n) {
      if (n === 0) return 'hoje';
      if (n === 1) return 'amanhã';
      if (n > 1) return 'em ' + n + ' dias';
      if (n === -1) return 'ontem';
      return 'há ' + (-n) + ' dias';
    }
  };
  window.U = U;
})();
