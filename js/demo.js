/*
 * demo.js — dados FICTÍCIOS de demonstração, gerados em relação ao mês atual.
 * Cenário: o mês atual fecha no vermelho (despesas maiores que a renda).
 */
(function () {
  'use strict';
  function build(today) {
    const C = window.Calc;
    today = today || C.todayISO();
    const cur = C.ymOf(today);
    const m = (n) => C.addMonths(cur, n);
    const d = (ym, day) => C.dateInMonth(ym, day);
    const day = C.dayOf(today);
    const id = (p) => p + '_' + U.uid();
    const s = Store.empty();
    s.isDemo = true;

    /* Empréstimos */
    const consig = {
      id: id('emp'), name: 'Consignado CLT (exemplo)', institution: 'Banco Exemplo', type: 'consignado_clt',
      contractedAmount: 600000, installmentAmount: 35000, totalInstallments: 24, paidInstallments: 9,
      firstDueDate: d(m(-8), 5), interestRate: 2.1, paymentMethod: 'folha',
      bankBalance: 520000, bankBalanceDate: d(m(-1), 28), notes: 'Dados fictícios de demonstração.'
    };
    const pessoal = {
      id: id('emp'), name: 'Empréstimo pessoal (exemplo)', institution: 'Financeira Exemplo', type: 'pessoal',
      contractedAmount: 250000, installmentAmount: 29000, totalInstallments: 12, paidInstallments: 3,
      firstDueDate: d(m(-3), 15), interestRate: 4.9, paymentMethod: 'manual',
      bankBalance: null, bankBalanceDate: null, notes: ''
    };
    s.loans.push(consig, pessoal);

    /* Entradas */
    s.incomes.push({
      id: id('ent'), description: 'Salário (exemplo)', type: 'salario', mode: 'referencia', amount: 380000,
      deductions: [{ id: id('desc'), name: 'INSS e IRRF (valor copiado do holerite)', amount: 42000 }],
      expectedDate: d(m(-2), 5), recurring: true, received: true,
      byMonth: { [m(-2)]: { received: true }, [m(-1)]: { received: true }, [cur]: { received: day >= 5 } }, notes: ''
    });
    s.incomes.push({ id: id('ent'), description: 'Renda extra — freela (exemplo)', type: 'extra', mode: 'liquido', amount: 25000, deductions: [], expectedDate: d(cur, 20), recurring: false, received: false, notes: '' });
    s.incomes.push({ id: id('ent'), description: 'Reembolso de despesa (exemplo)', type: 'reembolso', mode: 'liquido', amount: 8000, deductions: [], expectedDate: d(m(-1), 12), recurring: false, received: true, notes: '' });

    /* Despesas recorrentes (começam 2 meses atrás) */
    const rec = (description, amount, dueDay, categoryId, paymentMethod, curStatus) => ({
      id: id('desp'), description, amount, date: d(m(-2), dueDay), dueDate: d(m(-2), dueDay), categoryId, paymentMethod,
      status: 'paga', recurring: true,
      byMonth: { [m(-2)]: { status: 'paga' }, [m(-1)]: { status: 'paga' }, [cur]: { status: curStatus } }, notes: ''
    });
    s.expenses.push(rec('Aluguel', 130000, 10, 'moradia', 'pix', 'paga'));
    s.expenses.push(rec('Conta de luz', 18500, 12, 'moradia', 'boleto', day > 12 ? 'paga' : 'prevista'));
    s.expenses.push(rec('Internet', 11000, 25, 'moradia', 'debito', 'prevista'));
    s.expenses.push(rec('Academia', 9000, 5, 'lazer', 'pix', 'paga'));

    /* Despesas avulsas */
    const one = (description, amount, date, dueDate, categoryId, paymentMethod, status, notes) => ({
      id: id('desp'), description, amount, date, dueDate: dueDate || null, categoryId, paymentMethod, status, recurring: false, notes: notes || ''
    });
    s.expenses.push(one('Mercado do mês', 52000, d(cur, 3), null, 'alimentacao', 'pix', 'paga'));
    s.expenses.push(one('Farmácia', 9500, d(cur, 6), null, 'saude', 'debito', 'paga'));
    s.expenses.push(one('Recarga do transporte', 18000, d(cur, 2), null, 'transporte', 'pix', 'paga'));
    s.expenses.push(one('Conta de água', 9500, d(cur, 1), d(cur, Math.min(28, day + 3)), 'moradia', 'boleto', 'prevista'));
    s.expenses.push(one('IPTU — parcela', 15000, d(m(-1), 20), d(m(-1), 20), 'moradia', 'boleto', 'atrasada', 'Exemplo de conta marcada como atrasada.'));
    s.expenses.push(one('Mercado do mês', 60000, d(m(-1), 4), null, 'alimentacao', 'pix', 'paga'));
    s.expenses.push(one('Mercado do mês', 55000, d(m(-2), 4), null, 'alimentacao', 'pix', 'paga'));

    /* Cartões (sem número, sem dados sensíveis) */
    const azul = { id: id('cart'), name: 'Cartão Azul (exemplo)', bank: 'Banco Exemplo', limit: 400000, closingDay: 3, dueDay: 10, color: '#6c8cff' };
    const verde = { id: id('cart'), name: 'Cartão Verde (exemplo)', bank: 'Financeira Demo', limit: 150000, closingDay: 25, dueDay: 5, color: '#4cb28a' };
    s.cards.push(azul, verde);
    const buy = (card, description, amount, installments, date, categoryId) => ({
      id: id('comp'), cardId: card.id, description, amount, installments, date, categoryId, firstInvoiceMonth: null, notes: ''
    });
    s.cardPurchases.push(buy(azul, 'Geladeira', 240000, 10, d(m(-3), 20), 'compras'));
    s.cardPurchases.push(buy(azul, 'Roupas', 18000, 3, d(m(-1), 2), 'compras'));
    s.cardPurchases.push(buy(azul, 'Restaurante', 8500, 1, d(cur, 1), 'lazer'));
    [-2, -1, 0].forEach((n) => s.cardPurchases.push(buy(azul, 'Streaming', 4590, 1, d(m(n - 1), 28), 'assinaturas')));
    s.cardPurchases.push(buy(verde, 'Curso online', 60000, 3, d(m(-1), 10), 'educacao'));
    s.cardPurchases.push(buy(verde, 'Mercado (compra extra)', 23000, 1, d(cur, 8), 'alimentacao'));

    const invTotal = (card, ym) => C.invoice(s, card, ym).total;
    [-2, -1].forEach((n) => {
      s.invoicePayments.push({ id: id('pag'), cardId: azul.id, month: m(n), amount: invTotal(azul, m(n)), date: d(m(n), 10) });
    });
    s.invoicePayments.push({ id: id('pag'), cardId: verde.id, month: m(-1), amount: invTotal(verde, m(-1)), date: d(m(-1), 5) });
    if (day > 5) s.invoicePayments.push({ id: id('pag'), cardId: verde.id, month: cur, amount: invTotal(verde, cur), date: d(cur, 5) });
    s.invoicePayments.push({ id: id('pag'), cardId: azul.id, month: cur, amount: 20000, date: d(cur, Math.min(day, 10)) });

    /* Orçamento, metas e plano */
    s.budgets = { alimentacao: 50000, moradia: 170000, lazer: 15000, transporte: 25000, compras: 30000 };
    s.goals.push({ id: id('meta'), name: 'Reserva de emergência', kind: 'reserva', target: 600000, saved: 15000, monthly: 5000, targetDate: null });
    s.goals.push({ id: id('meta'), name: 'Sair do vermelho', kind: 'vermelho', target: 50000, saved: 10000, monthly: 0, targetDate: null });
    s.goals.push({ id: id('meta'), name: 'Viagem para ver a família', kind: 'objetivo', target: 200000, saved: 0, monthly: 0, targetDate: d(m(10), 1) });
    s.plan.push({ id: id('plano'), title: 'Empréstimo pessoal (exemplo)', refType: 'loan', refId: pessoal.id, monthly: 29000, notes: 'Perguntar à financeira sobre portabilidade ou renegociação com juros menores.', status: 'planejado' });
    return s;
  }
  window.Demo = { build };
})();
