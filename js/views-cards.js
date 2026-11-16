/* views-cards.js — cartões de crédito, faturas, parcelas e pagamentos. */
(function () {
  'use strict';
  const M = U.money;
  const COLORS = ['#6c8cff', '#4cb28a', '#b07cd8', '#e08a5f', '#d9668a', '#4aa8c9', '#8a8f9c', '#c9a13b'];
  const ST = { vazia: 'Sem lançamentos', aberta: 'Em aberto', parcial: 'Paga em parte', paga: 'Paga' };
  const stCls = { vazia: 'st-prevista', aberta: 'st-prevista', parcial: 'st-parcial', paga: 'st-paga' };

  function cardTile(app, c) {
    const inv = Calc.invoice(app.s, c, app.month, app.today());
    const lim = Calc.estimatedAvailableLimit(app.s, c);
    return '<a class="cc" href="#cartoes/' + encodeURIComponent(c.id) + '" style="--cc:' + c.color + '">' +
      '<div class="cc-top"><strong>' + U.esc(c.name) + '</strong><span>' + U.esc(c.bank || '') + '</span></div>' +
      '<div class="cc-mid"><span>Fatura de ' + U.monthName(app.month) + '</span><strong>' + M(inv.total) + '</strong></div>' +
      '<div class="cc-bot"><span>Vence ' + U.date(inv.dueDate) + '</span><span class="st ' + stCls[inv.status] + '">' + ST[inv.status] + '</span></div>' +
      (inv.paid > 0 && inv.remaining > 0 ? '<div class="cc-bot"><span>Pago ' + M(inv.paid) + '</span><span>Falta ' + M(inv.remaining) + '</span></div>' : '') +
      (lim ? '<div class="cc-lim"><span>Limite disponível (estimativa)</span><strong>' + M(lim.available) + '</strong></div>' : '') + '</a>';
  }

  App.views.cartoes = function (id) {
    if (id) return cardDetail(this, id);
    const cards = this.s.cards;
    let h = '<div class="section-head"><h2>Cartões de crédito</h2><button class="btn small" data-act="addCard">+ Cartão</button></div>';
    if (!cards.length) return h + '<div class="empty">Nenhum cartão cadastrado.<br><span class="muted small">Só pedimos apelido, banco e datas — nunca número do cartão, código ou senha.</span><br><button class="btn primary" data-act="addCard">+ Cadastrar cartão</button></div>';
    const tot = Calc.sum(cards, (c) => Calc.invoice(this.s, c, this.month).total);
    h += '<div class="totals"><div><span>Total das faturas de ' + U.monthName(this.month) + '</span><strong>' + M(tot) + '</strong></div></div>';
    h += '<div class="cc-grid">' + cards.map((c) => cardTile(this, c)).join('') + '</div>';
    h += '<p class="muted tiny">Limite disponível é uma estimativa baseada só nos lançamentos cadastrados aqui. Não há conexão com o banco.</p>';
    return h;
  };

  function cardDetail(app, id) {
    const c = app.card(id);
    if (!c) return '<div class="empty">Cartão não encontrado. <a href="#cartoes">Voltar</a></div>';
    const inv = Calc.invoice(app.s, c, app.month, app.today());
    const lim = Calc.estimatedAvailableLimit(app.s, c);
    const fut = Calc.futureInvoices(app.s, c, app.month);
    let h = '<a href="#cartoes" class="back">‹ Cartões</a>';
    h += '<section class="cc big" style="--cc:' + c.color + '"><div class="cc-top"><strong>' + U.esc(c.name) + '</strong><span>' + U.esc(c.bank || '') + '</span></div>' +
      '<div class="cc-bot"><span>Fecha dia ' + c.closingDay + ' · vence dia ' + c.dueDay + '</span>' + (c.limit ? '<span>Limite ' + M(c.limit) + '</span>' : '') + '</div>' +
      (lim ? '<div class="cc-lim"><span>Limite disponível (estimativa)</span><strong>' + M(lim.available) + '</strong></div>' : '') + '</section>';

    h += '<section class="card"><div class="section-head"><h3>Fatura de ' + U.monthLabel(app.month) + '</h3><span class="st ' + stCls[inv.status] + '">' + ST[inv.status] + '</span></div>' +
      '<p class="muted small">Fecha em ' + U.date(inv.closingDate) + ' · vence em ' + U.date(inv.dueDate) + '</p>' +
      '<div class="totals three"><div><span>Total</span><strong>' + M(inv.total) + '</strong></div><div><span>Pago</span><strong>' + M(inv.paid) + '</strong></div><div><span>Falta</span><strong>' + M(inv.remaining) + '</strong></div></div>' +
      '<div class="btn-row"><button class="btn" data-act="addPurchase" data-id="' + c.id + '">+ Compra</button><button class="btn primary" data-act="payInvoice" data-id="' + c.id + '"' + (inv.total === 0 ? ' disabled' : '') + '>Registrar pagamento</button></div>';
    h += '<p class="lbl">Compras nesta fatura <span class="muted tiny">(visão por compra)</span></p>';
    if (!inv.items.length) h += '<p class="muted small">Nenhuma compra nesta fatura.</p>';
    else h += '<ul class="list">' + inv.items.map((it) => {
      const cat = app.cat(it.purchase.categoryId);
      return '<li class="row" data-act="purchaseDetail" data-id="' + it.purchase.id + '"><span class="ico" style="background:' + cat.color + '22">' + cat.icon + '</span>' +
        '<span class="row-main"><strong>' + U.esc(it.purchase.description) + '</strong><small>compra ' + U.date(it.purchase.date) + (it.of > 1 ? ' · parcela ' + it.n + '/' + it.of + ' (total ' + M(it.purchase.amount) + ')' : ' · à vista') + (it.purchase.firstInvoiceMonth ? ' · fatura ajustada' : '') + '</small></span>' +
        '<span class="row-end"><strong>' + M(it.amount) + '</strong></span></li>';
    }).join('') + '</ul>';
    if (inv.payments.length) {
      h += '<p class="lbl">Pagamentos registrados <span class="muted tiny">(dinheiro que saiu da conta)</span></p><ul class="list">' + inv.payments.map((p) =>
        '<li class="row"><span class="ico in">✓</span><span class="row-main"><strong>Pagamento</strong><small>' + U.date(p.date) + '</small></span><span class="row-end"><strong>' + M(p.amount) + '</strong></span>' +
        '<button class="icon-btn" data-act="delPayment" data-id="' + p.id + '" aria-label="Excluir pagamento">✕</button></li>').join('') + '</ul>';
    }
    h += '</section>';

    h += '<section class="card"><h3>Próximas faturas (parcelas já lançadas)</h3>' +
      (fut.length ? '<ul class="list compact">' + fut.slice(0, 12).map((f) => '<li class="row"><span class="row-main"><strong>' + U.monthLabel(f.month) + '</strong><small>' + U.plural(f.items.length, 'lançamento', 'lançamentos') + ' · vence ' + U.date(f.dueDate) + '</small></span><span class="row-end"><strong>' + M(f.total) + '</strong></span></li>').join('') + '</ul>' +
        '<p class="muted small">Total comprometido em faturas futuras: <strong>' + M(Calc.sum(fut, (f) => f.total)) + '</strong></p>' : '<p class="muted small">Nenhuma parcela futura.</p>') + '</section>';

    h += '<p class="muted tiny">Aqui você vê as <strong>compras</strong> que formam a fatura. No resumo do mês, conta só o <strong>valor da fatura</strong> (uma vez), e o que já foi pago aparece como pagamento — sem somar compra e pagamento duas vezes.</p>';
    h += '<div class="btn-row"><button class="btn ghost danger" data-act="delCard" data-id="' + c.id + '">Excluir cartão</button><button class="btn" data-act="editCard" data-id="' + c.id + '">Editar cartão</button></div>';
    return h;
  }

  function cardForm(app, c) {
    F.open({
      title: c ? 'Editar cartão' : 'Novo cartão',
      intro: '<p class="info-box small">🔒 Não informe número do cartão, código de segurança ou senha. Aqui só precisamos de um apelido e das datas.</p>',
      values: c || { color: COLORS[app.s.cards.length % COLORS.length], closingDay: '', dueDay: '' },
      submit: c ? 'Salvar' : 'Cadastrar cartão',
      fields: [
        { name: 'name', label: 'Nome ou apelido', required: true, placeholder: 'Ex.: Cartão do dia a dia' },
        { name: 'bank', label: 'Instituição financeira', placeholder: 'Ex.: nome do banco' },
        { name: 'limit', label: 'Limite total (opcional)', type: 'money' },
        { name: 'closingDay', label: 'Dia de fechamento', type: 'number', min: 1, max: 31, required: true, validate: (n) => (n >= 1 && n <= 31 ? null : 'Entre 1 e 31.') },
        { name: 'dueDay', label: 'Dia de vencimento', type: 'number', min: 1, max: 31, required: true, validate: (n) => (n >= 1 && n <= 31 ? null : 'Entre 1 e 31.') },
        { name: 'color', label: 'Cor', type: 'chips', compact: true, options: COLORS.map((x) => ({ value: x, label: ' ', color: x })), cls: 'color-chips' },
        { name: 'rule', type: 'html', html: '<p class="muted small">Regra usada: compras feitas no dia do fechamento ou depois entram na fatura seguinte. Se o seu banco fizer diferente, você pode corrigir a fatura de cada compra.</p>' }
      ],
      onSubmit: (v) => {
        const obj = c || { id: 'cart_' + U.uid() };
        Object.assign(obj, { name: v.name, bank: v.bank, limit: v.limit || null, closingDay: v.closingDay, dueDay: v.dueDay, color: v.color || COLORS[0] });
        if (!c) app.s.cards.push(obj);
        app.save(); app.toast(c ? 'Cartão atualizado.' : 'Cartão cadastrado.');
      }
    });
  }

  Object.assign(App.actions, {
    addCard() { cardForm(this); },
    editCard(el) { cardForm(this, this.card(el.dataset.id)); },
    async delCard(el) {
      const c = this.card(el.dataset.id); if (!c) return;
      const n = this.s.cardPurchases.filter((p) => p.cardId === c.id).length;
      if (!(await F.confirm({ title: 'Excluir cartão?', message: '“' + c.name + '”' + (n ? ' e suas ' + n + ' compras e pagamentos registrados' : '') + ' serão removidos.', ok: 'Excluir', danger: true }))) return;
      this.s.cards = this.s.cards.filter((x) => x !== c);
      this.s.cardPurchases = this.s.cardPurchases.filter((p) => p.cardId !== c.id);
      this.s.invoicePayments = this.s.invoicePayments.filter((p) => p.cardId !== c.id);
      Store.save(); this.go('#cartoes'); this.toast('Cartão excluído.');
    },
    addPurchase(el) { this.expenseForm({ cardId: el.dataset.id }); },
    payInvoice(el) {
      const c = this.card(el.dataset.id); const inv = Calc.invoice(this.s, c, this.month);
      F.open({
        title: 'Pagamento da fatura', submit: 'Registrar pagamento',
        intro: '<p class="small">Fatura de <strong>' + U.monthLabel(this.month) + '</strong> · total ' + M(inv.total) + ' · falta ' + M(inv.remaining) + '</p>',
        values: { kind: 'total', amount: inv.remaining, date: this.today() },
        fields: [
          { name: 'kind', label: 'Tipo de pagamento', type: 'chips', options: [{ value: 'total', label: 'Valor que falta (' + M(inv.remaining) + ')' }, { value: 'parcial', label: 'Outro valor (parcial)' }] },
          { name: 'amount', label: 'Valor pago', type: 'money', required: true, showIf: (v) => v.kind === 'parcial', validate: (x) => (x > 0 ? null : 'Informe o valor pago.') },
          { name: 'date', label: 'Data do pagamento', type: 'date', required: true }
        ],
        onSubmit: (v) => {
          const amount = v.kind === 'total' ? inv.remaining : v.amount;
          if (!(amount > 0)) { this.toast('Nada a pagar nesta fatura.'); return false; }
          this.s.invoicePayments.push({ id: 'pag_' + U.uid(), cardId: c.id, month: this.month, amount, date: v.date });
          this.save(); this.toast('Pagamento registrado.');
        }
      });
    },
    async delPayment(el) {
      if (!(await F.confirm({ title: 'Excluir pagamento?', message: 'O pagamento será removido desta fatura.', ok: 'Excluir', danger: true }))) return;
      this.s.invoicePayments = this.s.invoicePayments.filter((p) => p.id !== el.dataset.id); this.save();
    }
  });
})();
