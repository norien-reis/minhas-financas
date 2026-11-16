/* app.js — núcleo: estado da interface, navegação, ações comuns e inicialização. */
(function () {
  'use strict';

  const PAY = {
    pix: 'Pix', debito: 'Débito', dinheiro: 'Dinheiro', boleto: 'Boleto',
    credito: 'Cartão de crédito', transferencia: 'Transferência', folha: 'Desconto em folha', outro: 'Outro'
  };
  const STATUS = { prevista: 'Prevista', paga: 'Paga', atrasada: 'Atrasada' };

  const App = {
    month: Calc.ymOf(Calc.todayISO()),
    route: 'inicio', param: null,
    ui: { movTab: 'saidas', debtTab: 'emprestimos', filters: { period: 'mes', from: '', to: '', cat: '', pay: '', status: '' } },
    views: {},
    actions: {},
    PAY, STATUS,
    get s() { return Store.state; },
    today() { return Calc.todayISO(); },
    curMonth() { return Calc.ymOf(Calc.todayISO()); },

    save() { Store.save(); this.render(); },
    cat(id) { return this.s.categories.find((c) => c.id === id) || this.s.categories.find((c) => c.id === 'outros') || { id: 'outros', name: 'Outros', icon: '📦', color: '#a0a7b4' }; },
    card(id) { return this.s.cards.find((c) => c.id === id); },
    loan(id) { return this.s.loans.find((l) => l.id === id); },
    catChips() { return this.s.categories.map((c) => ({ value: c.id, label: c.icon + ' ' + c.name, color: c.color })); },

    toast(msg, kind) {
      const t = document.createElement('div');
      t.className = 'toast ' + (kind || '');
      t.setAttribute('role', 'status');
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
    },

    go(hash) { location.hash = hash; },
    parseRoute() {
      const h = (location.hash || '#inicio').slice(1).split('/');
      this.route = h[0] || 'inicio';
      this.param = h[1] ? decodeURIComponent(h[1]) : null;
    },

    setMonth(ym) { this.month = ym; this.render(); },

    render() {
      if (!this.s) return this.renderWelcome();
      this.parseRoute();
      U.$('.month-nav').hidden = false;
      const main = U.$('#main');
      const key = this.route + (this.param ? '/' + this.param : '');
      const view = this.views[this.route] || this.views.inicio;
      const top = key === this._lastKey ? window.scrollY : 0;
      main.innerHTML = (this.s.isDemo ? this.demoBanner() : '') + view.call(this, this.param);
      this._lastKey = key;
      window.scrollTo(0, top);
      const ml = U.monthLabel(this.month);
      U.$('#month-label').textContent = ml.charAt(0).toUpperCase() + ml.slice(1);
      U.$('#month-today').hidden = this.month === this.curMonth();
      U.$$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === this.route || (a.dataset.tab === 'mais' && ['metas', 'orcamento', 'categorias', 'dados', 'instalar', 'sobre'].includes(this.route))));
      const tab = U.$('.tabbar a.active'); document.title = 'Minhas Finanças' + (tab ? ' · ' + tab.lastChild.textContent.trim() : '');
      U.$('#fab').hidden = ['dados', 'sobre', 'instalar', 'categorias'].includes(this.route);
    },

    demoBanner() {
      return '<div class="demo-banner" role="note"><div><strong>Dados fictícios de demonstração.</strong> ' +
        'Nada aqui é real — serve para mostrar como a ferramenta funciona, inclusive um mês no vermelho.</div>' +
        '<button class="btn small" data-act="clearDemo">Apagar exemplo e começar do zero</button></div>';
    },

    renderWelcome() {
      U.$('#main').innerHTML =
        '<section class="welcome card">' +
        '<div class="welcome-icon" aria-hidden="true">💙</div>' +
        '<h1>Boas-vindas às suas finanças</h1>' +
        '<p>Um lugar tranquilo para entender seu mês, organizar cartões e empréstimos e, no seu tempo, começar a guardar dinheiro.</p>' +
        '<p class="muted small">Seus dados ficam <strong>somente neste navegador, neste aparelho</strong>. Nada é enviado para a internet.</p>' +
        '<div class="stack">' +
        '<button class="btn primary block" data-act="startDemo">Ver com dados de exemplo</button>' +
        '<button class="btn block" data-act="startEmpty">Começar do zero</button>' +
        '<label class="btn ghost block">Restaurar um backup<input type="file" accept="application/json,.json" hidden data-import></label>' +
        '</div></section>';
      U.$('#fab').hidden = true;
      U.$('.month-nav').hidden = true;
    },

    /* ---------- Atualizações de status reutilizáveis ---------- */
    setExpenseStatus(e, ym, status) {
      if (e.recurring) {
        e.byMonth = e.byMonth || {};
        e.byMonth[ym] = Object.assign({}, e.byMonth[ym], { status, date: status === 'paga' ? this.today() : null });
      } else { e.status = status; e.paidDate = status === 'paga' ? this.today() : null; }
    },
    setIncomeReceived(inc, ym, received) {
      if (inc.recurring) { inc.byMonth = inc.byMonth || {}; inc.byMonth[ym] = Object.assign({}, inc.byMonth[ym], { received }); }
      else inc.received = received;
    },

    statusChip(st) { return '<span class="st st-' + st + '">' + (STATUS[st] || st) + '</span>'; },

    async showPhoto(id) {
      const b = await Store.photoGet(id).catch(() => null);
      if (!b) return this.toast('Foto não encontrada neste aparelho.');
      const url = URL.createObjectURL(b);
      F.sheet({ title: 'Comprovante', body: '<img class="photo-full" src="' + url + '" alt="Foto do comprovante">', onClose: () => URL.revokeObjectURL(url) });
    }
  };
  window.App = App;

  /* ---------- Ações globais (delegação de eventos) ---------- */
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const fn = App.actions[el.dataset.act];
    if (fn) { ev.preventDefault(); fn.call(App, el, ev); }
  });
  document.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-import]')) App.actions.importFile(ev.target);
    const el = ev.target.closest('[data-change]');
    if (el && App.actions[el.dataset.change]) App.actions[el.dataset.change].call(App, el, ev);
  });

  Object.assign(App.actions, {
    prevMonth() { this.setMonth(Calc.addMonths(this.month, -1)); },
    nextMonth() { this.setMonth(Calc.addMonths(this.month, 1)); },
    todayMonth() { this.setMonth(this.curMonth()); },
    pickMonth() {
      const s = F.sheet({ title: 'Escolher mês', body: '<input type="month" class="month-pick" value="' + this.month + '"><div class="btn-row"><button class="btn primary block" data-ok>Ver este mês</button></div>' });
      s.el.querySelector('[data-ok]').onclick = () => { const v = s.el.querySelector('input').value; if (v) this.setMonth(v); s.close(); };
    },
    go(el) { this.go(el.dataset.to); },
    startDemo() { Store.replace(Demo.build()); this.render(); this.toast('Dados de exemplo carregados.'); },
    startEmpty() { Store.replace(Store.empty()); this.render(); this.toast('Tudo pronto. Comece cadastrando seu salário em Lançamentos → Entradas.'); },
    async clearDemo() {
      const ok = await F.confirm({ title: 'Apagar dados de exemplo?', message: 'Todos os dados fictícios serão removidos e você começa do zero. Suas categorias padrão continuam disponíveis.', ok: 'Apagar e começar', danger: true });
      if (!ok) return;
      Store.replace(Store.empty());
      await Store.photoClear().catch(() => {});
      this.go('#inicio'); this.render();
      this.toast('Pronto! Comece cadastrando suas entradas.');
    },
    photo(el) { this.showPhoto(el.dataset.id); },
    addExpense() { this.expenseForm(); },
    tab(el) { this.ui[el.dataset.key] = el.dataset.val; this.render(); }
  });

  /* ---------- Inicialização ---------- */
  window.addEventListener('hashchange', () => { F.closeAll(); App.render(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { const open = U.$$('.sheet-wrap.open [data-close]'); if (open.length) open[open.length - 1].click(); }
  });
  window.addEventListener('DOMContentLoaded', () => {
    Store.load();
    App.render();
    if (!Store.storageOk) App.toast('Este navegador bloqueou o armazenamento local. Os dados não serão salvos.', 'erro');
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); App.installPrompt = e; });
})();
