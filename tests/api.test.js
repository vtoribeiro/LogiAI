import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createApp } from '../src/app.js';

let app, server, base;
const files = () => ['pedidos', 'entregas', 'ocorrencias'].map(type => ({ name: `${type}.csv`, content: readFileSync(new URL(`../assets/examples/${type}.csv`, import.meta.url), 'utf8') }));
const post = values => fetch(`${base}/api/analyses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: values }) });
before(async () => {
  app = createApp();
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { app.locals.store.close(); await new Promise(resolve => server.close(resolve)); });

test('página, configuração, scripts e modelos são servidos com proteção de conteúdo', async () => {
  for (const path of ['/', '/assets/script.js', '/assets/view.js', '/assets/style.css', '/api/config', '/api/templates/pedidos']) {
    const response = await fetch(base + path); assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.equal(response.headers.get('x-powered-by'), null);
  }
  const config = await (await fetch(base + '/api/config')).json(); assert.equal(config.ai.available, false);
  const template = await fetch(base + '/api/templates/pedidos');
  assert.match(template.headers.get('content-disposition'), /pedidos\.csv/);
});
test('CA-01/09: importar, receber indicadores, recusar IA sem provedor e limpar análise', async () => {
  const response = await post(files()); assert.equal(response.status, 201);
  const result = await response.json(); assert.equal(result.metrics.onTimeRate, 50);
  assert.equal('groups' in result, false);
  const diagnosis = await fetch(`${base}/api/analyses/${result.id}/diagnosis`, { method: 'POST' });
  assert.equal(diagnosis.status, 503); assert.equal((await diagnosis.json()).error.code, 'AI_NOT_CONFIGURED');
  assert.equal(app.locals.store.get(result.id).metrics.orders, 6);
  assert.equal((await fetch(`${base}/api/analyses/${result.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${base}/api/analyses/${result.id}/diagnosis`, { method: 'POST' })).status, 404);
});
test('CA-03: conjunto inválido não é armazenado, erros incluem arquivo e linha', async () => {
  const invalid = files(); invalid[0].content = invalid[0].content.replace('2026-10-01', '2026-02-30');
  const response = await post(invalid); assert.equal(response.status, 422);
  const body = await response.json(); assert.equal(body.id, undefined);
  assert.ok(body.error.details.some(detail => detail.file === 'pedidos.csv' && detail.line === 2));
});
test('CA-11: requisições paralelas recebem IDs distintos e resultados próprios', async () => {
  const other = files(); other[1].content = 'entrega_id;pedido_id;data_entrega';
  const responses = await Promise.all([post(files()), post(other)]);
  const [a, b] = await Promise.all(responses.map(response => response.json()));
  assert.notEqual(a.id, b.id); assert.equal(a.metrics.delivered, 4); assert.equal(b.metrics.delivered, 0);
});
test('CA-14: arquivos internos, origem externa, host externo e JSON inválido são bloqueados', async () => {
  for (const path of ['/server.js', '/src/app.js', '/package.json', '/.env', '/node_modules/express/package.json', '/api/templates/__proto__']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
  const foreign = await fetch(base + '/api/config', { headers: { Origin: 'https://example.com' } }); assert.equal(foreign.status, 403);
  // fetch controla o Host; HTTP nativo permite testar a proteção contra DNS rebinding.
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(base + '/api/config', { headers: { Host: 'example.com' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end();
  });
  assert.equal(hostStatus, 403);
  const invalid = await fetch(base + '/api/analyses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{secret' });
  assert.equal(invalid.status, 400); assert.equal((await invalid.text()).includes('secret'), false);
});
