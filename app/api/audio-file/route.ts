import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveAudioPath, resolveProjectPath, InputError, AUDIO_EXTENSIONS } from '../../lib/security';
import { apiError } from '../../lib/http';
const MAX_AUDIO_BYTES = 256 * 1024 * 1024;
function parameters(request: Request) {
  const p = new URL(request.url).searchParams;
  return { folder: p.get('folder'), type: p.get('type') || 'short', filename: p.get('filename') };
}
export async function GET(request: Request) {
  try {
    const { folder, type, filename } = parameters(request);
    const file = resolveAudioPath(folder, type, filename);
    if (!fs.existsSync(file)) throw new InputError('Chưa có tệp âm thanh.', 404);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > MAX_AUDIO_BYTES) throw new InputError('Tệp âm thanh quá lớn.', 413);
    const contentType = ({ '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac' } as Record<string, string>)[path.extname(file).toLowerCase()] || 'audio/mpeg';
    const buffer = fs.readFileSync(file);
    const range = request.headers.get('range');
    const headers = { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.length}` } });
      const start = match[1] ? Number(match[1]) : Math.max(0, buffer.length - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
      if (start > end || start >= buffer.length) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.length}` } });
      return new Response(buffer.subarray(start, end + 1), { status: 206, headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${buffer.length}` } });
    }
    return new Response(buffer, { headers: { ...headers, 'Content-Length': String(buffer.length) } });
  } catch (error) { return apiError(error); }
}
export async function DELETE(request: Request) {
  try {
    const { folder, type, filename } = parameters(request);
    const project = resolveProjectPath(folder, type);
    const names = filename === 'all'
      ? fs.readdirSync(project).filter(name => AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase()) && !name.startsWith('tong_hop_loi_thoai'))
      : [filename];
    for (const name of names) {
      const file = resolveAudioPath(folder, type, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const { folder, type, filename } = parameters(request);
    const file = resolveAudioPath(folder, type, filename);
    if (Number(request.headers.get('content-length')) > MAX_AUDIO_BYTES) throw new InputError('Tệp âm thanh quá lớn.', 413);
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = request.body?.getReader();
    if (!reader) throw new InputError('Thiếu nội dung âm thanh.');
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) { await reader.cancel(); throw new InputError('Tệp âm thanh quá lớn.', 413); }
      chunks.push(value);
    }
    if (!size) throw new InputError('Tệp âm thanh trống.');
    const buffer = Buffer.concat(chunks);
    const ext = path.extname(file).toLowerCase();
    const isWav = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE';
    const isMp3 = buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
    if ((ext === '.wav' && !isWav) || (ext === '.mp3' && !isMp3)) throw new InputError('Định dạng tệp không khớp phần mở rộng.');
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, buffer); fs.renameSync(temporary, file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return NextResponse.json({ success: true, status: 'success', message: 'Đã lưu âm thanh.' });
  } catch (error) { return apiError(error); }
}
