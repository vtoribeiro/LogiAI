import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGroqProvider, GROQ_MODEL } from '../src/providers/groq.js';
import { createAiService } from '../src/ai.js';
import { createApp } from '../src/app.js';

const analysis = {
  contractVersion: 'mvp-1', metrics: { orders: 6, delivered: 4, pending: 2, onTimeRate: 50, occurrences: 3 },
  distribution: { onTime: 2, late: 2, pending: 2 }, limitations: ['Apenas arquivos enviados.'],
  sources: [{ name: 'arquivo-privado.csv' }], carriers: [{ name: 'Empresa privada' }],
};
const diagnosis = () => ({
  facts: [{ metric: 'onTimeRate', value: 50 }], hypotheses: [],
  recommendations: [{ action: 'Revisar planejamento.', rationale: 'Pontualidade observada.', expectedEffect: 'Identificar oportunidades sem garantia.', evidence: ['onTimeRate'] }],
  limitations: ['Causa não comprovada.'],
});
const reply = (value = diagnosis(), finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content: JSON.stringify(value) } }] });
const service = fetchImpl => createAiService({ provider: createGroqProvider({ apiKey: 'test-only-not-a-real-key', fetchImpl }) });

test('Groq usa endpoint e modelo escolhidos, JSON Schema estrito e somente agregados', async () => {
  let calls = 0;
  const ai = service(async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-only-not-a-real-key');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, GROQ_MODEL); assert.equal(body.max_completion_tokens, 4096);
    assert.equal(body.response_format.type, 'json_schema'); assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.additionalProperties, false);
    assert.equal(body.tools, undefined);
    const context = JSON.parse(body.messages[1].content);
    assert.deepEqual(Object.keys(context), ['contractVersion', 'metrics', 'distribution', 'limitations']);
    assert.equal(options.body.includes('Empresa privada'), false); assert.equal(options.body.includes('arquivo-privado'), false);
    return reply();
  });
  assert.deepEqual(await ai.diagnose(analysis), diagnosis()); assert.equal(calls, 1);
});
test('chave ausente mantém IA desabilitada', () => {
  assert.equal(createGroqProvider(), null);
  assert.equal(createGroqProvider({ apiKey: '  ' }), null);
  assert.equal(createAiService({ provider: createGroqProvider() }).available, false);
});
test('401/403, 429 e indisponibilidade não vazam detalhes nem repetem chamadas', async () => {
  for (const [status, code] of [[401, 'AI_AUTH'], [403, 'AI_AUTH'], [429, 'AI_RATE_LIMIT'], [500, 'AI_UNAVAILABLE'], [400, 'AI_UNAVAILABLE']]) {
    let calls = 0;
    const ai = service(async () => { calls++; return new Response('secret-provider-response', { status }); });
    const original = structuredClone(analysis);
    await assert.rejects(ai.diagnose(analysis), error => error.code === code && !error.message.includes('secret'));
    assert.equal(calls, 1); assert.deepEqual(analysis, original);
  }
});
test('respostas truncadas, recusadas, JSON inválido e fatos inventados são rejeitados', async () => {
  for (const makeResponse of [
    () => reply(diagnosis(), 'length'), () => new Response('not-json'),
    () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{invalid' } }] }),
    () => Response.json({ choices: [{ finish_reason: 'stop', message: { refusal: 'refused', content: '{}' } }] }),
    () => reply({ ...diagnosis(), facts: [{ metric: 'onTimeRate', value: 100 }] }), () => reply({}),
  ]) await assert.rejects(service(async () => makeResponse()).diagnose(analysis), error => error.code === 'AI_INVALID');
});
test('falha de rede é sanitizada e cancelamento chega ao fetch', async () => {
  await assert.rejects(service(async () => { throw new Error('secret-network'); }).diagnose(analysis), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes('secret'));
  let aborted = false;
  const provider = createGroqProvider({ apiKey: 'test-only', fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('abort')); });
  }) });
  await assert.rejects(createAiService({ provider, timeoutMs: 10 }).diagnose(analysis), error => error.code === 'AI_TIMEOUT');
  assert.equal(aborted, true);
});
test('API publica disponibilidade sem chave e preserva análise após falha Groq', async () => {
  let status = 200;
  const app = createApp({ ai: service(async () => status === 200 ? reply() : new Response('secret', { status })) });
  const entry = app.locals.store.put(structuredClone(analysis));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const config = await (await fetch(base + '/api/config')).json();
    assert.equal(config.ai.available, true); assert.equal(JSON.stringify(config).includes('test-only'), false);
    const valid = await fetch(`${base}/api/analyses/${entry.id}/diagnosis`, { method: 'POST' });
    assert.equal(valid.status, 200); assert.deepEqual((await valid.json()).diagnosis, diagnosis());
    status = 429;
    const limited = await fetch(`${base}/api/analyses/${entry.id}/diagnosis`, { method: 'POST' });
    assert.equal(limited.status, 429); assert.equal((await limited.json()).error.code, 'AI_RATE_LIMIT');
    assert.deepEqual(app.locals.store.get(entry.id).metrics, analysis.metrics);
    assert.equal((await fetch(base + '/.env')).status, 404);
  } finally { app.locals.store.close(); await new Promise(resolve => server.close(resolve)); }
});
test('.env é opcional, é carregado localmente e não sobrescreve o ambiente', () => {
  const directory = mkdtempSync(join(tmpdir(), 'logiai-env-'));
  const path = join(directory, '.env');
  writeFileSync(path, 'LOGIAI_TEST_SETTING=from-file\n');
  const moduleUrl = new URL('../src/config.js', import.meta.url).href;
  const code = `import {loadLocalEnv} from ${JSON.stringify(moduleUrl)}; loadLocalEnv(process.argv[1]); console.log(process.env.LOGIAI_TEST_SETTING ?? 'absent');`;
  const cleanEnv = { ...process.env }; delete cleanEnv.LOGIAI_TEST_SETTING;
  const run = (file, env) => execFileSync(process.execPath, ['--input-type=module', '-e', code, file], { env, encoding: 'utf8' }).trim();
  try {
    assert.equal(run(path, cleanEnv), 'from-file');
    assert.equal(run(path, { ...cleanEnv, LOGIAI_TEST_SETTING: 'from-shell' }), 'from-shell');
    assert.equal(run(join(directory, 'absent.env'), cleanEnv), 'absent');
  } finally { rmSync(path); rmdirSync(directory); }
});
