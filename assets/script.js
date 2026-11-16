import { $, el, date, renderMetrics, renderDelivery, renderOccurrences, renderCarriers, renderTrace, renderContract, renderDiagnosis } from './view.js';

let config = null, selectedFiles = [], analysis = null, demo = false, busy = false, revision = 0, expiryTimer;
const status = message => { $('status-message').textContent = message; };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error?.message ?? 'Não foi possível concluir a solicitação.');
    error.details = body.error?.details ?? []; error.code = body.error?.code; throw error;
  }
  return body;
}
function showError(error) {
  $('error-panel').hidden = false;
  $('error-message').textContent = error.name === 'TimeoutError' ? 'O servidor excedeu o tempo de resposta. Tente novamente.' : error.message;
  $('error-details').replaceChildren(...(error.details ?? []).map(detail => {
    const location = [detail.file, detail.line ? `linha ${detail.line}` : '', detail.field].filter(Boolean).join(' · ');
    return el('li', `${location}${detail.message ? `: ${detail.message}` : ''}`);
  }));
}
function clearError() { $('error-panel').hidden = true; $('error-details').replaceChildren(); }
function controls() {
  $('csv-files').disabled = !config || busy;
  $('demo-button').disabled = !config || busy;
  $('analyze-button').disabled = !config || busy || !selectedFiles.length;
  $('clear-button').disabled = busy || (!analysis && !selectedFiles.length);
  $('ai-button').disabled = busy || !analysis || !config?.ai.available;
  $('analyze-button').textContent = busy ? 'Processando…' : 'Analisar arquivos →';
  $('import-form').setAttribute('aria-busy', String(busy));
}
function render() {
  renderMetrics(config?.metrics ?? [], analysis);
  renderDelivery(analysis); renderOccurrences(analysis); renderCarriers(analysis); renderTrace(analysis);
  $('period-label').textContent = analysis ? `Pedidos de ${date(analysis.period.start)} a ${date(analysis.period.end)} · Todos os registros validados` : 'Importe seus arquivos para revelar os indicadores.';
  $('data-badge').textContent = analysis ? demo ? 'Demonstração · Dados fictícios' : 'Base validada' : 'Sem dados';
  $('data-badge').className = `badge${analysis ? demo ? ' demo' : ' live' : ''}`;
  $('ai-result').replaceChildren();
  $('ai-status').textContent = config?.ai.available ? 'São enviados somente indicadores agregados, sem nomes ou IDs dos arquivos.' : 'Os indicadores funcionam independentemente da IA.';
  controls();
}
function discard() {
  revision++;
  clearTimeout(expiryTimer);
  const current = revision;
  if (analysis) request(`/api/analyses/${analysis.id}`, { method: 'DELETE' }).catch(() => {
    if (current === revision) status('Visualização limpa. Não foi possível confirmar o descarte no servidor; a análise expira automaticamente.');
  });
  analysis = null;
  $('trace-panel').open = false;
  render();
}
function validateFiles(files) {
  const limits = config.limits;
  if (!files.length || files.length > limits.files) throw new Error(`Selecione de 3 a ${limits.files} arquivos CSV.`);
  if (files.reduce((sum, file) => sum + file.size, 0) > limits.totalBytes) throw new Error('O conjunto de arquivos deve ter até 5 MiB.');
  for (const file of files) {
    if (!/\.csv$/i.test(file.name)) throw new Error(`O arquivo ${file.name} não possui extensão CSV.`);
    if (!file.size || file.size > limits.fileBytes) throw new Error(`O arquivo ${file.name} está vazio ou excede 1 MiB.`);
  }
}
function selectFiles(files, isDemo = false) {
  if (busy) return;
  discard(); clearError(); selectedFiles = []; demo = isDemo;
  try { validateFiles(files); selectedFiles = files; status('Arquivos selecionados. A validação definitiva ocorrerá ao analisar.'); }
  catch (error) { showError(error); status('Corrija a seleção de arquivos para continuar.'); }
  $('file-list').replaceChildren(...selectedFiles.map(file => el('li', file.name)));
  $('selection-count').textContent = selectedFiles.length ? `${selectedFiles.length} arquivo(s) selecionado(s)` : 'Nenhum arquivo selecionado';
  controls();
}
async function runAnalysis() {
  if (busy || !selectedFiles.length) return;
  discard(); clearError(); busy = true; controls();
  const current = revision;
  status('Validando os arquivos, relacionando os dados e calculando os indicadores…');
  try {
    const files = [];
    for (const file of selectedFiles) {
      let content;
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
      catch { throw new Error(`O arquivo ${file.name} não está em UTF-8. Converta a codificação e tente novamente.`); }
      files.push({ name: file.name, content });
    }
    const result = await request('/api/analyses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
    if (current !== revision) { request(`/api/analyses/${result.id}`, { method: 'DELETE' }).catch(() => {}); return; }
    analysis = result;
    render();
    status(demo ? 'Demonstração carregada com dados fictícios. Os mesmos validadores e cálculos são usados na importação real.' : 'Importação concluída. Todos os registros foram validados; confira a origem e os avisos ao final da página.');
    expiryTimer = setTimeout(() => {
      discard(); busy = false; controls();
      status('A análise expirou após 30 minutos. Analise os arquivos novamente para continuar.');
    }, Math.max(0, result.expiresAt - Date.now()));
  } catch (error) {
    if (current === revision) { showError(error); status('A importação não foi concluída. Nenhum resultado anterior foi reutilizado.'); }
  } finally { if (current === revision) { busy = false; controls(); } }
}

$('import-form').addEventListener('submit', event => { event.preventDefault(); runAnalysis(); });
$('csv-files').addEventListener('change', event => selectFiles([...event.target.files]));
$('clear-button').addEventListener('click', () => {
  discard(); clearError(); selectedFiles = []; demo = false;
  $('csv-files').value = ''; $('file-list').replaceChildren();
  $('selection-count').textContent = 'Nenhum arquivo selecionado'; controls(); status('Análise removida. Selecione novos arquivos para começar.');
});
for (const eventName of ['dragenter', 'dragover']) $('drop-zone').addEventListener(eventName, event => {
  event.preventDefault(); if (!busy && config) $('drop-zone').classList.add('drag-over');
});
for (const eventName of ['dragleave', 'drop']) $('drop-zone').addEventListener(eventName, event => {
  event.preventDefault(); $('drop-zone').classList.remove('drag-over');
});
$('drop-zone').addEventListener('drop', event => {
  if (config && !busy) { $('csv-files').value = ''; selectFiles([...event.dataTransfer.files]); }
});
$('demo-button').addEventListener('click', async () => {
  if (busy) return;
  busy = true; controls(); clearError();
  status('Carregando a demonstração…');
  try {
    const files = await Promise.all(['pedidos', 'entregas', 'ocorrencias'].map(async type => {
      const response = await fetch(`/assets/examples/${type}.csv`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Não foi possível carregar os arquivos de demonstração.');
      return new File([await response.text()], `demo-${type}.csv`, { type: 'text/csv' });
    }));
    busy = false; $('csv-files').value = ''; selectFiles(files, true); await runAnalysis();
  } catch (error) { showError(error); status('Não foi possível carregar a demonstração.'); }
  finally { busy = false; controls(); }
});
$('ai-button').addEventListener('click', async () => {
  if (!analysis || busy || !config.ai.available) return;
  const id = analysis.id;
  busy = true; controls(); clearError(); $('ai-result').replaceChildren();
  $('ai-status').textContent = 'Gerando diagnóstico com os indicadores validados…';
  try {
    const response = await request(`/api/analyses/${id}/diagnosis`, { method: 'POST' });
    if (analysis?.id !== id) return;
    renderDiagnosis(response.diagnosis, config.metrics);
    $('ai-status').textContent = 'Diagnóstico gerado. Revise as hipóteses e alternativas antes de tomar decisões.';
  } catch (error) {
    if (analysis?.id === id) { showError(error); $('ai-status').textContent = 'Diagnóstico não concluído. Os indicadores foram preservados.'; }
  } finally { busy = false; controls(); }
});
$('contract-button').addEventListener('click', () => $('contract-dialog').showModal());
$('close-dialog').addEventListener('click', () => $('contract-dialog').close());
for (const link of document.querySelectorAll('.nav-item')) link.addEventListener('click', () => {
  for (const item of document.querySelectorAll('.nav-item')) { item.classList.remove('active'); item.removeAttribute('aria-current'); }
  link.classList.add('active'); link.setAttribute('aria-current', 'location');
});

try {
  config = await request('/api/config'); renderContract(config); render();
  $('contract-button').disabled = false;
  if (config.ai.available) {
    document.querySelector('.ai-badge').textContent = 'IA · Groq configurada';
    $('ai-description').textContent = 'Gere hipóteses e alternativas com openai/gpt-oss-20b na Groq. Ao solicitar o diagnóstico, somente indicadores agregados e limitações serão enviados.';
  }
  status('Tudo pronto. Importe seus CSVs ou explore a demonstração com dados fictícios.');
} catch {
  showError(new Error('Não foi possível conectar ao servidor. Inicie o LogiAI com npm start e acesse o endereço local informado.'));
  status('Servidor indisponível. Recarregue a página após iniciar o aplicativo.');
}
