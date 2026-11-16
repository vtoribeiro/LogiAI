import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/analysis.js';
import { buildAiContext, createAiService } from '../src/ai.js';
import { createStore } from '../src/store.js';
import { readFileSync } from 'node:fs';

const files = ['pedidos', 'entregas', 'ocorrencias'].map(type => ({ name: `${type}.csv`, content: readFileSync(new URL(`../assets/examples/${type}.csv`, import.meta.url), 'utf8') }));
const analysis = analyze(files);
const validResponse = () => ({
  facts: [{ metric: 'onTimeRate', value: 50 }],
  hypotheses: [{ text: 'Investigar possíveis restrições de capacidade; causa não confirmada.', evidence: ['onTimeRate'] }],
  recommendations: [{ action: 'Revisar as entregas após o prazo.', rationale: 'A pontualidade merece investigação.', expectedEffect: 'Identificar oportunidades, sem garantia de ganho.', evidence: ['onTimeRate'] }],
  limitations: ['Amostra limitada aos arquivos enviados.'],
});
test('CA-08: adaptador simulado retorna fatos verificados e não altera indicadores', async () => {
  const before = structuredClone(analysis);
  const service = createAiService({ provider: { generate: async context => { context.metrics.orders = -1; return validResponse(); } } });
  const response = await service.diagnose(analysis);
  assert.equal(response.facts[0].value, 50); assert.deepEqual(analysis, before);
});
test('CA-14: contexto de IA contém apenas agregados, sem nomes, IDs ou textos dos CSVs', () => {
  const context = JSON.stringify(buildAiContext(analysis));
  for (const secret of ['P001', 'Rota Sul', 'Curitiba', 'pedidos.csv', 'Atraso informado', 'fingerprint']) assert.equal(context.includes(secret), false);
});
test('CA-09: sem provedor, indisponibilidade, resposta inválida e números inventados', async () => {
  await assert.rejects(createAiService().diagnose(analysis), error => error.code === 'AI_NOT_CONFIGURED');
  await assert.rejects(createAiService({ provider: { generate: async () => { throw new Error('SECRET'); } } }).diagnose(analysis), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes('SECRET'));
  for (const response of [null, {}, { ...validResponse(), facts: [{ metric: 'onTimeRate', value: 99 }] }, { ...validResponse(), facts: [{ metric: '__proto__', value: {} }] }]) {
    await assert.rejects(createAiService({ provider: { generate: async () => response } }).diagnose(analysis), error => error.code === 'AI_INVALID');
  }
});
test('CA-09: tempo limite aborta a chamada e impede chamadas simultâneas', async () => {
  let aborted = false;
  const service = createAiService({ timeoutMs: 20, provider: { generate: (_context, { signal }) => new Promise(() => signal.addEventListener('abort', () => { aborted = true; })) } });
  const first = service.diagnose(analysis);
  await assert.rejects(service.diagnose(analysis), error => error.code === 'AI_BUSY');
  await assert.rejects(first, error => error.code === 'AI_TIMEOUT'); assert.equal(aborted, true);
});
test('CA-11: armazenamento isola análises e limita capacidade, descarte e expiração', () => {
  let now = 1000;
  const store = createStore({ now: () => now, ttl: 100, capacity: 2 });
  try {
    const first = store.put({ metrics: { orders: 1 } }), second = store.put({ metrics: { orders: 2 } });
    assert.notEqual(first.id, second.id); assert.equal(store.get(first.id).metrics.orders, 1);
    assert.throws(() => store.put({}), error => error.code === 'CAPACITY');
    store.delete(first.id); assert.throws(() => store.get(first.id), error => error.code === 'ANALYSIS_EXPIRED');
    now = 1100; assert.throws(() => store.get(second.id), error => error.code === 'ANALYSIS_EXPIRED');
    assert.ok(store.put({}).id);
  } finally { store.close(); }
});
