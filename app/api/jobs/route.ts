import { NextResponse } from 'next/server';
import { listJobs, controlJob, wakeWorker } from '../../lib/jobs';
import { apiError } from '../../lib/http';
import { InputError } from '../../lib/security';
export async function GET() {
  try {
    const jobs = listJobs(); if (jobs.some(j => ['pending','processing','cancel_requested'].includes(j.status))) wakeWorker();
    return NextResponse.json(jobs, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const { id, action } = await request.json();
    if (typeof id !== 'string' || !['cancel','retry'].includes(action) || !listJobs().some(j => j.id === id)) throw new InputError('Tác vụ hoặc hành động không hợp lệ.');
    await controlJob(id, action); return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
