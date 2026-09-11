import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { getScanRoot, resolveWithin } from '../../lib/security';
import { readJsonStrict } from '../../lib/storage';
import { apiError } from '../../lib/http';
export async function GET(request: Request) {
  try {
    const root = getScanRoot();
    const parents = [path.join(root, 'video_short'), path.join(root, 'video_long')];
    if (process.env.VUTRU_SCAN_ROOT && !(await fs.stat(parents[0]).catch(() => null)) && !(await fs.stat(parents[1]).catch(() => null))) parents.splice(0, 2, root);
    const folders: Array<{ path: string; name: string; mp4Count: number; parent: string; mtime: number }> = [];
    for (const parent of parents) {
      const entries = await fs.readdir(parent, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        const folder = resolveWithin(parent, path.join(parent, entry.name)); if (!folder) continue;
        const children = await fs.readdir(folder, { withFileTypes: true });
        const videos = children.filter(child => child.isFile() && child.name.toLowerCase().endsWith('.mp4'));
        if (!videos.length) continue;
        const stat = await fs.stat(folder);
        const metadata = readJsonStrict<{ title?: string }>(path.join(folder, 'metadata.json'), {});
        folders.push({ path: folder, name: metadata.title || entry.name, mp4Count: videos.length, parent: path.basename(parent), mtime: stat.mtimeMs });
      }
    }
    folders.sort((a,b) => b.mtime-a.mtime || a.path.localeCompare(b.path));
    const etag = `"${createHash('sha256').update(JSON.stringify(folders)).digest('hex')}"`;
    const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
    if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers });
    return NextResponse.json({ status: 'success', folders }, { headers });
  } catch (error) { return apiError(error); }
}
