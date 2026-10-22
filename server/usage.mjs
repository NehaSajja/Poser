import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { isIP } from 'node:net';

export function limitValue(value, fallback) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('Usage limits must be nonnegative integers.');
  return number;
}
// Single server instance. Reserve before the provider call; persist across restarts.
// Counts attempts, not money or successful generations. Zero disables paid calls.
export function createDailyQuota({ file, limit, totalLimit = Infinity, now = () => new Date() }) {
  mkdirSync(dirname(file), { recursive: true });
  let state;
  try {
    state = JSON.parse(readFileSync(file, 'utf8'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(state.day) || !Number.isSafeInteger(state.used) || state.used < 0) throw new Error('Invalid usage ledger');
    state.total ??= state.used;
    if (!Number.isSafeInteger(state.total) || state.total < state.used) throw new Error('Invalid total usage ledger');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // Fail closed; never reset a broken ledger.
    state = { day: now().toISOString().slice(0, 10), used: 0, total: 0 };
  }
  return () => {
    const day = now().toISOString().slice(0, 10);
    const used = state.day === day ? state.used : 0;
    if (state.total >= totalLimit) throw Object.assign(new Error('The overall demo allowance has been reached. Ask the owner to extend it.'), { status: 429 });
    if (used >= limit) throw Object.assign(new Error('Today’s demo allowance has been reached. Please try again tomorrow.'), { status: 429 });
    const next = { day, used: used + 1, total: state.total + 1 };
    writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
    state = next;
  };
}

export function clientAddress(req, proxy = false) {
  const header = proxy === 'fly' ? 'fly-client-ip' : 'x-real-ip';
  const address = req.headers[header];
  return proxy && typeof address === 'string' && isIP(address) ? address : req.socket.remoteAddress || 'unknown';
}
export function createVisitorLimiter({ limit = 12, windowMs = 60_000, now = Date.now, maxVisitors = 10_000 } = {}) {
  const visitors = new Map();
  return address => {
    const time = now();
    for (const [key, value] of visitors) if (value.until <= time) visitors.delete(key);
    let entry = visitors.get(address);
    if (!entry) {
      if (visitors.size >= maxVisitors) return false;
      entry = { used: 0, until: time + windowMs }; visitors.set(address, entry);
    }
    if (entry.used >= limit) return false;
    entry.used++; return true;
  };
}
