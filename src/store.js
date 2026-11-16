import { randomUUID } from 'node:crypto';
import { AppError } from './errors.js';
import { LIMITS } from './contract.js';

export function createStore({ now = Date.now, ttl = LIMITS.ttlMs, capacity = LIMITS.analyses } = {}) {
  const entries = new Map();
  const sweep = () => {
    for (const [id, entry] of entries) if (entry.expiresAt <= now()) entries.delete(id);
  };
  const timer = setInterval(sweep, Math.min(ttl, 60000));
  timer.unref();
  return {
    put(analysis) {
      sweep();
      if (entries.size >= capacity) throw new AppError(503, 'CAPACITY', 'Limite de análises em memória atingido. Limpe uma análise ou aguarde sua expiração.');
      const id = randomUUID();
      const entry = { ...analysis, id, expiresAt: now() + ttl };
      entries.set(id, entry);
      return entry;
    },
    get(id) {
      sweep();
      const entry = entries.get(id);
      if (!entry) throw new AppError(404, 'ANALYSIS_EXPIRED', 'Análise não encontrada ou expirada. Importe os arquivos novamente.');
      return entry;
    },
    delete(id) { entries.delete(id); },
    close() { clearInterval(timer); entries.clear(); },
  };
}
