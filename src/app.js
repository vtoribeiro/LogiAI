import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './errors.js';
import { contract, SCHEMAS } from './contract.js';
import { analyze } from './analysis.js';
import { createStore } from './store.js';
import { createAiService } from './ai.js';

const root = fileURLToPath(new URL('../', import.meta.url));

export function createApp({ store = createStore(), ai = createAiService() } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.locals.store = store;
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY',
    });
    // Uso local sem autenticação: impede requisições de páginas externas e DNS rebinding.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(req.hostname)) {
      return next(new AppError(403, 'LOCAL_ONLY', 'Esta versão está disponível somente no endereço local.'));
    }
    const origin = req.get('origin');
    if ((origin && origin !== `http://${req.get('host')}`) || req.get('sec-fetch-site') === 'cross-site') {
      return next(new AppError(403, 'ORIGIN', 'Origem da requisição não permitida.'));
    }
    next();
  });
  app.use('/api', express.json({ limit: '12mb', strict: true }));
  app.get('/api/config', (_req, res) => res.json({ ...contract, ai: { available: ai.available } }));
  app.get('/api/templates/:type', (req, res, next) => {
    if (!Object.hasOwn(SCHEMAS, req.params.type)) return next(new AppError(404, 'NOT_FOUND', 'Modelo não encontrado.'));
    res.type('text/csv').attachment(`${req.params.type}.csv`).send(`\uFEFF${SCHEMAS[req.params.type].join(';')}\r\n`);
  });
  app.post('/api/analyses', (req, res) => {
    if (!req.is('application/json')) throw new AppError(415, 'CONTENT_TYPE', 'Envie a importação em formato JSON.');
    const analysis = store.put(analyze(req.body?.files));
    res.status(201).json(analysis);
  });
  app.delete('/api/analyses/:id', (req, res) => { store.delete(req.params.id); res.status(204).end(); });
  app.post('/api/analyses/:id/diagnosis', async (req, res) => {
    const analysis = store.get(req.params.id);
    const diagnosis = await ai.diagnose(analysis);
    store.get(req.params.id); // Não devolve um diagnóstico de uma análise descartada durante a espera.
    res.json({ analysisId: analysis.id, diagnosis });
  });
  app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
  app.use('/assets', express.static(path.join(root, 'assets'), { dotfiles: 'deny', index: false }));
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Recurso não encontrado.')));
  app.use((error, _req, res, _next) => {
    const known = error instanceof AppError;
    const tooLarge = error.type === 'entity.too.large';
    const badJson = error.type === 'entity.parse.failed';
    res.status(known ? error.status : tooLarge ? 413 : badJson ? 400 : 500).json({
      error: {
        code: known ? error.code : tooLarge ? 'BODY_LIMIT' : badJson ? 'INVALID_JSON' : 'INTERNAL_ERROR',
        message: known ? error.message : tooLarge ? 'Requisição maior que o limite permitido.' : badJson ? 'Conteúdo JSON inválido.' : 'Não foi possível processar a solicitação.',
        details: known ? error.details : [],
      },
    });
  });
  return app;
}
