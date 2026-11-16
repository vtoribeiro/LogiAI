import { createHash } from 'node:crypto';
import { validateImport } from './validation.js';
import { VERSION } from './contract.js';

const rate = (part, total) => total ? Math.round(part / total * 1000) / 10 : null;

export function analyze(files) {
  const { groups, sources, warnings } = validateImport(files);
  const orders = groups.pedidos.map(row => row.data);
  const deliveries = new Map(groups.entregas.map(row => [row.data.pedido_id, row.data]));
  const occurrences = groups.ocorrencias.map(row => row.data);
  const carriers = new Map(), categories = new Map();
  let onTime = 0;
  for (const order of orders) {
    const carrier = carriers.get(order.transportadora) ?? {
      name: order.transportadora, orders: 0, delivered: 0, onTime: 0, late: 0, pending: 0,
    };
    carrier.orders++;
    const delivery = deliveries.get(order.pedido_id);
    if (delivery) {
      carrier.delivered++;
      if (delivery.data_entrega <= order.data_prevista) { carrier.onTime++; onTime++; }
      else carrier.late++;
    } else carrier.pending++;
    carriers.set(order.transportadora, carrier);
  }
  for (const occurrence of occurrences) categories.set(occurrence.tipo, (categories.get(occurrence.tipo) ?? 0) + 1);
  const dates = orders.map(order => order.data_pedido).sort();
  const canonical = Object.fromEntries(Object.entries(groups).map(([type, rows]) =>
    [type, rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row.data).sort()))) .sort()]));
  return {
    contractVersion: VERSION,
    fingerprint: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
    period: { start: dates[0], end: dates.at(-1) },
    metrics: {
      orders: orders.length, delivered: deliveries.size, pending: orders.length - deliveries.size,
      onTimeRate: rate(onTime, deliveries.size), occurrences: occurrences.length,
    },
    distribution: { onTime, late: deliveries.size - onTime, pending: orders.length - deliveries.size },
    carriers: [...carriers.values()].map(carrier => ({ ...carrier, onTimeRate: rate(carrier.onTime, carrier.delivered) }))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, 'pt-BR')),
    occurrenceTypes: [...categories].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')),
    sources,
    warnings,
    limitations: [
      'A análise considera somente os arquivos enviados, sem verificar a completude dos dados na origem.',
      'Pontualidade considera apenas entregas registradas. Pedidos sem entrega não são classificados como atrasados.',
      'Ocorrências são contagens de registros; não comprovam causas de atraso. Não há metas de desempenho configuradas.',
    ],
  };
}
