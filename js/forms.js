/* forms.js — painéis (bottom sheets), confirmações e construtor de formulários. */
(function () {
  'use strict';
  const stack = [];

  function sheet(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML =
      '<div class="sheet-backdrop"></div>' +
      '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + U.esc(opts.title) + '">' +
      '<header class="sheet-head"><h2>' + U.esc(opts.title) + '</h2>' +
      '<button class="icon-btn" data-close aria-label="Fechar">✕</button></header>' +
      '<div class="sheet-body">' + (opts.body || '') + '</div></section>';
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    const api = {
      el: wrap.querySelector('.sheet'),
      close() {
        const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1);
        wrap.classList.remove('open');
        setTimeout(() => wrap.remove(), 180);
        if (!stack.length) document.body.classList.remove('no-scroll');
        if (opts.onClose) opts.onClose();
      }
    };
    wrap.querySelector('.sheet-backdrop').addEventListener('click', () => api.close());
    wrap.querySelector('[data-close]').addEventListener('click', () => api.close());
    stack.push(api);
    requestAnimationFrame(() => wrap.classList.add('open'));
    if (opts.onMount) opts.onMount(api.el, api);
    return api;
  }

  function closeAll() { stack.slice().forEach((s) => s.close()); }

  function confirm(o) {
    return new Promise((resolve) => {
      let done = false;
      const s = sheet({
        title: o.title || 'Confirmar',
        body: '<div class="confirm-msg">' + (o.html || '<p>' + U.esc(o.message || '') + '</p>') + '</div>' +
          '<div class="btn-row">' +
          '<button class="btn ghost" data-no>' + U.esc(o.cancel || 'Cancelar') + '</button>' +
          '<button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-yes>' + U.esc(o.ok || 'Confirmar') + '</button></div>',
        onClose: () => { if (!done) resolve(false); }
      });
      s.el.querySelector('[data-yes]').onclick = () => { done = true; s.close(); resolve(true); };
      s.el.querySelector('[data-no]').onclick = () => { done = true; s.close(); resolve(false); };
    });
  }

  /* ---------- Formulários ---------- */
  function fieldHTML(f, v) {
    const id = 'f_' + f.name;
    const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const label = f.label ? '<label class="lbl" for="' + id + '">' + U.esc(f.label) + req + '</label>' : '';
    const hint = '<small class="hint">' + (f.hint || '') + '</small>';
    const val = v === undefined || v === null ? '' : v;
    let input = '';
    switch (f.type) {
      case 'money':
        input = '<div class="money-in' + (f.big ? ' big' : '') + '"><span>R$</span><input id="' + id + '" name="' + f.name + '" inputmode="decimal" autocomplete="off" placeholder="0,00" value="' + U.esc(U.moneyInput(val)) + '"' + (f.autofocus ? ' autofocus' : '') + '></div>';
        break;
      case 'date': case 'month':
        input = '<input type="' + f.type + '" id="' + id + '" name="' + f.name + '" value="' + U.esc(val) + '">';
        break;
      case 'number':
        input = '<input type="number" inputmode="' + (f.step ? 'decimal' : 'numeric') + '" id="' + id + '" name="' + f.name + '" value="' + U.esc(val) + '"' +
          (f.min !== undefined ? ' min="' + f.min + '"' : '') + (f.max !== undefined ? ' max="' + f.max + '"' : '') + (f.step ? ' step="' + f.step + '"' : '') + (f.placeholder ? ' placeholder="' + U.esc(f.placeholder) + '"' : '') + '>';
        break;
      case 'select':
        input = '<select id="' + id + '" name="' + f.name + '">' + f.options.map((o) => '<option value="' + U.esc(o.value) + '"' + (String(o.value) === String(val) ? ' selected' : '') + '>' + U.esc(o.label) + '</option>').join('') + '</select>';
        break;
      case 'chips':
        input = '<div class="chips' + (f.compact ? ' compact' : '') + '" role="radiogroup">' + f.options.map((o) =>
          '<label class="chip"' + (o.color ? ' style="--chip:' + o.color + '"' : '') + '><input type="radio" name="' + f.name + '" value="' + U.esc(o.value) + '"' + (String(o.value) === String(val) ? ' checked' : '') + '><span>' + U.esc(o.label) + '</span></label>').join('') + '</div>';
        break;
      case 'toggle':
        input = '<label class="toggle"><input type="checkbox" id="' + id + '" name="' + f.name + '"' + (val ? ' checked' : '') + '><span class="track"></span><span>' + U.esc(f.text || '') + '</span></label>';
        break;
      case 'textarea':
        input = '<textarea id="' + id + '" name="' + f.name + '" rows="' + (f.rows || 2) + '"' + (f.placeholder ? ' placeholder="' + U.esc(f.placeholder) + '"' : '') + '>' + U.esc(val) + '</textarea>';
        break;
      case 'html':
        return '<div class="field" data-field="' + f.name + '">' + (typeof f.html === 'function' ? f.html() : f.html) + '</div>';
      default:
        input = '<input type="text" id="' + id + '" name="' + f.name + '" value="' + U.esc(val) + '"' + (f.placeholder ? ' placeholder="' + U.esc(f.placeholder) + '"' : '') + (f.autofocus ? ' autofocus' : '') + (f.inputmode ? ' inputmode="' + f.inputmode + '"' : '') + ' autocomplete="off" maxlength="' + (f.maxlength || 80) + '">';
    }
    return '<div class="field' + (f.cls ? ' ' + f.cls : '') + '" data-field="' + f.name + '">' + label + input + hint + '</div>';
  }

  function render(fields, values) {
    values = values || {};
    return fields.map((f) => {
      if (f.group) return '<details class="more"' + (f.open ? ' open' : '') + '><summary>' + U.esc(f.group) + '</summary>' + render(f.fields, values) + '</details>';
      return fieldHTML(f, values[f.name] !== undefined ? values[f.name] : f.default);
    }).join('');
  }

  function flat(fields) { return fields.reduce((a, f) => a.concat(f.group ? flat(f.fields) : [f]), []); }

  function rawValues(form, fields) {
    const out = {};
    flat(fields).forEach((f) => {
      if (f.type === 'html') return;
      if (f.type === 'chips') { const c = form.querySelector('input[name="' + f.name + '"]:checked'); out[f.name] = c ? c.value : ''; return; }
      const el = form.elements[f.name];
      if (!el) return;
      if (f.type === 'toggle') out[f.name] = el.checked;
      else if (f.type === 'money') out[f.name] = U.parseMoney(el.value);
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = el.value.trim();
    });
    return out;
  }

  function applyVisibility(form, fields) {
    const v = rawValues(form, fields);
    flat(fields).forEach((f) => {
      if (!f.showIf) return;
      const w = form.querySelector('[data-field="' + f.name + '"]');
      if (w) w.hidden = !f.showIf(v);
    });
    return v;
  }

  // Liga visibilidade condicional e callback de mudança.
  function bind(form, fields, onChange) {
    const h = () => { const v = applyVisibility(form, fields); if (onChange) onChange(v, form); };
    form.addEventListener('input', h);
    form.addEventListener('change', h);
    applyVisibility(form, fields);
    if (onChange) onChange(rawValues(form, fields), form);
  }

  function read(form, fields) {
    const v = rawValues(form, fields);
    let ok = true; let firstBad = null;
    flat(fields).forEach((f) => {
      const w = form.querySelector('[data-field="' + f.name + '"]');
      if (!w) return;
      w.classList.remove('invalid');
      const hidden = w.hidden || (w.closest('[hidden]'));
      if (hidden) { v[f.name] = f.type === 'toggle' ? false : (f.keepHidden ? v[f.name] : null); return; }
      let bad = false;
      if (f.required && (v[f.name] === null || v[f.name] === '' || v[f.name] === undefined)) bad = true;
      if (f.type === 'money' && v[f.name] !== null && v[f.name] < 0 && !f.allowNegative) bad = true;
      if (f.validate && !bad) { const msg = f.validate(v[f.name], v); if (msg) { bad = true; w.querySelector('.hint').textContent = msg; } }
      if (bad) { ok = false; w.classList.add('invalid'); firstBad = firstBad || w; }
    });
    if (!ok) { firstBad.scrollIntoView({ block: 'center', behavior: 'smooth' }); const i = firstBad.querySelector('input,select,textarea'); if (i) i.focus(); return null; }
    return v;
  }

  // Abre um painel com formulário. onSubmit(values) pode retornar false para manter aberto.
  function open(opts) {
    const s = sheet({
      title: opts.title,
      body: (opts.intro || '') + '<form class="form" novalidate>' + render(opts.fields, opts.values) +
        '<div class="btn-row sticky">' +
        (opts.extraButtons || '') +
        '<button type="submit" class="btn primary block">' + U.esc(opts.submit || 'Salvar') + '</button></div></form>',
      onMount: (el, api) => {
        const form = el.querySelector('form');
        bind(form, opts.fields, opts.onChange);
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const v = read(form, opts.fields);
          if (!v) return;
          const r = await opts.onSubmit(v, form, api);
          if (r !== false) api.close();
        });
        if (opts.onMount) opts.onMount(form, api);
        const af = form.querySelector('[autofocus]');
        if (af && window.matchMedia('(pointer:fine)').matches) setTimeout(() => af.focus(), 200);
      },
      onClose: opts.onClose
    });
    return s;
  }

  window.F = { sheet, closeAll, confirm, render, bind, read, open, rawValues };
})();
