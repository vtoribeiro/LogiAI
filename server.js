import { createApp } from './src/app.js';
import { createAiService } from './src/ai.js';
import { createGroqProvider } from './src/providers/groq.js';
import { loadLocalEnv } from './src/config.js';

loadLocalEnv();
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT deve ser um número entre 1 e 65535.');
const ai = createAiService({ provider: createGroqProvider({ apiKey: process.env.GROQ_API_KEY }) });
const app = createApp({ ai });
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
