/* views-entries.js — Lançamentos: despesas (saídas), entradas, formulários, foto e leitura de nota. */
(function () {
  'use strict';
  const M = U.money;

  /* =================== LISTA =================== */
  function monthsInRange(app) {
    const f = app.ui.filters;
    if (f.period === 'intervalo' && f.from && f.to && f.from <= f.to) {
      const out = []; for (let m = Calc.ymOf(f.from); m <= Calc.ymOf(f.to); m = Calc.addMonths(m, 1)) out.push(m);
      return out.slice(0, 36);
    }
    return [app.month];
  }
  function inDateRange(app, iso) {
    const f = app.ui.filters;
    if (f.period !== 'intervalo' || !f.from || !f.to) return true;
    return iso >= f.from && iso <= f.to;
  }

  function expenseRows(app) {
    const f = app.ui.filters; const rows = [];
    monthsInRange(app).forEach((ym) => {
      app.s.expenses.forEach((e) => {
        const o = Calc.expenseOccurrence(e, ym);
        if (!o || !inDateRange(app, o.dueDate || o.date)) return;
        if (f.cat && e.categoryId !== f.cat) return;
        if (f.pay && e.paymentMethod !== f.pay) return;
        if (f.status && o.status !== f.status) return;
        rows.push({ type: 'exp', o, date: o.dueDate || o.date, amount: o.amount });
      });
      if (!f.pay || f.pay === 'credito') {
        if (f.status) return; // compras de cartão seguem a situação da fatura
        app.s.cards.forEach((c) => {
          const inv = Calc.invoice(app.s, c, ym, app.today());
          inv.items.forEach((it) => {
            if (f.cat && it.purchase.categoryId !== f.cat) return;
            rows.push({ type: 'card', it, card: c, inv, date: it.purchase.date, amount: it.amount, ym });
          });
        });
      }
    });
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function filtersHTML(app) {
    const f = app.ui.filters;
    const opt = (v, l, cur) => '<option value="' + U.esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    const active = [f.cat, f.pay, f.status, f.period === 'intervalo'].filter(Boolean).length;
    return '<details class="filters"' + (active ? ' open' : '') + '><summary>Filtros' + (active ? ' <span class="badge">' + active + '</span>' : '') + '</summary>' +
      '<div class="filter-grid">' +
      '<label>Período<select data-change="filter" data-k="period">' + opt('mes', 'Mês selecionado', f.period) + opt('intervalo', 'Intervalo de datas', f.period) + '</select></label>' +
      (f.period === 'intervalo' ? '<label>De<input type="date" data-change="filter" data-k="from" value="' + f.from + '"></label><label>Até<input type="date" data-change="filter" data-k="to" value="' + f.to + '"></label>' : '') +
      '<label>Categoria<select data-change="filter" data-k="cat">' + opt('', 'Todas', f.cat) + app.s.categories.map((c) => opt(c.id, c.icon + ' ' + c.name, f.cat)).join('') + '</select></label>' +
      '<label>Forma de pagamento<select data-change="filter" data-k="pay">' + opt('', 'Todas', f.pay) + Object.keys(app.PAY).filter((k) => k !== 'folha').map((k) => opt(k, app.PAY[k], f.pay)).join('') + '</select></label>' +
      '<label>Situação<select data-change="filter" data-k="status">' + opt('', 'Todas', f.status) + opt('prevista', 'Prevista', f.status) + opt('paga', 'Paga', f.status) + opt('atrasada', 'Atrasada', f.status) + '</select></label>' +
      '</div>' + (active ? '<button class="btn small ghost" data-act="clearFilters">Limpar filtros</button>' : '') + '</details>';
  }

  function expenseListHTML(app) {
    const rows = expenseRows(app);
    const direct = Calc.sum(rows.filter((r) => r.type === 'exp'), (r) => r.amount);
    const card = Calc.sum(rows.filter((r) => r.type === 'card'), (r) => r.amount);
    let h = filtersHTML(app);
    h += '<div class="totals"><div><span>Despesas diretas</span><strong>' + M(direct) + '</strong></div><div><span>Compras no cartão (nas faturas)</span><strong>' + M(card) + '</strong></div></div>';
    h += '<p class="muted tiny">Compras no cartão aparecem aqui para você ver o gasto por compra. O dinheiro que sai da conta é o pagamento da fatura (em Cartões).</p>';
    if (!rows.length) return h + '<div class="empty">Nenhuma despesa encontrada.<br><button class="btn primary" data-act="addExpense">+ Adicionar gasto</button></div>';
    let lastMonth = null;
    h += '<ul class="list">';
    rows.forEach((r) => {
      const ym = Calc.ymOf(r.date);
      if (monthsInRange(app).length > 1 && ym !== lastMonth) { h += '<li class="list-sep">' + U.monthLabel(ym) + '</li>'; lastMonth = ym; }
      if (r.type === 'exp') {
        const e = r.o.item; const c = app.cat(e.categoryId);
        const passed = r.o.status === 'prevista' && r.o.dueDate && r.o.dueDate < app.today();
        h += '<li class="row" data-act="expenseDetail" data-id="' + e.id + '" data-ym="' + r.o.ym + '">' +
          '<span class="ico" style="background:' + c.color + '22">' + c.icon + '</span>' +
          '<span class="row-main"><strong>' + U.esc(e.description) + (e.recurring ? ' <span class="tag">mensal</span>' : '') + (e.photoId ? ' <span aria-label="tem foto">📎</span>' : '') + '</strong>' +
          '<small>' + (r.o.dueDate ? 'vence ' + U.date(r.o.dueDate) : U.date(r.o.date)) + ' · ' + app.PAY[e.paymentMethod] + (passed ? ' · <span class="txt-warn">vencimento passou — confirme</span>' : '') + '</small></span>' +
          '<span class="row-end"><strong>' + M(r.o.amount) + '</strong>' + app.statusChip(r.o.status) + '</span>' +
          (r.o.status !== 'paga' ? '<button class="check" data-act="quickPay" data-id="' + e.id + '" data-ym="' + r.o.ym + '" aria-label="Marcar como paga">✓</button>' : '') +
          '</li>';
      } else {
        const p = r.it.purchase; const c = app.cat(p.categoryId);
        h += '<li class="row is-card" data-act="purchaseDetail" data-id="' + p.id + '">' +
          '<span class="ico" style="background:' + c.color + '22">' + c.icon + '</span>' +
          '<span class="row-main"><strong>' + U.esc(p.description) + (p.photoId ? ' 📎' : '') + '</strong>' +
          '<small><i class="dot" style="background:' + r.card.color + '"></i>' + U.esc(r.card.name) + ' · compra ' + U.date(p.date) + (r.it.of > 1 ? ' · parcela ' + r.it.n + '/' + r.it.of : '') + '</small></span>' +
          '<span class="row-end"><strong>' + M(r.it.amount) + '</strong><span class="st st-card">fatura ' + U.monthShort(r.ym) + '</span></span></li>';
      }
    });
    return h + '</ul>';
  }

  function incomeListHTML(app) {
    const s = Calc.monthSummary(app.s, app.month, app.today());
    let h = '<div class="totals"><div><span>Previsto</span><strong>' + M(s.incomeExpected) + '</strong></div><div><span>Recebido</span><strong>' + M(s.incomeReceived) + '</strong></div></div>';
    if (!s.incomes.length) return h + '<div class="empty">Nenhuma entrada em ' + U.monthLabel(app.month) + '.<br><button class="btn primary" data-act="addIncome">+ Adicionar entrada</button></div>';
    h += '<ul class="list">';
    s.incomes.forEach((o) => {
      const i = o.item; const c = o.calc;
      let how = c.mode === 'referencia'
        ? 'Referência ' + M(c.gross) + (c.deductions.length ? ' − descontos ' + M(Calc.sum(c.deductions, (d) => d.amount)) : '') + (c.payroll.length ? ' − consignado em folha ' + M(Calc.sum(c.payroll, (p) => p.amount)) : '')
        : 'Valor líquido informado';
      h += '<li class="row" data-act="incomeDetail" data-id="' + i.id + '" data-ym="' + o.ym + '">' +
        '<span class="ico in">' + ({ salario: '💼', extra: '✨', reembolso: '↩️' }[i.type] || '💰') + '</span>' +
        '<span class="row-main"><strong>' + U.esc(i.description) + (i.recurring ? ' <span class="tag">mensal</span>' : '') + '</strong><small>' + U.date(o.date) + ' · ' + how + '</small></span>' +
        '<span class="row-end"><strong class="txt-in">' + M(o.net) + '</strong><span class="st ' + (o.received ? 'st-paga">Recebido' : 'st-prevista">Previsto') + '</span></span>' +
        (!o.received ? '<button class="check" data-act="quickReceive" data-id="' + i.id + '" data-ym="' + o.ym + '" aria-label="Marcar como recebido">✓</button>' : '') + '</li>';
    });
    return h + '</ul>';
  }

  App.views.movimentos = function () {
    const t = this.ui.movTab;
    return '<div class="seg" role="tablist">' +
      '<button role="tab" class="' + (t === 'saidas' ? 'on' : '') + '" data-act="tab" data-key="movTab" data-val="saidas">Saídas</button>' +
      '<button role="tab" class="' + (t === 'entradas' ? 'on' : '') + '" data-act="tab" data-key="movTab" data-val="entradas">Entradas</button></div>' +
      (t === 'saidas'
        ? '<div class="section-head"><h2>Despesas</h2><button class="btn small" data-act="addExpense">+ Gasto</button></div>' + expenseListHTML(this)
        : '<div class="section-head"><h2>Entradas e salário</h2><button class="btn small" data-act="addIncome">+ Entrada</button></div>' + incomeListHTML(this));
  };

  /* =================== AÇÕES DA LISTA =================== */
  Object.assign(App.actions, {
    filter(el) {
      const f = this.ui.filters; f[el.dataset.k] = el.value;
      if (el.dataset.k === 'period' && el.value === 'intervalo' && !f.from) {
        f.from = Calc.addMonths(this.month, -2) + '-01'; f.to = Calc.dateInMonth(this.month, 31);
      }
      this.render();
    },
    clearFilters() { this.ui.filters = { period: 'mes', from: '', to: '', cat: '', pay: '', status: '' }; this.render(); },
    quickPay(el, ev) {
      ev.stopPropagation();
      const e = this.s.expenses.find((x) => x.id === el.dataset.id); if (!e) return;
      this.setExpenseStatus(e, el.dataset.ym, 'paga'); this.save(); this.toast('Marcada como paga.');
    },
    quickReceive(el, ev) {
      ev.stopPropagation();
      const i = this.s.incomes.find((x) => x.id === el.dataset.id); if (!i) return;
      this.setIncomeReceived(i, el.dataset.ym, true); this.save(); this.toast('Marcada como recebida.');
    },
    expenseDetail(el) { expenseDetail(this, el.dataset.id, el.dataset.ym); },
    purchaseDetail(el) { const p = this.s.cardPurchases.find((x) => x.id === el.dataset.id); if (p) this.expenseForm({ purchase: p }); },
    incomeDetail(el) { const i = this.s.incomes.find((x) => x.id === el.dataset.id); if (i) incomeForm(this, i, el.dataset.ym); },
    addIncome() { incomeForm(this); }
  });

  function expenseDetail(app, id, ym) {
    const e = app.s.expenses.find((x) => x.id === id); if (!e) return;
    const o = Calc.expenseOccurrence(e, ym); const c = app.cat(e.categoryId);
    const body =
      '<div class="detail"><div class="detail-amount">' + M(o.amount) + '</div>' +
      '<dl><dt>Categoria</dt><dd>' + c.icon + ' ' + U.esc(c.name) + '</dd><dt>Data</dt><dd>' + U.date(o.date) + '</dd>' +
      (o.dueDate ? '<dt>Vencimento</dt><dd>' + U.date(o.dueDate) + '</dd>' : '') +
      '<dt>Pagamento</dt><dd>' + app.PAY[e.paymentMethod] + '</dd>' +
      (e.recurring ? '<dt>Repetição</dt><dd>Todo mês' + (e.endMonth ? ' até ' + U.monthShort(e.endMonth) : '') + '</dd>' : '') +
      (e.notes ? '<dt>Observações</dt><dd>' + U.esc(e.notes) + '</dd>' : '') + '</dl>' +
      '<p class="lbl">Situação em ' + U.monthLabel(ym) + '</p><div class="chips" data-status>' +
      ['prevista', 'paga', 'atrasada'].map((st) => '<button class="chip-btn' + (o.status === st ? ' on' : '') + '" data-st="' + st + '">' + app.STATUS[st] + '</button>').join('') + '</div>' +
      (e.photoId ? '<button class="btn block ghost" data-photo>📎 Ver foto do comprovante</button>' : '') +
      '<div class="btn-row"><button class="btn danger ghost" data-del>Excluir</button><button class="btn primary" data-edit>Editar</button></div></div>';
    const sh = F.sheet({ title: e.description, body });
    sh.el.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { app.setExpenseStatus(e, ym, b.dataset.st); app.save(); sh.close(); app.toast('Situação atualizada.'); });
    const ph = sh.el.querySelector('[data-photo]'); if (ph) ph.onclick = () => app.showPhoto(e.photoId);
    sh.el.querySelector('[data-edit]').onclick = () => { sh.close(); app.expenseForm({ expense: e }); };
    sh.el.querySelector('[data-del]').onclick = async () => {
      if (e.recurring && ym > Calc.ymOf(e.dueDate || e.date)) {
        const s2 = F.sheet({ title: 'Excluir despesa mensal', body: '<p>Esta despesa se repete todo mês.</p><div class="stack"><button class="btn block" data-end>Parar a partir de ' + U.monthLabel(ym) + '</button><button class="btn danger block" data-all>Excluir de todos os meses</button></div>' });
        s2.el.querySelector('[data-end]').onclick = () => { e.endMonth = Calc.addMonths(ym, -1); app.save(); s2.close(); sh.close(); app.toast('A despesa não aparece mais a partir deste mês.'); };
        s2.el.querySelector('[data-all]').onclick = () => { removeExpense(app, e); s2.close(); sh.close(); };
        return;
      }
      if (await F.confirm({ title: 'Excluir despesa?', message: '“' + e.description + '” será removida' + (e.recurring ? ' de todos os meses' : '') + '.', ok: 'Excluir', danger: true })) { removeExpense(app, e); sh.close(); }
    };
  }
  function removeExpense(app, e) {
    app.s.expenses = app.s.expenses.filter((x) => x !== e);
    if (e.photoId) Store.photoDel(e.photoId).catch(() => {});
    app.save(); app.toast('Despesa excluída.');
  }

  /* =================== FORMULÁRIO DE GASTO (rápido e completo) =================== */
  // opts: { expense } | { purchase } | { cardId } (nova compra no cartão)
  App.expenseForm = function (opts) {
    const app = this; opts = opts || {};
    const e = opts.expense; const p = opts.purchase;
    const editing = e || p;
    const hasCards = app.s.cards.length > 0;
    const v = p ? {
      amount: p.amount, description: p.description, categoryId: p.categoryId, paymentMethod: 'credito', cardId: p.cardId,
      installments: p.installments, date: p.date, firstInvoiceMonth: p.firstInvoiceMonth || '', notes: p.notes
    } : e ? {
      amount: e.amount, description: e.description, categoryId: e.categoryId, paymentMethod: e.paymentMethod, status: e.status,
      date: e.date, dueDate: e.dueDate || '', recurring: e.recurring, notes: e.notes
    } : {
      date: app.today(), status: 'paga', paymentMethod: opts.cardId ? 'credito' : 'pix', cardId: opts.cardId || (app.s.cards[0] && app.s.cards[0].id), installments: 1, categoryId: 'alimentacao'
    };
    if (!v.cardId && hasCards) v.cardId = app.s.cards[0].id;
    let photo = { blob: null, existingId: (p || e || {}).photoId || null, keep: true, removed: false };

    const isCredit = (x) => x.paymentMethod === 'credito';
    const fields = [
      { name: 'photo', type: 'html', html: '<div class="photo-box" data-photo-box>' +
        '<div class="photo-actions"><label class="btn small">📷 Tirar foto<input type="file" accept="image/*" capture="environment" hidden data-photo-in></label>' +
        '<label class="btn small ghost">🖼️ Escolher imagem<input type="file" accept="image/*" hidden data-photo-in></label></div>' +
        '<div data-photo-preview></div></div>' },
      { name: 'amount', label: 'Valor', type: 'money', required: true, big: true, autofocus: !editing, validate: (x) => (x > 0 ? null : 'Informe um valor maior que zero.') },
      { name: 'description', label: 'Descrição ou estabelecimento', required: true, placeholder: 'Ex.: Mercado, farmácia, aluguel' },
      { name: 'categoryId', label: 'Categoria', type: 'chips', compact: true, options: app.catChips(), required: true },
      { name: 'paymentMethod', label: 'Forma de pagamento', type: 'chips', compact: true, required: true,
        options: Object.keys(app.PAY).filter((k) => k !== 'folha').map((k) => ({ value: k, label: app.PAY[k] })) },
      { name: 'noCard', type: 'html', showIf: (x) => isCredit(x) && !hasCards, html: '<p class="soft-warn small">Você ainda não cadastrou cartões. <a href="#cartoes" data-close-sheets>Cadastrar cartão</a></p>' },
      { name: 'cardId', label: 'Cartão', type: 'chips', showIf: (x) => isCredit(x) && hasCards, required: true, options: app.s.cards.map((c) => ({ value: c.id, label: c.name, color: c.color })) },
      { name: 'installments', label: 'Parcelas', type: 'number', min: 1, max: 48, showIf: (x) => isCredit(x) && hasCards, hint: '1 = à vista', required: true,
        validate: (n) => (n >= 1 && n <= 48 ? null : 'Entre 1 e 48 parcelas.') },
      { name: 'invoiceInfo', type: 'html', showIf: (x) => isCredit(x) && hasCards, html: '<p class="muted small" data-invoice-info></p>' },
      { name: 'status', label: 'Situação', type: 'chips', compact: true, showIf: (x) => !isCredit(x), required: true,
        options: [{ value: 'paga', label: 'Paga' }, { value: 'prevista', label: 'Prevista' }, { value: 'atrasada', label: 'Atrasada' }] },
      { name: 'date', label: 'Data da compra', type: 'date', required: true },
      { group: 'Mais detalhes (vencimento, repetição, observações)', open: !!(e && (e.dueDate || e.recurring || e.notes)) || !!(p && p.firstInvoiceMonth), fields: [
        { name: 'dueDate', label: 'Data de vencimento', type: 'date', showIf: (x) => !isCredit(x), hint: 'Para contas com vencimento (boletos, aluguel...).' },
        { name: 'recurring', type: 'toggle', text: 'Repetir todo mês (despesa fixa)', showIf: (x) => !isCredit(x) },
        { name: 'firstInvoiceMonth', label: 'Corrigir fatura da 1ª parcela', type: 'month', showIf: (x) => isCredit(x) && hasCards, hint: 'Deixe vazio para calcular pelo fechamento do cartão.' },
        { name: 'notes', label: 'Observações', type: 'textarea' }
      ] }
    ];

    const updateInvoiceInfo = (x, form) => {
      const info = form.querySelector('[data-invoice-info]');
      if (!info) return;
      const card = app.card(x.cardId);
      if (!card || !x.date || !(x.amount > 0)) { info.textContent = ''; return; }
      const first = x.firstInvoiceMonth || Calc.invoiceMonthFor(x.date, card.closingDay, card.dueDay);
      const n = Math.max(1, x.installments || 1);
      const parts = Calc.splitInstallments(x.amount, n);
      info.innerHTML = (n > 1 ? n + 'x de ' + M(parts[parts.length - 1]) + (parts[0] !== parts[parts.length - 1] ? ' (1ª de ' + M(parts[0]) + ')' : '') + ' · ' : '') +
        '1ª parcela na fatura de <strong>' + U.monthLabel(first) + '</strong> (vence ' + U.date(Calc.dueDateFor(first, card.dueDay)) + ')' +
        (n > 1 ? ', última em ' + U.monthLabel(Calc.addMonths(first, n - 1)) : '') + '.';
    };

    const sh = F.open({
      title: p ? 'Editar compra no cartão' : e ? 'Editar despesa' : 'Adicionar gasto',
      fields, values: v, submit: editing ? 'Salvar alterações' : 'Salvar gasto',
      onChange: updateInvoiceInfo,
      onMount: (form, api) => {
        const box = form.querySelector('[data-photo-preview]');
        const drawPreview = async () => {
          let url = null;
          if (photo.blob) url = URL.createObjectURL(photo.blob);
          else if (photo.existingId && !photo.removed) { const b = await Store.photoGet(photo.existingId).catch(() => null); if (b) url = URL.createObjectURL(b); }
          if (!url) { box.innerHTML = ''; return; }
          box.innerHTML = '<div class="photo-prev"><img src="' + url + '" alt="Prévia do comprovante">' +
            '<div><button type="button" class="btn small primary" data-ocr>🔎 Ler dados da foto</button>' +
            '<label class="toggle small"><input type="checkbox" data-keep ' + (photo.keep ? 'checked' : '') + '><span class="track"></span><span>Guardar a foto com o lançamento</span></label>' +
            '<button type="button" class="link" data-rm>Remover foto</button></div></div><div data-ocr-out></div>';
          box.querySelector('[data-keep]').onchange = (ev) => { photo.keep = ev.target.checked; };
          box.querySelector('[data-rm]').onclick = () => { photo.blob = null; photo.removed = true; drawPreview(); };
          box.querySelector('[data-ocr]').onclick = () => runOCR(app, photo, form, fields, box.querySelector('[data-ocr-out]'));
        };
        form.querySelectorAll('[data-photo-in]').forEach((inp) => inp.addEventListener('change', async () => {
          const f = inp.files && inp.files[0]; if (!f) return;
          photo.blob = await Store.compressImage(f); photo.removed = false; inp.value = '';
          drawPreview();
        }));
        drawPreview();
        const link = form.querySelector('[data-close-sheets]'); if (link) link.onclick = () => F.closeAll();
        if (editing) {
          const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger ghost'; del.textContent = 'Excluir';
          form.querySelector('.btn-row').prepend(del);
          del.onclick = async () => {
            if (!(await F.confirm({ title: 'Excluir lançamento?', message: '“' + (p || e).description + '” será removido' + (p && p.installments > 1 ? ' com todas as parcelas' : '') + '.', ok: 'Excluir', danger: true }))) return;
            if (p) app.s.cardPurchases = app.s.cardPurchases.filter((x) => x !== p);
            else app.s.expenses = app.s.expenses.filter((x) => x !== e);
            if ((p || e).photoId) Store.photoDel((p || e).photoId).catch(() => {});
            api.close(); app.save(); app.toast('Lançamento excluído.');
          };
        }
      },
      onSubmit: async (x) => {
        if (isCredit(x) && !hasCards) { app.toast('Cadastre um cartão primeiro.'); return false; }
        const entry = { amount: x.amount, date: x.date, description: x.description };
        const dups = Calc.findDuplicates(app.s, entry, editing && editing.id);
        if (dups.length && !editing) {
          const d = dups[0].item;
          const ok = await F.confirm({ title: 'Possível duplicidade', ok: 'Salvar mesmo assim', cancel: 'Voltar e conferir',
            html: '<p>Já existe um lançamento parecido:</p><p class="dup"><strong>' + U.esc(d.description) + '</strong><br>' + M(d.amount) + ' · ' + U.date(d.date) + (dups[0].kind === 'cartao' ? ' · no cartão' : '') + '</p><p class="muted small">Se forem gastos diferentes, pode salvar normalmente.</p>' });
          if (!ok) return false;
        }
        // Foto
        let photoId = photo.removed ? null : photo.existingId;
        if (photo.removed && photo.existingId) Store.photoDel(photo.existingId).catch(() => {});
        if (photo.blob && photo.keep) {
          try { photoId = await Store.photoPut(photo.blob); if (photo.existingId && photo.existingId !== photoId) Store.photoDel(photo.existingId).catch(() => {}); }
          catch (err) { app.toast('Não foi possível guardar a foto neste navegador. O gasto será salvo sem ela.'); }
        } else if (photo.blob && !photo.keep && !photo.existingId) photoId = null;

        // Remove o original se mudou de tipo (despesa <-> cartão)
        if (e) app.s.expenses = app.s.expenses.filter((y) => y !== e);
        if (p) app.s.cardPurchases = app.s.cardPurchases.filter((y) => y !== p);

        if (isCredit(x)) {
          app.s.cardPurchases.push({
            id: (p && p.id) || 'comp_' + U.uid(), cardId: x.cardId, description: x.description, amount: x.amount,
            installments: x.installments || 1, date: x.date, categoryId: x.categoryId, firstInvoiceMonth: x.firstInvoiceMonth || null, notes: x.notes || '', photoId
          });
        } else {
          const base = e && !p ? e : {};
          app.s.expenses.push(Object.assign({}, base, {
            id: base.id || 'desp_' + U.uid(), description: x.description, amount: x.amount, date: x.date, dueDate: x.dueDate || null,
            categoryId: x.categoryId, paymentMethod: x.paymentMethod, status: x.status, recurring: !!x.recurring, notes: x.notes || '', photoId,
            byMonth: x.recurring ? (base.byMonth || {}) : undefined
          }));
        }
        app.save();
        app.toast(editing ? 'Alterações salvas.' : isCredit(x) ? 'Compra registrada no cartão.' : 'Gasto registrado.');
      }
    });
    return sh;
  };

  /* =================== LEITURA DA FOTO (OCR) =================== */
  async function runOCR(app, photo, form, fields, out) {
    if (!app.s.settings.ocrConsent) {
      const ok = await F.confirm({
        title: 'Leitura automática da foto', ok: 'Entendi, ler a foto', cancel: 'Agora não',
        html: '<p>A leitura usa o <strong>Tesseract.js</strong>, uma biblioteca gratuita que roda <strong>dentro do seu navegador</strong>.</p>' +
          '<ul><li>A imagem <strong>não é enviada</strong> para nenhum servidor.</li>' +
          '<li>Na primeira vez, o navegador baixa a biblioteca e o dicionário em português (alguns MB) do site jsDelivr. Use Wi-Fi se puder.</li>' +
          '<li>Não tem custo.</li><li>Pode demorar e <strong>pode errar</strong>: tudo será mostrado para você conferir antes de salvar.</li></ul>'
      });
      if (!ok) return;
      app.s.settings.ocrConsent = true; Store.save();
    }
    const blob = photo.blob || (photo.existingId ? await Store.photoGet(photo.existingId) : null);
    if (!blob) return;
    out.innerHTML = '<div class="ocr-status"><span class="spinner"></span> <span data-msg>Preparando a leitura...</span><div class="hbar"><i data-bar style="width:0"></i></div></div>';
    const msgs = { 'loading tesseract core': 'Baixando a biblioteca...', 'loading language traineddata': 'Baixando o dicionário em português...', 'initializing api': 'Iniciando...', 'recognizing text': 'Lendo o texto da imagem...' };
    try {
      const text = await OCR.recognize(blob, (status, prog) => {
        const m = out.querySelector('[data-msg]'); const b = out.querySelector('[data-bar]');
        if (m) m.textContent = msgs[status] || 'Processando...'; if (b) b.style.width = Math.round(prog * 100) + '%';
      });
      const r = OCR.parse(text, app.today());
      applySuggestions(app, form, fields, r);
      out.innerHTML = '<div class="ocr-result"><strong>Sugestões da leitura — confira cada campo.</strong>' +
        '<p class="small">Campos com borda amarela foram preenchidos pela leitura. Campos com borda vermelha não foram identificados.</p>' +
        '<details><summary>Ver texto lido</summary><pre>' + U.esc(text || '(nenhum texto encontrado)') + '</pre></details></div>';
    } catch (err) {
      out.innerHTML = '<p class="soft-warn small">Não foi possível ler a imagem: ' + U.esc(err.message || 'erro desconhecido') + '. Você pode preencher os campos manualmente.</p>';
    }
  }

  function applySuggestions(app, form, fields, r) {
    const mark = (name, found) => {
      const w = form.querySelector('[data-field="' + name + '"]'); if (!w) return;
      w.classList.remove('suggested', 'missing');
      w.classList.add(found ? 'suggested' : 'missing');
      const hint = w.querySelector('.hint');
      if (hint) hint.textContent = found ? 'Sugestão da leitura — confira.' : 'Não identificado na imagem — preencha.';
    };
    if (r.amount) form.elements.amount.value = U.moneyInput(r.amount); mark('amount', !!r.amount);
    if (r.merchant) form.elements.description.value = r.merchant; mark('description', !!r.merchant);
    if (r.date) form.elements.date.value = r.date; mark('date', !!r.date);
    if (r.categoryId) { const c = form.querySelector('input[name="categoryId"][value="' + r.categoryId + '"]'); if (c) c.checked = true; }
    mark('categoryId', !!r.categoryId);
    form.dispatchEvent(new Event('change'));
  }

  /* =================== ENTRADAS =================== */
  function incomeForm(app, inc, ym) {
    const payrollFor = (m) => app.s.loans.map((l) => Calc.loanInstallment(l, m)).filter((x) => x && x.payroll);
    const refYM = ym || app.month;
    let deductions = inc ? JSON.parse(JSON.stringify(inc.deductions || [])) : [];
    const v = inc ? Object.assign({}, inc) : { type: 'salario', mode: 'liquido', expectedDate: Calc.dateInMonth(app.month, 5), recurring: true, received: false };
    if (inc && inc.recurring && ym) { const o = Calc.incomeOccurrence(inc, ym); if (o) v.received = o.received; }

    const dedHTML = () => '<div class="deductions"><p class="lbl">Descontos informados por você</p>' +
      '<p class="hint">Copie do seu holerite (ex.: INSS, IRRF, plano de saúde). A ferramenta não calcula impostos automaticamente. <strong>Não inclua aqui consignados cadastrados em Empréstimos</strong> — eles são descontados automaticamente.</p>' +
      '<ul data-ded-list>' + deductions.map((d, i) => '<li><input aria-label="Nome do desconto" data-ded-name="' + i + '" value="' + U.esc(d.name) + '" placeholder="Nome"><div class="money-in"><span>R$</span><input aria-label="Valor do desconto" inputmode="decimal" data-ded-val="' + i + '" value="' + U.moneyInput(d.amount) + '" placeholder="0,00"></div><button type="button" class="icon-btn" data-ded-rm="' + i + '" aria-label="Remover desconto">✕</button></li>').join('') + '</ul>' +
      '<button type="button" class="btn small ghost" data-ded-add>+ Adicionar desconto</button></div>';

    const fields = [
      { name: 'description', label: 'Descrição', required: true, placeholder: 'Ex.: Salário, freela, reembolso' },
      { name: 'type', label: 'Tipo', type: 'chips', compact: true, required: true, options: [{ value: 'salario', label: 'Salário' }, { value: 'extra', label: 'Renda extra' }, { value: 'reembolso', label: 'Reembolso' }, { value: 'outro', label: 'Outro' }] },
      { name: 'mode', label: 'Como você quer informar o valor?', type: 'chips', required: true, options: [{ value: 'liquido', label: 'Valor líquido que cai na conta' }, { value: 'referencia', label: 'Valor de referência + descontos' }] },
      { name: 'amount', label: 'Valor', type: 'money', big: true, required: true, validate: (x) => (x > 0 ? null : 'Informe um valor maior que zero.') },
      { name: 'deductions', type: 'html', showIf: (x) => x.mode === 'referencia', html: '<div data-ded-wrap>' + dedHTML() + '</div>' },
      { name: 'netInfo', type: 'html', html: '<div class="info-box" data-net-info></div>' },
      { name: 'expectedDate', label: 'Data prevista de recebimento', type: 'date', required: true },
      { name: 'recurring', type: 'toggle', text: 'Repete todo mês' },
      { name: 'received', type: 'toggle', text: 'Já recebi' + (inc && inc.recurring ? ' (neste mês)' : '') },
      { name: 'notes', label: 'Observações', type: 'textarea' }
    ];

    const readDed = (form) => {
      deductions = deductions.map((d, i) => ({ id: d.id || 'desc_' + U.uid(), name: (form.querySelector('[data-ded-name="' + i + '"]') || {}).value || d.name, amount: U.parseMoney((form.querySelector('[data-ded-val="' + i + '"]') || {}).value) || 0 }));
    };
    const updateInfo = (x, form) => {
      readDed(form);
      const box = form.querySelector('[data-net-info]'); if (!box) return;
      const m = x.expectedDate ? Calc.ymOf(x.expectedDate) : refYM;
      const pl = x.type === 'salario' ? payrollFor(m) : [];
      const plTotal = Calc.sum(pl, (p) => p.amount);
      const amount = x.amount || 0;
      let h;
      if (x.mode === 'referencia') {
        const dTotal = Calc.sum(deductions, (d) => d.amount);
        h = '<strong>Valor líquido estimado: ' + M(amount - dTotal - plTotal) + '</strong><br>' +
          'Referência ' + M(amount) + ' − descontos informados ' + M(dTotal) + (pl.length ? ' − consignado em folha ' + M(plTotal) + ' (' + pl.map((p) => U.esc(p.loan.name)).join(', ') + ')' : '') + '.' +
          '<br><small>Este é o valor usado nos cálculos.</small>';
      } else {
        h = '<strong>Valor usado nos cálculos: ' + M(amount) + '</strong> (o que cai na conta).' +
          (pl.length ? '<br><small>Os consignados em folha (' + M(plTotal) + ') já estão descontados desse valor, por isso <strong>não</strong> serão subtraídos de novo.</small>' : '');
      }
      box.innerHTML = h;
    };

    F.open({
      title: inc ? 'Editar entrada' : 'Nova entrada', fields, values: v, submit: inc ? 'Salvar alterações' : 'Salvar entrada',
      onChange: updateInfo,
      onMount: (form, api) => {
        const wrap = form.querySelector('[data-ded-wrap]');
        const redraw = () => { readDed(form); wrap.innerHTML = dedHTML(); form.dispatchEvent(new Event('change')); };
        wrap.addEventListener('click', (ev) => {
          if (ev.target.matches('[data-ded-add]')) { readDed(form); deductions.push({ id: 'desc_' + U.uid(), name: '', amount: 0 }); wrap.innerHTML = dedHTML(); }
          const rm = ev.target.closest('[data-ded-rm]'); if (rm) { readDed(form); deductions.splice(+rm.dataset.dedRm, 1); wrap.innerHTML = dedHTML(); form.dispatchEvent(new Event('change')); }
        });
        void redraw;
        if (inc) {
          const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger ghost'; del.textContent = 'Excluir';
          form.querySelector('.btn-row').prepend(del);
          del.onclick = async () => {
            if (!(await F.confirm({ title: 'Excluir entrada?', message: '“' + inc.description + '” será removida' + (inc.recurring ? ' de todos os meses' : '') + '.', ok: 'Excluir', danger: true }))) return;
            app.s.incomes = app.s.incomes.filter((x) => x !== inc); api.close(); app.save(); app.toast('Entrada excluída.');
          };
        }
      },
      onSubmit: (x, form) => {
        readDed(form);
        const obj = inc || { id: 'ent_' + U.uid(), byMonth: {} };
        Object.assign(obj, {
          description: x.description, type: x.type, mode: x.mode, amount: x.amount,
          deductions: x.mode === 'referencia' ? deductions.filter((d) => d.amount > 0 || d.name) : [],
          expectedDate: x.expectedDate, recurring: !!x.recurring, notes: x.notes || ''
        });
        if (obj.recurring) {
          obj.byMonth = obj.byMonth || {};
          const m = ym || Calc.ymOf(x.expectedDate);
          obj.byMonth[m] = Object.assign({}, obj.byMonth[m], { received: !!x.received });
          if (!inc) obj.received = !!x.received;
        } else obj.received = !!x.received;
        if (!inc) app.s.incomes.push(obj);
        app.save(); app.toast(inc ? 'Entrada atualizada.' : 'Entrada registrada.');
      }
    });
  }
  App.incomeForm = function (inc, ym) { incomeForm(this, inc, ym); };
})();
