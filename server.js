import { createApp } from './src/app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser um número entre 1 e 65535.');
const app = createApp();
const server = app.listen(port, '127.0.0.1', error => {
  if (error) { console.error('Não foi possível iniciar o LogiAI. Verifique se a porta está disponível.'); process.exitCode = 1; return; }
  console.log(`LogiAI disponível em http://127.0.0.1:${port}`);
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  app.locals.store.close();
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
