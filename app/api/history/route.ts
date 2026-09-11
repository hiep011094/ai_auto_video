import { NextResponse } from 'next/server';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { readJsonSafe, writeJsonSafe } from '../../lib/storage';
import { resolveProjectPath, InputError } from '../../lib/security';
import { readHistory } from '../../lib/history-store';
import { withFileLock } from '../../lib/storage';
import { jobsPath, assertProjectIdle } from '../../lib/jobs';
import { randomUUID, createHash } from 'crypto';
import { apiError } from '../../lib/http';
import { historyResponseCache, invalidateHistoryCache } from '../../lib/history-cache';
import type { HistoryItem } from '../../types';

const dbPath = path.join(process.cwd(), 'database', 'history.json');
const queuePath = path.join(process.cwd(), 'queue.json');
const dataRoot = path.join(process.cwd(), 'data');

// ─── Short-lived in-memory cache ─────────────────────────────────────────────
// Cache the expensive "scan all data dirs for session_state.json" result.
// Keyed by taskId → { folder, type }. Refreshed when queue changes or TTL expires.
const _taskFolderCache = new Map<string, { folder: string; type: 'short' | 'long' } | null>();
let _taskFolderCacheTs = 0;
const TASK_FOLDER_CACHE_TTL_MS = 8_000; // 8s — tasks don't move folders mid-run

/**
 * Build a map of taskId → { folder, type } by scanning data directories ONCE.
 * Result is cached for TASK_FOLDER_CACHE_TTL_MS to avoid rescanning every request.
 */
async function buildTaskFolderIndex(): Promise<Map<string, { folder: string; type: 'short' | 'long' } | null>> {
  const now = Date.now();
  if (_taskFolderCache.size > 0 && (now - _taskFolderCacheTs) < TASK_FOLDER_CACHE_TTL_MS) {
    return _taskFolderCache;
  }

  _taskFolderCache.clear();

  const parentDirs: Array<['video_long' | 'video_short', 'long' | 'short']> = [
    ['video_long', 'long'],
    ['video_short', 'short'],
  ];

  // Read all session_state.json files in parallel across both parent dirs
  await Promise.all(
    parentDirs.map(async ([parentDir, folderType]) => {
      const dataDir = path.join(dataRoot, parentDir);
      if (!fs.existsSync(dataDir)) return;

      let dirs: string[];
      try {
        dirs = await fsPromises.readdir(dataDir);
      } catch {
        return;
      }

      await Promise.all(
        dirs.map(async (dir) => {
          const ssPath = path.join(dataDir, dir, 'session_state.json');
          if (!fs.existsSync(ssPath)) return;
          try {
            const ss = readJsonSafe<any>(ssPath, {});
            if (ss.taskId) {
              _taskFolderCache.set(ss.taskId, { folder: dir, type: folderType });
            }
          } catch {
            // ignore corrupt session_state
          }
        })
      );
    })
  );

  _taskFolderCacheTs = now;
  return _taskFolderCache;
}

/** Invalidate the task-folder index (call when queue mutates) */
function invalidateTaskFolderCache(): void {
  _taskFolderCache.clear();
  _taskFolderCacheTs = 0;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const lang = searchParams.get('lang') || searchParams.get('language');

    // ── Build ETag from mtime of history.json + queue.json ──────────────────
    const histMtime = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : 0;
    const queueMtime = fs.existsSync(queuePath) ? fs.statSync(queuePath).mtimeMs : 0;
    const etag = `"h-${histMtime}-${queueMtime}"`;
    const cacheKey = `${type ?? ''}|${lang ?? ''}`;

    // ETag revalidation — browser sends If-None-Match on repeat requests
    const clientEtag = request.headers.get('if-none-match');
    const cached = historyResponseCache.get(cacheKey);

    // NOTE: Always recompute etag from current mtime BEFORE checking the cache.
    // If an external process (e.g. agent) wrote history.json directly, mtime will
    // have changed and etag won't match the cached entry, forcing a fresh read.
    if (clientEtag && clientEtag === etag && cached && cached.etag === etag) {
      return new NextResponse(null, { status: 304 });
    }
    // In-memory cache hit — only reuse when etag matches current file mtime
    if (cached && cached.etag === etag) {
      const res = NextResponse.json(cached.payload);
      res.headers.set('Cache-Control', 'no-cache');
      res.headers.set('ETag', etag);
      return res;
    }
    // Cache miss or stale (file was written externally) — always rebuild below

    // Safely read history.json. It should be a flat array, but we also handle legacy {topics: []} wrapper
    const rawData = readJsonSafe<any>(dbPath, []);
    let topics: HistoryItem[] = Array.isArray(rawData) ? rawData : (rawData.topics || []);

    if (type) {
      topics = topics.filter((t) => t.type === type);
    }

    // Enrich missing language field CONCURRENTLY (was sequential map)
    topics = await Promise.all(
      topics.map(async (t) => {
        if (t.language) return t;
        try {
          const parentFolder = t.type === 'long' ? 'video_long' : 'video_short';
          const metaPath = path.join(dataRoot, parentFolder, t.folder, 'metadata.json');
          if (fs.existsSync(metaPath)) {
            const meta = readJsonSafe<any>(metaPath, {});
            if (meta.language === 'en' || meta.language === 'vi') {
              return { ...t, language: meta.language };
            }
          }
        } catch {
          // ignore
        }
        return { ...t, language: 'vi' as const };
      })
    );

    // ─── Inject in-progress tasks from queue.json ───────────────────────────
    try {
      const queue = readJsonSafe<any[]>(queuePath, []);
      const inProgressStatuses = ['processing', 'visual_sessions_pending'];
      const inProgressTasks = queue.filter(
        (task) => !task.skill && inProgressStatuses.includes(task.status)
      );

      if (inProgressTasks.length > 0) {
        // Build index ONCE for all tasks (replaces per-task O(dirs) scan)
        const taskFolderIndex = await buildTaskFolderIndex();

        for (const task of inProgressTasks) {
          const outputFolder: string | undefined = task.outputFolder;
          const videoType: 'short' | 'long' = task.videoType === 'long' ? 'long' : 'short';

          let folder: string;
          let resolvedType: 'short' | 'long' = videoType;

          if (!outputFolder) {
            // O(1) lookup from pre-built index instead of O(dirs) scan
            const found = taskFolderIndex.get(task.id);
            if (!found) continue;
            folder = found.folder;
            resolvedType = found.type;
          } else {
            folder = outputFolder.includes('/') ? outputFolder.split('/').pop()! : outputFolder;
          }

          // Skip if already visible in history
          if (topics.some((t) => t.folder === folder)) continue;
          // Skip if type filter doesn't match
          if (type && resolvedType !== type) continue;

          // Read metadata for display title
          const parentFolder = resolvedType === 'long' ? 'video_long' : 'video_short';
          let title = task.topic || folder;
          let language: 'vi' | 'en' = task.language === 'en' ? 'en' : 'vi';

          try {
            const metaPath = path.join(dataRoot, parentFolder, folder, 'metadata.json');
            if (fs.existsSync(metaPath)) {
              const meta = readJsonSafe<any>(metaPath, {});
              if (meta.title) title = meta.title;
              if (meta.language === 'en' || meta.language === 'vi') language = meta.language;
            }
          } catch {
            // ignore
          }

          if (lang && language !== lang) continue;

          const syntheticItem: any = {
            id: `queue-${task.id}`,
            title: `⏳ [Đang tạo ${task.progress ?? 0}%] ${title}`,
            folder,
            date: task.createdAt || new Date().toISOString(),
            created_at: task.createdAt || new Date().toISOString(),
            type: resolvedType,
            language,
            youtube_status: 'pending',
            capcut_created: false,
            _inProgress: true,
            _progress: task.progress ?? 0,
          };

          topics.unshift(syntheticItem);
        }
      }
    } catch (e) {
      console.error('History API: failed to read queue for in-progress injection:', e);
    }
    // ────────────────────────────────────────────────────────────────────────

    if (lang) {
      topics = topics.filter((t) => t.language === lang);
    }

    // Đảo ngược mảng để cái mới nhất lên đầu
    topics.reverse();

    const payload = { topics };

    // Update in-memory response cache
    historyResponseCache.set(cacheKey, { etag, payload });

    const response = NextResponse.json(payload);
    response.headers.set('Cache-Control', 'no-cache');
    response.headers.set('ETag', etag);
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('Error reading history:', e);
    return NextResponse.json({ topics: [], error: msg }, { status: 500 });
  }
}

/**
 * POST /api/history
 * Body: { action: "invalidate" }
 *
 * Called by agent scripts after writing history.json directly to disk.
 * Clears the in-memory response cache so the next GET always reads the
 * freshly written file instead of serving stale data.
 */
export async function POST(request: Request) {
  try {
    // Windows CLI (cmd/powershell) often breaks JSON escaping in curl commands.
    // So we try to parse JSON, but we will invalidate the cache even if parsing fails,
    // as invalidation is the only purpose of POST /api/history.
    const text = await request.text().catch(() => '');
    let action = 'invalidate'; // Default to invalidate
    try {
      const body = JSON.parse(text);
      if (body.action) action = body.action;
    } catch (e) {
      // Ignore parse error
    }

    if (action === 'invalidate') {
      invalidateHistoryCache();
      invalidateTaskFolderCache();
      return NextResponse.json({ success: true, message: 'History cache invalidated' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


export async function DELETE(request: Request) {
  try {
    const q = new URL(request.url).searchParams, id = q.get('id'), type = q.get('type');
    if (!id || (id==='all' && !['short','long'].includes(type||''))) throw new InputError('Cần mã dự án hoặc loại short/long.');
    const targets = readHistory().filter(row=>id==='all'?row.type===type:row.id===id);
    if (!targets.length) throw new InputError('Không tìm thấy dự án.',404);
    const lockUploads = async (index:number):Promise<unknown> => {
      if (index < targets.length) {
        const receipt = path.join(process.cwd(),'database/operations/uploads',createHash('sha256').update(targets[index].id).digest('hex')+'.json');
        return withFileLock(receipt,()=>lockUploads(index+1),300);
      }
      return withFileLock(jobsPath(),()=>withFileLock(dbPath,()=>{
        const current=readHistory(), ids=new Set(targets.map(row=>row.id));
        const selected=current.filter(row=>ids.has(row.id));
        for(const row of selected) assertProjectIdle(row.folder);
        const archive=path.join(dataRoot,'.trash',randomUUID());
        fs.mkdirSync(archive,{recursive:true});
        writeJsonSafe(path.join(archive,'history.json'),selected);
        const moved:Array<{from:string;to:string}>=[];
        try {
          for(const row of selected){
            const from=resolveProjectPath(row.folder,row.type), to=path.join(archive,`video_${row.type}`,row.folder);
            if(fs.existsSync(from)){fs.mkdirSync(path.dirname(to),{recursive:true});fs.renameSync(from,to);moved.push({from,to});}
          }
          writeJsonSafe(dbPath,current.filter(row=>!ids.has(row.id)));
        } catch(error){for(const item of moved.reverse())fs.renameSync(item.to,item.from);throw error;}
        invalidateHistoryCache();invalidateTaskFolderCache();
        return {success:true,archivedAt:path.relative(process.cwd(),archive),message:'Đã chuyển dự án vào data/.trash; có thể khôi phục từ thư mục lưu trữ.'};
      }));
    };
    targets.sort((a,b)=>a.id.localeCompare(b.id));
    return NextResponse.json(await lockUploads(0));
  } catch(error){return apiError(error);}
}
