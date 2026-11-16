import { parse } from 'csv-parse/sync';
import { AppError } from './errors.js';
import { LIMITS, SCHEMAS } from './contract.js';

export function readCsv(file) {
  if (!file || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 160 ||
      typeof file.content !== 'string' || !/\.csv$/i.test(file.name)) {
    throw new AppError(400, 'INVALID_FILE', 'Envie arquivos CSV com nome e conteúdo válidos.');
  }
  const bytes = Buffer.byteLength(file.content, 'utf8');
  if (!bytes || bytes > LIMITS.fileBytes) {
    throw new AppError(422, 'FILE_SIZE', 'Arquivo vazio ou maior que 1 MiB.', [{ file: file.name }]);
  }
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u.test(file.content)) {
    throw new AppError(422, 'ENCODING', 'Use CSV em UTF-8, sem caracteres de controle.', [{ file: file.name }]);
  }
  const firstLine = file.content.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).find(line => line.trim());
  if (!firstLine) throw new AppError(422, 'EMPTY_FILE', 'O arquivo não possui cabeçalho.', [{ file: file.name }]);
  const delimiter = firstLine.includes(';') ? ';' : ',';
  let parsed;
  try {
    parsed = parse(file.content, {
      bom: true, delimiter, skip_empty_lines: true, info: true,
      max_record_size: LIMITS.recordChars,
      to: LIMITS.rowsPerFile + 2,
    });
  } catch (error) {
    throw new AppError(422, 'INVALID_CSV', 'CSV malformado: confira aspas e quantidade de colunas.',
      [{ file: file.name, line: error.lines ?? null }]);
  }
  const headers = parsed[0]?.record.map(value => value.trim());
  const type = Object.keys(SCHEMAS).find(key =>
    headers?.length === SCHEMAS[key].length && SCHEMAS[key].every(column => headers.includes(column)));
  if (!type || new Set(headers).size !== headers.length) {
    throw new AppError(422, 'HEADERS', 'Cabeçalho não reconhecido. Use as colunas dos modelos disponíveis.',
      [{ file: file.name, line: parsed[0]?.info.lines ?? 1 }]);
  }
  if (parsed.length - 1 > LIMITS.rowsPerFile) {
    throw new AppError(422, 'ROW_LIMIT', 'Limite de 10.000 registros por arquivo excedido.', [{ file: file.name }]);
  }
  let normalized = parsed[0].record.some((value, i) => value !== headers[i]) ? 1 : 0;
  const rows = parsed.slice(1).map(({ record, info }) => {
    if (record.some(value => value !== value.trim())) normalized++;
    return {
      data: Object.fromEntries(headers.map((header, i) => [header, record[i].trim()])),
      source: { file: file.name, line: info.lines },
    };
  });
  const warnings = [];
  if (normalized) warnings.push({ file: file.name, message: `Espaços externos removidos em ${normalized} linha(s), incluindo cabeçalho quando aplicável.` });
  if (parsed.at(-1)?.info.empty_lines || file.content.replace(/\r\n|\r/g, '\n').endsWith('\n\n')) {
    warnings.push({ file: file.name, message: 'Linhas vazias foram ignoradas.' });
  }
  return { type, rows, warnings, file: file.name, bytes };
}
