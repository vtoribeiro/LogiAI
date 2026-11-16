import { AppError } from './errors.js';
import { LIMITS } from './contract.js';

// O adaptador recebe somente agregados; nenhum texto, ID ou nome dos CSVs é enviado.
export function buildAiContext(analysis) {
  return {
    contractVersion: analysis.contractVersion,
    metrics: { ...analysis.metrics },
    distribution: { ...analysis.distribution },
    limitations: [...analysis.limitations],
  };
}

function validText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 1200;
}

export function validateAiResponse(result, context) {
  const invalid = () => { throw new AppError(502, 'AI_INVALID', 'A IA retornou uma resposta inválida ou sem evidências suficientes.'); };
  if (!result || typeof result !== 'object' || !Array.isArray(result.facts) || !result.facts.length ||
      !Array.isArray(result.hypotheses) || !Array.isArray(result.recommendations) || !result.recommendations.length ||
      !Array.isArray(result.limitations) || !result.limitations.length) invalid();
  for (const list of [result.facts, result.hypotheses, result.recommendations, result.limitations]) if (list.length > 10) invalid();
  const metrics = context.metrics;
  const facts = result.facts.map(fact => {
    if (!fact || !Object.hasOwn(metrics, fact.metric) || metrics[fact.metric] === null || fact.value !== metrics[fact.metric]) invalid();
    // Os fatos são dados verificados; sua redação será feita pela interface.
    return { metric: fact.metric, value: fact.value };
  });
  const supported = new Set(facts.map(fact => fact.metric));
  const evidence = value => Array.isArray(value) && value.length > 0 && value.length <= 5 && value.every(key => supported.has(key));
  const hypotheses = result.hypotheses.map(item => {
    if (!item || !validText(item.text) || !evidence(item.evidence)) invalid();
    return { text: item.text, evidence: [...item.evidence] };
  });
  const recommendations = result.recommendations.map(item => {
    if (!item || !validText(item.action) || !validText(item.rationale) || !validText(item.expectedEffect) || !evidence(item.evidence)) invalid();
    return { action: item.action, rationale: item.rationale, expectedEffect: item.expectedEffect, evidence: [...item.evidence] };
  });
  if (!result.limitations.every(validText)) invalid();
  return { facts, hypotheses, recommendations, limitations: [...result.limitations] };
}

export function createAiService({ provider = null, timeoutMs = LIMITS.aiTimeoutMs } = {}) {
  let busy = false;
  return {
    available: Boolean(provider),
    async diagnose(analysis) {
      if (!provider) throw new AppError(503, 'AI_NOT_CONFIGURED', 'Configure GROQ_API_KEY no .env do servidor e reinicie o aplicativo. Os indicadores continuam disponíveis.');
      if (busy) throw new AppError(429, 'AI_BUSY', 'Uma análise de IA já está em andamento. Aguarde antes de tentar novamente.');
      busy = true;
      const controller = new AbortController();
      let timer;
      try {
        const context = buildAiContext(analysis);
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AppError(504, 'AI_TIMEOUT', 'A IA excedeu o tempo de resposta. Seus indicadores foram preservados.'));
          }, timeoutMs);
        });
        const result = await Promise.race([
          Promise.resolve().then(() => provider.generate(structuredClone(context), { signal: controller.signal })), timeout,
        ]);
        return validateAiResponse(result, context);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(502, 'AI_UNAVAILABLE', 'Não foi possível obter o diagnóstico de IA. Seus indicadores foram preservados.');
      } finally {
        clearTimeout(timer);
        busy = false;
      }
    },
  };
}
