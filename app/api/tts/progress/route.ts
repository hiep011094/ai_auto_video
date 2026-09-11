import { NextResponse } from 'next/server';
import fs from 'fs';
import { resolveProjectPath, resolveWithin, InputError } from '../../../lib/security';
import { apiError } from '../../../lib/http';
import { listJobs } from '../../../lib/jobs';
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const folder = q.get('folder'), type = q.get('type');
    const project = resolveProjectPath(folder, type);
    const name = q.get('logName') || 'tts.log';
    if (!/^(?:(?:saydi_|capcut_|vbee_)?tts)(?:_scene_[1-9][0-9]*)?\.log$/.test(name)) throw new InputError('Tên log không hợp lệ.');
    const log = resolveWithin(project, name);
    if (!log) throw new InputError('Đường dẫn log không hợp lệ.');
    let content = '';
    if (fs.existsSync(log)) {
      const fd = fs.openSync(log, 'r');
      try { const size = fs.fstatSync(fd).size; const buffer = Buffer.alloc(Math.min(size, 64*1024));fs.readSync(fd,buffer,0,buffer.length,Math.max(0,size-buffer.length));content=buffer.toString('utf8'); }
      finally { fs.closeSync(fd); }
    }
    const jobs = listJobs().filter(j=>j.params.folder===folder && j.params.type===type && ['saydi','capcut-tts','vbee'].includes(j.kind));
    const latest = jobs.at(-1);
    const complete = latest ? latest.status==='completed' : content.includes('TẤT CẢ ĐÃ HOÀN TẤT');
    return NextResponse.json({status:'success',logs:content.trim().split('\n').slice(-15).join('\n')||'Đang chờ xử lý.',percent:complete?100:0,jobId:latest?.id,jobStatus:latest?.status,error:latest?.error}, {headers:{'Cache-Control':'no-store'}});
  } catch(error) { return apiError(error); }
}
