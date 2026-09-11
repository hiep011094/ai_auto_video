import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/** Missing files may use a default; malformed existing files must never be overwritten silently. */
export function readJsonStrict<T>(filePath: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return structuredClone(fallback);
    throw new Error(`Không thể đọc JSON hợp lệ: ${path.basename(filePath)}`, { cause: error });
  }
}
export function readJsonSafe<T>(filePath: string, fallback: T): T {
  try { return readJsonStrict(filePath, fallback); }
  catch (error) { console.error('[storage]', error); return structuredClone(fallback); }
}
export function ensureDir(dir: string): void { fs.mkdirSync(dir, { recursive: true }); }
export function writeJsonSafe(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  if (fs.existsSync(filePath)) readJsonStrict(filePath, null);
  const temporary = path.join(path.dirname(filePath), `.tmp_${crypto.randomUUID()}.json`);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(descriptor); fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, filePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
/** File lock shared with the Python completion tool. Never steal a live process's lock. */
export async function withFileLock<T>(filePath: string, action: () => T | Promise<T>, timeout = 10_000): Promise<T> {
  ensureDir(path.dirname(filePath));
  const lockPath = `${filePath}.lock`, token = crypto.randomUUID(), deadline = Date.now() + timeout;
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token })); } finally { fs.closeSync(fd); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number };
        try { process.kill(owner.pid, 0); }
        catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ESRCH') fs.unlinkSync(lockPath); }
      } catch { /* A just-created lock may not have its payload yet. */ }
      if (Date.now() >= deadline) throw new Error('Dữ liệu đang được cập nhật. Vui lòng thử lại.');
      await new Promise(resolve => setTimeout(resolve, 40));
    }
  }
  try { return await action(); }
  finally {
    const owner = readJsonStrict<{ token?: string }>(lockPath, {});
    if (owner.token === token) fs.unlinkSync(lockPath);
  }
}
export async function updateJson<T>(filePath: string, fallback: T, mutate: (current: T) => T): Promise<T> {
  return withFileLock(filePath, () => {
    const updated = mutate(readJsonStrict(filePath, fallback));
    writeJsonSafe(filePath, updated); return updated;
  });
}
