export const VERSION = 'mvp-1';
export const LIMITS = Object.freeze({
  files: 9,
  fileBytes: 1024 * 1024,
  totalBytes: 5 * 1024 * 1024,
  rowsPerFile: 10000,
  totalRows: 20000,
  recordChars: 16384,
  fieldChars: 120,
  issues: 100,
  analyses: 20,
  ttlMs: 30 * 60 * 1000,
  aiTimeoutMs: 20000,
});

export const SCHEMAS = Object.freeze({
  pedidos: ['pedido_id', 'data_pedido', 'data_prevista', 'transportadora', 'destino'],
  entregas: ['entrega_id', 'pedido_id', 'data_entrega'],
  ocorrencias: ['ocorrencia_id', 'pedido_id', 'data_ocorrencia', 'tipo'],
});

export const METRICS = [
  { id: 'orders', label: 'Pedidos importados', unit: 'pedidos', formula: 'Quantidade de pedidos únicos na base validada.' },
  { id: 'delivered', label: 'Entregas concluídas', unit: 'entregas', formula: 'Pedidos com uma entrega registrada. O MVP admite uma entrega por pedido.' },
  { id: 'pending', label: 'Sem entrega registrada', unit: 'pedidos', formula: 'Pedidos importados menos pedidos com entrega. Não indica atraso.' },
  { id: 'onTimeRate', label: 'Pontualidade', unit: '%', formula: 'Entregas com data_entrega ≤ data_prevista ÷ entregas concluídas × 100. Uma casa decimal; sem entregas: indisponível.' },
  { id: 'occurrences', label: 'Ocorrências registradas', unit: 'ocorrências', formula: 'Quantidade de ocorrências únicas. Um pedido pode possuir várias ocorrências.' },
];

export const contract = {
  version: VERSION,
  limits: LIMITS,
  schemas: SCHEMAS,
  metrics: METRICS,
  rules: [
    'Envie os três tipos de CSV. Entregas e ocorrências podem conter apenas o cabeçalho; pedidos precisa ter registros.',
    'UTF-8, com ou sem BOM; vírgula ou ponto e vírgula. Colunas exatas, em qualquer ordem. Datas AAAA-MM-DD, sem horário.',
    'Todos os campos são obrigatórios. IDs diferenciam maiúsculas e minúsculas. Duplicidades e relações inválidas rejeitam toda a importação.',
    'IDs: até 80 letras, números, pontos, hífens ou sublinhados. Demais campos: até 120 caracteres. Datas reais entre 1900 e 9999.',
    'Uma entrega por pedido; várias ocorrências por pedido. Datas de previsão, entrega e ocorrência não podem anteceder data_pedido.',
    'Espaços externos são removidos com aviso; linhas vazias são ignoradas com aviso. Não há correção automática de valores.',
    'A análise inclui todos os pedidos enviados. O período é a menor e a maior data_pedido. Não há filtro ou meta de desempenho.',
    'Dados ficam apenas em memória. A análise expira em 30 minutos; reiniciar o servidor ou limpar a análise descarta os resultados.',
    'Até 10.000 registros por arquivo e 20.000 por importação. Até 20 análises em memória; nomes de arquivos devem ser distintos.',
  ],
};
