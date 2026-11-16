import { readCsv } from './csv.js';
import { AppError } from './errors.js';
import { LIMITS, SCHEMAS } from './contract.js';

const idPattern = /^[\p{L}\p{N}._-]{1,80}$/u;
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateImport(files) {
  if (!Array.isArray(files) || !files.length || files.length > LIMITS.files) {
    throw new AppError(400, 'FILE_COUNT', `Envie de 3 a ${LIMITS.files} arquivos, incluindo os três tipos de dados.`);
  }
  let totalBytes = 0;
  for (const file of files) {
    if (typeof file?.content !== 'string') throw new AppError(400, 'INVALID_FILE', 'Conteúdo de arquivo inválido.');
    totalBytes += Buffer.byteLength(file.content, 'utf8');
    if (totalBytes > LIMITS.totalBytes) throw new AppError(413, 'TOTAL_SIZE', 'O conjunto de arquivos deve ter até 5 MiB.');
  }
  const groups = { pedidos: [], entregas: [], ocorrencias: [] };
  const issues = [], warnings = [], sources = [], present = new Set(), names = new Set();
  let issueCount = 0;
  const issue = (row, field, message) => {
    issueCount++;
    if (issues.length < LIMITS.issues) issues.push({ ...row.source, field, message });
  };
  for (const file of files) {
    if (names.has(file.name)) throw new AppError(422, 'FILE_NAME', 'Use nomes diferentes para os arquivos da mesma importação.');
    names.add(file.name);
    const parsed = readCsv(file);
    present.add(parsed.type);
    groups[parsed.type].push(...parsed.rows);
    warnings.push(...parsed.warnings);
    sources.push({ name: parsed.file, type: parsed.type, rows: parsed.rows.length, bytes: parsed.bytes });
    if (Object.values(groups).reduce((sum, rows) => sum + rows.length, 0) > LIMITS.totalRows) {
      throw new AppError(422, 'TOTAL_ROWS', 'Limite de 20.000 registros por importação excedido.');
    }
  }
  if (present.size !== 3 || !groups.pedidos.length) {
    throw new AppError(422, 'MISSING_DATA', 'Inclua pedidos com registros, entregas e ocorrências. Os dois últimos podem conter só o cabeçalho.');
  }
  const indexes = {};
  for (const [type, rows] of Object.entries(groups)) {
    const primaryKey = SCHEMAS[type][0];
    const index = new Map();
    indexes[type] = index;
    for (const row of rows) {
      for (const [field, value] of Object.entries(row.data)) {
        if (!value) issue(row, field, 'Campo obrigatório não preenchido.');
        else if (value.length > LIMITS.fieldChars) issue(row, field, 'Campo excede 120 caracteres.');
        else if (field.endsWith('_id') && !idPattern.test(value)) issue(row, field, 'ID: até 80 letras, números, ponto, hífen ou sublinhado.');
        else if (field.startsWith('data_') && !isDate(value)) issue(row, field, 'Use uma data real entre 1900 e 9999 no formato AAAA-MM-DD.');
      }
      const id = row.data[primaryKey];
      if (index.has(id)) issue(row, primaryKey, 'Identificador duplicado, inclusive entre arquivos.');
      else index.set(id, row);
    }
  }
  for (const row of groups.pedidos) {
    if (isDate(row.data.data_pedido) && isDate(row.data.data_prevista) && row.data.data_prevista < row.data.data_pedido) {
      issue(row, 'data_prevista', 'A previsão não pode anteceder a data do pedido.');
    }
  }
  const delivered = new Set();
  for (const type of ['entregas', 'ocorrencias']) {
    const dateField = type === 'entregas' ? 'data_entrega' : 'data_ocorrencia';
    for (const row of groups[type]) {
      const order = indexes.pedidos.get(row.data.pedido_id);
      if (!order) issue(row, 'pedido_id', 'Pedido não encontrado nos arquivos importados.');
      else if (isDate(row.data[dateField]) && isDate(order.data.data_pedido) && row.data[dateField] < order.data.data_pedido) {
        issue(row, dateField, 'A data não pode anteceder a data do pedido relacionado.');
      }
      if (type === 'entregas') {
        if (delivered.has(row.data.pedido_id)) issue(row, 'pedido_id', 'O contrato inicial permite somente uma entrega por pedido.');
        delivered.add(row.data.pedido_id);
      }
    }
  }
  if (issueCount) {
    throw new AppError(422, 'VALIDATION_FAILED',
      `Importação rejeitada: ${issueCount} problema(s). Nenhum registro foi utilizado. Exibindo até ${LIMITS.issues}.`, issues);
  }
  return { groups, sources, warnings };
}
