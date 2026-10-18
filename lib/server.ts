import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_SETTINGS, IMAGE_MODELS, type Run, type Stage, type Settings } from "./defaults";
import { geminiImageData } from "./gemini-image";
import { parseImage, safeAssetUrl, validId } from "./validation";

const ROOT = path.join(process.cwd(), ".local");
const RUNS = path.join(ROOT, "runs");
const globals = globalThis as typeof globalThis & { poserLocks?: Set<string> };
const locks = globals.poserLocks ??= new Set<string>();
const runPath = (id: string) => path.join(RUNS, validId(id));
const assetPath = (id: string, name: string) => {
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp|glb|json)$/.test(name)) throw new Error("Invalid file.");
  return path.join(runPath(id), name);
};
const assetURL = (id: string, name: string) => `/api/assets/${id}/${name}`;

export async function connections() {
  const keys = await credentials();
  return { gemini: !!keys.gemini, fal: !!keys.fal };
}
export async function credentials(): Promise<{gemini?: string; fal?: string}> {
  let saved: {gemini?: string; fal?: string} = {};
  try { saved = JSON.parse(await fs.readFile(path.join(ROOT, "connections.json"), "utf8")); } catch {}
  return { gemini: saved.gemini || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, fal: saved.fal || process.env.FAL_KEY };
}
export async function saveConnections(input: {gemini?: string; fal?: string}) {
  const prior = await credentials();
  for (const key of ["gemini", "fal"] as const) {
    if (input[key]?.trim()) {
      if (input[key]!.length > 500 || /[\r\n]/.test(input[key]!)) throw new Error("The key format is invalid.");
      prior[key] = input[key]!.trim();
    }
  }
  await fs.mkdir(ROOT, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(ROOT, "connections.json"), JSON.stringify(prior), { mode: 0o600 });
  await fs.chmod(path.join(ROOT, "connections.json"), 0o600);
  return connections();
}
export async function readRun(id: string): Promise<Run> {
  return JSON.parse(await fs.readFile(path.join(runPath(id), "run.json"), "utf8"));
}
async function saveRun(run: Run) {
  run.updatedAt = new Date().toISOString();
  const folder = runPath(run.id);
  await fs.mkdir(folder, { recursive: true });
  const tmp = path.join(folder, `run-${randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(run, null, 2));
  await fs.rename(tmp, path.join(folder, "run.json"));
}
export async function listRuns() {
  await fs.mkdir(RUNS, { recursive: true });
  const names = await fs.readdir(RUNS);
  const result = await Promise.all(names.map(async id => { try { return await readRun(id); } catch { return null; } }));
  return result.filter((r): r is Run => !!r).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0,100);
}
async function storeImage(id: string, name: string, data: unknown) {
  const { mime, bytes } = parseImage(data);
  const filename = `${name}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
  await fs.writeFile(assetPath(id, filename), bytes);
  return assetURL(id, filename);
}
function validateSettings(input: Partial<Settings>): Settings {
  const s = { ...DEFAULT_SETTINGS, ...input };
  if (typeof s.vlmPrompt !== "string" || typeof s.imagePrompt !== "string" || s.vlmPrompt.length > 30000 || s.imagePrompt.length > 30000 || typeof s.fastPrompt !== "string" || s.fastPrompt.length > 30000) throw new Error("Prompt is too long.");
  if (!/^gemini-[a-zA-Z0-9.-]+$/.test(s.geminiModel)) throw new Error("Enter a valid Gemini model ID.");
  if (!Object.hasOwn(IMAGE_MODELS, s.imageModel) || s.bodyModel !== DEFAULT_SETTINGS.bodyModel) throw new Error("Unsupported model endpoint.");
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2147483647) throw new Error("Seed must be an integer between 0 and 2147483647.");
  return s;
}
export async function createRun(input: { sketch: string; reference?: string; settings?: Partial<Settings>; recipe?: string; description?: string; image?: string; parentId?: string; edit?: {mode: string; clean?: string; marked?: string; instruction?: string} }) {
  const settings = validateSettings(input.settings || {});
  const recipe = input.recipe || "guided";
  if (!["fast", "guided", "image", "direct"].includes(recipe)) throw new Error("Unknown workflow.");
  if (input.edit) {
    if (!input.parentId || !["sketch", "overlay"].includes(input.edit.mode)) throw new Error("Choose an existing pose to update.");
    const parent = await readRun(input.parentId);
    if (!parent.generatedImage) throw new Error("The previous pose needs a reference image before it can be edited.");
    if (input.edit.mode === "overlay" && (!input.edit.clean || !input.edit.marked)) throw new Error("Draw a correction over the model first.");
  }
  const id = randomUUID();
  await fs.mkdir(runPath(id), { recursive: true });
  const run: Run = {
    id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    recipe: recipe as Run["recipe"], settings, sketch: await storeImage(id, "sketch", input.sketch),
    reference: input.reference ? await storeImage(id, "reference", input.reference) : undefined,
    description: typeof input.description === "string" ? input.description.slice(0,40000) : "",
    descriptionSource: input.description ? "edited" : undefined,
    generatedImage: input.image ? await storeImage(id, "uploaded-reference", input.image) : undefined,
    imageSource: input.image ? "uploaded" : undefined,
    parentId: input.parentId ? validId(input.parentId) : undefined,
    status: "ready", stages: [],
  };
  if(input.edit) run.edit = {
    mode: input.edit.mode as "sketch" | "overlay",
    clean: input.edit.clean ? await storeImage(id, "edit-clean", input.edit.clean) : undefined,
    marked: input.edit.marked ? await storeImage(id, "edit-marked", input.edit.marked) : undefined,
    instruction: typeof input.edit.instruction === "string" ? input.edit.instruction.slice(0,2000) : undefined,
  };
  await saveRun(run);
  return run;
}
export async function getAsset(id: string, name: string) {
  return fs.readFile(assetPath(id, name));
}
export async function localData(url: string) {
  const match = /^\/api\/assets\/([a-f0-9-]{36})\/([\w.-]+)$/.exec(url);
  if (!match) throw new Error("Local asset could not be found.");
  const bytes = await getAsset(match[1], match[2]);
  const mime = match[2].endsWith(".png") ? "image/png" : match[2].endsWith(".webp") ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
export async function providerJSON(url: string, init: RequestInit, provider: string) {
  const response = await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(120000), cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Never include the request, authorization headers, or provider error bodies in logs.
    const hint = response.status === 401 || response.status === 403 ? "Check your API key and model access in Connections." : response.status === 429 ? "Check your account credit or quota, then try again." : "Inspect the request in your provider dashboard and try again.";
    throw new Error(`${provider} returned ${response.status}. ${hint}`);
  }
  return data;
}
async function interpret(run: Run, key: string) {
  const sources = run.edit?.mode === "sketch" && run.parentId ? [(await readRun(run.parentId)).sketch, run.sketch] : [run.sketch];
  const imageParts = await Promise.all(sources.map(async url=>{const image=parseImage(await localData(url));return {inlineData:{mimeType:image.mime,data:image.bytes.toString("base64")}};}));
  const fast = run.recipe === "fast";
  const instructions = run.edit?.mode === "sketch" ? `You are an animator comparing TWO gesture sketches. Image 1 is OLD and Image 2 is REVISED. In at most 120 words, identify only the pose changes: which SCREEN-LEFT or SCREEN-RIGHT limb moved, its new shoulder-elbow-wrist or hip-knee-foot directions, and any changed torso/head orientation. Disregard changes of overall drawing scale or position. A new horizontal line extending from a shoulder is an outstretched arm. Describe ONLY changed joints. Do not restate positions of unchanged parts from either sketch: the previous mannequin may already contain other corrections. End with: Preserve all unedited parts and camera from the previous mannequin image. Do not reinterpret unchanged lines or invent a new camera angle. Output concise editing instructions, no preamble.` : fast ? run.settings.fastPrompt : run.settings.vlmPrompt;
  const request = {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [{ text: run.edit?.mode === "sketch" ? "Describe the pose change from the first sketch to the second." : "Analyze this pose sketch." }, ...imageParts] }],
    generationConfig: fast ? { temperature: 0.1, maxOutputTokens: 1024, thinkingConfig: {thinkingLevel: /gemini-3\.[78]-flash/.test(run.settings.geminiModel) ? "low" : "minimal"} } : { temperature: 0.3, maxOutputTokens: 8192 },
  };
  await fs.writeFile(assetPath(run.id, "interpret-input.json"), JSON.stringify({ model: run.settings.geminiModel, prompt: instructions, images: sources, generationConfig: request.generationConfig }, null, 2));
  const result = await providerJSON(`https://generativelanguage.googleapis.com/v1beta/models/${run.settings.geminiModel}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body: JSON.stringify(request),
  }, "Gemini");
  const text = result.candidates?.[0]?.content?.parts?.filter((p: {thought?: boolean}) => !p.thought).map((p: {text?: string}) => p.text || "").join("\n");
  if (!text) throw new Error("Gemini returned no description. Try a clearer sketch or another model ID.");
  if (result.candidates?.[0]?.finishReason === "MAX_TOKENS") throw new Error("The pose description was cut short. Shorten the prompt and retry.");
  await fs.writeFile(assetPath(run.id, "interpret-output.json"), JSON.stringify(result, null, 2));
  run.description = text;
  run.descriptionSource = "model";
}
async function fal(run: Run, stage: Stage, endpoint: string, payload: object, key: string) {
  const headers = { "Content-Type": "application/json", "Authorization": `Key ${key}`, "X-Fal-No-Retry": "1" };
  const submitted = await providerJSON(`https://queue.fal.run/${endpoint}`, { method: "POST", headers, body: JSON.stringify(payload) }, "fal");
  const urls = [submitted.status_url, submitted.response_url];
  if (!urls.every(u => typeof u === "string" && new URL(u).origin === "https://queue.fal.run")) throw new Error("fal returned an unexpected queue response.");
  const record = run.stages[run.stages.length - 1];
  record.requestId = submitted.request_id;
  await fs.writeFile(assetPath(run.id, `${stage}-queue.json`), JSON.stringify(submitted, null, 2));
  await saveRun(run);
  const deadline = Date.now() + 12 * 60_000;
  while (Date.now() < deadline) {
    const status = await providerJSON(submitted.status_url, { headers }, "fal");
    if (status.status === "COMPLETED") {
      if (status.error) throw new Error("fal could not complete this request. Check the request ID in your fal dashboard.");
      return providerJSON(submitted.response_url, { headers }, "fal");
    }
    if (status.status === "FAILED") throw new Error("fal could not complete this request. Check the request ID in your fal dashboard.");
    await new Promise(resolve => setTimeout(resolve, 600));
  }
  // A timeout is not an invitation to silently submit another paid request.
  throw new Error("This request is taking longer than 12 minutes. Its request ID is saved; check fal before retrying to avoid a duplicate charge.");
}
async function downloadAsset(id: string, name: string, url: string) {
  const safe = safeAssetUrl(url);
  const response = await fetch(safe, { signal: AbortSignal.timeout(120000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error("The generated file could not be downloaded. The provider response is saved locally.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 100_000_000) { await reader.cancel(); throw new Error("The generated file exceeds the 100 MB local limit."); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  if (name.endsWith(".glb") && bytes.toString("ascii",0,4) !== "glTF") throw new Error("The reconstruction did not return a valid GLB.");
  if (name.endsWith(".png")) {
    // Preserve the actual image type rather than trusting an endpoint's filename.
    const mime = bytes[0] === 255 && bytes[1] === 216 ? "image/jpeg" : bytes.toString("ascii",8,12) === "WEBP" ? "image/webp" : "image/png";
    return storeImage(id, name.slice(0,-4), `data:${mime};base64,${bytes.toString("base64")}`);
  }
  await fs.writeFile(assetPath(id, name), bytes);
  return assetURL(id, name);
}
export async function runStage(id: string, stage: Stage) {
  if (!["interpret", "image", "model"].includes(stage)) throw new Error("Unknown stage.");
  if (locks.has(id)) throw new Error("An experiment step is already running.");
  locks.add(id);
  let run: Run | undefined;
  try {
    run = await readRun(id);
    // A retried HTTP request must neither charge again nor invalidate a saved result.
    if (run.stages.some(s => s.stage === stage && s.status === "complete")) return run;
    const keys = await credentials();
    if (stage === "interpret" && !keys.gemini) throw new Error("Connect Gemini to read the sketch.");
    const geminiImage = run.settings.imageModel.startsWith("gemini-");
    if (stage === "image" && geminiImage && !keys.gemini) throw new Error("Connect Gemini to generate the reference image.");
    if ((stage === "model" || (stage === "image" && !geminiImage)) && !keys.fal) throw new Error("Connect fal to run this step.");
    if (stage === "model" && run.recipe !== "direct" && !run.generatedImage) throw new Error("Generate or upload a reference image first.");
    const started = Date.now();
    run.status = stage === "interpret" ? "interpreting" : stage === "image" ? "imaging" : "modeling";
    run.error = undefined;
    run.stages.push({ stage, model: stage === "interpret" ? run.settings.geminiModel : stage === "image" ? run.settings.imageModel : run.settings.bodyModel, status: "running", startedAt: new Date().toISOString() });
    await saveRun(run);
    if (stage === "interpret") {
      await interpret(run, keys.gemini!);
      run.status = "paused";
    } else if (stage === "image") {
      let sources = [run.sketch, ...(run.reference ? [run.reference] : [])];
      let prompt = `${run.settings.imagePrompt}\n\n${run.description || "Follow the supplied sketch directly. Infer the torso, individual limb positions and camera angle visually, without writing a description."}\n\nPreserve screen-space geometry exactly: do not mirror or swap limbs, straighten bent legs, or turn a profile head toward the camera. The sketch and its description override any pose in the body reference. Render complete human anatomy, including TWO complete hands and TWO complete feet even if these are absent from the stick sketch. Never end limbs in stumps or omit extremities where sketch lines end. Keep the full figure comfortably inside the frame.`;
      if(run.edit && run.parentId) {
        const parent = await readRun(run.parentId);
        if(run.edit.mode === "overlay") {
          sources = [run.edit.clean!, run.edit.marked!];
          prompt = `Edit this anatomical mannequin's pose. Image 1 is the current 3D view. Image 2 is that same view with red corrections drawn by the artist. Red strokes show the intended NEW position or gesture of a limb or hand; red arrows point toward the intended destination. Replace the corresponding original limb, do not add extra limbs. Preserve all unmarked body parts, the adult body's proportions, camera angle, and overall composition. Resolve occlusion plausibly. Render one smooth gray full-body mannequin with readable joints on a plain off-white background. Remove all red marks, arrows and text from the result. ${run.edit.instruction || "Apply the drawn corrections."}`;
        } else {
          sources = [run.sketch, parent.generatedImage!];
          prompt = `Update the pose of the adult anatomical mannequin. Image 1 is the REVISED gesture sketch and is the authoritative pose target. Image 2 is the previous rendered mannequin, for body proportions and appearance. Apply ONLY the listed pose changes below to Image 2, using Image 1 to locate the new limb positions. Preserve the camera angle, head, torso, proportions and every unchanged limb from Image 2. Do not rotate the whole body or reinterpret unchanged parts of the sketch. Horizontal lines extending from shoulders are outstretched arms, not extra-wide shoulders. Erased lines are no longer part of the pose. Never duplicate a moved limb. Output one full-body smooth gray mannequin on a plain off-white background, no sketch lines, annotations or text. Required pose changes: ${run.description || "Follow the new sketch, even when it differs from the old rendered pose."} ${run.edit.instruction || ""}`;
        }
      }
      const images = await Promise.all(sources.map(localData));
      if (geminiImage) {
        const imageParts = images.map(data => {
          const image = parseImage(data);
          return { inlineData: { mimeType: image.mime, data: image.bytes.toString("base64") } };
        });
        const generationConfig = run.settings.imageModel === "gemini-3.1-flash-lite-image"
          ? { responseModalities: ["IMAGE"], thinkingConfig: { thinkingLevel: "minimal" } }
          : { responseModalities: ["TEXT", "IMAGE"] };
        const payload = { contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }], generationConfig };
        await fs.writeFile(assetPath(id, "image-input.json"), JSON.stringify({ model: run.settings.imageModel, prompt, images: sources, generationConfig }, null, 2));
        const result = await providerJSON(`https://generativelanguage.googleapis.com/v1beta/models/${run.settings.imageModel}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": keys.gemini! },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(240000),
        }, "Gemini image generation");
        await fs.writeFile(assetPath(id, "image-output.json"), JSON.stringify(result, null, 2));
        run.generatedImage = await storeImage(id, "generated", geminiImageData(result));
      } else {
      const payload = { prompt, image_urls: images, seed: run.settings.seed, num_images: 1, image_size: "portrait_4_3", output_format: "png", enable_safety_checker: true, enable_prompt_expansion: false };
      await fs.writeFile(assetPath(id, "image-input.json"), JSON.stringify({ ...payload, image_urls: sources }, null, 2));
      const result = await fal(run, stage, run.settings.imageModel, payload, keys.fal!);
      await fs.writeFile(assetPath(id, "image-output.json"), JSON.stringify(result, null, 2));
      if (result.has_nsfw_concepts?.some(Boolean)) throw new Error("The image provider did not return a usable image for this request. Revise the reference or prompt.");
      const imageURL = result.images?.[0]?.url;
      if (!imageURL) throw new Error("The image provider returned no image.");
      run.generatedImage = await downloadAsset(id, "generated.png", imageURL);
      }
      run.imageSource = "generated";
      run.status = "ready";
    } else {
      const inputImage = run.recipe === "direct" ? run.sketch : run.generatedImage!;
      const payload = { image_url: await localData(inputImage), export_meshes: true, include_3d_keypoints: false, include_mhr_params: true };
      await fs.writeFile(assetPath(id, "model-input.json"), JSON.stringify({ ...payload, image_url: inputImage }, null, 2));
      const result = await fal(run, stage, run.settings.bodyModel, payload, keys.fal!);
      await fs.writeFile(assetPath(id, "model-output.json"), JSON.stringify(result, null, 2));
      const modelURL = typeof result.model_glb === "string" ? result.model_glb : result.model_glb?.url;
      if (!modelURL || result.metadata?.num_people === 0) throw new Error("SAM could not reconstruct a person from this image. Try a clearer full-body reference.");
      run.model = await downloadAsset(id, "body.glb", modelURL);
      const visualizationURL = typeof result.visualization === "string" ? result.visualization : result.visualization?.url;
      if (visualizationURL) {
        try { run.visualization = await downloadAsset(id, "reconstruction.png", visualizationURL); } catch { /* Model and metadata are sufficient; keep the successful reconstruction. */ }
      }
      run.status = "complete";
    }
    const record = run.stages[run.stages.length - 1];
    record.status = "complete"; record.finishedAt = new Date().toISOString(); record.durationMs = Date.now() - started;
    await saveRun(run);
    return run;
  } catch (error) {
    if (run) {
      run.status = "error";
      run.error = error instanceof Error ? error.message : "This step failed.";
      const record = run.stages[run.stages.length - 1];
      if (record?.status === "running") { record.status = "error"; record.error = run.error; record.finishedAt = new Date().toISOString(); record.durationMs = Date.now() - Date.parse(record.startedAt); }
      await saveRun(run);
    }
    throw error;
  } finally { locks.delete(id); }
}
