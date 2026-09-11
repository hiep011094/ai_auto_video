import { NextResponse } from 'next/server';
import { getPlaylists, getUploadsCountByDate } from '@/app/lib/youtube-auth';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

// ─── In-memory cache for YouTube history (action=history) ─────────────────────
// Keyed by mtime of history.json — auto-invalidated when file changes on disk.
const HISTORY_CACHE_TTL_MS = 60_000; // 60 giây — đủ nhanh để phát hiện file .mp4 mới xuất
interface YTHistoryCache { mtime: number; cachedAt: number; history: any[] }
let _ytHistoryCache: YTHistoryCache | null = null;

function invalidateYTHistoryCache(): void {
  _ytHistoryCache = null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'authStatus') {
      const { loadToken } = await import('@/app/lib/youtube-auth');
      return NextResponse.json({ authenticated: loadToken() });
    }

    if (action === 'history') {
      const dbPath = path.join(process.cwd(), 'database', 'history.json');

      // ── Cache check: only rebuild when history.json actually changed ───────
      const histMtime = fs.existsSync(dbPath) ? fs.statSync(dbPath).mtimeMs : 0;
      const cacheAge = _ytHistoryCache ? Date.now() - _ytHistoryCache.cachedAt : Infinity;
      if (_ytHistoryCache && _ytHistoryCache.mtime === histMtime && cacheAge < HISTORY_CACHE_TTL_MS) {
        return NextResponse.json({ success: true, history: _ytHistoryCache.history });
      }

      let localHistory: any[] = [];
      if (fs.existsSync(dbPath)) {
        const raw = await fsPromises.readFile(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        const rawTopics: any[] = Array.isArray(parsed) ? parsed : (parsed.topics || []);

        // ── Parallel async enrich: all items run concurrently ─────────────────
        // Previously: sequential sync I/O (fs.*Sync) → ~112s for 149 items.
        // Now: Promise.all + fs.promises → all items fetched in parallel → <100ms.
        localHistory = await Promise.all(rawTopics.map(async (item: any) => {
          try {
            const videoTypeStr = item.type === 'short' ? 'video_short' : 'video_long';
            const folderPath = path.join(process.cwd(), 'data', videoTypeStr, item.folder);
            const seoPath = path.join(folderPath, 'seo_optimized.json');
            const metaPath = path.join(folderPath, 'metadata.json');

            let title = item.title;
            let description = '';
            let language = item.language || 'vi';
            let topicKey = '';
            let topicLabel = '';

            // Check folder existence without blocking
            const folderExists = await fsPromises.access(folderPath).then(() => true).catch(() => false);
            if (!folderExists) {
              return { ...item, description: '', language, hasVideo: false, videoFileName: '', topicKey, topicLabel };
            }

            // Read seo, meta, and dir listing ALL IN PARALLEL per item
            const [seoRaw, metaRaw, dirFiles] = await Promise.all([
              fsPromises.readFile(seoPath, 'utf8').catch(() => null),
              fsPromises.readFile(metaPath, 'utf8').catch(() => null),
              fsPromises.readdir(folderPath).catch(() => [] as string[]),
            ]);

            if (seoRaw) {
              try {
                const seoData = JSON.parse(seoRaw);
                const typeKey = item.type === 'short' ? 'short' : 'long';
                const targetSeo = seoData[typeKey] || (seoData.title ? seoData : null);
                if (targetSeo) {
                  if (targetSeo.title) title = targetSeo.title;
                  if (targetSeo.description) description = targetSeo.description;
                  if (targetSeo.language) language = targetSeo.language;
                }
              } catch { /* ignore corrupt seo json */ }
            }

            if (metaRaw) {
              try {
                const meta = JSON.parse(metaRaw);
                if (!description) description = meta.description || '';
                if (!title) title = meta.title || item.title;
                if (meta.language) language = meta.language;
                // topicKey = keyword đầu tiên (dùng để nhóm), topicLabel = 3 keyword đầu (hiển thị)
                if (Array.isArray(meta.keywords) && meta.keywords.length > 0) {
                  topicKey = meta.keywords[0];
                  topicLabel = meta.keywords.slice(0, 3).join(', ');
                }
              } catch { /* ignore corrupt meta json */ }
            }

            // CHỈ kiểm tra duy nhất file .mp4, loại trừ các file phân cảnh dạng Scene_xxx.mp4
            const files = dirFiles as string[];
            const validVideoFile = files.find(f => {
              const isMp4 = /\.mp4$/i.test(f);
              const isSceneFile = /^scene[_\-\s]/i.test(f);
              return isMp4 && !isSceneFile;
            });

            return {
              ...item,
              title,
              description,
              language,
              hasVideo: Boolean(validVideoFile),
              videoFileName: validVideoFile || '',
              topicKey,
              topicLabel,
            };
          } catch {
            return { ...item, description: '', language: item.language || 'vi', hasVideo: false };
          }
        }));
      }

      // Store result in cache keyed by mtime + timestamp (TTL-based invalidation)
      _ytHistoryCache = { mtime: histMtime, cachedAt: Date.now(), history: localHistory };

      return NextResponse.json({ success: true, history: localHistory });
    }

    if (action === 'playlists') {
      const { loadToken } = await import('@/app/lib/youtube-auth');
      if (!loadToken()) {
        return NextResponse.json({ success: true, playlists: [] });
      }
      const playlists = await getPlaylists();
      return NextResponse.json({ success: true, playlists });
    }

    if (action === 'uploads') {
      const { loadToken } = await import('@/app/lib/youtube-auth');
      if (!loadToken()) {
        return NextResponse.json({ success: true, counts: {}, list: [] });
      }
      const uploadStats = await getUploadsCountByDate();

      // Đồng bộ 2 chiều (ĐÃ VÔ HIỆU HÓA): 
      // Tính năng này trước đây gây lỗi tự động reset trạng thái của TẤT CẢ video thành 'pending' 
      // khi YouTube API hết Quota (trả về mảng rỗng) hoặc khi số lượng video vượt quá 200 (limit).
      // Để bảo vệ an toàn dữ liệu lịch sử, tính năng này tạm thời bị vô hiệu hóa.
      /*
      try {
        const activeYtIds = new Set((uploadStats.list || []).map((v: any) => v.id));
        const dbPath = path.join(process.cwd(), 'database', 'history.json');
        // Chỉ đồng bộ nếu API trả về danh sách hợp lệ (tránh xóa nhầm khi lỗi mạng/quota)
        if (uploadStats.list && uploadStats.list.length > 0 && fs.existsSync(dbPath)) {
          const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
          let modified = false;
          (db.topics || []).forEach((t: any) => {
            if (t.youtube_video_id && !activeYtIds.has(t.youtube_video_id) && (t.youtube_status === 'published' || t.youtube_status === 'scheduled')) {
              t.youtube_status = 'pending';
              delete t.youtube_video_id;
              modified = true;
            }
          });
          if (modified) {
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
          }
        }
      } catch (e) {
        console.error('Lỗi tự động đồng bộ khi xóa video trên YouTube:', e);
      }
      */

      return NextResponse.json({ success: true, ...uploadStats });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Lỗi YouTube API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, id, status, videoId } = body;
    const dbPath = path.join(process.cwd(), 'database', 'history.json');

    if (action === 'updateStatus') {
      if (fs.existsSync(dbPath)) {
        const rawData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        const topics = Array.isArray(rawData) ? rawData : (rawData.topics || []);
        const topicIdx = topics.findIndex((t: any) => t.id === id);

        if (topicIdx !== -1) {
          topics[topicIdx].youtube_status = status;
          if (videoId) topics[topicIdx].youtube_video_id = videoId;

          // Normalize to flat array before saving
          fs.writeFileSync(dbPath, JSON.stringify(topics, null, 2), 'utf8');
          // Invalidate history cache so next GET picks up the new status
          invalidateYTHistoryCache();
          return NextResponse.json({ success: true, item: topics[topicIdx] });
        }
      }
      return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
