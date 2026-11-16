import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// A localização independe da pasta do terminal. Variáveis já definidas no ambiente prevalecem.
export function loadLocalEnv(path = fileURLToPath(new URL('../.env', import.meta.url))) {
  try { loadEnvFile(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Não foi possível carregar a configuração local. Verifique o arquivo .env.');
  }
}
