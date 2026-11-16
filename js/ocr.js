/*
 * ocr.js — leitura de texto de notas/comprovantes (opcional).
 * Usa Tesseract.js (gratuito, código aberto) rodando DENTRO do navegador.
 * A imagem não sai do aparelho. Na 1ª vez, o navegador baixa a biblioteca e o idioma português
 * do CDN jsDelivr (alguns MB). O resultado é sempre uma SUGESTÃO para conferência.
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.OCR = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LIB = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  const CATEGORY_HINTS = [
    ['alimentacao', /supermerc|mercado|atacad|hortifr|padaria|acougue|açougue|assai|carrefour|restaurante|lanchonete|pizzaria|ifood|alimenta/i],
    ['transporte', /posto|combust|gasolina|etanol|uber|estaciona|pedagio|pedágio|metro|metrô|onibus|ônibus/i],
    ['saude', /farmac|farmác|drogaria|droga|clinica|clínica|laborat|hospital|odonto/i],
    ['lazer', /cinema|teatro|show|ingresso|bar |cervej/i],
    ['assinaturas', /netflix|spotify|prime video|disney|assinatura|globoplay|youtube/i],
    ['educacao', /escola|faculdade|curso|livrar|papelaria/i],
    ['moradia', /energia|eletric|saneamento|agua|água|condominio|condomínio|aluguel|gas |gás/i],
    ['compras', /loja|magazine|calçad|calcad|vestu|moda|shopping/i]
  ];

  const MONEY = /(\d{1,3}(?:[.\s]\d{3})*,\d{2}|\d+,\d{2})/g;
  const toCents = (s) => Math.round(parseFloat(s.replace(/[.\s]/g, '').replace(',', '.')) * 100);

  function findTotal(lines) {
    const strong = /(valor\s*(total|a\s*pagar|pago|cobrado)|total\s*(a\s*pagar|geral|r\$)|total\s*$|^total\b)/i;
    const weak = /total/i;
    const skip = /(troco|desconto|tribut|imposto|qtd|quantidade|itens|subtotal\s*itens|lei\s*12)/i;
    const pick = (re) => {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!re.test(l) || skip.test(l)) continue;
        const nums = l.match(MONEY) || (lines[i + 1] || '').match(MONEY);
        if (nums) return toCents(nums[nums.length - 1]);
      }
      return null;
    };
    let v = pick(strong);
    if (v === null) v = pick(weak);
    if (v === null) {
      // último recurso: maior valor monetário do texto (pode errar — por isso é só sugestão)
      const all = (lines.join('\n').match(MONEY) || []).map(toCents).filter((x) => x > 0);
      v = all.length ? Math.max.apply(null, all) : null;
      return { value: v, confidence: v === null ? 'none' : 'low' };
    }
    return { value: v, confidence: 'medium' };
  }

  function findDate(text, todayISO) {
    const re = /(\d{2})[\/.-](\d{2})[\/.-](\d{4}|\d{2})/g;
    let m;
    while ((m = re.exec(text))) {
      let [, dd, mm, yy] = m;
      if (yy.length === 2) yy = '20' + yy;
      const D = +dd, M = +mm, Y = +yy;
      if (M < 1 || M > 12 || D < 1 || D > 31 || Y < 2000) continue;
      const iso = Y + '-' + String(M).padStart(2, '0') + '-' + String(D).padStart(2, '0');
      if (todayISO && iso > todayISO) continue; // data futura: provavelmente vencimento/validade
      return iso;
    }
    return null;
  }

  function findMerchant(lines) {
    const bad = /(cnpj|cpf|ie[:\s]|inscri|documento|auxiliar|nota fiscal|nfc-?e|danfe|cupom|extrato|consumidor|sat\b|^\W*$|www\.|http|rua |av\.|avenida|tel|fone|cep)/i;
    for (const l of lines.slice(0, 8)) {
      const letters = (l.match(/[a-zà-ú]/gi) || []).length;
      if (letters < 3 || bad.test(l)) continue;
      if (letters / l.length < 0.5) continue;
      return l.replace(/\s{2,}/g, ' ').trim().slice(0, 60);
    }
    return null;
  }

  function suggestCategory(text) {
    for (const [id, re] of CATEGORY_HINTS) if (re.test(text)) return id;
    return null;
  }

  // Converte o texto lido em sugestões de campos. Função pura (testável).
  function parse(text, todayISO) {
    const lines = (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const total = findTotal(lines);
    return {
      merchant: findMerchant(lines),
      date: findDate(text || '', todayISO),
      amount: total.value,
      amountConfidence: total.confidence,
      categoryId: suggestCategory(text || ''),
      rawText: text || ''
    };
  }

  function loadLib() {
    if (typeof document === 'undefined') return Promise.reject(new Error('sem navegador'));
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIB; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Biblioteca não carregou')));
      s.onerror = () => reject(new Error('Não foi possível baixar a biblioteca de leitura (verifique a internet).'));
      document.head.appendChild(s);
    });
  }

  async function recognize(blob, onProgress) {
    const T = await loadLib();
    const res = await T.recognize(blob, 'por', {
      logger: (m) => { if (onProgress && m && typeof m.progress === 'number') onProgress(m.status, m.progress); }
    });
    return res.data.text || '';
  }

  return { parse, recognize, loadLib, LIB };
});
