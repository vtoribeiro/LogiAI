import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/analysis.js';
import { readCsv } from '../src/csv.js';
import { LIMITS, SCHEMAS } from '../src/contract.js';

export function sample() {
  return ['pedidos', 'entregas', 'ocorrencias'].map(type => ({
    name: `${type}.csv`, content: readFileSync(new URL(`../assets/examples/${type}.csv`, import.meta.url), 'utf8'),
  }));
}
const rejects = (files, code) => assert.throws(() => analyze(files), error => error.code === code);

test('CA-01: demonstração tem valores calculados independentemente', () => {
  const result = analyze(sample());
  assert.deepEqual(result.metrics, { orders: 6, delivered: 4, pending: 2, onTimeRate: 50, occurrences: 3 });
  assert.deepEqual(result.distribution, { onTime: 2, late: 2, pending: 2 });
  assert.deepEqual(result.period, { start: '2026-10-01', end: '2026-10-06' });
  assert.equal(result.carriers.find(carrier => carrier.name === 'Expresso Centro').onTimeRate, null);
  assert.equal(result.carriers.reduce((sum, row) => sum + row.orders, 0), 6);
  assert.equal(result.occurrenceTypes.find(type => type.name === 'Atraso informado').count, 2);
  assert.equal(result.sources.length, 3);
});
test('CA-07: reordenar arquivos e linhas mantém indicadores e impressão da base', () => {
  const initial = analyze(sample());
  const files = sample().reverse().map(file => {
    const [header, ...rows] = file.content.trim().split('\n');
    return { ...file, content: [header, ...rows.reverse()].join('\n') };
  });
  const reordered = analyze(files);
  assert.deepEqual(reordered.metrics, initial.metrics);
  assert.equal(reordered.fingerprint, initial.fingerprint);
});
test('CA-06: cabeçalhos sem entregas ou ocorrências significam ausência de registros', () => {
  const files = sample();
  files[1].content = SCHEMAS.entregas.join(';'); files[2].content = SCHEMAS.ocorrencias.join(';');
  assert.deepEqual(analyze(files).metrics, { orders: 6, delivered: 0, pending: 6, onTimeRate: null, occurrences: 0 });
});
test('zero por cento é distinto de pontualidade indisponível', () => {
  const files = sample();
  files[1].content = 'entrega_id;pedido_id;data_entrega\nE001;P001;2026-10-10';
  assert.equal(analyze(files).metrics.onTimeRate, 0);
});
test('CA-02: arquivos vazios, CSV malformado e cabeçalhos desconhecidos são rejeitados', () => {
  for (const [content, code] of [['', 'FILE_SIZE'], ['a;b\n"abc', 'INVALID_CSV'], ['x;y\na;b', 'HEADERS']]) {
    const files = sample(); files[0].content = content; rejects(files, code);
  }
  const files = sample(); files[0].content = SCHEMAS.pedidos.join(';'); rejects(files, 'MISSING_DATA');
});
test('CA-03: datas inexistentes, campo vazio e ID inválido têm origem e campo', () => {
  for (const [from, to, field] of [['2026-10-01', '2026-02-30', 'data_pedido'], ['Rota Sul', '', 'transportadora'], ['P001', '<x>', 'pedido_id']]) {
    const files = sample(); files[0].content = files[0].content.replace(from, to);
    assert.throws(() => analyze(files), error => error.code === 'VALIDATION_FAILED' &&
      error.details.some(detail => detail.file === 'pedidos.csv' && detail.line === 2 && detail.field === field));
  }
});
test('CA-04: duplicidades entre arquivos e referências inexistentes rejeitam todo o conjunto', () => {
  const files = sample(); files.push({ ...files[0], name: 'pedidos-extra.csv' }); rejects(files, 'VALIDATION_FAILED');
  const missing = sample(); missing[1].content = missing[1].content.replace('P001', 'P999'); rejects(missing, 'VALIDATION_FAILED');
});
test('CA-05: uma entrega por pedido e múltiplas ocorrências não multiplicam entregas', () => {
  const files = sample(); files[1].content += '\nE005;P001;2026-10-03'; rejects(files, 'VALIDATION_FAILED');
  assert.equal(analyze(sample()).metrics.delivered, 4);
});
test('datas dos eventos e previsão não podem anteceder o pedido', () => {
  for (const index of [0, 1, 2]) {
    const files = sample();
    const original = ['2026-10-03', '2026-10-03', '2026-10-05'][index];
    files[index].content = files[index].content.replace(original, '2026-09-01');
    rejects(files, 'VALIDATION_FAILED');
  }
});
test('BOM, CRLF, vírgulas, aspas, campos com quebras de linha e colunas reordenadas', () => {
  const file = { name: 'pedidos.csv', content: '\uFEFFdestino,pedido_id,data_pedido,data_prevista,transportadora\r\n"São Paulo, SP",P1,2026-10-01,2026-10-02,"Rota\nSul"\r\n' };
  const result = readCsv(file);
  assert.equal(result.rows[0].data.destino, 'São Paulo, SP');
  assert.equal(result.rows[0].data.transportadora, 'Rota\nSul');
  assert.equal(result.rows[0].source.line, 3);
  assert.equal(result.warnings.length, 0);
});
test('normalização e linhas vazias emitem avisos, inclusive no fim do CSV', () => {
  const files = sample(); files[0].content = files[0].content.replace('Rota Sul', ' Rota Sul ') + '\n\n';
  const result = analyze(files);
  assert.equal(result.metrics.orders, 6); assert.equal(result.warnings.length, 2);
});
test('CA-10: textos são dados e não instruções; cabeçalhos perigosos são rejeitados', () => {
  const files = sample(); files[0].content = files[0].content.replaceAll('Rota Sul', '<script>alert(1)</script>');
  assert.equal(analyze(files).carriers.some(row => row.name === '<script>alert(1)</script>'), true);
  files[0].content = files[0].content.replace('transportadora', '__proto__'); rejects(files, 'HEADERS');
});
test('múltiplos arquivos do mesmo tipo podem ser consolidados sem duplicação', () => {
  const files = sample(); const [header, ...rows] = files[0].content.trim().split('\n');
  files[0].content = [header, ...rows.slice(0, 3)].join('\n');
  files.push({ name: 'pedidos-parte-2.csv', content: [header, ...rows.slice(3)].join('\n') });
  assert.equal(analyze(files).metrics.orders, 6);
});
test('CA-12: limites de arquivos, tamanho e registros são aplicados', () => {
  rejects(Array.from({ length: 10 }, () => sample()[0]), 'FILE_COUNT');
  const oversized = sample(); oversized[0].content = 'x'.repeat(LIMITS.fileBytes + 1); rejects(oversized, 'FILE_SIZE');
  const total = Array.from({ length: 6 }, (_, i) => ({ name: `${i}.csv`, content: 'x'.repeat(LIMITS.fileBytes) }));
  rejects(total, 'TOTAL_SIZE');
  const header = SCHEMAS.entregas.join(';');
  const file = { name: 'entregas.csv', content: header + '\n' + Array.from({ length: 10000 }, (_, i) => `E${i};P${i};2026-10-01`).join('\n') };
  assert.equal(readCsv(file).rows.length, 10000);
  file.content += '\nE10001;P10001;2026-10-01';
  assert.throws(() => readCsv(file), error => error.code === 'ROW_LIMIT');
});
test('avisos de erro são limitados sem permitir a importação parcialmente inválida', () => {
  const files = sample();
  files[2].content = SCHEMAS.ocorrencias.join(';') + '\n' + Array.from({ length: 120 }, (_, i) => `O${i};P999;invalida;Atraso`).join('\n');
  assert.throws(() => analyze(files), error => error.code === 'VALIDATION_FAILED' && error.details.length === 100 && error.message.includes('240'));
});
