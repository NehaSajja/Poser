import { buildRequest, parseAnswer } from './decisions.mjs';
import { RECOGNITION_VERSION } from '../src/recognition.js';

export async function recognize(input, { provider = 'openai', model, evaluate }) {
  const start = performance.now();
  const result = parseAnswer(await evaluate(buildRequest(input, provider, model)), provider);
  return { ...result, recognitionVersion: RECOGNITION_VERSION, elapsedMs: Math.round(performance.now() - start) };
}
