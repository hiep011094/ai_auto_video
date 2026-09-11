import { NextResponse } from 'next/server';
import fs from 'fs';
import { resolveProjectPath, InputError } from '../../lib/security';
import { openDesktopPath } from '../../lib/desktop';
import { apiError } from '../../lib/http';
export async function GET(request: Request) {
  try { const p = new URL(request.url).searchParams; return NextResponse.json({ path: resolveProjectPath(p.get('folder'), p.get('type') || 'short') }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json(); const project = resolveProjectPath(body.folder, body.type || 'short');
    if (!fs.existsSync(project)) throw new InputError('Không tìm thấy dự án.', 404);
    await openDesktopPath(project); return NextResponse.json({ success: true, path: project });
  } catch (error) { return apiError(error); }
}
