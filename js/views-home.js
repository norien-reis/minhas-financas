/* views-home.js — tela inicial (visão geral do mês) e gráficos simples. */
(function () {
  'use strict';
  const M = U.money;

  const Charts = {
    // Barras agrupadas: [{label, a, b}] com legenda (entradas x saídas)
    grouped(rows, la, lb) {
      if (!rows.length) return '<p class="muted small">Ainda não há meses com dados para comparar.</p>';
      const max = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b)));
      const w = 320, h = 150, pad = 22, gw = (w - 10) / rows.length, bw = Math.min(18, gw / 3);
      let bars = '';
      rows.forEach((r, i) => {
        const x = 5 + i * gw + gw / 2;
        const ha = (r.a / max) * (h - pad - 10), hb = (r.b / max) * (h - pad - 10);
        bars += '<rect class="bar-a" x="' + (x - bw - 1) + '" y="' + (h - pad - ha) + '" width="' + bw + '" height="' + ha + '" rx="3"><title>' + la + ': ' + M(r.a) + '</title></rect>';
        bars += '<rect class="bar-b' + (r.b > r.a ? ' over' : '') + '" x="' + (x + 1) + '" y="' + (h - pad - hb) + '" width="' + bw + '" height="' + hb + '" rx="3"><title>' + lb + ': ' + M(r.b) + '</title></rect>';
        bars += '<text x="' + x + '" y="' + (h - 6) + '" text-anchor="middle" class="axis' + (r.current ? ' cur' : '') + '">' + U.esc(r.label) + '</text>';
      });
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" role="img" aria-label="Comparação de ' + la + ' e ' + lb + ' por mês">' + bars + '</svg>' +
        '<div class="legend"><span><i class="lg-a"></i>' + la + '</span><span><i class="lg-b"></i>' + lb + '</span></div>';
    },
    // Barras de saldo positivo/negativo
    balance(rows) {
      const max = Math.max(1, ...rows.map((r) => Math.abs(r.balance)));
      const w = 320, h = 160, mid = 75, gw = (w - 10) / rows.length, bw = Math.min(26, gw * 0.55);
      let out = '<line x1="0" x2="' + w + '" y1="' + mid + '" y2="' + mid + '" class="zero"/>';
      rows.forEach((r, i) => {
        const x = 5 + i * gw + gw / 2; const hh = (Math.abs(r.balance) / max) * 60;
        const y = r.balance >= 0 ? mid - hh : mid;
        out += '<rect class="' + (r.balance >= 0 ? 'pos' : 'neg') + '" x="' + (x - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + Math.max(1, hh) + '" rx="3"><title>' + U.monthShort(r.ym) + ': ' + M(r.balance) + '</title></rect>';
        out += '<text x="' + x + '" y="' + (h - 4) + '" text-anchor="middle" class="axis">' + U.monthShort(r.ym) + '</text>';
      });
      return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" role="img" aria-label="Saldo previsto por mês">' + out + '</svg>';
    },
    hbar(value, max, cls) {
      const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
      return '<div class="hbar ' + (cls || '') + '"><i style="width:' + p.toFixed(1) + '%"></i></div>';
    }
  };
  window.Charts = Charts;

  function stat(label, value, opts) {
    opts = opts || {};
    return '<div class="stat ' + (opts.cls || '') + '"' + (opts.go ? ' data-act="go" data-to="' + opts.go + '" role="button" tabindex="0"' : '') + '>' +
      '<span class="stat-l">' + label + '</span><strong class="stat-v">' + value + '</strong>' +
      (opts.sub ? '<span class="stat-s">' + opts.sub + '</span>' : '') + '</div>';
  }

  function alertsHTML(app) {
    const list = Calc.alerts(app.s, app.month, app.today());
    if (!list.length) return '<p class="muted small">Nenhum aviso por enquanto. 🌿</p>';
    return '<ul class="alerts">' + list.map((a) => {
      let txt = '';
      if (a.kind === 'saldo') txt = 'O saldo previsto de ' + U.monthName(app.month) + ' está em <strong>' + M(a.amount) + '</strong>.';
      else if (a.kind === 'orcamento') { const c = app.cat(a.categoryId); txt = c.icon + ' ' + U.esc(c.name) + ': <strong>' + M(a.amount) + '</strong> acima do orçamento.'; }
      else txt = U.esc(a.title) + ' · <strong>' + M(a.amount) + '</strong> · vence ' + U.relDays(Calc.daysBetween(app.today(), a.date)) + ' (' + U.dateShort(a.date) + ')';
      const icon = { saldo: '⚠️', orcamento: '📊', fatura: '💳', conta: '🧾', emprestimo: '🏦' }[a.kind];
      return '<li class="al-' + a.level + '"><span aria-hidden="true">' + icon + '</span><span>' + txt + '</span></li>';
    }).join('') + '</ul><p class="muted tiny">Avisos aparecem só aqui dentro da ferramenta. Não há notificações por celular, e-mail ou WhatsApp.</p>';
  }

  App.views.inicio = function () {
    const s = Calc.monthSummary(this.s, this.month, this.today());
    const neg = s.forecastBalance < 0;
    const isCur = this.month === this.curMonth();
    let h = '';

    h += '<section class="hero ' + (neg ? 'neg' : s.forecastBalance > 0 ? 'pos' : '') + '">' +
      '<span class="hero-l">Saldo previsto para o fim de ' + U.monthName(this.month) + '</span>' +
      '<strong class="hero-v">' + M(s.forecastBalance) + '</strong>' +
      '<span class="hero-s">Entradas previstas ' + M(s.incomeExpected) + ' − saídas previstas ' + M(s.outExpected) + '</span>' +
      Charts.hbar(s.outPaid, s.outExpected, 'light') +
      '<span class="hero-s">' + M(s.outPaid) + ' de ' + M(s.outExpected) + ' já pagos</span></section>';

    if (neg) {
      h += '<section class="card soft-alert"><strong>Este mês está previsto para fechar no vermelho.</strong>' +
        '<p>Faltam <strong>' + M(-s.forecastBalance) + '</strong> para cobrir tudo que está cadastrado. Isso é uma informação para planejar, não um julgamento. ' +
        'Você pode ver o que pede atenção primeiro e montar um plano no seu ritmo.</p>' +
        '<button class="btn small" data-act="go" data-to="#dividas">Ver situação e plano</button></section>';
    }
    // Lembrete gentil de backup (dados reais, sem backup há mais de 7 dias)
    const st = this.s;
    const records = st.expenses.length + st.incomes.length + st.cardPurchases.length + st.loans.length;
    if (!st.isDemo && records > 0) {
      const lb = st.settings.lastBackup;
      const days = lb ? Calc.daysBetween(lb.slice(0, 10), this.today()) : null;
      const changedSince = !lb || (st.updatedAt && st.updatedAt > lb);
      if (changedSince && (days === null || days >= 7)) {
        h += '<section class="card soft-warn small backup-tip"><strong>💾 ' + (days === null ? 'Você ainda não fez backup.' : 'Seu último backup foi há ' + days + ' dias.') + '</strong>' +
          '<p>Seus dados ficam só neste aparelho. Um backup protege contra perda e serve para levar tudo para o celular ou o computador.</p>' +
          '<button class="btn small" data-act="go" data-to="#dados">Fazer backup / enviar para outro aparelho</button></section>';
      }
    }
    if (!s.hasData) {
      h += '<section class="card"><h3>Mês sem lançamentos</h3><p class="muted">Cadastre seu salário e suas contas para ver o resumo de ' + U.monthLabel(this.month) + '.</p>' +
        '<div class="btn-row"><button class="btn" data-act="addIncome">+ Entrada</button><button class="btn primary" data-act="addExpense">+ Gasto</button></div></section>';
    }

    h += '<section class="grid-stats">' +
      stat('A receber (previsto)', M(s.incomeExpected), { go: '#movimentos', cls: 'in' }) +
      stat('Já recebido', M(s.incomeReceived), { cls: 'in' }) +
      stat('A pagar (previsto)', M(s.outExpected), { cls: 'out' }) +
      stat('Já pago', M(s.outPaid), { cls: 'out' }) +
      stat('Falta pagar', M(s.outRemaining), { cls: s.outRemaining > 0 ? 'warn' : '' }) +
      stat('Saldo atual', M(s.currentBalance), { sub: 'recebido − pago até agora', cls: s.currentBalance < 0 ? 'neg' : '' }) +
      stat('Faturas de cartão', M(s.invTotal), { go: '#cartoes', sub: s.invPaid ? M(s.invPaid) + ' pago' : '' }) +
      stat('Parcelas de empréstimos', M(s.loansTotal), { go: '#dividas', sub: s.loanPayrollTotal ? M(s.loanPayrollTotal) + ' em folha (já sai do salário)' : '' }) +
      (s.budgetTotal ? stat(s.budgetSpent > s.budgetTotal ? 'Acima do orçamento' : 'Dentro do orçamento', M(s.budgetSpent), {
        go: '#orcamento', cls: s.budgetSpent > s.budgetTotal ? 'warn' : '',
        sub: 'de ' + M(s.budgetTotal) + ' · ' + (s.budgetSpent > s.budgetTotal ? M(s.budgetSpent - s.budgetTotal) + ' acima' : M(s.budgetTotal - s.budgetSpent) + ' disponível') + (s.overBudget.length ? ' · ' + U.plural(s.overBudget.length, 'categoria passou', 'categorias passaram') : '')
      }) : stat('Orçamento', 'Não definido', { go: '#orcamento', sub: 'Toque para criar' })) +
      '</section>';

    if (s.payrollWithoutSalary) {
      h += '<section class="card soft-warn small">Há consignado descontado em folha neste mês, mas nenhum salário cadastrado. Cadastre o salário para o cálculo ficar completo.</section>';
    }

    h += '<section class="card"><h3>Avisos ' + (isCur ? '' : '<span class="muted tiny">(vencimentos contam a partir de hoje)</span>') + '</h3>' + alertsHTML(this) + '</section>';

    // Comparação com meses anteriores (somente meses com dados)
    const rows = [];
    for (let i = 5; i >= 0; i--) {
      const ym = Calc.addMonths(this.month, -i);
      const x = Calc.monthSummary(this.s, ym, this.today());
      if (x.incomes.length || x.expenses.length || x.invTotal) rows.push({ label: U.monthShort(ym), a: x.incomeExpected, b: x.outExpected, current: ym === this.month });
    }
    h += '<section class="card"><h3>Comparação com meses anteriores</h3>' + Charts.grouped(rows, 'Entradas', 'Saídas') + '</section>';

    // Gastos por categoria
    const cats = Object.keys(s.byCategory).map((k) => ({ c: this.cat(k), v: s.byCategory[k] })).sort((a, b) => b.v - a.v);
    const maxc = cats.length ? cats[0].v : 0;
    h += '<section class="card"><h3>Gastos por categoria</h3>' +
      (cats.length ? '<ul class="cat-bars">' + cats.map((x) => '<li><span>' + x.c.icon + ' ' + U.esc(x.c.name) + '</span><strong>' + M(x.v) + '</strong>' +
        '<div class="hbar"><i style="width:' + (x.v / maxc * 100).toFixed(1) + '%;background:' + x.c.color + '"></i></div></li>').join('') + '</ul>' : '<p class="muted small">Sem gastos neste mês.</p>') +
      '<p class="muted tiny">Inclui compras no cartão pelo mês da fatura em que caem (visão por compra).</p></section>';

    h += '<details class="card explain"><summary>Como estes números são calculados</summary>' +
      '<ul><li><strong>Saídas previstas</strong> = despesas pagas por Pix, débito, boleto etc. + <strong>valor total das faturas</strong> que vencem no mês + parcelas de empréstimos pagas por você.</li>' +
      '<li>Compras no cartão <strong>não</strong> são somadas de novo: elas já estão dentro da fatura. O pagamento da fatura é o dinheiro que sai da conta.</li>' +
      '<li>Consignado descontado em folha <strong>não</strong> entra como saída: ele já foi descontado do salário (ou é descontado automaticamente se você usa valor de referência).</li>' +
      '<li><strong>Saldo atual</strong> = o que já foi marcado como recebido − o que já foi marcado como pago neste mês. Não considera dinheiro de meses anteriores.</li>' +
      '<li>Nada é marcado como atrasado automaticamente: só quando você indica.</li></ul></details>';
    return h;
  };
})();
