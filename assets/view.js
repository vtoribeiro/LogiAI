export const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const format = value => value === null || value === undefined ? '—' : number.format(value);
export const date = value => value?.split('-').reverse().join('/') ?? '—';
export function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function empty(container, message) {
  const box = el('div', undefined, 'empty-state');
  box.append(el('span', '◌'), el('p', message));
  container.replaceChildren(box);
}
export function renderMetrics(definitions, analysis) {
  $('metrics').replaceChildren(...definitions.map(definition => {
    const card = el('article', undefined, `metric${definition.id === 'onTimeRate' ? ' featured' : ''}`);
    const value = analysis?.metrics[definition.id];
    const displayed = format(value) + (value !== null && value !== undefined && definition.unit === '%' ? '%' : '');
    card.title = definition.formula;
    card.append(el('h3', definition.label, 'metric-label'), el('strong', displayed, 'metric-value'),
      el('p', definition.id === 'onTimeRate' ? 'Sobre as entregas concluídas' : 'Na base importada', 'metric-note'));
    return card;
  }));
}
export function renderDelivery(analysis) {
  if (!analysis) return empty($('delivery-chart'), 'Importe os arquivos para visualizar as entregas.');
  const parts = [
    { value: analysis.distribution.onTime, label: 'Dentro do prazo', className: 'on-time' },
    { value: analysis.distribution.late, label: 'Após o prazo', className: 'late' },
    { value: analysis.distribution.pending, label: 'Sem entrega', className: 'pending' },
  ];
  const ns = 'http://www.w3.org/2000/svg';
  const wrapper = el('div', undefined, 'donut-wrap');
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 160 160');
  svg.setAttribute('aria-hidden', 'true');
  let offset = 0;
  for (const part of parts) {
    const circle = document.createElementNS(ns, 'circle');
    const portion = part.value / analysis.metrics.orders * 100;
    for (const [name, value] of Object.entries({ cx: 80, cy: 80, r: 63, pathLength: 100,
      'stroke-dasharray': `${portion} ${100 - portion}`, 'stroke-dashoffset': -offset,
      class: `donut-segment ${part.className}` })) circle.setAttribute(name, String(value));
    svg.append(circle);
    offset += portion;
  }
  const center = el('div', undefined, 'donut-center');
  center.append(el('strong', format(analysis.metrics.orders)), el('small', 'pedidos na base'));
  wrapper.append(svg, center);
  const legend = el('div', undefined, 'legend');
  for (const part of parts) {
    const item = el('div', undefined, 'legend-item');
    item.append(el('span', '', `legend-dot ${part.className}`), el('span', part.label), el('strong', format(part.value)));
    legend.append(item);
  }
  $('delivery-chart').replaceChildren(wrapper, legend);
}
function paginate(container, rows, page, onChange) {
  container.replaceChildren();
  const pages = Math.ceil(rows.length / 5);
  if (pages <= 1) return;
  const previous = el('button', 'Anterior');
  const next = el('button', 'Próxima');
  previous.type = next.type = 'button';
  previous.disabled = page === 0;
  next.disabled = page >= pages - 1;
  previous.addEventListener('click', () => onChange(page - 1));
  next.addEventListener('click', () => onChange(page + 1));
  container.append(el('span', `Página ${page + 1} de ${pages}`), previous, next);
}
export function renderOccurrences(analysis, page = 0) {
  const chart = $('occurrence-chart');
  const rows = analysis?.occurrenceTypes ?? [];
  $('occurrence-total').textContent = format(analysis?.metrics.occurrences);
  paginate($('occurrence-pagination'), rows, page, next => renderOccurrences(analysis, next));
  if (!analysis) return empty(chart, 'Os tipos de ocorrência aparecerão aqui.');
  if (!rows.length) return empty(chart, 'Nenhuma ocorrência registrada na base importada.');
  chart.replaceChildren(...rows.slice(page * 5, page * 5 + 5).map(row => {
    const bar = el('div', undefined, 'bar-row');
    const label = el('div', undefined, 'bar-label');
    label.append(el('span', row.name), el('strong', format(row.count)));
    const progress = el('progress');
    progress.max = analysis.metrics.occurrences;
    progress.value = row.count;
    progress.setAttribute('aria-label', `${row.name}: ${row.count} de ${analysis.metrics.occurrences} ocorrências`);
    bar.append(label, progress);
    return bar;
  }));
}
export function renderCarriers(analysis, page = 0) {
  const rows = analysis?.carriers ?? [];
  $('carrier-count').textContent = analysis ? `${format(rows.length)} TRANSPORTADORAS` : 'SEM DADOS';
  paginate($('carrier-pagination'), rows, page, next => renderCarriers(analysis, next));
  if (!analysis) {
    const tr = el('tr'), td = el('td', 'As transportadoras dos seus arquivos aparecerão aqui.', 'table-empty');
    td.colSpan = 5; tr.append(td); $('carrier-rows').replaceChildren(tr); return;
  }
  $('carrier-rows').replaceChildren(...rows.slice(page * 5, page * 5 + 5).map(carrier => {
    const tr = el('tr');
    for (const key of ['name', 'orders', 'delivered', 'pending']) tr.append(el('td', key === 'name' ? carrier[key] : format(carrier[key])));
    const rate = el('td', undefined, 'rate-cell');
    rate.append(el('span', carrier.onTimeRate === null ? 'Indisponível' : `${format(carrier.onTimeRate)}%`));
    if (carrier.onTimeRate !== null) {
      const progress = el('progress'); progress.max = 100; progress.value = carrier.onTimeRate;
      progress.setAttribute('aria-label', `Pontualidade de ${carrier.name}`); rate.append(progress);
    }
    tr.append(rate); return tr;
  }));
}
export function renderTrace(analysis) {
  $('trace-panel').hidden = !analysis;
  const content = $('trace-content'); content.replaceChildren();
  if (!analysis) return;
  content.append(el('p', `Contrato ${analysis.contractVersion} · Análise ${analysis.id}`),
    el('p', `Identificador da base (SHA-256): ${analysis.fingerprint}`),
    el('p', `Expiração: ${new Date(analysis.expiresAt).toLocaleString('pt-BR')}. Os arquivos originais não são armazenados.`));
  for (const [heading, entries] of [
    ['Arquivos considerados', analysis.sources.map(file => `${file.name} · ${file.type} · ${format(file.rows)} registros`)],
    ['Avisos de normalização', analysis.warnings.length ? analysis.warnings.map(warning => `${warning.file}: ${warning.message}`) : ['Nenhuma normalização foi necessária.']],
    ['Limitações da análise', analysis.limitations],
  ]) {
    const list = el('ul'); list.append(...entries.map(value => el('li', value)));
    content.append(el('h3', heading), list);
  }
}
export function renderContract(config) {
  $('schemas').replaceChildren(...Object.entries(config.schemas).map(([name, fields]) => {
    const card = el('div', undefined, 'schema-card');
    const link = el('a', 'Baixar modelo ↓'); link.href = `/api/templates/${name}`; link.download = `${name}.csv`;
    card.append(link, el('h3', name), el('code', fields.join(';'))); return card;
  }));
  $('contract-rules').replaceChildren(...config.rules.map(rule => el('li', rule)));
  $('metric-definitions').replaceChildren(...config.metrics.flatMap(metric => [el('dt', metric.label), el('dd', metric.formula)]));
}
export function renderDiagnosis(diagnosis, definitions) {
  const labels = Object.fromEntries(definitions.map(metric => [metric.id, metric.label]));
  const sections = [
    ['Fatos verificados', diagnosis.facts.map(fact => `${labels[fact.metric]}: ${format(fact.value)}${fact.metric === 'onTimeRate' ? '%' : ''}.`)],
    ['Hipóteses a investigar', diagnosis.hypotheses.map(item => `${item.text} Evidências: ${item.evidence.map(key => labels[key]).join(', ')}.`)],
    ['Alternativas de ação', diagnosis.recommendations.map(item => `${item.action} ${item.rationale} Efeito esperado: ${item.expectedEffect} Evidências: ${item.evidence.map(key => labels[key]).join(', ')}.`)],
    ['Limitações', [...diagnosis.limitations, 'Hipóteses e sugestões precisam de revisão gerencial; a validação não comprova causalidade.']],
  ];
  $('ai-result').replaceChildren(...sections.map(([heading, items]) => {
    const section = el('section'), list = el('ul'); list.append(...items.map(item => el('li', item)));
    section.append(el('h3', heading), list); return section;
  }));
}
