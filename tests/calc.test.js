// Testes dos cálculos. Rodar com:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');
const OCR = require('../js/ocr.js');

const TODAY = '2026-11-16';
const base = () => ({ categories: [{ id: 'moradia', name: 'Moradia', essential: true }, { id: 'outros', name: 'Outros' }], incomes: [], expenses: [], cards: [], cardPurchases: [], invoicePayments: [], loans: [], goals: [], plan: [], budgets: {} });

test('meses e datas', () => {
  assert.equal(C.addMonths('2026-11', 2), '2027-01');
  assert.equal(C.addMonths('2026-01', -1), '2025-12');
  assert.equal(C.monthDiff('2026-11', '2027-02'), 3);
  assert.equal(C.dateInMonth('2026-02', 31), '2026-02-28');
  assert.equal(C.daysBetween('2026-11-16', '2026-11-20'), 4);
});

test('parcelamento soma exatamente o total (centavos na 1ª parcela)', () => {
  const p = C.splitInstallments(10000, 3);
  assert.deepEqual(p, [3334, 3333, 3333]);
  assert.equal(p.reduce((a, b) => a + b), 10000);
  assert.deepEqual(C.splitInstallments(5000, 1), [5000]);
});

test('fatura: fechamento e vencimento', () => {
  // fecha dia 3, vence dia 10 (mesmo mês)
  assert.equal(C.invoiceMonthFor('2026-11-02', 3, 10), '2026-11');
  assert.equal(C.invoiceMonthFor('2026-11-03', 3, 10), '2026-12'); // no dia do fechamento -> próxima
  assert.equal(C.invoiceMonthFor('2026-11-20', 3, 10), '2026-12');
  // fecha dia 25, vence dia 5 (mês seguinte)
  assert.equal(C.invoiceMonthFor('2026-11-20', 25, 5), '2026-12');
  assert.equal(C.invoiceMonthFor('2026-11-26', 25, 5), '2027-01');
  assert.equal(C.closingDateFor('2026-12', 25, 5), '2026-11-25');
  // virada de ano
  assert.equal(C.invoiceMonthFor('2026-12-28', 25, 5), '2027-02');
});

test('compra parcelada distribui pelas faturas e respeita correção manual', () => {
  const s = base();
  const card = { id: 'c1', name: 'A', closingDay: 3, dueDay: 10, limit: 200000 };
  s.cards.push(card);
  s.cardPurchases.push({ id: 'p1', cardId: 'c1', description: 'TV', amount: 120000, installments: 4, date: '2026-10-20' });
  assert.equal(C.invoice(s, card, '2026-10', TODAY).total, 0);
  assert.equal(C.invoice(s, card, '2026-11', TODAY).total, 30000);
  assert.equal(C.invoice(s, card, '2027-02', TODAY).total, 30000);
  assert.equal(C.invoice(s, card, '2027-03', TODAY).total, 0);
  s.cardPurchases[0].firstInvoiceMonth = '2026-12'; // banco lançou um mês depois
  assert.equal(C.invoice(s, card, '2026-11', TODAY).total, 0);
  assert.equal(C.invoice(s, card, '2027-03', TODAY).total, 30000);
});

test('pagamento parcial/total da fatura e limite estimado', () => {
  const s = base();
  const card = { id: 'c1', name: 'A', closingDay: 3, dueDay: 10, limit: 200000 };
  s.cards.push(card);
  s.cardPurchases.push({ id: 'p1', cardId: 'c1', description: 'TV', amount: 120000, installments: 4, date: '2026-10-20' });
  s.invoicePayments.push({ id: 'x', cardId: 'c1', month: '2026-11', amount: 10000, date: TODAY });
  let inv = C.invoice(s, card, '2026-11', TODAY);
  assert.equal(inv.status, 'parcial'); assert.equal(inv.remaining, 20000);
  assert.equal(C.estimatedAvailableLimit(s, card).available, 200000 - 110000);
  s.invoicePayments.push({ id: 'y', cardId: 'c1', month: '2026-11', amount: 20000, date: TODAY });
  inv = C.invoice(s, card, '2026-11', TODAY);
  assert.equal(inv.status, 'paga'); assert.equal(inv.remaining, 0);
});

test('resumo do mês NÃO soma compra no cartão e pagamento da fatura duas vezes', () => {
  const s = base();
  const card = { id: 'c1', name: 'A', closingDay: 3, dueDay: 10 };
  s.cards.push(card);
  s.cardPurchases.push({ id: 'p1', cardId: 'c1', description: 'Mercado', amount: 50000, installments: 1, date: '2026-11-01', categoryId: 'outros' });
  s.invoicePayments.push({ id: 'x', cardId: 'c1', month: '2026-11', amount: 50000, date: '2026-11-10' });
  s.expenses.push({ id: 'e1', description: 'Aluguel', amount: 100000, date: '2026-11-05', dueDate: '2026-11-05', categoryId: 'moradia', paymentMethod: 'pix', status: 'paga' });
  const m = C.monthSummary(s, '2026-11', TODAY);
  assert.equal(m.outExpected, 150000); // 1000 aluguel + 500 fatura (não 2000)
  assert.equal(m.outPaid, 150000);
  assert.equal(m.byCategory.outros, 50000);
});

test('salário líquido: consignado em folha não é descontado de novo', () => {
  const s = base();
  s.loans.push({ id: 'l1', name: 'Consig', installmentAmount: 35000, totalInstallments: 24, paidInstallments: 9, firstDueDate: '2026-03-05', paymentMethod: 'folha' });
  s.incomes.push({ id: 'i1', description: 'Salário', type: 'salario', mode: 'liquido', amount: 300000, expectedDate: '2026-11-05', recurring: false, received: true });
  const m = C.monthSummary(s, '2026-11', TODAY);
  assert.equal(m.incomeExpected, 300000);
  assert.equal(m.outExpected, 0); // parcela em folha não vira saída
  assert.equal(m.loansTotal, 35000); // mas aparece no total comprometido
  assert.equal(m.forecastBalance, 300000);
});

test('salário por referência: descontos informados + consignado em folha, uma única vez', () => {
  const s = base();
  s.loans.push({ id: 'l1', name: 'Consig', installmentAmount: 35000, totalInstallments: 24, paidInstallments: 9, firstDueDate: '2026-03-05', paymentMethod: 'folha' });
  s.incomes.push({ id: 'i1', description: 'Salário', type: 'salario', mode: 'referencia', amount: 380000, deductions: [{ name: 'INSS', amount: 42000 }], expectedDate: '2026-11-05', recurring: true, received: false });
  s.incomes.push({ id: 'i2', description: '13º', type: 'salario', mode: 'referencia', amount: 100000, deductions: [], expectedDate: '2026-11-25', recurring: false, received: false });
  const m = C.monthSummary(s, '2026-11', TODAY);
  assert.equal(m.incomes[0].net, 380000 - 42000 - 35000);
  assert.equal(m.incomes[1].net, 100000); // consignado não é aplicado no segundo salário
  assert.equal(m.outExpected, 0);
});

test('empréstimo: parcelas restantes, soma estimada e próximo vencimento', () => {
  const l = { id: 'l', name: 'P', installmentAmount: 29000, totalInstallments: 12, paidInstallments: 3, firstDueDate: '2026-08-15', paymentMethod: 'manual' };
  const s = C.loanSummary(l, TODAY);
  assert.equal(s.remaining, 9);
  assert.equal(s.remainingSumEstimate, 261000);
  assert.equal(s.nextDueDate, '2026-11-15');
  assert.equal(s.nextDuePassed, true);
  assert.equal(C.loanInstallment(l, '2026-11').k, 4);
  assert.equal(C.loanInstallment(l, '2026-11').paid, false);
  assert.equal(C.loanInstallment(l, '2027-08'), null); // após a última
});

test('mês no vermelho: saldo previsto e saldo atual', () => {
  const s = base();
  s.incomes.push({ id: 'i1', description: 'Salário', type: 'salario', mode: 'liquido', amount: 200000, expectedDate: '2026-11-05', received: true });
  s.expenses.push({ id: 'e1', description: 'Aluguel', amount: 150000, date: '2026-11-05', categoryId: 'moradia', paymentMethod: 'pix', status: 'paga' });
  s.expenses.push({ id: 'e2', description: 'Luz', amount: 80000, date: '2026-11-01', dueDate: '2026-11-20', categoryId: 'moradia', paymentMethod: 'boleto', status: 'prevista' });
  s.loans.push({ id: 'l', name: 'P', installmentAmount: 29000, totalInstallments: 12, paidInstallments: 3, firstDueDate: '2026-08-15', paymentMethod: 'manual' });
  const m = C.monthSummary(s, '2026-11', TODAY);
  assert.equal(m.outExpected, 150000 + 80000 + 29000);
  assert.equal(m.forecastBalance, 200000 - 259000);
  assert.equal(m.currentBalance, 200000 - 150000);
  assert.equal(m.outRemaining, 109000);
});

test('despesa recorrente: aparece todo mês com situação própria e pode ser encerrada', () => {
  const e = { id: 'e', description: 'Internet', amount: 11000, date: '2026-09-15', dueDate: '2026-09-15', recurring: true, status: 'paga', byMonth: { '2026-10': { status: 'paga' } } };
  assert.equal(C.expenseOccurrence(e, '2026-08'), null);
  assert.equal(C.expenseOccurrence(e, '2026-09').status, 'paga');
  assert.equal(C.expenseOccurrence(e, '2026-10').status, 'paga');
  assert.equal(C.expenseOccurrence(e, '2026-11').status, 'prevista');
  assert.equal(C.expenseOccurrence(e, '2026-11').dueDate, '2026-11-15');
  e.endMonth = '2026-11';
  assert.equal(C.expenseOccurrence(e, '2026-12'), null);
});

test('nada é marcado como atrasado sem indicação do usuário', () => {
  const s = base();
  s.expenses.push({ id: 'e1', description: 'Luz', amount: 8000, date: '2026-11-01', dueDate: '2026-11-10', categoryId: 'moradia', paymentMethod: 'boleto', status: 'prevista' });
  s.expenses.push({ id: 'e2', description: 'IPTU', amount: 15000, date: '2026-10-20', dueDate: '2026-10-20', categoryId: 'moradia', paymentMethod: 'boleto', status: 'atrasada' });
  const p = C.pendencies(s, TODAY);
  assert.deepEqual(p.late.map((x) => x.title), ['IPTU']);
  assert.deepEqual(p.unconfirmed.map((x) => x.title), ['Luz']); // só pede confirmação
});

test('alertas de vencimento próximo e orçamento', () => {
  const s = base();
  s.expenses.push({ id: 'e1', description: 'Água', amount: 9000, date: '2026-11-01', dueDate: '2026-11-19', categoryId: 'moradia', paymentMethod: 'boleto', status: 'prevista' });
  s.budgets = { moradia: 5000 };
  const a = C.alerts(s, '2026-11', TODAY);
  assert.ok(a.find((x) => x.kind === 'conta' && x.title === 'Água'));
  assert.ok(a.find((x) => x.kind === 'orcamento'));
  assert.ok(a.find((x) => x.kind === 'saldo'));
});

test('duplicidade: mesmo valor, data próxima e nome parecido', () => {
  const s = base();
  s.expenses.push({ id: 'e1', description: 'Supermercado Bom Preço', amount: 15230, date: '2026-11-14' });
  assert.equal(C.findDuplicates(s, { description: 'BOM PRECO SUPERMERCADO LTDA', amount: 15230, date: '2026-11-15' }).length, 1);
  assert.equal(C.findDuplicates(s, { description: 'Farmácia', amount: 15230, date: '2026-11-15' }).length, 0);
  assert.equal(C.findDuplicates(s, { description: 'Supermercado', amount: 15230, date: '2026-11-25' }).length, 0);
});

test('metas: progresso e estimativa', () => {
  const g = C.goalProgress({ target: 600000, saved: 15000, monthly: 5000 });
  assert.equal(g.missing, 585000);
  assert.equal(g.monthsAtPace, 117);
  assert.equal(C.goalProgress({ target: 1000, saved: 1000 }).done, true);
});

test('leitura de nota: extrai total, data, estabelecimento e categoria', () => {
  const text = 'SUPERMERCADO BOM PRECO LTDA\nCNPJ 12.345.678/0001-90\nRua das Flores, 100\nDOCUMENTO AUXILIAR DA NOTA FISCAL\nARROZ 5KG 1 UN 27,90\nFEIJAO 1KG 2 UN 17,80\nQTD. TOTAL DE ITENS 3\nVALOR TOTAL R$ 45,70\nDinheiro 50,00\nTroco 4,30\nEmissão: 14/11/2026 10:22';
  const r = OCR.parse(text, TODAY);
  assert.equal(r.amount, 4570);
  assert.equal(r.date, '2026-11-14');
  assert.equal(r.merchant, 'SUPERMERCADO BOM PRECO LTDA');
  assert.equal(r.categoryId, 'alimentacao');
  const r2 = OCR.parse('texto ilegível', TODAY);
  assert.equal(r2.amount, null); assert.equal(r2.date, null);
});
