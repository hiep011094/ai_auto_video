import { NextResponse } from 'next/server';
import fs from 'fs';
import { resolveAudioPath, InputError } from '../../lib/security';
import { openDesktopPath } from '../../lib/desktop';
import { apiError } from '../../lib/http';
export async function POST(request: Request) {
  try {
    const p = new URL(request.url).searchParams;
    const file = resolveAudioPath(p.get('folder'), p.get('type'), p.get('filename'));
    if (!fs.existsSync(file)) throw new InputError('Không tìm thấy âm thanh.', 404);
    await openDesktopPath(file); return NextResponse.json({ status: 'success', message: 'Đã mở âm thanh.' });
  } catch (error) { return apiError(error); }
}
