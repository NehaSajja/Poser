import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = fileURLToPath(new URL('../../data/cloud-retrieval/', import.meta.url));
let loaded;
export async function loadRetrievalIndex() {
  if (!loaded) loaded = (async () => {
    const [manifest, catalog, protocol] = await Promise.all(['index.json', 'catalog.json', 'protocol.json'].map(async name => JSON.parse(await readFile(DATA_ROOT + name, 'utf8'))));
    const poses = new Map(catalog.map(p => [p.id, p]));
    const rows = [];
    for (let offset = 0; offset < manifest.items.length; offset += 64) {
      rows.push(...await Promise.all(manifest.items.slice(offset, offset + 64).map(async item => {
        const bytes = await readFile(`${DATA_ROOT}embeddings/${item.key}.f32`);
        if (bytes.length !== manifest.dimensions * 4 || !poses.has(item.id)) throw new Error('Incomplete pose retrieval index.');
        const values = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        let norm = 0;
        for (const value of values) { if (!Number.isFinite(value)) throw new Error('Invalid pose embedding.'); norm += value * value; }
        if (!norm) throw new Error('Empty pose embedding.');
        norm = Math.sqrt(norm); for (let i = 0; i < values.length; i++) values[i] /= norm;
        return { ...item, values, pose: poses.get(item.id) };
      })));
    }
    return { rows, keys: new Set(rows.map(r => r.key)), dimensions: manifest.dimensions, model: manifest.model,
      prompt: protocol.prompt, captionModel: protocol.captionModel, sceneCount: poses.size };
  })().catch(error => { loaded = null; throw error; });
  return loaded;
}

export function rankLibraryPoses(index, values, limit = 6) {
  if (values?.length !== index.dimensions || !values.every(Number.isFinite)) throw new Error('Invalid query embedding.');
  const norm = Math.hypot(...values);
  if (!norm) throw new Error('Empty query embedding.');
  const best = new Map();
  for (const row of index.rows) {
    let score = 0; for (let i = 0; i < values.length; i++) score += row.values[i] * values[i] / norm;
    if (!best.has(row.id) || score > best.get(row.id).score) best.set(row.id, { id: row.id, key: row.key, view: row.view,
      name: row.pose.name, description: row.pose.description, model: row.pose.model, score,
      thumbnail: `/api/pose-retrieval/thumbnails/${row.key}.png` });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function retrievePoses({ sketch }, { key, signal, fetcher = fetch, loadIndex = loadRetrievalIndex, beforeProviderCall = () => {} }) {
  const start = performance.now(), index = await loadIndex();
  signal?.throwIfAborted();
  async function call(model, operation, body) {
    beforeProviderCall();
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:${operation}`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body), signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok) throw Object.assign(new Error(response.status === 429 ? 'Search limit reached. Try again shortly.' : 'Cloud search failed. Try again.'), { status: 502 });
    return response.json();
  }
  const image = { inlineData: { mimeType: 'image/png', data: sketch.slice(22) } };
  const captionStart = performance.now();
  const data = await call(index.captionModel, 'generateContent', {
    systemInstruction: { parts: [{ text: index.prompt }] }, contents: [{ role: 'user', parts: [image] }],
    generationConfig: { temperature: 0, maxOutputTokens: 350, thinkingConfig: { thinkingLevel: 'minimal' }, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { readable: { type: 'BOOLEAN' }, description: { type: 'STRING' } }, required: ['readable', 'description'] } },
  });
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw new Error('Description was incomplete.');
  const caption = JSON.parse(candidate.content.parts.filter(p => !p.thought).map(p => p.text || '').join(''));
  if (!caption.readable) throw Object.assign(new Error('Add more of the figure.'), { status: 422 });
  if (typeof caption.description !== 'string' || !caption.description.trim()) throw new Error('Missing pose description.');
  const description = caption.description, captionMs = performance.now() - captionStart;
  signal?.throwIfAborted();
  const embedStart = performance.now();
  const embedded = await call(index.model, 'embedContent', { content: { parts: [{ text: description }, image] }, outputDimensionality: index.dimensions });
  const embeddingMs = performance.now() - embedStart;
  signal?.throwIfAborted();
  const searchStart = performance.now(), results = rankLibraryPoses(index, embedded.embedding?.values);
  return { results, description, sceneCount: index.sceneCount,
    timing: { captionMs, embeddingMs, searchMs: performance.now() - searchStart, totalMs: performance.now() - start } };
}
