import { setTimeout as delay } from 'node:timers/promises';
import { POSE_PROMPT, mannequinPrompt } from './prompts.mjs';

export const MODELS = Object.freeze({ pose: 'gemini-3.1-flash-lite', image: 'gemini-3.1-flash-lite-image', body: 'fal-ai/sam-3/3d-body' });
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
const MAX_MODEL_BYTES = 100 * 1024 * 1024;
export class PoseError extends Error {}

export function validateSketch(value) {
  if (typeof value !== 'string' || value.length > 4_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const png = Buffer.from(value.slice(22), 'base64');
  if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 2048 && height <= 2048;
}

export function queueUrl(value) {
  const url = new URL(value);
  if (url.origin !== 'https://queue.fal.run' || url.username || url.password) throw new PoseError('Invalid reconstruction queue URL.');
  return url.href;
}

export function modelUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(url.hostname === 'fal.media' || url.hostname.endsWith('.fal.media'))) throw new PoseError('Invalid reconstruction model URL.');
  return url.href;
}

export function finalParts(result) {
  const candidate = result.candidates?.[0];
  if (result.promptFeedback?.blockReason || !candidate || (candidate.finishReason && candidate.finishReason !== 'STOP')) throw new PoseError('Gemini could not complete this pose. Try a clearer full-body sketch.');
  return (candidate.content?.parts || []).filter(part => !part.thought);
}

export function finalImage(result) {
  const image = finalParts(result).find(part => /^image\/(png|jpeg|webp)$/.test(part.inlineData?.mimeType) && part.inlineData?.data)?.inlineData;
  if (!image || image.data.length > MAX_IMAGE_BYTES * 4 / 3) throw new PoseError('Gemini did not return a usable mannequin image.');
  return image;
}

async function boundedBytes(response, max) {
  if (Number(response.headers.get('content-length')) > max) throw new PoseError('The generated asset is too large.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw new PoseError('The generated asset is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Only fixed provider endpoints receive keys. Never forward their raw errors to the browser.
export async function generatePose(sketch, { geminiKey, falKey, reference, onStage = async () => {}, fetcher = fetch, sleep = delay }) {
  async function request(url, options, label, timeout = 120_000) {
    let response;
    try { response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(timeout) }); }
    catch { throw new PoseError(`${label} could not be reached. Your sketch is preserved.`); }
    if (!response.ok) {
      if ([401,403].includes(response.status)) throw new PoseError(`${label} rejected its API key. Check .env.local.`);
      if (response.status === 429) throw new PoseError(`${label} reached its API limit. Try again later.`);
      throw new PoseError(`${label} failed (${response.status}). Your sketch is preserved.`);
    }
    return response;
  }
  async function json(url, options, label, timeout) {
    const response = await request(url, options, label, timeout);
    return JSON.parse((await boundedBytes(response, 40 * 1024 * 1024)).toString());
  }
  const gemini = (model, body, timeout) => json(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey }, body: JSON.stringify(body),
  }, 'Gemini', timeout);
  const ink = { inlineData: { mimeType: 'image/png', data: sketch.slice(22) } };
  await onStage('interpreting');
  const pose = await gemini(MODELS.pose, {
    systemInstruction: { parts: [{ text: POSE_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: 'Analyze this pose sketch.' }, ink] }],
    generationConfig: { temperature: .1, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' } },
  });
  const description = finalParts(pose).map(part => part.text || '').join('\n').trim();
  if (!description) throw new PoseError('Gemini could not read the pose. Try a clearer full-body sketch.');
  await onStage('rendering');
  const image = finalImage(await gemini(MODELS.image, {
    contents: [{ role: 'user', parts: [{ text: mannequinPrompt(description) }, ink, { inlineData: { mimeType: 'image/png', data: reference.toString('base64') } }] }],
    generationConfig: { responseModalities: ['IMAGE'], thinkingConfig: { thinkingLevel: 'minimal' } },
  }, 240_000));
  await onStage('reconstructing');
  const headers = { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' };
  const queued = await json(`https://queue.fal.run/${MODELS.body}`, {
    method: 'POST', headers: { ...headers, 'X-Fal-No-Retry': '1' },
    body: JSON.stringify({ image_url: `data:${image.mimeType};base64,${image.data}`, export_meshes: true, include_3d_keypoints: false, include_mhr_params: false }),
  }, 'fal');
  const statusUrl = queueUrl(queued.status_url), responseUrl = queueUrl(queued.response_url);
  await onStage('reconstructing', { requestId: queued.request_id });
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const status = await json(statusUrl, { headers }, 'fal', 30_000);
    if (status.status === 'COMPLETED') {
      const result = await json(responseUrl, { headers }, 'fal');
      if (result.metadata?.num_people === 0) throw new PoseError('No body was found. Try a clearer full-body sketch.');
      const url = modelUrl(typeof result.model_glb === 'string' ? result.model_glb : result.model_glb?.url);
      await onStage('loading');
      const bytes = await boundedBytes(await request(url, {}, 'Model download'), MAX_MODEL_BYTES);
      if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new PoseError('The reconstruction did not return a valid 3D model.');
      return bytes;
    }
    if (status.status === 'FAILED' || status.error) throw new PoseError('Body reconstruction failed. Try a clearer full-body sketch.');
    await sleep(800);
  }
  throw new PoseError('Body reconstruction timed out. Your sketch is preserved.');
}
