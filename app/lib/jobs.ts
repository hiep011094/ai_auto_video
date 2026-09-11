import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { readJsonStrict, updateJson } from './storage';
import { toVNTime } from './time';
import { InputError } from './security';
export type JobKind = 'script'|'veo'|'seo'|'thumbnail'|'saydi'|'capcut-tts'|'vbee'|'align';
export type JobStatus = 'pending'|'processing'|'completed'|'error'|'cancel_requested'|'cancelled';
export interface OperationJob {
  id: string; kind: JobKind; status: JobStatus; params: Record<string, unknown>;
  createdAt: string; updatedAt: string; error?: string; workerPid?: number; childPid?: number;
  result?: unknown;
}
export const jobsPath = () => path.join(process.cwd(), 'database', 'operations', 'jobs.json');
export function wakeWorker(): void {
  if (process.env.NODE_ENV === 'test' || process.env.VUTRU_WORKER_DISABLED === '1') return;
  const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'worker.cjs')], {
    cwd: process.cwd(), env: { ...process.env }, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.on('error', error => console.error('Không thể khởi động worker:', error));
  child.unref();
}
export async function enqueueJob(kind: JobKind, params: Record<string, unknown>, start = true): Promise<OperationJob> {
  const job: OperationJob = { id: randomUUID(), kind, params, status: 'pending', createdAt: toVNTime(), updatedAt: toVNTime() };
  await updateJson<OperationJob[]>(jobsPath(), [], jobs => {
    if (jobs.some(j => j.kind === kind && ['pending','processing','cancel_requested'].includes(j.status) && JSON.stringify(j.params) === JSON.stringify(params))) {
      throw new InputError('Tác vụ này đang chờ hoặc đang chạy.', 409);
    }
    return [...jobs, job];
  });
  if (start) wakeWorker();
  return job;
}
export function listJobs(): OperationJob[] { return readJsonStrict<OperationJob[]>(jobsPath(), []); }
export async function controlJob(id: string, action: 'cancel'|'retry'): Promise<void> {
  let changed: OperationJob | undefined;
  await updateJson<OperationJob[]>(jobsPath(), [], jobs => {
    if (!jobs.some(job => job.id === id)) throw new InputError('Không tìm thấy tác vụ.', 404);
    return jobs.map(job => {
      if (job.id !== id) return job;
      if (action === 'retry' && !['error','cancelled'].includes(job.status)) throw new InputError('Chỉ thử lại tác vụ lỗi hoặc đã hủy.', 409);
      const status = action === 'retry' ? 'pending' : job.status === 'processing' ? 'cancel_requested' : job.status === 'pending' ? 'cancelled' : job.status;
      changed = { ...job, status, error: action === 'retry' ? undefined : job.error, updatedAt: toVNTime() };
      return changed;
    });
  });
  if (changed && ['script','veo'].includes(changed.kind) && ['pending','cancelled'].includes(changed.status)) {
    const updated = changed;
    await updateJson<Array<{id:string;status:string;updatedAt:string;retryCount?:number;errorMessage?:string}>>(path.join(process.cwd(),updated.kind==='script'?'queue.json':'veo_queue.json'),[],rows=>rows.map(row=>row.id===updated.params.taskId?{...row,status:updated.status,errorMessage:undefined,retryCount:(row.retryCount||0)+(action==='retry'?1:0),updatedAt:toVNTime()}:row));
  }
  wakeWorker();
}
export function assertProjectIdle(folder: string): void {
  if (listJobs().some(j => ['pending','processing','cancel_requested'].includes(j.status) && (j.kind === 'script' || j.params.folder === folder || j.params.outputFolder === folder))) {
    throw new InputError('Dự án đang có tác vụ. Hãy hủy hoặc chờ hoàn tất trước khi xóa.', 409);
  }
}
export function workerAvailable(): boolean { return fs.existsSync(path.join(process.cwd(), 'scripts', 'worker.cjs')); }
