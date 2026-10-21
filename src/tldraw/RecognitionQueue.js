// Requests belong to ink groups. An unrelated gesture never invalidates their answers.
export class RecognitionQueue {
  constructor({ evaluate, isCurrent, apply, canApply, onPending, onError, delay = 120 }) {
    Object.assign(this, { evaluate, isCurrent, apply, canApply, onPending, onError, delay });
    this.jobs = new Map();
    this.active = 0;
  }

  schedule(group) {
    const ids = new Set([...group.members.map(m => m.id), group.control?.id]);
    this.invalidate(job => [...job.group.members, job.group.control].some(m => m && ids.has(m.id)));
    const job = { group, controller: new AbortController(), ready: false, started: false, answered: false };
    this.jobs.set(group.key, job);
    job.timer = setTimeout(() => { job.ready = true; this.pump(); }, this.delay);
    this.notify();
  }

  invalidate(predicate = () => true) {
    for (const [key, job] of this.jobs) {
      if (!predicate(job)) continue;
      clearTimeout(job.timer);
      job.controller.abort();
      this.jobs.delete(key);
    }
    this.notify();
  }

  notify() { this.onPending(this.jobs.size > 0); }

  pump() {
    for (const job of this.jobs.values()) {
      if (this.active >= 2) break;
      if (!job.ready || job.started) continue;
      job.started = true;
      this.active++;
      this.evaluate(job.group, job.controller.signal)
        .then(result => {
          if (this.jobs.get(job.group.key) !== job) return;
          job.result = result;
          job.answered = true;
          this.flush();
        })
        .catch(error => {
          if (this.jobs.get(job.group.key) !== job) return;
          this.jobs.delete(job.group.key);
          if (error.name !== 'AbortError') this.onError(error.message);
        })
        .finally(() => { this.active--; this.notify(); this.pump(); });
    }
  }

  flush() {
    // Applying an async conversion must not split another active pen gesture's undo step.
    if (!this.canApply()) return;
    for (const [key, job] of this.jobs) {
      if (!job.answered) continue;
      this.jobs.delete(key);
      if (this.isCurrent(job.group)) {
        try { this.apply(job.group, job.result); }
        catch (error) { this.onError(error.message); }
      }
    }
    this.notify();
  }
}
