import { resolveProjectPath } from '../../lib/security';
import { NextResponse } from 'next/server';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';
import { sanitizePath } from '../../lib/security';
import { readJsonSafe } from '../../lib/storage';
import type { ProjectMetadata, Scene } from '../../types';

// ─── In-process payload cache ────────────────────────────────────────────────
// Key: `${folder}|${type}`  Value: { etag, payload }
// ETag is derived from the max mtime of all files in the project folder.
// When files change (TTS output, audit result, etc.) mtime updates → cache busts.
interface ContentCache {
  etag: string;
  payload: Record<string, unknown>;
}
const _contentCache = new Map<string, ContentCache>();

/** Compute ETag from the maximum mtime across all files in a directory */
async function computeFolderEtag(dirPath: string): Promise<string> {
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    let maxMtime = 0;
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isFile()) return;
        try {
          const st = await fsPromises.stat(path.join(dirPath, entry.name));
          if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
        } catch {
          // ignore
        }
      })
    );
    return `"c-${maxMtime}"`;
  } catch {
    return `"c-${Date.now()}"`;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');
    const type = searchParams.get('type') || 'short';

    if (!folder) {
      return NextResponse.json({ error: 'Missing folder parameter' }, { status: 400 });
    }

    const projectPath = resolveProjectPath(folder, type);

    // Security: validate resolved path
    const safePath = sanitizePath(projectPath);
    if (!safePath) {
      return NextResponse.json({ error: 'Invalid folder path' }, { status: 403 });
    }

    if (!fs.existsSync(safePath)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── ETag check — compute ONCE before any file reads ──────────────────────
    const etag = await computeFolderEtag(safePath);
    const cacheKey = `${folder}|${type}`;
    const clientEtag = request.headers.get('if-none-match');

    // 304 Not Modified — browser already has the latest version
    if (clientEtag && clientEtag === etag) {
      return new NextResponse(null, { status: 304 });
    }

    // In-process cache hit — return serialized payload without re-reading disk
    const cached = _contentCache.get(cacheKey);
    if (cached && cached.etag === etag) {
      const res = NextResponse.json(cached.payload);
      res.headers.set('Cache-Control', 'no-cache');
      res.headers.set('ETag', etag);
      return res;
    }

    // ── Phase 1: Read directory listing ──────────────────────────────────────
    // Use the already-read entries (readdirSync is cheap after stat above)
    const files = fs.readdirSync(safePath);
    const chapterFiles = files
      .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('chapter_', '').replace('.json', '')) || 0;
        const numB = parseInt(b.replace('chapter_', '').replace('.json', '')) || 0;
        return numA - numB;
      });
    const audioFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));

    // ── Phase 2: Read all files truly in parallel ─────────────────────────────
    // Note: readJsonSafe uses mtime-based in-memory cache internally, so repeat
    // reads of unchanged files are O(1) Map lookups — no re-parse needed.
    const readText = async (filePath: string): Promise<string | null> => {
      try {
        return await fsPromises.readFile(filePath, 'utf8');
      } catch {
        return null;
      }
    };

    const [
      rawMetadata,
      chaptersData,
      seo_optimized,
      master_script,
      tong_hop_veo_prompt,
      remediation_plan,
      audit_report,
      capcutExists,
      hasSrtFile,
      hasSceneSrtFile,
    ] = await Promise.all([
      // metadata.json — readJsonSafe has own mtime cache, stays fast
      Promise.resolve(readJsonSafe<ProjectMetadata>(path.join(safePath, 'metadata.json'), {} as ProjectMetadata)),

      // All chapter_xx.json files — parallel per-chapter reads
      Promise.all(
        chapterFiles.map(async (file) => ({
          file,
          data: readJsonSafe<Scene[]>(path.join(safePath, file), []),
        }))
      ),

      // seo_optimized.json
      Promise.resolve(readJsonSafe<unknown>(path.join(safePath, 'seo_optimized.json'), null)),

      // master_script.txt — async read
      readText(path.join(safePath, 'master_script.txt')),

      // tong_hop_veo_prompt.json
      Promise.resolve(readJsonSafe<unknown>(path.join(safePath, 'tong_hop_veo_prompt.json'), null)),

      // remediation_plan.md — async read
      readText(path.join(safePath, 'remediation_plan.md')),

      // audit_report.json
      Promise.resolve(readJsonSafe<unknown>(path.join(safePath, 'audit_report.json'), null)),

      // CapCut project detection — async existsCheck
      fsPromises.access(
        path.join(os.homedir(), 'AppData', 'Local', 'CapCut', 'User Data', 'Projects',
          'com.lveditor.draft', folder, 'draft_content.json')
      ).then(() => true).catch(() => false),

      // AUDIO SRT file detection — check AUDIO_folder.srt
      fsPromises.access(path.join(safePath, `AUDIO_${folder}.srt`))
        .then(() => true).catch(() => false),

      // SCENE SRT file detection — check SCENE_folder.srt
      fsPromises.access(path.join(safePath, `SCENE_${folder}.srt`))
        .then(() => true).catch(() => false),
    ]);


    // ── Backward compatibility patches on metadata ────────────────────────────
    let metadata = rawMetadata;
    if (metadata.youtube_title && !metadata.title) {
      metadata = { ...metadata, title: metadata.youtube_title };
    }
    if (metadata.youtube_description && !metadata.description) {
      metadata = { ...metadata, description: metadata.youtube_description };
    }

    const hasCapcutProject = capcutExists || Boolean((metadata as any).capcut_created);

    const payload: Record<string, unknown> = {
      metadata,
      chapters: chaptersData,
      audioFiles,
      seo_optimized,
      hasCapcutProject,
      hasSrtFile,          // true if AUDIO_folder.srt exists
      hasSceneSrtFile,     // true if SCENE_folder.srt exists
      master_script,
      tong_hop_veo_prompt,
      remediation_plan,
      audit_report,
    };

    // Store in process-level cache for subsequent calls
    _contentCache.set(cacheKey, { etag, payload });

    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', 'no-cache');
    response.headers.set('ETag', etag);
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Error reading content:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
