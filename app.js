'use strict';

/* ==========================================================================
   Meu Dia — tarefas, rotina e finanças em um só lugar.
   Sem servidor: os dados ficam no localStorage deste navegador.
   ========================================================================== */

const STORAGE_KEY = 'meu-dia:v1';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CATEGORIES = {
  out: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Contas', 'Compras', 'Outros'],
  in: ['Salário', 'Renda extra', 'Investimentos', 'Reembolso', 'Outros'],
};
const PRIORITY_LABEL = { high: 'Alta', normal: 'Normal', low: 'Baixa' };
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const VIEW_TITLES = { today: 'Hoje', tasks: 'Tarefas', routine: 'Rotina', finance: 'Finanças', more: 'Mais' };

/* ---------- utilidades ---------- */

const pad = n => String(n).padStart(2, '0');
// Datas sempre no fuso local: toISOString() usa UTC e "muda o dia" à noite no Brasil.
const toISODate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISODate(new Date());
const parseISODate = s => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (iso, n) => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
const monthKey = iso => iso.slice(0, 7);
const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

const esc = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = cents => brl.format(cents / 100);

const fmtShortDate = iso => parseISODate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const fmtMonth = key => {
  const s = parseISODate(`${key}-01`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Aceita "1.234,56", "1234,56", "1234.56", "1.234" e "R$ 50". Retorna centavos ou null.
function parseMoney(input) {
  let s = String(input).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const v = Number(s);
  return s !== '' && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

/* ---------- estado e persistência ---------- */

const defaultState = () => ({ version: 1, tasks: [], habits: [], transactions: [] });

function normalize(data) {
  const s = defaultState();
  if (data && typeof data === 'object') {
    for (const k of ['tasks', 'habits', 'transactions']) {
      if (Array.isArray(data[k])) s[k] = data[k];
    }
  }
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Não foi possível salvar: o armazenamento do navegador está indisponível.');
  }
}

const ui = {
  view: 'today',
  taskFilter: 'pending',
  financeMonth: monthKey(todayISO()),
  txType: 'out',
};

/* ---------- regras de negócio ---------- */

function taskBucket(task, today) {
  if (!task.due) return 'nodate';
  if (task.due < today) return 'late';
  if (task.due === today) return 'today';
  return 'upcoming';
}

function sortTasks(a, b) {
  const da = a.due || '9999-99-99';
  const db = b.due || '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
}

const isScheduled = (habit, iso) => habit.days.includes(parseISODate(iso).getDay());

// Sequência de dias programados cumpridos. Se hoje ainda não foi feito, conta a partir de ontem.
function streak(habit, today) {
  let day = habit.log[today] ? today : addDays(today, -1);
  let count = 0;
  for (let i = 0; i < 400; i++, day = addDays(day, -1)) {
    if (!isScheduled(habit, day)) continue;
    if (!habit.log[day]) break;
    count++;
  }
  return count;
}

function monthSummary(key) {
  const txs = state.transactions.filter(t => monthKey(t.date) === key);
  let income = 0;
  let expense = 0;
  const byCategory = {};
  for (const t of txs) {
    if (t.type === 'in') income += t.amount;
    else {
      expense += t.amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    }
  }
  return { txs, income, expense, balance: income - expense, byCategory };
}

/* ---------- componentes ---------- */

function taskItem(task, today) {
  const late = !task.done && task.due && task.due < today;
  const meta = [];
  if (task.due) meta.push(late ? `<span class="badge late">Atrasada · ${fmtShortDate(task.due)}</span>` : fmtShortDate(task.due));
  if (task.priority !== 'normal') meta.push(`<span class="badge ${task.priority}">${PRIORITY_LABEL[task.priority]}</span>`);
  return `
    <li class="item ${task.done ? 'done' : ''}">
      <button class="check" data-action="toggle-task" data-id="${task.id}" aria-pressed="${task.done}"
        aria-label="${task.done ? 'Reabrir' : 'Concluir'}: ${esc(task.title)}">${task.done ? '✓' : ''}</button>
      <div class="body">
        <div class="title">${esc(task.title)}</div>
        ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
      </div>
      <button class="icon-btn" data-action="delete-task" data-id="${task.id}" aria-label="Excluir tarefa">✕</button>
    </li>`;
}

function habitTodayItem(habit, today) {
  const done = !!habit.log[today];
  return `
    <li class="item ${done ? 'done' : ''}">
      <button class="check" data-action="toggle-habit" data-id="${habit.id}" data-date="${today}" aria-pressed="${done}"
        aria-label="${done ? 'Desmarcar' : 'Marcar'}: ${esc(habit.name)}">${done ? '✓' : ''}</button>
      <div class="body">
        <div class="title">${esc(habit.name)}</div>
        <div class="meta">🔥 ${streak(habit, today)} em sequência</div>
      </div>
    </li>`;
}

function taskForm(compact) {
  return `
    <form class="inline card" data-form="task">
      <input class="grow" type="text" name="title" placeholder="Nova tarefa…" required maxlength="200" aria-label="Título da tarefa">
      ${compact ? `<input type="hidden" name="due" value="${todayISO()}">` : `
      <input type="date" name="due" aria-label="Data">
      <select name="priority" aria-label="Prioridade">
        <option value="normal">Normal</option>
        <option value="high">Alta</option>
        <option value="low">Baixa</option>
      </select>`}
      <button class="btn" type="submit">Adicionar</button>
    </form>`;
}

const list = (items, emptyText) => (items.length ? `<ul class="list">${items.join('')}</ul>` : `<p class="empty">${emptyText}</p>`);

/* ---------- telas ---------- */

const views = {
  today() {
    const today = todayISO();
    const pending = state.tasks.filter(t => !t.done);
    const focus = pending.filter(t => t.due && t.due <= today).sort(sortTasks);
    const lateCount = focus.filter(t => t.due < today).length;
    const habits = state.habits.filter(h => isScheduled(h, today));
    const habitsDone = habits.filter(h => h.log[today]).length;
    const { balance } = monthSummary(monthKey(today));

    return `
      <section class="stats">
        <div class="card stat"><div class="label">Tarefas p/ hoje</div>
          <div class="value">${focus.length}${lateCount ? ` <small class="neg">(${lateCount} atrasada${lateCount > 1 ? 's' : ''})</small>` : ''}</div></div>
        <div class="card stat"><div class="label">Hábitos</div><div class="value">${habitsDone}/${habits.length}</div></div>
        <div class="card stat"><div class="label">Saldo do mês</div>
          <div class="value ${balance < 0 ? 'neg' : 'pos'}">${money(balance)}</div></div>
      </section>

      <h2>Foco de hoje</h2>
      <div class="stack">
        ${taskForm(true)}
        ${list(focus.map(t => taskItem(t, today)), 'Nada pendente para hoje. 🎉')}
      </div>

      <h2>Rotina de hoje</h2>
      ${list(habits.map(h => habitTodayItem(h, today)), 'Nenhum hábito programado para hoje. Crie um na aba Rotina.')}
    `;
  },

  tasks() {
    const today = todayISO();
    const filters = { pending: 'Pendentes', done: 'Concluídas', all: 'Todas' };
    const visible = state.tasks.filter(t =>
      ui.taskFilter === 'all' ? true : ui.taskFilter === 'done' ? t.done : !t.done
    );

    let content;
    if (ui.taskFilter === 'done') {
      const done = visible.sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
      content = list(done.map(t => taskItem(t, today)), 'Nenhuma tarefa concluída ainda.');
    } else {
      const groups = { late: 'Atrasadas', today: 'Hoje', upcoming: 'Próximas', nodate: 'Sem data' };
      const sections = Object.entries(groups)
        .map(([key, label]) => {
          const items = visible.filter(t => taskBucket(t, today) === key).sort(sortTasks);
          return items.length ? `<h2>${label} <span class="muted">(${items.length})</span></h2>${list(items.map(t => taskItem(t, today)), '')}` : '';
        })
        .join('');
      content = sections || '<p class="empty">Nenhuma tarefa por aqui.</p>';
    }

    return `
      ${taskForm(false)}
      <div class="chips" role="group" aria-label="Filtro">
        ${Object.entries(filters).map(([k, label]) =>
          `<button class="chip" data-action="task-filter" data-value="${k}" aria-pressed="${ui.taskFilter === k}">${label}</button>`).join('')}
      </div>
      ${content}
    `;
  },

  routine() {
    const today = todayISO();
    const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

    const items = state.habits.map(h => {
      const dots = last7.map(day => {
        const scheduled = isScheduled(h, day);
        const on = !!h.log[day];
        const label = `${WEEKDAYS[parseISODate(day).getDay()]} ${fmtShortDate(day)}`;
        return scheduled
          ? `<button class="dot ${on ? 'on' : ''}" data-action="toggle-habit" data-id="${h.id}" data-date="${day}"
               aria-pressed="${on}" aria-label="${esc(h.name)} — ${label}" title="${label}">${WEEKDAYS[parseISODate(day).getDay()][0]}</button>`
          : `<span class="dot off" title="${label} (não programado)">${WEEKDAYS[parseISODate(day).getDay()][0]}</span>`;
      }).join('');
      const days = h.days.length === 7 ? 'Todos os dias' : h.days.map(d => WEEKDAYS[d]).join(', ');
      return `
        <li class="item">
          <div class="body">
            <div class="title">${esc(h.name)}</div>
            <div class="meta"><span>${days}</span><span>🔥 ${streak(h, today)}</span></div>
            <div class="dots">${dots}</div>
          </div>
          <button class="icon-btn" data-action="delete-habit" data-id="${h.id}" aria-label="Excluir hábito">✕</button>
        </li>`;
    });

    return `
      <form class="inline card" data-form="habit">
        <input class="grow" type="text" name="name" placeholder="Novo hábito (ex.: beber 2L de água)" required maxlength="120" aria-label="Nome do hábito">
        <button class="btn" type="submit">Adicionar</button>
        <div class="weekdays" role="group" aria-label="Dias da semana">
          ${WEEKDAYS.map((d, i) => `<label><input type="checkbox" name="days" value="${i}" checked><span>${d}</span></label>`).join('')}
        </div>
      </form>
      <h2>Seus hábitos <span class="muted">· últimos 7 dias</span></h2>
      ${list(items, 'Nenhum hábito ainda. Comece com algo pequeno.')}
    `;
  },

  finance() {
    const s = monthSummary(ui.financeMonth);
    const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
    const txs = [...s.txs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const defaultDate = ui.financeMonth === monthKey(todayISO()) ? todayISO() : `${ui.financeMonth}-01`;

    return `
      <div class="month-nav">
        <button class="btn secondary" data-action="month" data-value="-1" aria-label="Mês anterior">‹</button>
        <strong>${fmtMonth(ui.financeMonth)}</strong>
        <button class="btn secondary" data-action="month" data-value="1" aria-label="Próximo mês">›</button>
      </div>

      <section class="stats">
        <div class="card stat"><div class="label">Receitas</div><div class="value pos">${money(s.income)}</div></div>
        <div class="card stat"><div class="label">Despesas</div><div class="value neg">${money(s.expense)}</div></div>
        <div class="card stat"><div class="label">Saldo</div><div class="value ${s.balance < 0 ? 'neg' : 'pos'}">${money(s.balance)}</div></div>
      </section>

      <h2>Novo lançamento</h2>
      <div class="chips" role="group" aria-label="Tipo">
        <button class="chip" data-action="tx-type" data-value="out" aria-pressed="${ui.txType === 'out'}">Despesa</button>
        <button class="chip" data-action="tx-type" data-value="in" aria-pressed="${ui.txType === 'in'}">Receita</button>
      </div>
      <form class="inline card" data-form="tx">
        <input type="text" name="amount" inputmode="decimal" placeholder="Valor (R$)" required aria-label="Valor" style="flex:1 1 110px">
        <select name="category" aria-label="Categoria" style="flex:1 1 140px">
          ${CATEGORIES[ui.txType].map(c => `<option>${c}</option>`).join('')}
        </select>
        <input class="grow" type="text" name="description" placeholder="Descrição (opcional)" maxlength="120" aria-label="Descrição">
        <input type="date" name="date" value="${defaultDate}" required aria-label="Data">
        <button class="btn" type="submit">Lançar</button>
      </form>

      ${cats.length ? `
        <h2>Para onde foi o dinheiro</h2>
        <div class="card bars">
          ${cats.map(([cat, v]) => {
            const pct = Math.round((v / s.expense) * 100);
            return `<div class="bar-row"><div class="top"><span>${esc(cat)}</span><span>${money(v)} · ${pct}%</span></div>
              <div class="bar"><span style="width:${pct}%"></span></div></div>`;
          }).join('')}
        </div>` : ''}

      <h2>Lançamentos</h2>
      ${list(txs.map(t => `
        <li class="item">
          <div class="body">
            <div class="title">${esc(t.description || t.category)}</div>
            <div class="meta"><span>${fmtShortDate(t.date)}</span><span class="badge">${esc(t.category)}</span></div>
          </div>
          <span class="amount ${t.type === 'in' ? 'pos' : 'neg'}">${t.type === 'in' ? '+' : '−'} ${money(t.amount)}</span>
          <button class="icon-btn" data-action="delete-tx" data-id="${t.id}" aria-label="Excluir lançamento">✕</button>
        </li>`), 'Nenhum lançamento neste mês.')}
    `;
  },

  more() {
    const counts = `${state.tasks.length} tarefas · ${state.habits.length} hábitos · ${state.transactions.length} lançamentos`;
    return `
      <div class="card stack">
        <strong>Seus dados</strong>
        <p class="muted" style="margin:0">Tudo fica salvo <b>apenas neste navegador</b>. Se você limpar os dados do navegador
          ou trocar de aparelho, perde o histórico — faça backup regularmente.</p>
        <p class="muted" style="margin:0">${counts}</p>
        <div class="inline" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" data-action="export">Exportar backup</button>
          <label class="btn secondary" style="display:inline-flex;align-items:center">
            Importar backup<input type="file" accept="application/json,.json" data-action="import" hidden>
          </label>
        </div>
      </div>
      <h2>Zona de perigo</h2>
      <div class="card"><button class="btn danger" data-action="reset">Apagar todos os dados</button></div>
    `;
  },
};

/* ---------- renderização ---------- */

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('view-title');

function render() {
  titleEl.textContent = VIEW_TITLES[ui.view];
  document.getElementById('today-label').textContent = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  viewEl.innerHTML = views[ui.view]();
  document.querySelectorAll('.tabbar button').forEach(b => {
    if (b.dataset.view === ui.view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
}

function commit() {
  save();
  render();
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- ações ---------- */

const byId = (arr, id) => arr.find(x => x.id === id);

const actions = {
  'toggle-task'({ id }) {
    const t = byId(state.tasks, id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    commit();
  },
  'delete-task'({ id }) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    commit();
  },
  'task-filter'({ value }) {
    ui.taskFilter = value;
    render();
  },
  'toggle-habit'({ id, date }) {
    const h = byId(state.habits, id);
    if (!h) return;
    if (h.log[date]) delete h.log[date];
    else h.log[date] = true;
    commit();
  },
  'delete-habit'({ id }) {
    const h = byId(state.habits, id);
    if (!h || !confirm(`Excluir o hábito "${h.name}" e todo o histórico dele?`)) return;
    state.habits = state.habits.filter(x => x.id !== id);
    commit();
  },
  month({ value }) {
    ui.financeMonth = shiftMonth(ui.financeMonth, Number(value));
    render();
  },
  'tx-type'({ value }) {
    ui.txType = value;
    render();
  },
  'delete-tx'({ id }) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    commit();
    toast('Lançamento excluído.');
  },
  export() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meu-dia-backup-${todayISO()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset() {
    if (!confirm('Apagar TODAS as tarefas, hábitos e lançamentos? Isso não pode ser desfeito.')) return;
    state = defaultState();
    commit();
    toast('Dados apagados.');
  },
};

const forms = {
  task(data) {
    const title = data.get('title').trim();
    if (!title) return;
    state.tasks.push({
      id: uid(),
      title,
      due: data.get('due') || null,
      priority: data.get('priority') || 'normal',
      done: false,
      doneAt: null,
      createdAt: new Date().toISOString(),
    });
    commit();
    viewEl.querySelector('[data-form="task"] input[name="title"]')?.focus();
  },
  habit(data) {
    const name = data.get('name').trim();
    const days = data.getAll('days').map(Number);
    if (!name) return;
    if (!days.length) return toast('Escolha pelo menos um dia da semana.');
    state.habits.push({ id: uid(), name, days, log: {}, createdAt: new Date().toISOString() });
    commit();
  },
  tx(data) {
    const amount = parseMoney(data.get('amount'));
    if (amount === null) return toast('Valor inválido. Ex.: 49,90');
    const date = data.get('date');
    state.transactions.push({
      id: uid(),
      type: ui.txType,
      amount,
      category: data.get('category'),
      description: data.get('description').trim(),
      date,
      createdAt: new Date().toISOString(),
    });
    ui.financeMonth = monthKey(date);
    commit();
    toast(`${ui.txType === 'in' ? 'Receita' : 'Despesa'} de ${money(amount)} lançada.`);
  },
};

document.querySelector('.tabbar').addEventListener('click', e => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  ui.view = btn.dataset.view;
  render();
  window.scrollTo(0, 0);
});

viewEl.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.type === 'file') return;
  actions[el.dataset.action]?.(el.dataset);
});

viewEl.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  forms[form.dataset.form]?.(new FormData(form));
});

viewEl.addEventListener('change', async e => {
  if (e.target.dataset.action !== 'import') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !['tasks', 'habits', 'transactions'].some(k => Array.isArray(data[k]))) throw new Error('formato');
    if (!confirm('Substituir os dados atuais pelo conteúdo do backup?')) return;
    state = normalize(data);
    commit();
    toast('Backup importado.');
  } catch {
    toast('Arquivo inválido: não parece um backup do Meu Dia.');
  }
});

// Ao voltar para o app (ex.: virou o dia), atualiza a tela.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
