/* views-debts.js — empréstimos (incl. consignado CLT), situação geral e plano para sair do vermelho. */
(function () {
  'use strict';
  const M = U.money;
  const TYPES = { consignado_clt: 'Consignado CLT', consignado_inss: 'Consignado INSS/servidor', pessoal: 'Empréstimo pessoal', financiamento: 'Financiamento', cartao: 'Parcelamento de fatura', outro: 'Outro' };
  const PSTATUS = { planejado: 'Planejado', andamento: 'Em andamento', concluido: 'Concluído' };

  function loanCard(app, l) {
    const s = Calc.loanSummary(l, app.today());
    const inst = Calc.loanInstallment(l, app.month);
    const folha = l.paymentMethod === 'folha';
    let warn = '';
    if (folha) {
      const sal = app.s.incomes.map((i) => Calc.incomeOccurrence(i, app.month)).filter((o) => o && o.item.type === 'salario');
      if (!sal.length) warn = 'Descontado em folha, mas não há salário cadastrado em ' + U.monthName(app.month) + '.';
    }
    return '<article class="card loan">' +
      '<div class="section-head"><div><h3>' + U.esc(l.name) + '</h3><small class="muted">' + U.esc(l.institution || '') + ' · ' + (TYPES[l.type] || 'Empréstimo') + '</small></div>' +
      '<span class="tag ' + (folha ? 'tag-folha' : '') + '">' + (folha ? 'Desconto em folha' : 'Pagamento manual') + '</span></div>' +
      '<div class="loan-prog"><div class="hbar"><i style="width:' + (s.progress * 100).toFixed(1) + '%"></i></div><span>' + s.paid + ' de ' + l.totalInstallments + ' parcelas pagas</span></div>' +
      '<dl class="kv">' +
      '<dt>Parcela</dt><dd>' + M(l.installmentAmount) + '</dd>' +
      '<dt>Faltam</dt><dd>' + U.plural(s.remaining, 'parcela', 'parcelas') + '</dd>' +
      '<dt>Próximo vencimento</dt><dd>' + (s.nextDueDate ? U.date(s.nextDueDate) + (s.nextDuePassed && !folha ? ' <span class="txt-warn">(passou — registre se já pagou)</span>' : '') : 'Quitado 🎉') + '</dd>' +
      '<dt>Soma estimada das parcelas restantes</dt><dd>' + M(s.remainingSumEstimate) + '<small class="muted block">Parcela × parcelas restantes. Não é o saldo devedor nem o valor para quitar antes.</small></dd>' +
      '<dt>Saldo devedor informado pelo banco</dt><dd>' + (l.bankBalance ? M(l.bankBalance) + (l.bankBalanceDate ? ' <small class="muted">(em ' + U.date(l.bankBalanceDate) + ')</small>' : '') : '<span class="muted">Não informado</span>') + '</dd>' +
      '<dt>Juros</dt><dd>' + (l.interestRate ? String(l.interestRate).replace('.', ',') + '% ao mês' : '<span class="txt-warn">Não informado — vale conferir no contrato</span>') + '</dd>' +
      (l.contractedAmount ? '<dt>Valor contratado</dt><dd>' + M(l.contractedAmount) + '</dd>' : '') +
      (inst ? '<dt>Parcela de ' + U.monthName(app.month) + '</dt><dd>' + inst.k + '/' + inst.of + ' · ' + U.date(inst.dueDate) + ' · ' + (inst.paid ? '<span class="st st-paga">Paga</span>' : folha ? '<span class="st st-folha">Desconto em folha</span>' : '<span class="st st-prevista">Prevista</span>') + '</dd>' : '') +
      '</dl>' +
      (l.notes ? '<p class="small muted">' + U.esc(l.notes) + '</p>' : '') +
      (warn ? '<p class="soft-warn small">' + warn + '</p>' : '') +
      (folha ? '<p class="muted tiny">Como é descontado em folha, esta parcela não conta como saída da conta — ela já sai do salário. Veja como em Lançamentos → Entradas.</p>' : '') +
      '<div class="btn-row wrap">' +
      (s.remaining > 0 ? '<button class="btn small" data-act="loanPaid" data-id="' + l.id + '">✓ Registrar parcela paga</button>' : '') +
      '<button class="btn small ghost" data-act="loanBalance" data-id="' + l.id + '">Atualizar saldo do banco</button>' +
      '<button class="btn small ghost" data-act="editLoan" data-id="' + l.id + '">Editar</button></div></article>';
  }

  function loansHTML(app) {
    const s = Calc.monthSummary(app.s, app.month, app.today());
    let h = '<div class="section-head"><h2>Empréstimos</h2><button class="btn small" data-act="addLoan">+ Empréstimo</button></div>';
    h += '<div class="totals three"><div><span>Total mensal comprometido</span><strong>' + M(s.loansTotal) + '</strong></div><div><span>Em folha</span><strong>' + M(s.loanPayrollTotal) + '</strong></div><div><span>Pago por você</span><strong>' + M(s.loanManualTotal) + '</strong></div></div>';
    if (!app.s.loans.length) return h + '<div class="empty">Nenhum empréstimo cadastrado.<br><button class="btn primary" data-act="addLoan">+ Cadastrar empréstimo</button></div>';
    return h + app.s.loans.map((l) => loanCard(app, l)).join('');
  }

  function situationHTML(app) {
    const today = app.today();
    const p = Calc.pendencies(app.s, today);
    const cur = app.curMonth();
    let h = '<p class="intro">Uma visão honesta e sem julgamentos do que está cadastrado. Use como apoio para organizar — as decisões são suas.</p>';

    // Pendências
    h += '<section class="card"><h3>Contas pendentes ou atrasadas</h3>';
    if (!p.late.length && !p.unconfirmed.length) h += '<p class="muted small">Nada pendente com vencimento passado. 🌿</p>';
    if (p.late.length) h += '<p class="lbl">Marcadas por você como atrasadas</p><ul class="list compact">' + p.late.map((x) => pendRow(app, x)).join('') + '</ul>';
    if (p.unconfirmed.length) h += '<p class="lbl">Vencimento passou, sem pagamento registrado <span class="muted tiny">(não necessariamente atrasadas — confira)</span></p><ul class="list compact">' + p.unconfirmed.map((x) => pendRow(app, x)).join('') + '</ul>';
    h += '</section>';

    // Faturas em aberto
    const open = [];
    app.s.cards.forEach((c) => Calc.cardMonths(app.s, c).filter((m) => m <= Calc.addMonths(cur, 1)).forEach((m) => { const inv = Calc.invoice(app.s, c, m, today); if (inv.remaining > 0) open.push(inv); }));
    h += '<section class="card"><h3>Faturas em aberto</h3>' + (open.length ? '<ul class="list compact">' + open.map((i) =>
      '<li class="row"><span class="row-main"><strong><i class="dot" style="background:' + i.card.color + '"></i>' + U.esc(i.card.name) + ' · ' + U.monthShort(i.month) + '</strong><small>vence ' + U.date(i.dueDate) + (i.paid ? ' · pago ' + M(i.paid) : '') + '</small></span><span class="row-end"><strong>' + M(i.remaining) + '</strong></span></li>').join('') + '</ul>' : '<p class="muted small">Nenhuma fatura em aberto até o próximo mês.</p>') + '</section>';

    // Compromissos mensais e projeção
    const proj = Calc.projection(app.s, cur, 6, today);
    h += '<section class="card"><h3>Saldo previsto nos próximos meses</h3>' + Charts.balance(proj) +
      '<table class="tbl"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>' +
      proj.map((r) => '<tr><td>' + U.monthShort(r.ym) + '</td><td>' + M(r.income) + '</td><td>' + M(r.out) + '</td><td class="' + (r.balance < 0 ? 'txt-neg' : 'txt-in') + '">' + M(r.balance) + '</td></tr>').join('') +
      '</tbody></table><p class="muted tiny">Considera somente o que está cadastrado: entradas e despesas mensais, parcelas de cartão já lançadas e parcelas de empréstimos. Gastos futuros não cadastrados não aparecem.</p></section>';

    // Ordem de atenção
    const att = Calc.attentionOrder(app.s, today);
    const groups = { 1: 'Vencidas ou atrasadas', 2: 'Despesas essenciais em aberto', 3: 'Dívidas com juros informados (maior primeiro)', 4: 'Vencendo nos próximos 10 dias' };
    h += '<section class="card"><h3>Ordem de atenção sugerida</h3><p class="info-box small">Isto é um <strong>apoio à organização</strong> baseado nos dados cadastrados, não uma regra. Sua realidade (multas, risco de corte de serviço, negociações) pode pedir outra ordem.</p>';
    if (!att.items.length) h += '<p class="muted small">Nada a destacar agora.</p>';
    [1, 2, 3, 4].forEach((g) => {
      const it = att.items.filter((x) => x.group === g); if (!it.length) return;
      h += '<p class="lbl">' + g + '. ' + groups[g] + '</p><ul class="list compact">' + it.map((x) => '<li class="row"><span class="row-main"><strong>' + U.esc(x.title) + '</strong><small>' + U.esc(x.reason) + (x.date ? ' · ' + U.date(x.date) : '') + '</small></span><span class="row-end"><strong>' + M(x.amount) + '</strong>' + (g === 3 ? '<small>por mês</small>' : '') + '</span></li>').join('') + '</ul>';
    });
    if (att.missingRate.length) h += '<p class="soft-warn small">Sem juros informados: ' + att.missingRate.map((l) => U.esc(l.name)).join(', ') + '. Confira no contrato ou app do banco para comparar melhor.</p>';
    h += '</section>';

    // Plano
    h += '<section class="card"><div class="section-head"><h3>Meu plano</h3><button class="btn small" data-act="addPlan">+ Item</button></div>' +
      '<p class="muted small">Defina sua prioridade, quanto pretende destinar por mês e anote ideias de negociação.</p>';
    if (!app.s.plan.length) h += '<p class="muted small">Nenhum item no plano ainda.</p>';
    else h += app.s.plan.map((x) => '<div class="plan-item" data-act="editPlan" data-id="' + x.id + '" role="button" tabindex="0"><div><strong>' + U.esc(x.title) + '</strong><span class="st st-' + x.status + '">' + PSTATUS[x.status] + '</span></div>' +
      (x.monthly ? '<small>Pretendo destinar ' + M(x.monthly) + ' por mês</small>' : '') + (x.notes ? '<p class="small">' + U.esc(x.notes) + '</p>' : '') + '</div>').join('');
    h += '<p class="muted tiny">A ferramenta não promete datas de quitação: elas dependem de juros, saldo real e condições que só a instituição informa.</p></section>';
    return h;
  }

  function pendRow(app, x) {
    let act = '';
    if (x.kind === 'conta') act = '<button class="btn small" data-act="pendPay" data-id="' + x.occ.item.id + '" data-ym="' + x.occ.ym + '">Marcar paga</button>';
    if (x.kind === 'emprestimo') act = '<button class="btn small" data-act="loanPaid" data-id="' + x.inst.loan.id + '">Registrar paga</button>';
    if (x.kind === 'fatura') act = '<a class="btn small" href="#cartoes/' + x.inv.card.id + '" data-act="goInvoice" data-month="' + x.inv.month + '" data-id="' + x.inv.card.id + '">Ver fatura</a>';
    return '<li class="row"><span class="row-main"><strong>' + U.esc(x.title) + '</strong><small>' + (x.date ? 'venceu ' + U.date(x.date) : '') + '</small></span><span class="row-end"><strong>' + M(x.amount) + '</strong></span>' + act + '</li>';
  }

  App.views.dividas = function () {
    const t = this.ui.debtTab;
    return '<div class="seg" role="tablist">' +
      '<button role="tab" class="' + (t === 'emprestimos' ? 'on' : '') + '" data-act="tab" data-key="debtTab" data-val="emprestimos">Empréstimos</button>' +
      '<button role="tab" class="' + (t === 'plano' ? 'on' : '') + '" data-act="tab" data-key="debtTab" data-val="plano">Situação e plano</button></div>' +
      (t === 'emprestimos' ? loansHTML(this) : situationHTML(this));
  };

  function loanForm(app, l) {
    F.open({
      title: l ? 'Editar empréstimo' : 'Novo empréstimo', submit: l ? 'Salvar' : 'Cadastrar',
      values: l ? Object.assign({}, l, { interestRate: l.interestRate ? String(l.interestRate).replace('.', ',') : '' }) : { type: 'consignado_clt', paymentMethod: 'folha', paidInstallments: 0 },
      fields: [
        { name: 'name', label: 'Nome', required: true, placeholder: 'Ex.: Consignado da empresa' },
        { name: 'institution', label: 'Instituição' },
        { name: 'type', label: 'Tipo', type: 'select', options: Object.keys(TYPES).map((k) => ({ value: k, label: TYPES[k] })) },
        { name: 'paymentMethod', label: 'Forma de pagamento', type: 'chips', required: true, options: [{ value: 'folha', label: 'Desconto em folha' }, { value: 'manual', label: 'Pagamento manual' }] },
        { name: 'folhaInfo', type: 'html', showIf: (v) => v.paymentMethod === 'folha', html: '<p class="info-box small">Parcelas descontadas em folha <strong>não</strong> são contadas como saída da conta. Se você informa o salário líquido, elas já estão descontadas dele. Se informa valor de referência, a ferramenta desconta a parcela automaticamente — uma única vez.</p>' },
        { name: 'installmentAmount', label: 'Valor da parcela', type: 'money', required: true, validate: (x) => (x > 0 ? null : 'Informe o valor da parcela.') },
        { name: 'totalInstallments', label: 'Quantidade total de parcelas', type: 'number', min: 1, required: true, validate: (n) => (n >= 1 && n <= 480 ? null : 'Informe a quantidade de parcelas.') },
        { name: 'paidInstallments', label: 'Parcelas já pagas', type: 'number', min: 0, validate: (n, v) => (n === null || (n >= 0 && n <= v.totalInstallments) ? null : 'Não pode ser maior que o total.') },
        { name: 'firstDueDate', label: 'Vencimento da 1ª parcela', type: 'date', required: true, hint: 'As demais vencem no mesmo dia dos meses seguintes.' },
        { group: 'Informações opcionais', open: !!l, fields: [
          { name: 'contractDate', label: 'Data de contratação', type: 'date' },
          { name: 'contractedAmount', label: 'Valor contratado', type: 'money' },
          { name: 'interestRate', label: 'Taxa de juros (% ao mês)', inputmode: 'decimal', maxlength: 8, placeholder: 'Ex.: 2,5',
            validate: (x) => (!x || /^\d{1,3}([.,]\d{1,4})?$/.test(x) ? null : 'Use só números, ex.: 2,5') },
          { name: 'bankBalance', label: 'Saldo devedor informado pela instituição', type: 'money' },
          { name: 'bankBalanceDate', label: 'Data desse saldo', type: 'date' },
          { name: 'notes', label: 'Observações', type: 'textarea' }
        ] }
      ],
      onMount: (form, api) => {
        if (!l) return;
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger ghost'; del.textContent = 'Excluir';
        form.querySelector('.btn-row').prepend(del);
        del.onclick = async () => {
          if (!(await F.confirm({ title: 'Excluir empréstimo?', message: '“' + l.name + '” será removido.', ok: 'Excluir', danger: true }))) return;
          app.s.loans = app.s.loans.filter((x) => x !== l); api.close(); app.save();
        };
      },
      onSubmit: (v) => {
        const obj = l || { id: 'emp_' + U.uid() };
        Object.assign(obj, v, { paidInstallments: v.paidInstallments || 0, interestRate: v.interestRate ? parseFloat(String(v.interestRate).replace(',', '.')) : null });
        delete obj.folhaInfo;
        if (!l) app.s.loans.push(obj);
        app.save(); app.toast(l ? 'Empréstimo atualizado.' : 'Empréstimo cadastrado.');
      }
    });
  }

  function planForm(app, x) {
    const refs = [{ value: '', label: 'Outro objetivo' }]
      .concat(app.s.loans.map((l) => ({ value: 'loan:' + l.id, label: '🏦 ' + l.name })))
      .concat(app.s.cards.map((c) => ({ value: 'card:' + c.id, label: '💳 ' + c.name })));
    const val = x ? Object.assign({}, x, { ref: x.refType ? x.refType + ':' + x.refId : '' }) : { status: 'planejado', ref: '' };
    F.open({
      title: x ? 'Editar item do plano' : 'Novo item do plano', values: val, submit: 'Salvar',
      fields: [
        { name: 'ref', label: 'Dívida ou objetivo relacionado', type: 'select', options: refs },
        { name: 'title', label: 'Título', required: true, placeholder: 'Ex.: Quitar fatura do cartão' },
        { name: 'monthly', label: 'Quanto pretendo destinar por mês', type: 'money' },
        { name: 'notes', label: 'Observações sobre negociação', type: 'textarea', rows: 3, placeholder: 'Ex.: ligar para pedir proposta de desconto à vista; perguntar sobre portabilidade' },
        { name: 'status', label: 'Situação', type: 'chips', options: Object.keys(PSTATUS).map((k) => ({ value: k, label: PSTATUS[k] })) }
      ],
      onChange: (v, form) => {
        const t = form.elements.title;
        if (!t.value && v.ref) { const o = refs.find((r) => r.value === v.ref); if (o) t.value = o.label.replace(/^\S+\s/, ''); }
      },
      onMount: (form, api) => {
        if (!x) return;
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger ghost'; del.textContent = 'Excluir';
        form.querySelector('.btn-row').prepend(del);
        del.onclick = () => { app.s.plan = app.s.plan.filter((y) => y !== x); api.close(); app.save(); };
      },
      onSubmit: (v) => {
        const obj = x || { id: 'plano_' + U.uid() };
        const [refType, refId] = v.ref ? v.ref.split(':') : [null, null];
        Object.assign(obj, { title: v.title, refType, refId, monthly: v.monthly || 0, notes: v.notes, status: v.status || 'planejado' });
        if (!x) app.s.plan.push(obj);
        app.save();
      }
    });
  }

  Object.assign(App.actions, {
    addLoan() { loanForm(this); },
    editLoan(el) { loanForm(this, this.loan(el.dataset.id)); },
    async loanPaid(el) {
      const l = this.loan(el.dataset.id); if (!l) return;
      const s = Calc.loanSummary(l, this.today());
      if (!(await F.confirm({ title: 'Registrar parcela paga', message: 'Registrar a parcela ' + s.next + ' de ' + l.totalInstallments + ' (' + M(l.installmentAmount) + ', vencimento ' + U.date(s.nextDueDate) + ') como paga?', ok: 'Registrar' }))) return;
      l.paidInstallments = (l.paidInstallments || 0) + 1; this.save(); this.toast('Parcela registrada.');
    },
    loanBalance(el) {
      const l = this.loan(el.dataset.id);
      F.open({
        title: 'Saldo informado pelo banco', submit: 'Salvar',
        intro: '<p class="small muted">Copie o saldo devedor que aparece no app ou extrato da instituição. A ferramenta não calcula juros nem descontos de quitação.</p>',
        values: { bankBalance: l.bankBalance, bankBalanceDate: this.today() },
        fields: [{ name: 'bankBalance', label: 'Saldo devedor', type: 'money', required: true }, { name: 'bankBalanceDate', label: 'Data da consulta', type: 'date', required: true }],
        onSubmit: (v) => { l.bankBalance = v.bankBalance; l.bankBalanceDate = v.bankBalanceDate; this.save(); this.toast('Saldo atualizado.'); }
      });
    },
    pendPay(el) {
      const e = this.s.expenses.find((x) => x.id === el.dataset.id); if (!e) return;
      this.setExpenseStatus(e, el.dataset.ym, 'paga'); this.save(); this.toast('Marcada como paga.');
    },
    goInvoice(el) { this.month = el.dataset.month; this.go('#cartoes/' + el.dataset.id); this.render(); },
    addPlan() { planForm(this); },
    editPlan(el) { planForm(this, this.s.plan.find((x) => x.id === el.dataset.id)); }
  });
})();
