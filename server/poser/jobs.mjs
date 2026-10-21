import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { generatePose, PoseError } from './pipeline.mjs';

export const isJobId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const terminal = status => status === 'complete' || status === 'failed';

export async function createPoseJobs({ directory, reference, geminiKey, falKey, generate = generatePose }) {
  await mkdir(directory, { recursive: true });
  const jobs = new Map();
  let active = null;
  async function save(job) {
    const file = join(directory, `${job.id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(job));
    await rename(`${file}.tmp`, file);
  }
  for (const filename of await readdir(directory)) {
    if (!filename.endsWith('.json') || !isJobId(filename.slice(0, -5))) continue;
    try {
      const job = JSON.parse(await readFile(join(directory, filename), 'utf8'));
      if (!terminal(job.status)) {
        // A restart must never silently resubmit a paid generation.
        job.status = 'failed'; job.error = 'Generation was interrupted by a server restart. Generate again to retry.';
        await save(job);
      }
      jobs.set(job.id, job);
    } catch { /* An unreadable record is not a running generation. */ }
  }
  const publicJob = job => ({ id: job.id, status: job.status, error: job.error, modelUrl: job.status === 'complete' ? `/api/poser/models/${job.id}` : undefined });
  return {
    configured: Boolean(geminiKey && falKey),
    get(id) { const job = jobs.get(id); return job ? publicJob(job) : null; },
    modelPath(id) { return jobs.get(id)?.status === 'complete' ? join(directory, `${id}.glb`) : null; },
    async start(id, sketch) {
      if (jobs.has(id)) return publicJob(jobs.get(id));
      if (active) throw Object.assign(new Error('A model is already generating.'), { status: 409 });
      active = id;
      const job = { id, status: 'queued' };
      jobs.set(id, job);
      try { await save(job); }
      catch (error) { active = null; jobs.delete(id); throw error; }
      // Lives on the server: switching medium or refreshing cannot cancel a paid request.
      void (async () => {
        try {
          const model = await generate(sketch, { geminiKey, falKey, reference, onStage: async (status, details) => {
            Object.assign(job, { status }, details); await save(job);
          } });
          await writeFile(join(directory, `${id}.glb`), model);
          job.status = 'complete';
        } catch (error) {
          job.status = 'failed'; job.error = error instanceof PoseError ? error.message : 'Generation failed. Your sketch is preserved.';
        } finally {
          try { await save(job); } finally { active = null; }
        }
      })().catch(() => { job.status = 'failed'; job.error = 'Could not save the generated model.'; });
      return publicJob(job);
    },
  };
}
