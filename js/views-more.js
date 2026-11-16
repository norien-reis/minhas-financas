/* views-more.js — Metas, Orçamento, Categorias, Backup/dados, Instalação e Privacidade. */
(function () {
  'use strict';
  const M = U.money;
  const GOAL_KINDS = { vermelho: 'Sair do vermelho', reserva: 'Reserva de emergência', objetivo: 'Objetivo pessoal' };

  App.views.mais = function () {
    const item = (to, icon, t, d) => '<a class="menu-item" href="#' + to + '"><span class="ico">' + icon + '</span><span><strong>' + t + '</strong><small>' + d + '</small></span><span aria-hidden="true">›</span></a>';
    return '<h2>Mais</h2><nav class="menu">' +
      item('metas', '🎯', 'Metas', 'Sair do vermelho, reserva, objetivos') +
      item('orcamento', '📊', 'Orçamento por categoria', 'Previsto x gasto no mês') +
      item('categorias', '🏷️', 'Categorias', 'Criar e editar categorias') +
      item('dados', '💾', 'Backup e dados', 'Exportar, importar, apagar') +
      item('instalar', '📱', 'Adicionar à tela inicial', 'Usar como aplicativo') +
      item('sobre', '🔒', 'Privacidade e sobre', 'Onde ficam seus dados') + '</nav>';
  };

  /* ---------------- Metas ---------------- */
  App.views.metas = function () {
    const cur = Calc.monthSummary(this.s, this.curMonth(), this.today());
    let h = '<a href="#mais" class="back">‹ Mais</a><div class="section-head"><h2>Metas</h2><button class="btn small" data-act="addGoal">+ Meta</button></div>';
    if (cur.forecastBalance < 0) {
      h += '<section class="card soft-alert small"><strong>Neste mês o saldo previsto está negativo (' + M(cur.forecastBalance) + ').</strong>' +
        '<p>Tudo bem não guardar dinheiro agora. Quando o mês fecha no vermelho, costuma fazer sentido priorizar contas essenciais e organizar as dívidas primeiro. Suas metas continuam aqui esperando por você.</p></section>';
    } else if (cur.forecastBalance > 0) {
      h += '<section class="card soft-ok small">Pelo que está cadastrado, sobram <strong>' + M(cur.forecastBalance) + '</strong> previstos em ' + U.monthName(this.curMonth()) + '. Se fizer sentido para você, uma parte pode ir para uma meta.</section>';
    }
    if (!this.s.goals.length) return h + '<div class="empty">Nenhuma meta ainda. Que tal começar com uma pequena reserva?<br><button class="btn primary" data-act="addGoal">+ Criar meta</button></div>';
    h += this.s.goals.map((g) => {
      const p = Calc.goalProgress(g);
      return '<article class="card goal"><div class="section-head"><div><h3>' + U.esc(g.name) + '</h3><small class="muted">' + (GOAL_KINDS[g.kind] || '') + '</small></div>' +
        (p.done ? '<span class="st st-paga">Concluída 🎉</span>' : '<strong>' + U.pct(p.pct) + '</strong>') + '</div>' +
        '<div class="hbar goal-bar"><i style="width:' + (p.pct * 100).toFixed(1) + '%"></i></div>' +
        '<p class="small"><strong>' + M(g.saved) + '</strong> de ' + M(g.target) + (p.missing ? ' · faltam ' + M(p.missing) : '') + '</p>' +
        (g.monthly ? '<p class="small muted">Pretende guardar ' + M(g.monthly) + '/mês' + (p.monthsAtPace ? ' — nesse ritmo, cerca de ' + U.plural(p.monthsAtPace, 'mês', 'meses') + ' (estimativa)' : '') + '</p>' : '') +
        (g.targetDate ? '<p class="small muted">Data desejada: ' + U.date(g.targetDate) + (p.neededPerMonth ? ' · seria preciso cerca de ' + M(p.neededPerMonth) + '/mês' : '') + '</p>' : '') +
        '<div class="btn-row wrap"><button class="btn small primary" data-act="goalAdd" data-id="' + g.id + '">+ Guardar valor</button><button class="btn small ghost" data-act="goalTake" data-id="' + g.id + '">Retirar</button><button class="btn small ghost" data-act="editGoal" data-id="' + g.id + '">Editar</button></div></article>';
    }).join('');
    return h + '<p class="muted tiny">Os valores guardados são informados por você. A ferramenta não movimenta dinheiro.</p>';
  };

  function goalForm(app, g) {
    F.open({
      title: g ? 'Editar meta' : 'Nova meta', submit: 'Salvar', values: g || { kind: 'reserva', saved: 0 },
      fields: [
        { name: 'kind', label: 'Tipo', type: 'chips', options: Object.keys(GOAL_KINDS).map((k) => ({ value: k, label: GOAL_KINDS[k] })) },
        { name: 'name', label: 'Nome', required: true, placeholder: 'Ex.: Reserva de emergência' },
        { name: 'target', label: 'Valor desejado', type: 'money', required: true, validate: (x) => (x > 0 ? null : 'Informe o valor desejado.') },
        { name: 'saved', label: 'Valor já guardado', type: 'money' },
        { name: 'monthly', label: 'Quanto pretendo guardar por mês (se possível)', type: 'money' },
        { name: 'targetDate', label: 'Data desejada (opcional)', type: 'date' }
      ],
      onChange: (v, form) => { if (!form.elements.name.value && v.kind) form.elements.name.placeholder = GOAL_KINDS[v.kind]; },
      onMount: (form, api) => {
        if (!g) return;
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger ghost'; del.textContent = 'Excluir';
        form.querySelector('.btn-row').prepend(del);
        del.onclick = async () => { if (await F.confirm({ title: 'Excluir meta?', message: '“' + g.name + '” será removida.', ok: 'Excluir', danger: true })) { app.s.goals = app.s.goals.filter((x) => x !== g); api.close(); app.save(); } };
      },
      onSubmit: (v) => {
        const obj = g || { id: 'meta_' + U.uid() };
        Object.assign(obj, { kind: v.kind, name: v.name, target: v.target, saved: v.saved || 0, monthly: v.monthly || 0, targetDate: v.targetDate || null });
        if (!g) app.s.goals.push(obj);
        app.save();
      }
    });
  }

  /* ---------------- Orçamento ---------------- */
  App.views.orcamento = function () {
    const s = Calc.monthSummary(this.s, this.month, this.today());
    const b = this.s.budgets || {};
    let h = '<a href="#mais" class="back">‹ Mais</a><h2>Orçamento de ' + U.monthLabel(this.month) + '</h2>' +
      '<p class="muted small">Defina quanto pretende gastar por mês em cada categoria (vale para todos os meses). Deixe em branco para não acompanhar.</p>';
    if (s.budgetTotal) {
      const over = s.budgetSpent > s.budgetTotal;
      h += '<div class="totals three"><div><span>Previsto</span><strong>' + M(s.budgetTotal) + '</strong></div><div><span>Gasto</span><strong>' + M(s.budgetSpent) + '</strong></div><div><span>' + (over ? 'Acima' : 'Disponível') + '</span><strong class="' + (over ? 'txt-neg' : 'txt-in') + '">' + M(Math.abs(s.budgetTotal - s.budgetSpent)) + '</strong></div></div>';
    }
    h += '<ul class="budget">' + this.s.categories.map((c) => {
      const spent = s.byCategory[c.id] || 0; const bud = b[c.id] || 0;
      const over = bud && spent > bud;
      return '<li><div class="budget-top"><span>' + c.icon + ' ' + U.esc(c.name) + '</span>' +
        '<div class="money-in small"><span>R$</span><input inputmode="decimal" placeholder="—" value="' + (bud ? U.moneyInput(bud) : '') + '" data-change="setBudget" data-id="' + c.id + '" aria-label="Orçamento de ' + U.esc(c.name) + '"></div></div>' +
        (bud ? Charts.hbar(spent, bud, over ? 'over' : '') + '<small class="' + (over ? 'txt-neg' : 'muted') + '">' + M(spent) + ' de ' + M(bud) + (over ? ' · ' + M(spent - bud) + ' acima' : ' · restam ' + M(bud - spent)) + '</small>'
          : (spent ? '<small class="muted">Gasto no mês: ' + M(spent) + '</small>' : '')) + '</li>';
    }).join('') + '</ul>';
    h += '<p class="muted tiny">Gastos contam despesas diretas, compras no cartão pela fatura do mês e parcelas de empréstimos pagas por você (categoria Empréstimos).</p>';
    return h;
  };

  /* ---------------- Categorias ---------------- */
  App.views.categorias = function () {
    return '<a href="#mais" class="back">‹ Mais</a><div class="section-head"><h2>Categorias</h2><button class="btn small" data-act="addCat">+ Categoria</button></div>' +
      '<ul class="list">' + this.s.categories.map((c) => '<li class="row" data-act="editCat" data-id="' + c.id + '"><span class="ico" style="background:' + c.color + '33">' + c.icon + '</span><span class="row-main"><strong>' + U.esc(c.name) + '</strong><small>' + (c.essential ? 'Essencial' : 'Não essencial') + '</small></span><span aria-hidden="true">›</span></li>').join('') + '</ul>' +
      '<p class="muted tiny">Categorias marcadas como essenciais aparecem primeiro na ordem de atenção sugerida.</p>';
  };

  function catForm(app, c) {
    const COLORS = ['#7b8cde', '#5fb49c', '#e0a458', '#e07a7a', '#b48ead', '#6aa9d8', '#8fbf6f', '#d98bb3', '#9a8c7a', '#a0a7b4'];
    F.open({
      title: c ? 'Editar categoria' : 'Nova categoria', submit: 'Salvar', values: c || { icon: '🏷️', color: COLORS[0], essential: false },
      fields: [
        { name: 'name', label: 'Nome', required: true },
        { name: 'icon', label: 'Ícone (emoji)', maxlength: 4 },
        { name: 'color', label: 'Cor', type: 'chips', compact: true, options: COLORS.map((x) => ({ value: x, label: ' ', color: x })), cls: 'color-chips' },
        { name: 'essential', type: 'toggle', text: 'Despesa essencial (moradia, alimentação, saúde...)' }
      ],
      onMount: (form, api) => {
        if (!c || c.id === 'outros') return;
        const del = document.createElement('button'); del.type = 'button'; del.className = 'btn danger ghost'; del.textContent = 'Excluir';
        form.querySelector('.btn-row').prepend(del);
        del.onclick = async () => {
          if (!(await F.confirm({ title: 'Excluir categoria?', message: 'Os lançamentos de “' + c.name + '” passarão para “Outros”.', ok: 'Excluir', danger: true }))) return;
          app.s.expenses.forEach((e) => { if (e.categoryId === c.id) e.categoryId = 'outros'; });
          app.s.cardPurchases.forEach((e) => { if (e.categoryId === c.id) e.categoryId = 'outros'; });
          delete app.s.budgets[c.id];
          app.s.categories = app.s.categories.filter((x) => x !== c); api.close(); app.save();
        };
      },
      onSubmit: (v) => {
        const obj = c || { id: 'cat_' + U.uid() };
        Object.assign(obj, { name: v.name, icon: v.icon || '🏷️', color: v.color || COLORS[0], essential: !!v.essential });
        if (!c) app.s.categories.push(obj);
        app.save();
      }
    });
  }

  /* ---------------- Backup e dados ---------------- */
  App.views.dados = function () {
    const last = this.s.settings.lastBackup;
    const canShare = shareSupported();
    return '<a href="#mais" class="back">‹ Mais</a><h2>Backup e dados</h2>' +
      '<section class="card"><h3>📲 Levar para outro aparelho</h3>' +
      '<p class="small">Os dados <strong>não sincronizam sozinhos</strong>: cada aparelho guarda os seus. Para ver no celular o que você cadastrou aqui (ou o contrário):</p>' +
      '<ol class="small steps"><li>Toque em <strong>Enviar para outro aparelho</strong> e escolha WhatsApp (a conversa “Você”/“Mensagem para mim”), Google Drive ou e-mail.</li>' +
      '<li>No outro aparelho, abra o app → <strong>Mais → Backup e dados → Restaurar backup</strong> e escolha o arquivo recebido.</li></ol>' +
      '<div class="stack"><button class="btn primary block" data-act="shareData">' + (canShare ? 'Enviar para outro aparelho' : 'Baixar arquivo para enviar') + '</button>' +
      '<button class="btn block ghost" data-act="shareData" data-photos="1">' + (canShare ? 'Enviar' : 'Baixar') + ' com as fotos dos comprovantes (arquivo maior)</button></div>' +
      '<p class="soft-warn small">⚠️ Restaurar <strong>substitui</strong> tudo no aparelho que recebe (não junta). Escolha um aparelho principal para cadastrar e use o outro para consultar.</p>' +
      (canShare ? '' : '<p class="muted tiny">Este navegador não abre o menu de compartilhamento; o arquivo é baixado e você o envia pelo WhatsApp Web, Drive ou e-mail.</p>') +
      '<p class="muted tiny">Dados deste aparelho alterados pela última vez em <strong>' + (this.s.updatedAt ? dateTime(this.s.updatedAt) : '—') + '</strong>.</p></section>' +
      '<section class="card"><h3>Onde seus dados ficam</h3>' +
      '<ul class="small"><li>Os lançamentos ficam no <strong>armazenamento local deste navegador</strong> (localStorage), <strong>somente neste aparelho</strong>.</li>' +
      '<li>As fotos ficam no banco local do navegador (IndexedDB), também só neste aparelho.</li>' +
      '<li>Nada é enviado para servidores. Não há conta, login nem nuvem nesta versão.</li>' +
      '<li><strong>Se você limpar os dados do navegador, desinstalar o navegador ou trocar de celular, os dados se perdem</strong> — a menos que tenha um backup.</li>' +
      '<li>Navegação anônima/privada apaga tudo ao fechar.</li>' +
      '<li>O armazenamento local <strong>não é protegido por senha</strong>: quem tiver acesso ao aparelho desbloqueado pode ver os dados. Use o bloqueio de tela do celular.</li></ul>' +
      '<p class="small" data-usage></p><button class="btn small ghost" data-act="persist">Pedir ao navegador para não apagar os dados automaticamente</button></section>' +
      '<section class="card"><h3>Fazer backup</h3><p class="small">Gera um arquivo <strong>.json</strong> para você guardar (Google Drive, e-mail para si mesmo, computador...). ' + (last ? 'Último backup: <strong>' + U.date(last.slice(0, 10)) + '</strong>.' : '<span class="txt-warn">Você ainda não fez backup.</span>') + '</p>' +
      '<div class="stack"><button class="btn primary block" data-act="exportData">Baixar backup (sem fotos)</button><button class="btn block" data-act="exportData" data-photos="1">Baixar backup com fotos (arquivo maior)</button></div>' +
      '<p class="muted tiny">O arquivo não é criptografado. Guarde em local de confiança.</p></section>' +
      '<section class="card"><h3>Restaurar backup</h3><p class="small">Substitui os dados atuais deste aparelho pelos do arquivo.</p>' +
      '<label class="btn block">Escolher arquivo de backup<input type="file" accept="' + this.BACKUP_ACCEPT + '" hidden data-import></label>' +
      '<p class="muted tiny">Aceita arquivos <strong>.json</strong> ou <strong>.txt</strong> gerados por esta ferramenta.</p></section>' +
      '<section class="card"><h3>Recomeçar</h3><div class="stack">' +
      (this.s.isDemo ? '<button class="btn block danger" data-act="clearDemo">Apagar dados de exemplo e começar do zero</button>' : '<button class="btn block ghost" data-act="loadDemo">Ver dados de exemplo (substitui os atuais)</button>') +
      '<button class="btn block danger ghost" data-act="wipe">Apagar todos os dados deste aparelho</button></div></section>';
  };

  /* ---------------- Instalar ---------------- */
  App.views.instalar = function () {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    return '<a href="#mais" class="back">‹ Mais</a><h2>Adicionar à tela inicial</h2>' +
      (standalone ? '<p class="soft-ok card small">Você já está usando a ferramenta como aplicativo. 🎉</p>' : '') +
      (this.installPrompt ? '<button class="btn primary block" data-act="install">Instalar agora</button>' : '') +
      '<section class="card"><h3>Android (Chrome, Edge, Samsung Internet)</h3><ol class="small"><li>Abra o menu ⋮ do navegador.</li><li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li></ol></section>' +
      '<section class="card"><h3>iPhone / iPad (Safari)</h3><ol class="small"><li>Toque no botão <strong>Compartilhar</strong> (quadrado com seta).</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li></ol><p class="muted tiny">No iPhone, use o Safari. No iOS, os dados do app na tela inicial ficam separados dos do Safari — faça um backup antes de trocar.</p></section>' +
      '<section class="card"><h3>Computador (Chrome/Edge)</h3><p class="small">Clique no ícone de instalar na barra de endereço ou no menu → <strong>Instalar</strong>.</p></section>' +
      '<section class="card"><h3>Limitações</h3><ul class="small"><li>A instalação só funciona quando a ferramenta é aberta por <strong>https</strong> ou em <strong>localhost</strong>. Aberta como arquivo ou por endereço de rede local (http://192.168...), o navegador permite usar, mas não instalar nem funcionar offline.</li>' +
      '<li>O Firefox no Android permite "Adicionar à tela inicial", mas sem todos os recursos.</li>' +
      '<li>Os dados continuam no navegador do aparelho; instalar não cria backup na nuvem.</li></ul></section>';
  };

  /* ---------------- Sobre ---------------- */
  App.views.sobre = function () {
    return '<a href="#mais" class="back">‹ Mais</a><h2>Privacidade e sobre</h2>' +
      '<section class="card small"><h3>O que esta ferramenta faz e não faz</h3><ul>' +
      '<li>Não se conecta a bancos nem cartões. Tudo é informado por você.</li>' +
      '<li>Nunca pede senhas, número completo do cartão ou código de segurança.</li>' +
      '<li>Não envia seus dados para nenhum servidor.</li>' +
      '<li>Não envia notificações por celular, e-mail ou WhatsApp: os avisos aparecem só aqui dentro.</li>' +
      '<li>Não calcula impostos, juros ou valores de quitação. Use os valores informados pela empresa e pela instituição.</li></ul></section>' +
      '<section class="card small"><h3>Leitura de notas e comprovantes</h3><p>A leitura automática usa o Tesseract.js, que roda no próprio navegador. A imagem <strong>não sai do aparelho</strong>. Na primeira leitura, o navegador baixa a biblioteca e o idioma português do CDN jsDelivr (gratuito, sem cadastro). A leitura é só uma sugestão: confira sempre antes de salvar.</p>' +
      '<p>Permissão para leitura: <strong>' + (this.s.settings.ocrConsent ? 'aceita' : 'ainda não pedida') + '</strong>' + (this.s.settings.ocrConsent ? ' <button class="link" data-act="revokeOcr">revogar</button>' : '') + '</p></section>' +
      '<section class="card small"><h3>Versão</h3><p>Primeira versão (local, sem nuvem). Os dados ficam neste navegador.</p></section>';
  };

  /* ---------------- Ações ---------------- */
  Object.assign(App.actions, {
    addGoal() { goalForm(this); },
    editGoal(el) { goalForm(this, this.s.goals.find((g) => g.id === el.dataset.id)); },
    goalAdd(el) { goalMove(this, el.dataset.id, 1); },
    goalTake(el) { goalMove(this, el.dataset.id, -1); },
    setBudget(el) {
      const v = U.parseMoney(el.value);
      if (v && v > 0) this.s.budgets[el.dataset.id] = v; else delete this.s.budgets[el.dataset.id];
      this.save();
    },
    addCat() { catForm(this); },
    editCat(el) { catForm(this, this.s.categories.find((c) => c.id === el.dataset.id)); },
    async exportData(el) {
      const withPhotos = !!el.dataset.photos;
      const file = await backupFile(this, withPhotos, false);
      downloadFile(file);
      markBackup(this);
      this.toast('Backup gerado. Guarde o arquivo em local seguro.');
    },
    // Enviar para outro aparelho: abre o menu de compartilhamento do sistema (WhatsApp, Drive, e-mail...).
    // Se o navegador não permitir, baixa o arquivo.
    async shareData(el) {
      const withPhotos = !!el.dataset.photos;
      const file = await backupFile(this, withPhotos, true);
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          markBackup(this);
          this.toast('Arquivo enviado. No outro aparelho: Mais → Backup e dados → Restaurar backup.');
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') return; // a pessoa cancelou
          // Outros erros (ex.: permissão expirou): cai para o download
        }
      }
      downloadFile(file);
      markBackup(this);
      this.toast('Arquivo baixado. Envie pelo WhatsApp, Drive ou e-mail e restaure no outro aparelho.');
    },
    async importFile(input) {
      const f = input.files && input.files[0]; if (!f) return;
      input.value = '';
      let obj;
      try { obj = JSON.parse(await f.text()); } catch (e) { return this.toast('Não foi possível ler o arquivo. Ele precisa ser um backup gerado por esta ferramenta.', 'erro'); }
      const err = Store.validateBackup(obj); if (err) return this.toast(err, 'erro');
      const d = obj.data;
      const backupTime = obj.exportedAt || '';
      const localTime = this.s && this.s.updatedAt;
      // Aviso: este aparelho tem alterações mais recentes que o backup
      const newerHere = this.s && !this.s.isDemo && localTime && backupTime && localTime > backupTime;
      const localCount = this.s ? this.s.expenses.length + this.s.incomes.length + this.s.cardPurchases.length + this.s.loans.length : 0;
      const ok = !this.s || await F.confirm({ title: 'Restaurar backup?', ok: newerHere ? 'Restaurar mesmo assim' : 'Restaurar', danger: true,
        html: '<p>Backup gerado em <strong>' + dateTime(backupTime) + '</strong>: ' + U.plural((d.expenses || []).length, 'despesa', 'despesas') + ', ' + U.plural((d.incomes || []).length, 'entrada', 'entradas') + ', ' + U.plural((d.cardPurchases || []).length, 'compra no cartão', 'compras no cartão') + ', ' + U.plural((d.loans || []).length, 'empréstimo', 'empréstimos') + (obj.photos && Object.keys(obj.photos).length ? ', ' + U.plural(Object.keys(obj.photos).length, 'foto', 'fotos') : '') + '.</p>' +
          (newerHere ? '<p class="soft-warn small">⚠️ Este aparelho tem alterações feitas em <strong>' + dateTime(localTime) + '</strong>, <strong>depois</strong> desse backup. Elas serão perdidas. Se quiser mantê-las, cancele e envie um backup <em>deste</em> aparelho para o outro.</p>' : '') +
          '<p>Os dados atuais deste aparelho' + (localCount ? ' (' + localCount + ' lançamentos)' : '') + ' serão <strong>substituídos</strong>.</p>' });
      if (!ok) return;
      await Store.importData(obj);
      this.go('#inicio'); this.render(); this.toast('Backup restaurado.');
    },
    async loadDemo() {
      if (!(await F.confirm({ title: 'Carregar dados de exemplo?', message: 'Seus dados atuais serão substituídos por dados fictícios. Faça um backup antes, se quiser mantê-los.', ok: 'Carregar exemplo', danger: true }))) return;
      Store.replace(Demo.build()); this.go('#inicio'); this.render();
    },
    async wipe() {
      if (!(await F.confirm({ title: 'Apagar todos os dados?', message: 'Todos os lançamentos, cartões, empréstimos, metas e fotos deste aparelho serão apagados. Isso não pode ser desfeito sem um backup.', ok: 'Apagar tudo', danger: true }))) return;
      localStorage.removeItem(Store.KEY); Store.state = null;
      await Store.photoClear().catch(() => {});
      this.go('#inicio'); this.render();
    },
    async persist() {
      if (!navigator.storage || !navigator.storage.persist) return this.toast('Este navegador não oferece essa opção.');
      const ok = await navigator.storage.persist();
      this.toast(ok ? 'O navegador vai manter os dados (ainda assim, faça backups).' : 'O navegador não concedeu. Instalar na tela inicial costuma ajudar. Faça backups.');
    },
    async install() {
      if (!this.installPrompt) return;
      this.installPrompt.prompt(); await this.installPrompt.userChoice.catch(() => {}); this.installPrompt = null; this.render();
    },
    revokeOcr() { this.s.settings.ocrConsent = false; this.save(); }
  });

  /* ---------------- Auxiliares de backup ---------------- */
  function dateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function shareSupported() {
    try {
      const probe = new File(['{}'], 'teste.txt', { type: 'text/plain' });
      return !!(navigator.canShare && navigator.canShare({ files: [probe] }));
    } catch (e) { return false; }
  }
  // Gera o arquivo de backup. Para compartilhar, alguns navegadores (ex.: Chrome no Android) não aceitam
  // .json — nesse caso usa .txt com o mesmo conteúdo; a restauração aceita os dois.
  async function backupFile(app, withPhotos, forShare) {
    const data = await Store.exportData(withPhotos);
    const text = JSON.stringify(data, null, 1);
    const base = 'backup-financas-' + app.today() + (withPhotos ? '-com-fotos' : '');
    let file = new File([text], base + '.json', { type: 'application/json' });
    if (forShare && navigator.canShare && !navigator.canShare({ files: [file] })) {
      file = new File([text], base + '.txt', { type: 'text/plain' });
    }
    return file;
  }
  function downloadFile(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Registrar o backup não conta como "alteração dos dados".
  function markBackup(app) { app.s.settings.lastBackup = new Date().toISOString(); Store.save(); app.render(); }

  function goalMove(app, id, sign) {
    const g = app.s.goals.find((x) => x.id === id);
    F.open({
      title: sign > 0 ? 'Guardar valor em “' + g.name + '”' : 'Retirar de “' + g.name + '”', submit: sign > 0 ? 'Guardar' : 'Retirar',
      values: { amount: sign > 0 && g.monthly ? g.monthly : null },
      fields: [{ name: 'amount', label: 'Valor', type: 'money', big: true, required: true, validate: (x) => (x > 0 ? null : 'Informe um valor.') }],
      onSubmit: (v) => { g.saved = Math.max(0, (g.saved || 0) + sign * v.amount); app.save(); app.toast(sign > 0 ? 'Valor registrado na meta. 💙' : 'Retirada registrada.'); }
    });
  }

  // Mostra uso estimado de armazenamento na tela de dados
  const origRender = App.render;
  App.render = function () {
    origRender.call(this);
    const el = U.$('[data-usage]');
    if (el && navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((e) => { el.textContent = 'Espaço usado por esta ferramenta neste navegador: cerca de ' + (e.usage / 1048576).toFixed(1) + ' MB.'; }).catch(() => {});
    }
  };
})();
