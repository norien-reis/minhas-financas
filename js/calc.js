/*
 * calc.js — regras de cálculo financeiro (sem dependência de interface).
 * Todos os valores monetários são inteiros em CENTAVOS para evitar erros de arredondamento.
 * Meses são strings 'AAAA-MM'; datas são strings ISO 'AAAA-MM-DD'.
 * Funciona no navegador (window.Calc) e no Node (require) para os testes.
 */
(function (root, factory) {
  const m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.Calc = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- Datas e meses ---------------- */
  const pad = (n) => String(n).padStart(2, '0');
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function ymOf(iso) { return iso ? iso.slice(0, 7) : null; }
  function dayOf(iso) { return iso ? parseInt(iso.slice(8, 10), 10) : null; }
  function parseYM(ym) { return [parseInt(ym.slice(0, 4), 10), parseInt(ym.slice(5, 7), 10)]; }
  function addMonths(ym, n) {
    const [y, m] = parseYM(ym);
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
  }
  function monthDiff(a, b) { // quantos meses de a até b
    const [ya, ma] = parseYM(a); const [yb, mb] = parseYM(b);
    return (yb - ya) * 12 + (mb - ma);
  }
  function daysInMonth(ym) { const [y, m] = parseYM(ym); return new Date(y, m, 0).getDate(); }
  function dateInMonth(ym, day) { return ym + '-' + pad(Math.min(day, daysInMonth(ym))); }
  function daysBetween(aISO, bISO) { // b - a em dias
    const a = Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10));
    const b = Date.UTC(+bISO.slice(0, 4), +bISO.slice(5, 7) - 1, +bISO.slice(8, 10));
    return Math.round((b - a) / 86400000);
  }

  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);

  /* ---------------- Parcelamento ---------------- */
  // Divide o total em n parcelas em centavos; a diferença de arredondamento fica na 1ª parcela.
  function splitInstallments(totalCents, n) {
    n = Math.max(1, parseInt(n, 10) || 1);
    const base = Math.floor(totalCents / n);
    const rest = totalCents - base * n;
    const out = new Array(n).fill(base);
    out[0] += rest;
    return out;
  }

  /* ---------------- Cartão de crédito ---------------- */
  // Data de fechamento da fatura que vence no mês `dueYM`.
  function closingDateFor(dueYM, closingDay, dueDay) {
    const closingYM = dueDay > closingDay ? dueYM : addMonths(dueYM, -1);
    return dateInMonth(closingYM, closingDay);
  }
  function dueDateFor(dueYM, dueDay) { return dateInMonth(dueYM, dueDay); }

  // Mês (de vencimento) da fatura em que cai uma compra.
  // Regra usada: compras feitas NO dia do fechamento ou depois vão para a fatura seguinte.
  // O usuário pode corrigir manualmente (firstInvoiceMonth), pois as regras variam entre bancos.
  function invoiceMonthFor(purchaseISO, closingDay, dueDay) {
    let ym = addMonths(ymOf(purchaseISO), -1);
    for (let i = 0; i < 4; i++) {
      if (purchaseISO < closingDateFor(ym, closingDay, dueDay)) return ym;
      ym = addMonths(ym, 1);
    }
    return ym;
  }

  function purchaseFirstInvoice(p, card) {
    return p.firstInvoiceMonth || invoiceMonthFor(p.date, card.closingDay, card.dueDay);
  }

  // Lista de parcelas de uma compra: [{month, n, of, amount}]
  function purchaseSchedule(p, card) {
    const first = purchaseFirstInvoice(p, card);
    return splitInstallments(p.amount, p.installments).map((amount, i) => ({
      month: addMonths(first, i), n: i + 1, of: p.installments || 1, amount
    }));
  }

  function invoice(state, card, ym, today) {
    today = today || todayISO();
    const items = [];
    state.cardPurchases.filter((p) => p.cardId === card.id).forEach((p) => {
      purchaseSchedule(p, card).forEach((s) => {
        if (s.month === ym) items.push({ purchase: p, n: s.n, of: s.of, amount: s.amount });
      });
    });
    const payments = state.invoicePayments.filter((x) => x.cardId === card.id && x.month === ym);
    const total = sum(items, (i) => i.amount);
    const paid = sum(payments, (x) => x.amount);
    const remaining = Math.max(0, total - paid);
    const dueDate = dueDateFor(ym, card.dueDay);
    const closingDate = closingDateFor(ym, card.closingDay, card.dueDay);
    let status;
    if (total === 0 && paid === 0) status = 'vazia';
    else if (remaining === 0) status = 'paga';
    else if (paid > 0) status = 'parcial';
    else status = 'aberta';
    // "fechada" é só informativo: a data de fechamento já passou.
    const closed = today >= closingDate;
    const dueSoonDays = daysBetween(today, dueDate);
    return { card, month: ym, items, payments, total, paid, remaining, dueDate, closingDate, status, closed, daysToDue: dueSoonDays };
  }

  // Meses que têm parcelas ou pagamentos para o cartão
  function cardMonths(state, card) {
    const set = new Set();
    state.cardPurchases.filter((p) => p.cardId === card.id).forEach((p) => purchaseSchedule(p, card).forEach((s) => set.add(s.month)));
    state.invoicePayments.filter((x) => x.cardId === card.id).forEach((x) => set.add(x.month));
    return Array.from(set).sort();
  }

  // Limite disponível ESTIMADO: limite − (tudo que ainda não foi pago em faturas, inclusive parcelas futuras).
  function estimatedAvailableLimit(state, card) {
    if (!card.limit) return null;
    const used = sum(cardMonths(state, card), (ym) => invoice(state, card, ym).remaining);
    return { limit: card.limit, used, available: card.limit - used };
  }

  // Parcelas futuras (faturas depois de `fromYM`)
  function futureInvoices(state, card, fromYM) {
    return cardMonths(state, card).filter((ym) => ym > fromYM).map((ym) => invoice(state, card, ym)).filter((i) => i.total > 0);
  }

  /* ---------------- Empréstimos ---------------- */
  function loanInstallment(loan, ym) {
    const firstYM = ymOf(loan.firstDueDate);
    const k = monthDiff(firstYM, ym) + 1;
    if (k < 1 || k > loan.totalInstallments) return null;
    return {
      loan, k, of: loan.totalInstallments, amount: loan.installmentAmount,
      dueDate: dateInMonth(ym, dayOf(loan.firstDueDate)),
      paid: k <= (loan.paidInstallments || 0),
      payroll: loan.paymentMethod === 'folha'
    };
  }

  function loanSummary(loan, today) {
    today = today || todayISO();
    const paid = Math.min(loan.paidInstallments || 0, loan.totalInstallments);
    const remaining = loan.totalInstallments - paid;
    const next = remaining > 0 ? paid + 1 : null;
    const nextDueDate = next ? dateInMonth(addMonths(ymOf(loan.firstDueDate), next - 1), dayOf(loan.firstDueDate)) : null;
    const lastDueDate = dateInMonth(addMonths(ymOf(loan.firstDueDate), loan.totalInstallments - 1), dayOf(loan.firstDueDate));
    return {
      paid, remaining,
      // ATENÇÃO: soma simples das parcelas restantes — não é saldo devedor nem valor de quitação.
      remainingSumEstimate: remaining * loan.installmentAmount,
      next, nextDueDate, lastDueDate,
      nextDuePassed: nextDueDate ? nextDueDate < today : false,
      progress: loan.totalInstallments ? paid / loan.totalInstallments : 0
    };
  }

  /* ---------------- Ocorrências mensais (itens recorrentes) ---------------- */
  // Despesas e entradas podem ser recorrentes (repetem todo mês a partir da data original).
  // A situação de cada mês fica em item.byMonth[ym] = { status | received, date }.
  function expenseOccurrence(e, ym) {
    const baseDate = e.dueDate || e.date;
    const baseYM = ymOf(baseDate);
    if (!e.recurring) {
      if (baseYM !== ym) return null;
      return { item: e, ym, date: e.date, dueDate: e.dueDate || null, status: e.status || 'prevista', amount: e.amount };
    }
    if (ym < baseYM || (e.endMonth && ym > e.endMonth)) return null;
    const st = (e.byMonth && e.byMonth[ym]) || {};
    const shift = (iso) => (iso ? dateInMonth(ym, dayOf(iso)) : null);
    const dueDate = shift(e.dueDate);
    const date = shift(e.date || e.dueDate);
    const status = st.status || (ym === baseYM ? e.status : 'prevista') || 'prevista';
    return { item: e, ym, date, dueDate, status, amount: e.amount };
  }

  function incomeOccurrence(inc, ym) {
    const baseYM = ymOf(inc.expectedDate);
    if (!inc.recurring) {
      if (baseYM !== ym) return null;
      return { item: inc, ym, date: inc.expectedDate, received: !!inc.received };
    }
    if (ym < baseYM || (inc.endMonth && ym > inc.endMonth)) return null;
    const st = (inc.byMonth && inc.byMonth[ym]) || {};
    const received = st.received !== undefined ? st.received : (ym === baseYM ? !!inc.received : false);
    return { item: inc, ym, date: dateInMonth(ym, dayOf(inc.expectedDate)), received };
  }

  // Valor líquido de uma entrada no mês.
  // modo 'liquido': o valor informado já é o que cai na conta (consignado em folha já foi descontado).
  // modo 'referencia': valor de referência − descontos informados − consignados em folha do mês.
  function incomeNet(inc, payrollLoans) {
    if (inc.mode !== 'referencia') {
      return { mode: 'liquido', gross: inc.amount, deductions: [], payroll: [], net: inc.amount,
        payrollIncluded: inc.type === 'salario' ? (payrollLoans || []) : [] };
    }
    const deductions = inc.deductions || [];
    const payroll = payrollLoans || [];
    const net = inc.amount - sum(deductions, (d) => d.amount) - sum(payroll, (p) => p.amount);
    return { mode: 'referencia', gross: inc.amount, deductions, payroll, net, payrollIncluded: [] };
  }

  /* ---------------- Resumo do mês ---------------- */
  function monthSummary(state, ym, today) {
    today = today || todayISO();
    const loanInst = state.loans.map((l) => loanInstallment(l, ym)).filter(Boolean);
    const payrollInst = loanInst.filter((x) => x.payroll);
    const manualInst = loanInst.filter((x) => !x.payroll);

    // Consignados em folha são aplicados a UM salário do mês (o primeiro cadastrado).
    const incOcc = state.incomes.map((i) => incomeOccurrence(i, ym)).filter(Boolean)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const salaryOcc = incOcc.find((o) => o.item.type === 'salario');
    const incomes = incOcc.map((o) => {
      const calc = incomeNet(o.item, o === salaryOcc ? payrollInst : []);
      return Object.assign({}, o, { calc, net: calc.net });
    });
    const incomeExpected = sum(incomes, (i) => i.net);
    const incomeReceived = sum(incomes.filter((i) => i.received), (i) => i.net);

    const expenses = state.expenses.map((e) => expenseOccurrence(e, ym)).filter(Boolean);
    const invoices = state.cards.map((c) => invoice(state, c, ym, today));

    const expExpected = sum(expenses, (e) => e.amount);
    const expPaid = sum(expenses.filter((e) => e.status === 'paga'), (e) => e.amount);
    const invTotal = sum(invoices, (i) => i.total);
    const invPaid = sum(invoices, (i) => Math.min(i.paid, i.total));
    const loanManualTotal = sum(manualInst, (x) => x.amount);
    const loanManualPaid = sum(manualInst.filter((x) => x.paid), (x) => x.amount);
    const loanPayrollTotal = sum(payrollInst, (x) => x.amount);

    // SAÍDAS de dinheiro da conta: despesas diretas + faturas (valor total) + empréstimos pagos manualmente.
    // Compras no cartão NÃO entram separadamente (já estão na fatura). Consignado em folha já sai do salário.
    const outExpected = expExpected + invTotal + loanManualTotal;
    const outPaid = expPaid + invPaid + loanManualPaid;

    // Gastos por categoria (competência): despesas diretas + parcelas de cartão que caem na fatura do mês
    // + empréstimos pagos manualmente (categoria "emprestimos").
    const byCategory = {};
    const addCat = (id, v) => { id = id || 'outros'; byCategory[id] = (byCategory[id] || 0) + v; };
    expenses.forEach((e) => addCat(e.item.categoryId, e.amount));
    invoices.forEach((inv) => inv.items.forEach((it) => addCat(it.purchase.categoryId, it.amount)));
    manualInst.forEach((x) => addCat('emprestimos', x.amount));

    const budgets = state.budgets || {};
    const budgetRows = Object.keys(budgets).filter((k) => budgets[k] > 0).map((k) => ({
      categoryId: k, budget: budgets[k], spent: byCategory[k] || 0
    }));
    const budgetTotal = sum(budgetRows, (r) => r.budget);
    const budgetSpent = sum(budgetRows, (r) => r.spent);

    const hasData = incomes.length + expenses.length + invTotal + loanInst.length > 0;

    return {
      ym, hasData, incomes, expenses, invoices, loanInst, payrollInst, manualInst,
      incomeExpected, incomeReceived,
      outExpected, outPaid, outRemaining: outExpected - outPaid,
      expExpected, expPaid, invTotal, invPaid, loanManualTotal, loanManualPaid, loanPayrollTotal,
      loansTotal: loanManualTotal + loanPayrollTotal,
      forecastBalance: incomeExpected - outExpected,
      currentBalance: incomeReceived - outPaid,
      byCategory, budgetRows, budgetTotal, budgetSpent,
      overBudget: budgetRows.filter((r) => r.spent > r.budget),
      payrollWithoutSalary: payrollInst.length > 0 && !salaryOcc
    };
  }

  /* ---------------- Alertas e pendências ---------------- */
  function alerts(state, ym, today, opts) {
    today = today || todayISO();
    const soon = (opts && opts.soonDays) || 5;
    const out = [];
    const cur = ymOf(today);
    const months = [cur, addMonths(cur, 1)];
    const within = (d) => { const n = daysBetween(today, d); return n >= 0 && n <= soon; };

    months.forEach((m) => {
      state.expenses.map((e) => expenseOccurrence(e, m)).filter(Boolean).forEach((o) => {
        if (o.status === 'paga' || !o.dueDate) return;
        if (o.status === 'atrasada') return; // tratado em pendências
        if (within(o.dueDate)) out.push({ kind: 'conta', level: 'atencao', date: o.dueDate, amount: o.amount, title: o.item.description, ref: o });
      });
      state.cards.forEach((c) => {
        const inv = invoice(state, c, m, today);
        if (inv.remaining > 0 && within(inv.dueDate)) out.push({ kind: 'fatura', level: 'atencao', date: inv.dueDate, amount: inv.remaining, title: 'Fatura ' + c.name, ref: inv });
      });
      state.loans.forEach((l) => {
        const x = loanInstallment(l, m);
        if (x && !x.paid && !x.payroll && within(x.dueDate)) out.push({ kind: 'emprestimo', level: 'atencao', date: x.dueDate, amount: x.amount, title: 'Parcela ' + x.k + '/' + x.of + ' · ' + l.name, ref: x });
      });
    });
    const s = monthSummary(state, ym, today);
    if (s.forecastBalance < 0) out.unshift({ kind: 'saldo', level: 'alerta', amount: s.forecastBalance, title: 'Saldo previsto negativo' });
    s.overBudget.forEach((r) => out.push({ kind: 'orcamento', level: 'atencao', amount: r.spent - r.budget, title: 'Acima do orçamento', categoryId: r.categoryId }));
    return out.sort((a, b) => (a.date || '') < (b.date || '') ? -1 : 1);
  }

  // Pendências: atrasadas (informadas pelo usuário) e vencimentos que passaram sem pagamento registrado.
  // Itens do segundo grupo NÃO são chamados de atrasados — só pedem confirmação.
  function pendencies(state, today) {
    today = today || todayISO();
    const cur = ymOf(today);
    const late = []; const unconfirmed = [];
    const first = earliestMonth(state) || cur;
    for (let m = first; m <= cur; m = addMonths(m, 1)) {
      state.expenses.map((e) => expenseOccurrence(e, m)).filter(Boolean).forEach((o) => {
        if (o.status === 'atrasada') late.push({ kind: 'conta', occ: o, amount: o.amount, date: o.dueDate || o.date, title: o.item.description });
        else if (o.status === 'prevista' && o.dueDate && o.dueDate < today) unconfirmed.push({ kind: 'conta', occ: o, amount: o.amount, date: o.dueDate, title: o.item.description });
      });
      state.cards.forEach((c) => {
        const inv = invoice(state, c, m, today);
        if (inv.remaining > 0 && inv.dueDate < today) unconfirmed.push({ kind: 'fatura', inv, amount: inv.remaining, date: inv.dueDate, title: 'Fatura ' + c.name });
      });
      state.loans.forEach((l) => {
        const x = loanInstallment(l, m);
        if (x && !x.paid && !x.payroll && x.dueDate < today) unconfirmed.push({ kind: 'emprestimo', inst: x, amount: x.amount, date: x.dueDate, title: 'Parcela ' + x.k + '/' + x.of + ' · ' + l.name });
      });
    }
    return { late, unconfirmed };
  }

  function earliestMonth(state) {
    const ms = [];
    state.expenses.forEach((e) => ms.push(ymOf(e.dueDate || e.date)));
    state.incomes.forEach((i) => ms.push(ymOf(i.expectedDate)));
    state.loans.forEach((l) => ms.push(ymOf(l.firstDueDate)));
    state.cards.forEach((c) => { const cm = cardMonths(state, c); if (cm.length) ms.push(cm[0]); });
    return ms.filter(Boolean).sort()[0] || null;
  }

  // Ordem de atenção SUGERIDA (apoio à organização, não decisão automática).
  function attentionOrder(state, today) {
    today = today || todayISO();
    const cats = {}; state.categories.forEach((c) => { cats[c.id] = c; });
    const p = pendencies(state, today);
    const out = [];
    p.late.forEach((x) => out.push(Object.assign({ group: 1, reason: 'Marcada por você como atrasada' }, x)));
    p.unconfirmed.forEach((x) => out.push(Object.assign({ group: 1, reason: x.inv && x.inv.paid > 0 ? 'Vencimento passou e falta registrar parte do pagamento — confira' : 'Vencimento passou e não há pagamento registrado — confira' }, x)));
    const cur = ymOf(today);
    [cur, addMonths(cur, 1)].forEach((m) => {
      state.expenses.map((e) => expenseOccurrence(e, m)).filter(Boolean).forEach((o) => {
        if (o.status !== 'prevista') return;
        if (o.dueDate && o.dueDate < today) return; // já listada
        const c = cats[o.item.categoryId];
        if (c && c.essential) out.push({ group: 2, kind: 'conta', occ: o, amount: o.amount, date: o.dueDate || o.date, title: o.item.description, reason: 'Despesa essencial (' + c.name + ')' });
      });
    });
    const withRate = state.loans.filter((l) => loanSummary(l, today).remaining > 0 && l.interestRate > 0)
      .sort((a, b) => b.interestRate - a.interestRate);
    withRate.forEach((l) => out.push({ group: 3, kind: 'emprestimo', loan: l, title: l.name, amount: l.installmentAmount, reason: 'Juros informados: ' + String(l.interestRate).replace('.', ',') + '% a.m.' }));
    const missingRate = state.loans.filter((l) => loanSummary(l, today).remaining > 0 && !(l.interestRate > 0));
    const due = [];
    [cur, addMonths(cur, 1)].forEach((m) => {
      state.cards.forEach((c) => { const inv = invoice(state, c, m, today); if (inv.remaining > 0 && inv.dueDate >= today && daysBetween(today, inv.dueDate) <= 10) due.push({ group: 4, kind: 'fatura', inv, amount: inv.remaining, date: inv.dueDate, title: 'Fatura ' + c.name, reason: 'Vence em ' + daysBetween(today, inv.dueDate) + ' dia(s)' }); });
      state.loans.forEach((l) => { const x = loanInstallment(l, m); if (x && !x.paid && !x.payroll && x.dueDate >= today && daysBetween(today, x.dueDate) <= 10) due.push({ group: 4, kind: 'emprestimo', inst: x, amount: x.amount, date: x.dueDate, title: 'Parcela ' + x.k + '/' + x.of + ' · ' + l.name, reason: 'Vence em ' + daysBetween(today, x.dueDate) + ' dia(s)' }); });
    });
    due.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((x) => out.push(x));
    return { items: out, missingRate };
  }

  /* ---------------- Projeção ---------------- */
  function projection(state, fromYM, months, today) {
    const out = [];
    for (let i = 0; i < months; i++) {
      const ym = addMonths(fromYM, i);
      const s = monthSummary(state, ym, today);
      out.push({ ym, income: s.incomeExpected, out: s.outExpected, balance: s.forecastBalance, loans: s.loansTotal, cards: s.invTotal, hasData: s.hasData });
    }
    return out;
  }

  /* ---------------- Metas ---------------- */
  function goalProgress(g) {
    const pct = g.target > 0 ? Math.min(1, g.saved / g.target) : 0;
    const missing = Math.max(0, g.target - g.saved);
    // Estimativa SE o valor mensal for mantido — não é promessa.
    const monthsAtPace = g.monthly > 0 && missing > 0 ? Math.ceil(missing / g.monthly) : null;
    let neededPerMonth = null;
    if (g.targetDate && missing > 0) {
      const m = monthDiff(ymOf(todayISO()), ymOf(g.targetDate));
      neededPerMonth = m > 0 ? Math.ceil(missing / m) : missing;
    }
    return { pct, missing, monthsAtPace, neededPerMonth, done: missing === 0 && g.target > 0 };
  }

  /* ---------------- Duplicidade ---------------- */
  function normText(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  }
  function similarText(a, b) {
    const A = normText(a); const B = normText(b);
    if (!A.length || !B.length) return true; // sem descrição: considera só data/valor
    return A.some((w) => B.includes(w));
  }
  function findDuplicates(state, entry, ignoreId) {
    const cand = [];
    const check = (x, kind) => {
      if (x.id === ignoreId) return;
      if (Math.abs(x.amount - entry.amount) > Math.max(1, entry.amount * 0.01)) return;
      if (Math.abs(daysBetween(x.date, entry.date)) > 2) return;
      if (!similarText(x.description, entry.description)) return;
      cand.push({ kind, item: x });
    };
    state.expenses.forEach((e) => e.date && check(e, 'despesa'));
    state.cardPurchases.forEach((p) => check(p, 'cartao'));
    return cand;
  }

  return {
    todayISO, ymOf, dayOf, addMonths, monthDiff, daysInMonth, dateInMonth, daysBetween, sum,
    splitInstallments, closingDateFor, dueDateFor, invoiceMonthFor, purchaseFirstInvoice, purchaseSchedule,
    invoice, cardMonths, estimatedAvailableLimit, futureInvoices,
    loanInstallment, loanSummary,
    expenseOccurrence, incomeOccurrence, incomeNet, monthSummary,
    alerts, pendencies, attentionOrder, projection, goalProgress, findDuplicates, earliestMonth
  };
});
