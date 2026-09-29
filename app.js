'use strict';

/* ==========================================================================
   Meu Dia — painel pessoal em cards: casa, cuidados, inglês, pendências
   adiadas e finanças. Sem servidor: os dados ficam no localStorage.
   ========================================================================== */

// Chave mantida desde a v1 para não perder dados; o formato é migrado em normalize().
const STORAGE_KEY = 'meu-dia:v1';
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const CATEGORIES = {
  out: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Beleza', 'Lazer', 'Educação', 'Contas', 'Compras', 'Outros'],
  in: ['Salário', 'Renda extra', 'Investimentos', 'Reembolso', 'Outros'],
};
const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const FOCUS_LIMIT = 3;
const FREQ_TYPES = {
  daily: 'Todo dia',
  weekdays: 'Dias da semana',
  weekly: '1x por semana',
  times: 'X vezes por semana',
  monthly: '1x por mês',
  interval: 'A cada N dias',
};
const DEFAULT_AREAS = [
  { id: 'casa', name: 'Casa', emoji: '🏠' },
  { id: 'cuidados', name: 'Cuidados', emoji: '💆' },
  { id: 'ingles', name: 'Inglês', emoji: '🇬🇧' },
];
const AREA_HINTS = {
  casa: { placeholder: 'Ex.: Trocar roupa de cama', freq: 'weekly' },
  cuidados: { placeholder: 'Ex.: Hidratar o cabelo', freq: 'weekly' },
  ingles: { placeholder: 'Ex.: Praticar inglês (20 min)', freq: 'times', notes: 'O que praticou, palavras novas, dúvidas…' },
};

// Sugestões com frequências comuns; a pessoa escolhe quais adicionar.
const SUGGESTIONS = {
  casa: [
    ['Lavar a louça', { type: 'daily' }],
    ['Arrumar a cama', { type: 'daily' }],
    ['Tirar o lixo', { type: 'interval', every: 2 }],
    ['Varrer ou aspirar a casa', { type: 'times', per: 2 }],
    ['Lavar roupa', { type: 'weekly' }],
    ['Limpar o banheiro', { type: 'weekly' }],
    ['Passar pano no chão', { type: 'weekly' }],
    ['Tirar o pó dos móveis', { type: 'weekly' }],
    ['Trocar as toalhas', { type: 'weekly' }],
    ['Limpar fogão e micro-ondas', { type: 'weekly' }],
    ['Fazer a lista de compras', { type: 'weekly' }],
    ['Trocar a roupa de cama', { type: 'interval', every: 14 }],
    ['Limpar a geladeira', { type: 'monthly' }],
    ['Limpar janelas e vidros', { type: 'monthly' }],
    ['Limpar os ralos', { type: 'monthly' }],
    ['Lavar cortinas e tapetes', { type: 'interval', every: 90 }],
    ['Organizar os armários', { type: 'interval', every: 90 }],
  ],
  cuidados: [
    ['Protetor solar', { type: 'daily' }],
    ['Hidratar o corpo', { type: 'daily' }],
    ['Esfoliar a pele', { type: 'weekly' }],
    ['Máscara facial', { type: 'weekly' }],
    ['Fazer as unhas', { type: 'weekly' }],
    ['Lavar os pincéis de maquiagem', { type: 'interval', every: 14 }],
    ['Trocar a escova de dentes', { type: 'interval', every: 90 }],
  ],
};
const FINANCE_TABS = { lancamentos: 'Lançamentos', compromissos: 'Compromissos', orcamento: 'Orçamento', metas: 'Metas' };

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
const daysBetween = (a, b) => Math.round((parseISODate(b) - parseISODate(a)) / 86400000);
const monthKey = iso => iso.slice(0, 7);
const shiftMonth = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthEnd = key => {
  const [y, m] = key.split('-').map(Number);
  return toISODate(new Date(y, m, 0));
};
// Semana de segunda a domingo.
const weekStart = iso => addDays(iso, -((parseISODate(iso).getDay() + 6) % 7));
const localDate = isoDateTime => toISODate(new Date(isoDateTime));

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

const esc = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = cents => brl.format(cents / 100);
const moneyInput = cents => (cents / 100).toFixed(2).replace('.', ',');

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

const newItem = (areaId, name, freq, log = {}) => ({
  id: uid(), areaId, name, freq, log, createdAt: new Date().toISOString(),
});

const defaultState = () => ({
  version: 3,
  areas: DEFAULT_AREAS.map(a => ({ ...a })),
  // items: rotinas recorrentes de qualquer card (casa, cuidados, inglês…).
  items: [
    newItem('cuidados', 'Hidratar o cabelo', { type: 'weekly' }),
    newItem('cuidados', 'Limpar a sobrancelha', { type: 'weekly' }),
    newItem('ingles', 'Praticar inglês (20 min)', { type: 'times', per: 4 }),
  ],
  notes: [],
  tasks: [], // card "Adiados"
  transactions: [],
  bills: [], // compromissos mensais; o pagamento é um lançamento com billId
  budgets: {}, // { categoria: limite mensal em centavos }
  goals: [], // metas; o valor guardado vem dos lançamentos com goalId
});

const DATA_KEYS = ['areas', 'items', 'notes', 'tasks', 'transactions', 'bills', 'goals', 'habits'];
const areaExists = (st, id) => st.areas.some(a => a.id === id);
const isPlainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);

function normalize(data) {
  const s = defaultState();
  if (!isPlainObject(data)) return s;
  for (const k of ['tasks', 'transactions', 'bills', 'goals', 'notes']) {
    if (Array.isArray(data[k])) s[k] = data[k];
  }
  if (isPlainObject(data.budgets)) s.budgets = data.budgets;

  if ((data.version || 1) >= 2) {
    if (Array.isArray(data.areas)) s.areas = data.areas;
    if (Array.isArray(data.items)) s.items = data.items;
  } else if (Array.isArray(data.habits) && data.habits.length) {
    // v1: os hábitos viram itens de um card "Hábitos", com o histórico preservado.
    s.areas.push({ id: 'habitos', name: 'Hábitos', emoji: '🔁' });
    for (const h of data.habits) {
      const freq = h.days.length === 7 ? { type: 'daily' } : { type: 'weekdays', days: h.days };
      s.items.push({ id: h.id, areaId: 'habitos', name: h.name, freq, log: h.log || {}, createdAt: h.createdAt });
    }
  }

  if ((data.version || 1) === 2) {
    // v3: sobrancelha passa a ser semanal e o inglês ganha a meta de prática semanal.
    for (const it of s.items) {
      if (it.areaId === 'cuidados' && it.name === 'Limpar a sobrancelha' && it.freq.type === 'interval' && it.freq.every === 15) {
        it.freq = { type: 'weekly' };
      }
    }
    if (areaExists(s, 'ingles') && !s.items.some(i => i.areaId === 'ingles')) {
      s.items.push(newItem('ingles', 'Praticar inglês (20 min)', { type: 'times', per: 4 }));
    }
  }
  s.version = 3;
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
  financeMonth: monthKey(todayISO()),
  txType: 'out',
  editing: null, // { kind: 'item' | 'task' | 'bill', id } em edição na tela
};

const isEditing = (kind, id) => ui.editing?.kind === kind && ui.editing.id === id;

/* ---------- rotinas recorrentes ---------- */

function freqLabel(f) {
  if (f.type === 'weekdays') return f.days.length === 7 ? 'Todo dia' : f.days.map(d => WEEKDAYS[d]).join(', ');
  if (f.type === 'interval') return `A cada ${f.every} dias`;
  if (f.type === 'times') return `${f.per}x por semana`;
  return FREQ_TYPES[f.type];
}

function lastDone(item, upTo) {
  let last = null;
  for (const d in item.log) if (item.log[d] && d <= upTo && (!last || d > last)) last = d;
  return last;
}

function nextWeekday(days, today) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, i);
    if (days.includes(parseISODate(d).getDay())) return i === 1 ? 'amanhã' : WEEKDAYS[parseISODate(d).getDay()];
  }
  return '—';
}

/*
  Situação de um item hoje.
  - done: já cumprido no período atual (dia, semana ou mês; para "a cada N dias", feito hoje).
  - show: aparece em "Para hoje". Semanais/mensais só entram nos 2 últimos dias do período,
    para a tela inicial não virar uma lista permanente de pendências.
  - late: atrasado (só para "a cada N dias").
*/
function itemStatus(item, today) {
  const f = item.freq;
  const last = lastDone(item, today);
  const doneToday = last === today;

  if (f.type === 'interval') {
    if (doneToday) return { done: true, doneToday, show: false, label: `Feito hoje · próxima em ${f.every} dias` };
    if (!last) return { done: false, show: false, label: 'Sem registro · marque quando fizer' };
    const overdue = daysBetween(addDays(last, f.every), today);
    if (overdue < 0) return { done: false, show: false, resting: true, label: `Próxima em ${plural(-overdue, 'dia', 'dias')}` };
    return {
      done: false,
      show: true,
      late: overdue > 0,
      label: overdue === 0 ? 'Hoje' : `Atrasado ${plural(overdue, 'dia', 'dias')}`,
    };
  }

  if (f.type === 'times') {
    // Meta de N vezes na semana (segunda a domingo), em qualquer dia. O check vale para hoje.
    const start = weekStart(today);
    const count = Object.keys(item.log).filter(d => item.log[d] && d >= start && d <= today).length;
    const left = daysBetween(today, addDays(start, 6)) + 1; // inclui hoje
    const need = f.per - count;
    if (need <= 0) {
      return { done: doneToday, doneToday, show: false, resting: !doneToday, count, label: `✓ Meta da semana (${count}/${f.per})` };
    }
    let label = `${count}/${f.per} na semana`;
    if (!doneToday && need >= left) label += ` · faltam ${need} em ${plural(left, 'dia', 'dias')}`;
    return { done: doneToday, doneToday, show: !doneToday, count, label };
  }

  if (f.type === 'weekdays' && !f.days.includes(parseISODate(today).getDay())) {
    return { done: false, show: false, resting: true, label: `Próxima: ${nextWeekday(f.days, today)}` };
  }

  if (f.type === 'weekly' || f.type === 'monthly') {
    const start = f.type === 'weekly' ? weekStart(today) : `${monthKey(today)}-01`;
    const end = f.type === 'weekly' ? addDays(start, 6) : monthEnd(monthKey(today));
    const done = !!last && last >= start;
    const left = daysBetween(today, end);
    let label;
    if (done) label = `Feito ${doneToday ? 'hoje' : fmtShortDate(last)}`;
    else if (left === 0) label = 'Último dia';
    else label = `Até ${f.type === 'weekly' ? 'domingo' : fmtShortDate(end)} · ${plural(left, 'dia', 'dias')}`;
    return { done, doneToday, show: !done && left <= 1, label };
  }

  // Diário ou dia da semana programado para hoje.
  return { done: doneToday, doneToday, show: !doneToday, label: doneToday ? 'Feito hoje' : 'Hoje' };
}

const doneInMonth = (item, key) => Object.keys(item.log).filter(d => item.log[d] && monthKey(d) === key).length;

function statusRank(st) {
  if (st.late) return 0;
  if (st.show) return 1;
  if (!st.done && !st.resting) return 2;
  if (st.resting) return 3;
  return 4;
}

/* ---------- finanças ---------- */

function monthSummary(key) {
  const txs = state.transactions.filter(t => monthKey(t.date) === key);
  let income = 0;
  let expense = 0;
  let saved = 0;
  const byCategory = {};
  for (const t of txs) {
    // Dinheiro movido para metas não é receita nem despesa: é "guardado".
    if (t.goalId) saved += t.type === 'out' ? t.amount : -t.amount;
    else if (t.type === 'in') income += t.amount;
    else {
      expense += t.amount;
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    }
  }
  return { txs, income, expense, saved, balance: income - expense - saved, byCategory };
}

function budgetLines(key) {
  const { byCategory } = monthSummary(key);
  return Object.entries(state.budgets)
    .map(([category, limit]) => {
      const spent = byCategory[category] || 0;
      const pct = Math.round((spent / limit) * 100);
      return { category, limit, spent, pct, level: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok' };
    })
    .sort((a, b) => b.pct - a.pct);
}

function budgetAlert(category, key) {
  const line = budgetLines(key).find(l => l.category === category);
  if (!line || line.level === 'ok') return null;
  return line.level === 'over'
    ? `⚠️ Orçamento de ${category} estourado: ${money(line.spent)} de ${money(line.limit)}.`
    : `Atenção: ${line.pct}% do orçamento de ${category} já foi usado.`;
}

const goalSaved = id =>
  state.transactions.reduce((sum, t) => (t.goalId === id ? sum + (t.type === 'out' ? t.amount : -t.amount) : sum), 0);

// Meses restantes contando o mês atual (prazo neste mês = 1).
function monthsLeft(deadline, today) {
  const a = parseISODate(today);
  const b = parseISODate(deadline);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

// Vencimento no mês; dia 31 em mês de 30 dias vira o último dia.
const billDue = (bill, key) => `${key}-${pad(Math.min(bill.day, Number(monthEnd(key).slice(8))))}`;

function billsForMonth(key, today) {
  return state.bills
    .filter(b => (b.startMonth || monthKey(localDate(b.createdAt))) <= key)
    .map(bill => {
      const due = billDue(bill, key);
      const payment = state.transactions.find(t => t.billId === bill.id && t.billMonth === key);
      return { bill, due, payment, daysLeft: daysBetween(today, due) };
    })
    .sort((a, b) => a.due.localeCompare(b.due));
}

function billLabel(row) {
  if (row.payment) return `Pago ${money(row.payment.amount)} em ${fmtShortDate(row.payment.date)}`;
  if (row.daysLeft < 0) return `<span class="neg">Venceu ${fmtShortDate(row.due)}</span>`;
  if (row.daysLeft === 0) return '<span class="warn-text">Vence hoje</span>';
  return `Vence ${fmtShortDate(row.due)} · em ${plural(row.daysLeft, 'dia', 'dias')}`;
}

/* ---------- componentes ---------- */

const list = (items, emptyText) =>
  items.length ? `<ul class="list">${items.join('')}</ul>` : `<p class="empty">${emptyText}</p>`;

const checkButton = (action, id, pressed, label) => `
  <button class="check" data-action="${action}" data-id="${id}" aria-pressed="${pressed}"
    aria-label="${pressed ? 'Desmarcar' : 'Marcar'}: ${esc(label)}">${pressed ? '✓' : ''}</button>`;

const areaById = id => state.areas.find(a => a.id === id);

function weekDots(item, today) {
  const start = weekStart(today);
  return `<div class="dots" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const wd = WEEKDAYS[parseISODate(d).getDay()];
    return `<span class="dot ${item.log[d] ? 'on' : ''} ${d > today ? 'off' : ''}" title="${wd} ${fmtShortDate(d)}">${wd[0]}</span>`;
  }).join('')}</div>`;
}

function itemRow(item, st, { showArea = false } = {}) {
  if (!showArea && isEditing('item', item.id)) return itemEditRow(item);
  const area = showArea && areaById(item.areaId);
  const tag = area
    ? `<span class="badge">${esc(area.emoji)} ${esc(area.name)}</span>`
    : `<span>${esc(freqLabel(item.freq))}</span>`;
  return `
    <li class="item ${st.done ? 'done' : ''}">
      ${checkButton('toggle-item', item.id, st.done, item.name)}
      <div class="body">
        <div class="title">${esc(item.name)}</div>
        <div class="meta">${tag}<span class="${st.late ? 'neg' : ''}">${st.label}</span>${!showArea && item.reminder ? `<span>⏰ ${esc(item.reminder.time)}</span>` : ''}</div>
        ${!showArea && item.freq.type === 'times' ? weekDots(item, todayISO()) : ''}
      </div>
      ${showArea ? '' : `<button class="icon-btn" data-action="edit" data-kind="item" data-id="${item.id}" aria-label="Editar ${esc(item.name)}">✎</button>`}
    </li>`;
}

function sortTasks(a, b) {
  const da = a.due || '9999-99-99';
  const db = b.due || '9999-99-99';
  if (da !== db) return da < db ? -1 : 1;
  return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
}

function taskRow(task, today, { compact = false } = {}) {
  if (!compact && isEditing('task', task.id)) {
    return `
      <li class="item editing">
        <form class="stack edit-form" data-form="task-edit">
          <input type="hidden" name="id" value="${task.id}">
          <input type="text" name="title" value="${esc(task.title)}" required maxlength="200" aria-label="Pendência">
          <input type="text" name="step" value="${esc(task.step || '')}" placeholder="Menor próximo passo" maxlength="160" aria-label="Próximo passo">
          <label class="muted inline-label">Prazo <input type="date" name="due" value="${task.due || ''}"></label>
          ${editButtons('delete-task', task.id)}
        </form>
      </li>`;
  }
  const late = !task.done && task.due && task.due < today;
  const age = daysBetween(localDate(task.createdAt), today);
  const meta = [];
  if (compact) meta.push('<span class="badge">⏳ Adiados</span>');
  if (task.due) meta.push(late ? `<span class="neg">Prazo: ${fmtShortDate(task.due)} (vencido)</span>` : `<span>Prazo: ${fmtShortDate(task.due)}</span>`);
  if (!task.done && age >= 7) meta.push(`<span class="${age >= 30 ? 'warn-text' : ''}">adiando há ${age} dias</span>`);
  if (task.priority === 'high') meta.push('<span class="badge high">Alta</span>');
  return `
    <li class="item ${task.done ? 'done' : ''}">
      ${checkButton('toggle-task', task.id, task.done, task.title)}
      <div class="body">
        <div class="title">${esc(task.title)}</div>
        ${task.step && !task.done ? `<div class="step">→ ${esc(task.step)}</div>` : ''}
        ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
      </div>
      ${compact || task.done ? '' : `<button class="icon-btn star" data-action="focus-task" data-id="${task.id}" aria-pressed="${!!task.focus}"
        aria-label="${task.focus ? 'Tirar do foco' : 'Focar esta semana'}">${task.focus ? '★' : '☆'}</button>`}
      ${compact ? '' : `<button class="icon-btn" data-action="edit" data-kind="task" data-id="${task.id}" aria-label="Editar">✎</button>`}
    </li>`;
}

const bar = (pct, level = 'ok') =>
  `<div class="bar"><span class="${level}" style="width:${Math.max(0, Math.min(pct, 100))}%"></span></div>`;

const monthNav = () => `
  <div class="month-nav">
    <button class="btn secondary" data-action="month" data-value="-1" aria-label="Mês anterior">‹</button>
    <strong>${fmtMonth(ui.financeMonth)}</strong>
    <button class="btn secondary" data-action="month" data-value="1" aria-label="Próximo mês">›</button>
  </div>`;

const weekdayPicker = (checked = [], name = 'days') => `
  <div class="weekdays" role="group" aria-label="Dias da semana">
    ${WEEKDAYS.map((d, i) => `<label><input type="checkbox" name="${name}" value="${i}" ${checked.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}
  </div>`;

// Campos de frequência, usados ao criar e ao editar um item.
const freqFields = (freq = {}) => `
  <div class="inline">
    <select name="freq" aria-label="Frequência" style="flex:1 1 160px">
      ${Object.entries(FREQ_TYPES).map(([k, l]) => `<option value="${k}" ${k === freq.type ? 'selected' : ''}>${l}</option>`).join('')}
    </select>
    <label class="only-interval muted">a cada <input type="number" name="every" min="1" max="365" value="${freq.every || 7}" aria-label="Número de dias"> dias</label>
    <label class="only-times muted"><input type="number" name="per" min="1" max="7" value="${freq.per || 4}" aria-label="Vezes por semana"> vezes</label>
  </div>
  <div class="only-weekdays">${weekdayPicker(freq.type === 'weekdays' ? freq.days : [])}</div>`;

function parseFreq(data) {
  const type = data.get('freq');
  if (!FREQ_TYPES[type]) return { error: 'Frequência inválida.' };
  const freq = { type };
  if (type === 'weekdays') {
    freq.days = data.getAll('days').map(Number);
    if (!freq.days.length) return { error: 'Escolha pelo menos um dia da semana.' };
  }
  if (type === 'times') {
    freq.per = Math.round(Number(data.get('per')));
    if (!(freq.per >= 1 && freq.per <= 7)) return { error: 'Informe de 1 a 7 vezes por semana.' };
  }
  if (type === 'interval') {
    freq.every = Math.round(Number(data.get('every')));
    if (!(freq.every >= 1 && freq.every <= 365)) return { error: 'Informe de 1 a 365 dias.' };
  }
  return { freq };
}

const editButtons = (deleteAction, id) => `
  <div class="inline">
    <button class="btn" type="submit" name="do" value="save">Salvar</button>
    <button class="btn secondary" type="button" data-action="cancel-edit">Cancelar</button>
    <button class="btn danger" type="button" data-action="${deleteAction}" data-id="${id}">Excluir</button>
  </div>`;

function itemEditRow(item) {
  const r = item.reminder || {};
  const rdays = r.days || (item.freq.type === 'times' ? [1, 2, 3, 4, 5] : [6]);
  return `
    <li class="item editing">
      <form class="stack edit-form" data-form="item-edit" data-freq="${item.freq.type}">
        <input type="hidden" name="id" value="${item.id}">
        <input type="text" name="name" value="${esc(item.name)}" required maxlength="120" aria-label="Nome do item">
        ${freqFields(item.freq)}
        <fieldset class="reminder stack">
          <legend>⏰ Lembrete no calendário do celular</legend>
          <label class="muted inline-label">Horário <input type="time" name="time" value="${esc(r.time || '20:00')}" required></label>
          <div class="only-rdays"><span class="muted">Lembrar nestes dias</span>${weekdayPicker(rdays, 'rdays')}</div>
          <label class="only-monthly muted inline-label">Dia do mês <input type="number" name="monthDay" min="1" max="28" value="${r.monthDay || 1}"></label>
          <button class="btn secondary" type="submit" name="do" value="calendar">📅 Adicionar ao calendário</button>
          <p class="muted small">Cria um evento repetido com alarme no Calendário. Ele toca mesmo se você já tiver feito, e mudanças aqui não
            atualizam o calendário — para mudar, apague o evento no Calendário e adicione de novo.</p>
        </fieldset>
        ${editButtons('delete-item', item.id)}
      </form>
    </li>`;
}

/* ---------- telas ---------- */

const cardLink = (href, emoji, name, lines) => `
  <a class="card area-card" href="${href}">
    <span class="emoji" aria-hidden="true">${esc(emoji)}</span>
    <span class="name">${esc(name)}</span>
    <span class="summary">${lines.map(l => `<span>${l}</span>`).join('')}</span>
  </a>`;

function areaCard(area, today) {
  const key = monthKey(today);
  const items = state.items.filter(i => i.areaId === area.id);
  const sts = items.map(i => itemStatus(i, today));
  const late = sts.filter(s => s.late).length;
  const forToday = sts.filter(s => s.show && !s.done && !s.late).length;
  const period = items.filter((it, i) => ['weekly', 'monthly'].includes(it.freq.type) && !sts[i].done && !sts[i].show).length;
  const doneMonth = items.reduce((n, it) => n + doneInMonth(it, key), 0);

  const lines = [];
  if (!items.length) lines.push('<span class="muted">Toque para adicionar itens</span>');
  else {
    if (late) lines.push(`<span class="neg">${plural(late, 'atrasado', 'atrasados')}</span>`);
    if (forToday) lines.push(`${forToday} para hoje`);
    if (period) lines.push(`${period} no prazo da semana/mês`);
    items.forEach((it, i) => {
      if (it.freq.type === 'times') lines.push(`Semana: ${sts[i].count}/${it.freq.per}${sts[i].count >= it.freq.per ? ' ✓' : ''}`);
    });
    if (!lines.length) lines.push('<span class="pos">✓ Em dia</span>');
    lines.push(`<span class="muted">${plural(doneMonth, 'feito', 'feitos')} no mês</span>`);
  }
  return cardLink(`#area/${encodeURIComponent(area.id)}`, area.emoji, area.name, lines);
}

function suggestionsBlock(areaId, itemCount) {
  const existing = new Set(state.items.filter(i => i.areaId === areaId).map(i => i.name.toLowerCase()));
  const options = (SUGGESTIONS[areaId] || [])
    .map(([name, freq], index) => ({ name, freq, index }))
    .filter(o => !existing.has(o.name.toLowerCase()));
  if (!options.length) return '';
  return `
    <details class="card add" ${itemCount < 3 ? 'open' : ''}>
      <summary>💡 Sugestões (${options.length})</summary>
      <p class="muted" style="margin:0 0 8px">Comece com 5 ou 6 — dá para adicionar mais depois. A frequência pode ser ajustada recriando o item.</p>
      <ul class="list">${options.map(o => `
        <li class="item">
          <div class="body"><div class="title">${esc(o.name)}</div><div class="meta">${esc(freqLabel(o.freq))}</div></div>
          <button class="btn secondary small" data-action="add-suggestion" data-area="${esc(areaId)}" data-index="${o.index}"
            aria-label="Adicionar ${esc(o.name)}">+ Adicionar</button>
        </li>`).join('')}
      </ul>
    </details>`;
}

const views = {
  home() {
    const today = todayISO();
    const key = monthKey(today);

    const recurring = state.items
      .filter(it => areaById(it.areaId))
      .map(it => ({ it, st: itemStatus(it, today) }))
      .filter(x => x.st.show || x.st.doneToday)
      .sort((a, b) => statusRank(a.st) - statusRank(b.st));
    const tasks = state.tasks.filter(t => !t.done && (t.focus || (t.due && t.due <= today))).sort(sortTasks);
    const bills = billsForMonth(key, today).filter(r => !r.payment && r.daysLeft <= 3);
    const warnings = budgetLines(key).filter(l => l.level !== 'ok');
    const pending = recurring.filter(x => !x.st.done).length + tasks.length + bills.length;

    const rows = [
      ...bills.map(r => `
        <li class="item">
          <span class="check static" aria-hidden="true">💳</span>
          <div class="body">
            <div class="title">${esc(r.bill.name)} · ${money(r.bill.amount)}</div>
            <div class="meta">${billLabel(r)}</div>
          </div>
          <a class="btn secondary small" href="#financas/compromissos">Pagar</a>
        </li>`),
      ...recurring.map(x => itemRow(x.it, x.st, { showArea: true })),
      ...tasks.map(t => taskRow(t, today, { compact: true })),
    ];

    const open = state.tasks.filter(t => !t.done);
    const oldest = open.reduce((max, t) => Math.max(max, daysBetween(localDate(t.createdAt), today)), 0);
    const focus = open.filter(t => t.focus).length;
    const adiadosLines = open.length
      ? [plural(open.length, 'pendência', 'pendências'),
        focus ? `⭐ ${focus} em foco` : '<span class="muted">Nenhuma em foco</span>',
        oldest >= 7 ? `<span class="muted">mais antiga: ${oldest} dias</span>` : '']
      : ['<span class="muted">Nada adiado 🎉</span>'];

    const s = monthSummary(key);
    const unpaid = billsForMonth(key, today).filter(r => !r.payment);
    const financeLines = [
      `Saldo livre <b class="${s.balance < 0 ? 'neg' : 'pos'}">${money(s.balance)}</b>`,
      unpaid.length ? plural(unpaid.length, 'conta a pagar', 'contas a pagar') : '',
      warnings.length ? `<span class="neg">${plural(warnings.length, 'alerta', 'alertas')} de orçamento</span>` : '',
    ];

    return `
      <form class="inline card capture" data-form="task">
        <input class="grow" type="text" name="title" placeholder="Anotar algo que precisa fazer…" required maxlength="200" aria-label="Nova pendência">
        <button class="btn" type="submit" aria-label="Adicionar em Adiados">+</button>
      </form>

      <h2>Para hoje ${pending ? `<span class="muted">(${pending})</span>` : ''}</h2>
      ${warnings.length ? `
        <div class="card alert stack">
          ${warnings.map(l => `<div>${l.level === 'over' ? '⚠️' : '🟡'} <b>${esc(l.category)}</b>: ${money(l.spent)} de ${money(l.limit)} (${l.pct}%)</div>`).join('')}
        </div>` : ''}
      ${list(rows, 'Nada para hoje. 🎉')}

      <h2>Seus cards</h2>
      <section class="cards">
        ${state.areas.map(a => areaCard(a, today)).join('')}
        ${cardLink('#adiados', '⏳', 'Adiados', adiadosLines.filter(Boolean))}
        ${cardLink('#financas', '💰', 'Finanças', financeLines.filter(Boolean))}
      </section>
    `;
  },

  area(id) {
    const area = areaById(id);
    if (!area) return '<p class="empty">Card não encontrado. <a href="#">Voltar ao início</a></p>';
    const today = todayISO();
    const hint = AREA_HINTS[id] || {};
    const defFreq = hint.freq || 'weekly';

    const items = state.items
      .filter(i => i.areaId === id)
      .map(it => ({ it, st: itemStatus(it, today) }))
      .sort((a, b) => statusRank(a.st) - statusRank(b.st));
    const notes = state.notes
      .filter(n => n.areaId === id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    return `
      ${list(items.map(x => itemRow(x.it, x.st)), 'Nenhum item ainda. Adicione abaixo.')}

      <details class="card add" ${items.length ? '' : 'open'}>
        <summary>+ Novo item</summary>
        <form class="stack" data-form="item" data-freq="${defFreq}">
          <input type="hidden" name="areaId" value="${esc(id)}">
          <input type="text" name="name" placeholder="${esc(hint.placeholder || 'Nome do item')}" required maxlength="120" aria-label="Nome do item">
          ${freqFields({ type: defFreq })}
          <label class="only-interval muted">Última vez que fez (opcional) <input type="date" name="last" max="${today}"></label>
          <button class="btn" type="submit">Adicionar</button>
        </form>
      </details>

      ${suggestionsBlock(id, items.length)}

      <details class="notes" ${notes.length || hint.notes ? 'open' : ''}>
        <summary><h2>Anotações <span class="muted">(${notes.length})</span></h2></summary>
        <form class="card stack" data-form="note">
          <input type="hidden" name="areaId" value="${esc(id)}">
          <textarea name="text" rows="3" required maxlength="4000" placeholder="${esc(hint.notes || 'Escreva uma anotação…')}" aria-label="Anotação"></textarea>
          <div class="inline">
            <input type="date" name="date" value="${today}" required aria-label="Data">
            <button class="btn" type="submit">Salvar</button>
          </div>
        </form>
        ${notes.length ? `<ul class="list" style="margin-top:8px">${notes.map(n => `
          <li class="item">
            <div class="body">
              <div class="meta">${fmtShortDate(n.date)}</div>
              <div class="note-text">${esc(n.text)}</div>
            </div>
            <button class="icon-btn" data-action="delete-note" data-id="${n.id}" aria-label="Excluir anotação">✕</button>
          </li>`).join('')}</ul>` : ''}
      </details>
    `;
  },

  adiados() {
    const today = todayISO();
    const open = state.tasks.filter(t => !t.done);
    const focus = open.filter(t => t.focus).sort(sortTasks);
    const dated = open.filter(t => !t.focus && t.due).sort(sortTasks);
    const undated = open.filter(t => !t.focus && !t.due).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const done = state.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 30);
    const section = (title, items) => items.length
      ? `<h2>${title} <span class="muted">(${items.length})</span></h2>${list(items.map(t => taskRow(t, today)), '')}` : '';

    return `
      <form class="card stack" data-form="task">
        <input type="text" name="title" placeholder="O que você vive adiando?" required maxlength="200" aria-label="Pendência">
        <input type="text" name="step" placeholder="Menor próximo passo (ex.: pesquisar 3 orçamentos)" maxlength="160" aria-label="Próximo passo">
        <div class="inline">
          <label class="muted" style="display:flex;align-items:center;gap:6px;flex:1">Prazo <input type="date" name="due" aria-label="Prazo (opcional)"></label>
          <button class="btn" type="submit">Adicionar</button>
        </div>
      </form>
      <p class="muted">Marque até ${FOCUS_LIMIT} com ☆ para focar nesta semana — elas aparecem em "Para hoje".</p>

      ${section('⭐ Foco da semana', focus)}
      ${section('Com prazo', dated)}
      ${section('Sem prazo · mais antigas primeiro', undated)}
      ${open.length ? '' : '<p class="empty">Nada adiado. 🎉</p>'}

      ${done.length ? `
        <details class="notes">
          <summary><h2>Concluídas <span class="muted">(${done.length})</span></h2></summary>
          ${list(done.map(t => taskRow(t, today)), '')}
        </details>` : ''}
    `;
  },

  financas(tab) {
    const current = FINANCE_TABS[tab] ? tab : 'lancamentos';
    return `
      <nav class="chips" aria-label="Seção de finanças">
        ${Object.entries(FINANCE_TABS).map(([k, label]) =>
          `<a class="chip" href="#financas/${k}" ${k === current ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
      ${financeViews[current]()}`;
  },

  mais() {
    const counts = [
      plural(state.items.length, 'rotina', 'rotinas'),
      plural(state.tasks.length, 'pendência', 'pendências'),
      plural(state.notes.length, 'anotação', 'anotações'),
      plural(state.transactions.length, 'lançamento', 'lançamentos'),
    ].join(' · ');
    return `
      <h2>Cards de rotina</h2>
      ${list(state.areas.map(a => `
        <li class="item">
          <span class="emoji-sm" aria-hidden="true">${esc(a.emoji)}</span>
          <div class="body"><div class="title">${esc(a.name)}</div>
            <div class="meta">${plural(state.items.filter(i => i.areaId === a.id).length, 'item', 'itens')}</div></div>
          <button class="icon-btn" data-action="delete-area" data-id="${esc(a.id)}" aria-label="Excluir card ${esc(a.name)}">✕</button>
        </li>`), 'Nenhum card de rotina.')}
      <form class="inline card" data-form="area" style="margin-top:8px">
        <input type="text" name="emoji" value="📌" maxlength="8" aria-label="Emoji" style="width:64px;text-align:center">
        <input class="grow" type="text" name="name" placeholder="Novo card (ex.: Academia, Plantas)" required maxlength="40" aria-label="Nome do card">
        <button class="btn" type="submit">Criar</button>
      </form>

      <h2>Seus dados</h2>
      <div class="card stack">
        <p class="muted" style="margin:0">Tudo fica salvo <b>apenas neste aparelho</b>. Se limpar os dados do navegador
          ou trocar de celular, perde o histórico — faça backup regularmente.</p>
        <p class="muted" style="margin:0">${counts}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
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

/* ---------- finanças: subabas ---------- */

const goalName = id => state.goals.find(g => g.id === id)?.name ?? 'Meta excluída';

const financeViews = {
  lancamentos() {
    const s = monthSummary(ui.financeMonth);
    const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
    const txs = [...s.txs].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const defaultDate = ui.financeMonth === monthKey(todayISO()) ? todayISO() : `${ui.financeMonth}-01`;

    return `
      ${monthNav()}
      <section class="stats four">
        <div class="card stat"><div class="label">Receitas</div><div class="value pos">${money(s.income)}</div></div>
        <div class="card stat"><div class="label">Despesas</div><div class="value neg">${money(s.expense)}</div></div>
        <div class="card stat"><div class="label">Guardado em metas</div><div class="value">${money(s.saved)}</div></div>
        <div class="card stat"><div class="label">Saldo livre</div><div class="value ${s.balance < 0 ? 'neg' : 'pos'}">${money(s.balance)}</div></div>
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
            return `<div class="bar-row"><div class="top"><span>${esc(cat)}</span><span>${money(v)} · ${pct}%</span></div>${bar(pct)}</div>`;
          }).join('')}
        </div>` : ''}

      <h2>Lançamentos</h2>
      ${list(txs.map(t => {
        const label = t.goalId ? `${t.type === 'out' ? 'Guardado' : 'Retirado'}: ${goalName(t.goalId)}` : t.description || t.category;
        const cls = t.goalId ? '' : t.type === 'in' ? 'pos' : 'neg';
        const badge = t.goalId ? '🎯 Meta' : t.billId ? `💳 ${esc(t.category)}` : esc(t.category);
        return `
        <li class="item">
          <div class="body">
            <div class="title">${esc(label)}</div>
            <div class="meta"><span>${fmtShortDate(t.date)}</span><span class="badge">${badge}</span></div>
          </div>
          <span class="amount ${cls}">${t.type === 'in' ? '+' : '−'} ${money(t.amount)}</span>
          <button class="icon-btn" data-action="delete-tx" data-id="${t.id}" aria-label="Excluir lançamento">✕</button>
        </li>`;
      }), 'Nenhum lançamento neste mês.')}
    `;
  },

  compromissos() {
    const key = ui.financeMonth;
    const rows = billsForMonth(key, todayISO());
    const paid = rows.reduce((s, r) => s + (r.payment ? r.payment.amount : 0), 0);
    const toPay = rows.reduce((s, r) => s + (r.payment ? 0 : r.bill.amount), 0);

    return `
      ${monthNav()}
      ${rows.length ? `
        <section class="stats">
          <div class="card stat"><div class="label">Total</div><div class="value">${money(paid + toPay)}</div></div>
          <div class="card stat"><div class="label">Pago</div><div class="value pos">${money(paid)}</div></div>
          <div class="card stat"><div class="label">A pagar</div><div class="value ${toPay ? 'neg' : ''}">${money(toPay)}</div></div>
        </section>` : ''}

      <h2>Contas do mês</h2>
      ${list(rows.map(r => isEditing('bill', r.bill.id) ? `
        <li class="item editing">
          <form class="stack edit-form" data-form="bill-edit">
            <input type="hidden" name="id" value="${r.bill.id}">
            <input type="text" name="name" value="${esc(r.bill.name)}" required maxlength="60" aria-label="Nome">
            <div class="inline">
              <input type="text" name="amount" inputmode="decimal" value="${moneyInput(r.bill.amount)}" required aria-label="Valor" style="flex:1 1 110px">
              <label class="muted inline-label">Dia <input type="number" name="day" min="1" max="31" value="${r.bill.day}" required></label>
              <select name="category" aria-label="Categoria" style="flex:1 1 140px">
                ${CATEGORIES.out.map(c => `<option ${c === r.bill.category ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <p class="muted small">O novo valor vale para os próximos pagamentos; os já feitos não mudam.</p>
            ${editButtons('delete-bill', r.bill.id)}
          </form>
        </li>` : `
        <li class="item wrap ${r.payment ? 'done' : ''}">
          <div class="body">
            <div class="title">${r.payment ? '✓ ' : ''}${esc(r.bill.name)}</div>
            <div class="meta"><span>${billLabel(r)}</span><span class="badge">${esc(r.bill.category)}</span></div>
          </div>
          <button class="icon-btn" data-action="edit" data-kind="bill" data-id="${r.bill.id}" aria-label="Editar compromisso">✎</button>
          ${r.payment
            ? `<button class="icon-btn" data-action="delete-tx" data-id="${r.payment.id}" aria-label="Desfazer pagamento" title="Desfazer pagamento">↺</button>`
            : `<form class="inline pay" data-form="bill-pay">
                 <input type="hidden" name="billId" value="${r.bill.id}">
                 <input type="hidden" name="month" value="${key}">
                 <input type="text" name="amount" inputmode="decimal" value="${moneyInput(r.bill.amount)}" required aria-label="Valor pago" style="flex:1 1 100px">
                 <button class="btn" type="submit">Pagar</button>
               </form>`}
        </li>`), 'Nenhum compromisso cadastrado.')}

      <h2>Novo compromisso</h2>
      <form class="inline card" data-form="bill">
        <input class="grow" type="text" name="name" placeholder="Ex.: Aluguel, luz, internet" required maxlength="60" aria-label="Nome">
        <input type="text" name="amount" inputmode="decimal" placeholder="Valor (R$)" required aria-label="Valor" style="flex:1 1 110px">
        <label class="muted" style="display:flex;align-items:center;gap:6px">Dia <input type="number" name="day" min="1" max="31" value="10" required aria-label="Dia do vencimento" style="width:70px"></label>
        <select name="category" aria-label="Categoria" style="flex:1 1 140px">
          ${CATEGORIES.out.map(c => `<option ${c === 'Contas' ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
        <button class="btn" type="submit">Adicionar</button>
      </form>
      <p class="muted">Contas que se repetem todo mês. Para contas de valor variável (luz, água), ajuste o valor na hora de pagar — o pagamento vira uma despesa em Lançamentos.</p>
    `;
  },

  orcamento() {
    const lines = budgetLines(ui.financeMonth);
    const { byCategory } = monthSummary(ui.financeMonth);
    const totalLimit = lines.reduce((s, l) => s + l.limit, 0);
    const totalSpent = lines.reduce((s, l) => s + l.spent, 0);
    const unbudgeted = Object.entries(byCategory).filter(([c]) => !(c in state.budgets));

    return `
      ${monthNav()}
      ${lines.length ? `
        <section class="stats">
          <div class="card stat"><div class="label">Orçado</div><div class="value">${money(totalLimit)}</div></div>
          <div class="card stat"><div class="label">Gasto</div><div class="value">${money(totalSpent)}</div></div>
          <div class="card stat"><div class="label">Disponível</div>
            <div class="value ${totalLimit - totalSpent < 0 ? 'neg' : 'pos'}">${money(totalLimit - totalSpent)}</div></div>
        </section>` : ''}

      <h2>Limite mensal por categoria</h2>
      <form class="inline card" data-form="budget">
        <select name="category" aria-label="Categoria" style="flex:1 1 140px">
          ${CATEGORIES.out.map(c => `<option>${c}</option>`).join('')}
        </select>
        <input type="text" name="limit" inputmode="decimal" placeholder="Limite (R$)" required aria-label="Limite mensal" style="flex:1 1 110px">
        <button class="btn" type="submit">Salvar</button>
      </form>
      <p class="muted">O limite vale para todos os meses. Salvar de novo a mesma categoria substitui o valor.</p>

      ${list(lines.map(l => {
        const rest = l.limit - l.spent;
        return `
        <li class="item">
          <div class="body">
            <div class="top-line"><span class="title">${esc(l.category)}</span><span>${money(l.spent)} / ${money(l.limit)}</span></div>
            ${bar(l.pct, l.level)}
            <div class="meta"><span class="${l.level === 'over' ? 'neg' : ''}">${rest >= 0 ? `Restam ${money(rest)}` : `Estourou ${money(-rest)}`} · ${l.pct}%</span></div>
          </div>
          <button class="icon-btn" data-action="delete-budget" data-value="${esc(l.category)}" aria-label="Remover orçamento de ${esc(l.category)}">✕</button>
        </li>`;
      }), 'Nenhum orçamento definido. Comece pelas 2 ou 3 categorias em que mais gasta.')}

      ${unbudgeted.length ? `<p class="muted">Gastos sem orçamento neste mês: ${unbudgeted
        .map(([c, v]) => `${esc(c)} ${money(v)}`).join(' · ')}</p>` : ''}
    `;
  },

  metas() {
    const today = todayISO();
    const items = state.goals.map(g => {
      const saved = goalSaved(g.id);
      const pct = Math.round((saved / g.target) * 100);
      const remaining = g.target - saved;
      let hint;
      if (remaining <= 0) hint = '🎉 Meta atingida!';
      else if (g.deadline) {
        const months = monthsLeft(g.deadline, today);
        hint = months > 0
          ? `Guarde ${money(Math.ceil(remaining / months))}/mês até ${fmtShortDate(g.deadline)} (${plural(months, 'mês', 'meses')})`
          : `<span class="neg">Prazo vencido em ${fmtShortDate(g.deadline)} · faltam ${money(remaining)}</span>`;
      } else hint = `Faltam ${money(remaining)}`;

      return `
        <li class="card stack">
          <div class="top-line">
            <strong class="title">${esc(g.name)}</strong>
            <button class="icon-btn" data-action="delete-goal" data-id="${g.id}" aria-label="Excluir meta">✕</button>
          </div>
          <div class="top-line"><span>${money(saved)} de ${money(g.target)}</span><span>${pct}%</span></div>
          ${bar(pct, remaining <= 0 ? 'done' : 'ok')}
          <div class="meta muted">${hint}</div>
          <form class="inline" data-form="goal-tx">
            <input type="hidden" name="goalId" value="${g.id}">
            <input type="text" name="amount" inputmode="decimal" placeholder="Valor (R$)" required aria-label="Valor para ${esc(g.name)}" style="flex:1 1 90px">
            <button class="btn" type="submit" name="dir" value="out">Guardar</button>
            <button class="btn secondary" type="submit" name="dir" value="in">Retirar</button>
          </form>
        </li>`;
    });

    return `
      <h2>Nova meta</h2>
      <form class="inline card" data-form="goal">
        <input class="grow" type="text" name="name" placeholder="Ex.: Reserva de emergência" required maxlength="80" aria-label="Nome da meta">
        <input type="text" name="target" inputmode="decimal" placeholder="Valor alvo (R$)" required aria-label="Valor alvo" style="flex:1 1 150px">
        <label class="muted" style="display:flex;align-items:center;gap:6px">Prazo <input type="date" name="deadline" aria-label="Prazo (opcional)"></label>
        <button class="btn" type="submit">Criar</button>
      </form>
      <p class="muted">Quando você "guarda" dinheiro numa meta, ele sai do saldo livre do mês, sem contar como despesa.</p>
      <h2>Suas metas</h2>
      ${state.goals.length ? `<ul class="list">${items.join('')}</ul>` : '<p class="empty">Nenhuma meta ainda.</p>'}
    `;
  },
};

/* ---------- lembretes via calendário (.ics) ---------- */

// Sem servidor não há notificação push; em vez disso, geramos um evento repetido
// com alarme que o app Calendário do celular importa.
const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsText = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDateTime = (iso, time) => `${iso.replace(/-/g, '')}T${time.replace(':', '')}00`;

// Primeiro dia a partir de hoje que cai num dos dias da semana.
function firstMatchingDay(days, today) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    if (days.includes(parseISODate(d).getDay())) return d;
  }
  return today;
}

function reminderRule(item, today) {
  const f = item.freq;
  const r = item.reminder;
  const byDay = days => `FREQ=WEEKLY;BYDAY=${[...days].sort().map(d => ICS_DAYS[d]).join(',')}`;
  switch (f.type) {
    case 'daily':
      return { rule: 'FREQ=DAILY', start: today };
    case 'weekdays':
      return { rule: byDay(f.days), start: firstMatchingDay(f.days, today) };
    case 'weekly':
    case 'times':
      return { rule: byDay(r.days), start: firstMatchingDay(r.days, today) };
    case 'monthly': {
      const thisMonth = `${monthKey(today)}-${pad(r.monthDay)}`;
      const start = thisMonth >= today ? thisMonth : `${shiftMonth(monthKey(today), 1)}-${pad(r.monthDay)}`;
      return { rule: `FREQ=MONTHLY;BYMONTHDAY=${r.monthDay}`, start };
    }
    default: { // interval: a partir do próximo vencimento
      const last = lastDone(item, today);
      const next = last ? addDays(last, f.every) : today;
      return { rule: `FREQ=DAILY;INTERVAL=${f.every}`, start: next > today ? next : today };
    }
  }
}

function buildICS(item) {
  const today = todayISO();
  const { rule, start } = reminderRule(item, today);
  const area = areaById(item.areaId);
  const url = `${location.href.split('#')[0]}#area/${encodeURIComponent(item.areaId)}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Meu Dia//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${item.id}@meu-dia`,
    `DTSTAMP:${stamp}`,
    // Horário "flutuante" (sem fuso): o celular usa o fuso local.
    `DTSTART:${icsDateTime(start, item.reminder.time)}`,
    'DURATION:PT15M',
    `RRULE:${rule}`,
    `SUMMARY:${icsText(`${area ? `${area.emoji} ` : ''}${item.name}`)}`,
    `DESCRIPTION:${icsText(`Marque no Meu Dia: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(item.name)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function openCalendarFile(ics, name) {
  if (isIOS()) {
    // No iPhone, abrir o conteúdo text/calendar mostra a tela "Adicionar ao Calendário".
    const url = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    if (!window.open(url, '_blank')) location.href = url;
    return;
  }
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // Só ASCII: alguns navegadores descartam nomes de arquivo com acento.
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  a.download = `${slug || 'lembrete'}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Arquivo de lembrete baixado: abra-o para adicionar ao calendário.');
}

/* ---------- navegação e renderização ---------- */

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('view-title');

function parseRoute() {
  const [view, arg] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { view: views[view] ? view : 'home', arg };
}

function viewTitle(view, arg) {
  if (view === 'area') {
    const a = areaById(arg);
    return a ? `${a.emoji} ${a.name}` : 'Card';
  }
  return { home: 'Meu Dia', adiados: '⏳ Adiados', financas: '💰 Finanças', mais: 'Configurações' }[view];
}

let renderedDay = null; // dia usado na última renderização

function render() {
  renderedDay = todayISO();
  const { view, arg } = parseRoute();
  titleEl.textContent = viewTitle(view, arg);
  document.getElementById('back').hidden = view === 'home';
  document.getElementById('settings').hidden = view !== 'home';
  const dateEl = document.getElementById('today-label');
  dateEl.hidden = view !== 'home';
  dateEl.textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  viewEl.innerHTML = views[view](arg);
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
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ---------- ações ---------- */

const byId = (arr, id) => arr.find(x => x.id === id);

const actions = {
  'toggle-item'({ id }) {
    const it = byId(state.items, id);
    if (!it) return;
    const today = todayISO();
    if (it.log[today]) delete it.log[today];
    // Semanal/mensal já feito em outro dia do período: desmarcar desfaz esse registro.
    else if (it.freq.type !== 'times' && itemStatus(it, today).done) delete it.log[lastDone(it, today)];
    else it.log[today] = true;
    commit();
  },
  'add-suggestion'({ area, index }) {
    const sug = SUGGESTIONS[area]?.[Number(index)];
    if (!sug) return;
    state.items.push(newItem(area, sug[0], { ...sug[1] }));
    commit();
    toast(`"${sug[0]}" adicionado.`);
  },
  edit({ kind, id }) {
    ui.editing = { kind, id };
    render();
    const input = viewEl.querySelector('.editing input[type="text"]');
    input?.focus();
    input?.closest('.item')?.scrollIntoView({ block: 'nearest' });
  },
  'cancel-edit'() {
    ui.editing = null;
    render();
  },
  'delete-item'({ id }) {
    const it = byId(state.items, id);
    if (!it || !confirm(`Excluir "${it.name}" e o histórico dele?`)) return;
    state.items = state.items.filter(x => x.id !== id);
    ui.editing = null;
    commit();
  },
  'delete-note'({ id }) {
    if (!confirm('Excluir esta anotação?')) return;
    state.notes = state.notes.filter(n => n.id !== id);
    commit();
  },
  'toggle-task'({ id }) {
    const t = byId(state.tasks, id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : null;
    if (t.done) t.focus = false;
    commit();
    if (t.done) toast('Menos uma! ✓');
  },
  'focus-task'({ id }) {
    const t = byId(state.tasks, id);
    if (!t) return;
    if (!t.focus && state.tasks.filter(x => x.focus && !x.done).length >= FOCUS_LIMIT) {
      return toast(`Foco demais vira foco nenhum: no máximo ${FOCUS_LIMIT} por vez.`);
    }
    t.focus = !t.focus;
    commit();
  },
  'delete-task'({ id }) {
    const t = byId(state.tasks, id);
    if (!t || !confirm(`Excluir "${t.title}"?`)) return;
    state.tasks = state.tasks.filter(x => x.id !== id);
    ui.editing = null;
    commit();
  },
  'delete-area'({ id }) {
    const a = areaById(id);
    if (!a) return;
    const n = state.items.filter(i => i.areaId === id).length;
    if (!confirm(`Excluir o card "${a.name}" com ${plural(n, 'item', 'itens')} e as anotações dele?`)) return;
    state.areas = state.areas.filter(x => x.id !== id);
    state.items = state.items.filter(i => i.areaId !== id);
    state.notes = state.notes.filter(x => x.areaId !== id);
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
    toast('Lançamento removido.');
  },
  'delete-bill'({ id }) {
    const b = byId(state.bills, id);
    if (!b || !confirm(`Excluir o compromisso "${b.name}"? Pagamentos já feitos continuam em Lançamentos.`)) return;
    state.bills = state.bills.filter(x => x.id !== id);
    ui.editing = null;
    commit();
  },
  'delete-budget'({ value }) {
    delete state.budgets[value];
    commit();
  },
  'delete-goal'({ id }) {
    const g = byId(state.goals, id);
    if (!g || !confirm(`Excluir a meta "${g.name}"? Os lançamentos já feitos continuam no histórico.`)) return;
    state.goals = state.goals.filter(x => x.id !== id);
    commit();
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
    if (!confirm('Apagar TODOS os dados? Isso não pode ser desfeito.')) return;
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
      step: (data.get('step') || '').trim(),
      due: data.get('due') || null,
      focus: false,
      done: false,
      doneAt: null,
      createdAt: new Date().toISOString(),
    });
    commit();
    toast('Anotado em Adiados.');
  },
  item(data) {
    const name = data.get('name').trim();
    if (!name) return;
    const { freq, error } = parseFreq(data);
    if (error) return toast(error);
    const log = {};
    const last = freq.type === 'interval' && data.get('last');
    if (last && last <= todayISO()) log[last] = true;
    state.items.push(newItem(data.get('areaId'), name, freq, log));
    commit();
  },
  'item-edit'(data, submitter) {
    const it = byId(state.items, data.get('id'));
    const name = data.get('name').trim();
    if (!it || !name) return;
    const { freq, error } = parseFreq(data);
    if (error) return toast(error);
    // O histórico (log) é mantido: mudar a frequência não apaga o que já foi feito.
    it.name = name;
    it.freq = freq;
    const reminder = {
      time: data.get('time') || '20:00',
      days: data.getAll('rdays').map(Number),
      monthDay: Math.min(28, Math.max(1, Math.round(Number(data.get('monthDay')) || 1))),
    };
    const toCalendar = submitter?.value === 'calendar';
    if (toCalendar && ['weekly', 'times'].includes(freq.type) && !reminder.days.length) {
      return toast('Escolha em quais dias o lembrete deve tocar.');
    }
    if (toCalendar || it.reminder) it.reminder = reminder;
    ui.editing = null;
    commit();
    if (toCalendar) openCalendarFile(buildICS(it), `lembrete-${it.name}`);
    else toast('Salvo.');
  },
  'task-edit'(data) {
    const t = byId(state.tasks, data.get('id'));
    const title = data.get('title').trim();
    if (!t || !title) return;
    Object.assign(t, { title, step: data.get('step').trim(), due: data.get('due') || null });
    ui.editing = null;
    commit();
    toast('Salvo.');
  },
  'bill-edit'(data) {
    const b = byId(state.bills, data.get('id'));
    const name = data.get('name').trim();
    const amount = parseMoney(data.get('amount'));
    const day = Math.round(Number(data.get('day')));
    if (!b || !name) return;
    if (amount === null) return toast('Valor inválido. Ex.: 120,00');
    if (!(day >= 1 && day <= 31)) return toast('Dia do vencimento deve ser de 1 a 31.');
    Object.assign(b, { name, amount, day, category: data.get('category') });
    ui.editing = null;
    commit();
    toast('Salvo.');
  },
  note(data) {
    const text = data.get('text').trim();
    if (!text) return;
    state.notes.push({ id: uid(), areaId: data.get('areaId'), date: data.get('date') || todayISO(), text, createdAt: new Date().toISOString() });
    commit();
    toast('Anotação salva.');
  },
  area(data) {
    const name = data.get('name').trim();
    if (!name) return;
    state.areas.push({ id: uid(), name, emoji: data.get('emoji').trim() || '📌' });
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
    const alert = ui.txType === 'out' && budgetAlert(data.get('category'), monthKey(date));
    toast(alert || `${ui.txType === 'in' ? 'Receita' : 'Despesa'} de ${money(amount)} lançada.`);
  },
  bill(data) {
    const name = data.get('name').trim();
    const amount = parseMoney(data.get('amount'));
    const day = Math.round(Number(data.get('day')));
    if (!name) return;
    if (amount === null) return toast('Valor inválido. Ex.: 120,00');
    if (!(day >= 1 && day <= 31)) return toast('Dia do vencimento deve ser de 1 a 31.');
    // Vencimento deste mês já passou: provavelmente já foi pago fora do app,
    // então começa a contar no mês seguinte em vez de nascer "vencido".
    const today = todayISO();
    let startMonth = ui.financeMonth;
    const bill = { id: uid(), name, amount, day, category: data.get('category'), createdAt: new Date().toISOString() };
    if (startMonth <= monthKey(today) && billDue(bill, monthKey(today)) < today) startMonth = shiftMonth(monthKey(today), 1);
    state.bills.push({ ...bill, startMonth });
    ui.financeMonth = startMonth;
    commit();
    if (startMonth > monthKey(today)) toast(`O vencimento deste mês já passou: "${name}" começa a contar em ${fmtMonth(startMonth).toLowerCase()}.`);
  },
  'bill-pay'(data) {
    const bill = byId(state.bills, data.get('billId'));
    const key = data.get('month');
    const amount = parseMoney(data.get('amount'));
    if (!bill) return;
    if (amount === null) return toast('Valor inválido.');
    if (state.transactions.some(t => t.billId === bill.id && t.billMonth === key)) return;
    // Mês passado (preenchendo histórico): registra no vencimento. Senão, hoje.
    const today = todayISO();
    const date = key < monthKey(today) ? billDue(bill, key) : today;
    state.transactions.push({
      id: uid(), type: 'out', amount, category: bill.category, description: bill.name,
      billId: bill.id, billMonth: key, date, createdAt: new Date().toISOString(),
    });
    commit();
    toast(budgetAlert(bill.category, monthKey(date)) || `${bill.name}: pago ${money(amount)}.`);
  },
  budget(data) {
    const limit = parseMoney(data.get('limit'));
    if (limit === null) return toast('Limite inválido. Ex.: 800');
    state.budgets[data.get('category')] = limit;
    commit();
  },
  goal(data) {
    const name = data.get('name').trim();
    const target = parseMoney(data.get('target'));
    if (!name) return;
    if (target === null) return toast('Valor alvo inválido. Ex.: 5.000');
    state.goals.push({ id: uid(), name, target, deadline: data.get('deadline') || null, createdAt: new Date().toISOString() });
    commit();
  },
  'goal-tx'(data, submitter) {
    const goalId = data.get('goalId');
    const type = submitter?.value === 'in' ? 'in' : 'out';
    const amount = parseMoney(data.get('amount'));
    if (amount === null) return toast('Valor inválido. Ex.: 200');
    if (type === 'in' && amount > goalSaved(goalId)) return toast('Não dá para retirar mais do que está guardado.');
    state.transactions.push({
      id: uid(), type, amount, category: 'Metas', description: '', goalId,
      date: todayISO(), createdAt: new Date().toISOString(),
    });
    commit();
    toast(`${type === 'out' ? 'Guardado' : 'Retirado'}: ${money(amount)}.`);
  },
};

viewEl.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.type === 'file') return;
  actions[el.dataset.action]?.(el.dataset);
});

viewEl.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  forms[form.dataset.form]?.(new FormData(form), e.submitter);
});

viewEl.addEventListener('change', async e => {
  if (e.target.name === 'freq') {
    e.target.form.dataset.freq = e.target.value;
    return;
  }
  if (e.target.dataset.action !== 'import') return;
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!isPlainObject(data) || !DATA_KEYS.some(k => Array.isArray(data[k]))) throw new Error('formato');
    if (!confirm('Substituir os dados atuais pelo conteúdo do backup?')) return;
    state = normalize(data);
    commit();
    toast('Backup importado.');
  } catch {
    toast('Arquivo inválido: não parece um backup do Meu Dia.');
  }
});

window.addEventListener('hashchange', () => {
  ui.editing = null;
  render();
  window.scrollTo(0, 0);
});

// Ao voltar para o app (ex.: virou o dia), atualiza a tela.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});

// App aberto na tela durante a virada do dia: atualiza as contagens sozinho.
// Não redesenha se houver algo sendo digitado ou editado, para não perder o texto.
const isTyping = () => {
  const el = document.activeElement;
  const typing = el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
  const filled = [...viewEl.querySelectorAll('input[type="text"], textarea')].some(i => i.value.trim() && !i.defaultValue);
  return typing || filled || ui.editing;
};
setInterval(() => {
  if (document.hidden || todayISO() === renderedDay || isTyping()) return;
  if (ui.financeMonth === monthKey(renderedDay)) ui.financeMonth = monthKey(todayISO()); // virada de mês
  render();
}, 60 * 1000);

save(); // grava a migração da v1, se houve
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
