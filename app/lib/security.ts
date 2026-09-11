import path from 'path';
import fs from 'fs';
import os from 'os';

export class InputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
export function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
/** Resolve symlinks/junctions, including the existing ancestor of a new output. */
function physicalPath(value: string): string {
  let existing = path.resolve(value);
  const suffix: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return path.resolve(value);
    suffix.unshift(path.basename(existing)); existing = parent;
  }
  return path.join(fs.realpathSync.native(existing), ...suffix);
}
export function resolveWithin(root: string, input: string): string | null {
  if (typeof input !== 'string' || !input || /[\x00-\x1f]/.test(input)) return null;
  try {
    const base = path.resolve(root), resolved = path.resolve(input);
    if (!isWithin(base, resolved) || !isWithin(physicalPath(base), physicalPath(resolved))) return null;
    return resolved;
  } catch { return null; }
}
export function getScanRoot(): string { return path.resolve(process.env.VUTRU_SCAN_ROOT || path.join(process.cwd(), 'data')); }
export function sanitizePath(input: string): string | null {
  const roots = [path.join(process.cwd(), 'data'), getScanRoot()];
  return roots.map(root => resolveWithin(root, input)).find(Boolean) || null;
}
/** Browsing is read-only; these roots must never authorize writes. */
export function sanitizeBrowsePath(input: string): string | null {
  if (typeof input !== 'string' || !input) return null;
  const resolved = path.resolve(input);
  if (process.platform === 'win32' && /^[A-Z]:\\$/i.test(resolved)) return resolved;
  return [process.cwd(), os.homedir(), getScanRoot()].map(root => resolveWithin(root, resolved)).find(Boolean) || null;
}
export function validFolderName(value: unknown): value is string {
  return typeof value === 'string' && /^[\p{L}\p{N}][\p{L}\p{N}_. -]{0,179}$/u.test(value)
    && !value.includes('..') && !/[. ]$/.test(value) && !/^(CON|PRN|AUX|NUL|COM\d|LPT\d)(\.|$)/i.test(value);
}
export function resolveProjectPath(folder: unknown, type: unknown): string {
  if (type !== 'short' && type !== 'long') throw new InputError('Loại video phải là short hoặc long.');
  if (!validFolderName(folder)) throw new InputError('Tên thư mục dự án không hợp lệ.');
  const parent = path.join(process.cwd(), 'data', type === 'long' ? 'video_long' : 'video_short');
  const result = resolveWithin(parent, path.join(parent, folder));
  if (!result) throw new InputError('Không được truy cập ngoài thư mục dự án.', 403);
  return result;
}
export function resolveProjectInput(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new InputError('Thiếu đường dẫn dự án.');
  const absolute = path.resolve(input);
  for (const type of ['short', 'long'] as const) {
    const parent = path.join(process.cwd(), 'data', `video_${type}`);
    if (path.dirname(absolute).toLowerCase() === parent.toLowerCase()) return resolveProjectPath(path.basename(absolute), type);
  }
  throw new InputError('Chỉ được thao tác dự án trong data/video_short hoặc data/video_long.', 403);
}
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac']);
export function resolveAudioPath(folder: unknown, type: unknown, filename: unknown): string {
  const project = resolveProjectPath(folder, type);
  if (typeof filename !== 'string' || !validFolderName(filename) || !AUDIO_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    throw new InputError('Tên tệp âm thanh không hợp lệ.');
  }
  const result = resolveWithin(project, path.join(project, filename));
  if (!result) throw new InputError('Không được truy cập tệp ngoài dự án.', 403);
  return result;
}
export function validateRequired(body: Record<string, unknown>, fields: string[]): string[] {
  return fields.filter(field => body[field] === undefined || body[field] === null || body[field] === '');
}
export function sanitizeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\.\./g, '_').replace(/^\./, '_').trim();
}
