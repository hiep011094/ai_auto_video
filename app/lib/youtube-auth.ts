import { google, youtube_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Constants
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/youtube/callback';

// YouTube category ID — Science & Technology
const YT_CATEGORY_ID = '28';
// Max tags YouTube allows
const YT_MAX_TAGS = 15;
// Max videos to fetch for upload stats (pagination)
const YT_MAX_UPLOAD_RESULTS = 200;

export const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Auto-save refreshed tokens to token.json
oauth2Client.on('tokens', (tokens) => {
  try {
    const tokenPath = path.join(process.cwd(), 'config', 'token.json');
    let existing = {};
    if (fs.existsSync(tokenPath)) {
      existing = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    }
    const updated = { ...existing, ...tokens };
    fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (e) {
    console.error('Lỗi tự động lưu token mới:', e);
  }
});

export function loadToken(): boolean {
  try {
    const tokenPath = path.join(process.cwd(), 'config', 'token.json');
    if (fs.existsSync(tokenPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      if (tokenData.refresh_token || tokenData.access_token) {
        oauth2Client.setCredentials(tokenData);
        return true;
      }
    }
  } catch (error) {
    console.error('Lỗi đọc token.json:', error);
  }

  // Fallback to .env.local
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  if (REFRESH_TOKEN && REFRESH_TOKEN.length > 10) {
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    return true;
  }
  return false;
}

loadToken();

export const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

function sanitizeYouTubeTag(tag: string): string {
  if (!tag) return '';
  return tag
    .replace(/^#/, '')
    .replace(/[^a-zA-Z0-9\sÀ-ỹà-ỹ]/gi, ' ') // CHỈ GIỮ LẠI chữ cái (tiếng Việt/Anh), chữ số và khoảng trắng. Xóa sạch -, :, ?, !, ', ", /, \, <>, (), etc.
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);                         // Giới hạn 50 ký tự mỗi tag
}

function extractHashtagsAsTags(title: string, description: string): string[] {
  const text = `${title} ${description}`;
  const hashtagRegex = /#([a-zA-Z0-9_À-ỹ]+)/g;
  const tagsSet = new Set<string>(['shorts', 'phatgiao', 'phatphap', 'thien', 'buddhism', 'tinhthuc']);

  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    const tag = sanitizeYouTubeTag(match[1]);
    if (tag && tag.length > 1) tagsSet.add(tag);
  }
  return Array.from(tagsSet).slice(0, YT_MAX_TAGS);
}

export async function uploadToYouTube(
  filePath: string,
  title: string,
  description: string,
  publishAt?: string,
  keywords: string[] = [],
  language: string = 'vi'
): Promise<string | null> {
  let sanitizedTitle = title;
  if (sanitizedTitle.length > 100) {
    const sliced = sanitizedTitle.slice(0, 100);
    const lastSpace = sliced.lastIndexOf(' ');
    sanitizedTitle = lastSpace > 50 ? sliced.slice(0, lastSpace) : sliced;
  }

  let sanitizedDescription = description;
  if (sanitizedDescription.length > 5000) {
    const sliced = sanitizedDescription.slice(0, 4995);
    const lastSpace = sliced.lastIndexOf(' ');
    sanitizedDescription = (lastSpace > 4000 ? sliced.slice(0, lastSpace) : sliced) + '...';
  }

  // Kết hợp từ khóa SEO từ metadata.json + hashtag rút ra từ tiêu đề & mô tả
  const hashtagTags = extractHashtagsAsTags(title, description);
  const combinedSet = new Set<string>();

  // Nạp từ khóa SEO chuyên sâu từ metadata.json
  keywords.forEach(k => {
    const clean = sanitizeYouTubeTag(k);
    if (clean && clean.length > 1) combinedSet.add(clean);
  });

  // Nạp các hashtag
  hashtagTags.forEach(t => {
    const clean = sanitizeYouTubeTag(t);
    if (clean && clean.length > 1) combinedSet.add(clean);
  });

  // Giới hạn mảng từ khóa cho YouTube API (tối đa 15 tags & tổng số ký tự <= 350 để tránh quá giới hạn 500 của YouTube)
  const finalTags: string[] = [];
  let currentTotalLength = 0;

  for (const tag of combinedSet) {
    const tagLen = tag.length + (finalTags.length > 0 ? 1 : 0);
    if (currentTotalLength + tagLen > 350) break;
    finalTags.push(tag);
    currentTotalLength += tagLen;
    if (finalTags.length >= 15) break;
  }

  const defaultLangCode = language.toLowerCase().startsWith('en') ? 'en' : 'vi';

  console.log(`[YouTube Upload] Title: "${sanitizedTitle}", Tags (${finalTags.length}):`, finalTags);

  const status: any = {
    privacyStatus: publishAt ? 'private' : 'public',
    selfDeclaredMadeForKids: false, // Bắt buộc cho đề xuất YouTube & bật kiếm tiền
    embeddable: true, // Cho phép nhúng video trên web khác giúp tăng traffic
    license: 'youtube', // Bản quyền chuẩn YouTube
    publicStatsViewable: true, // Công khai lượt thích & xem giúp tăng độ uy tín (social proof)
  };

  if (publishAt) status.publishAt = publishAt;

  const buildSnippet = (tagsToUse: string[]) => ({
    title: sanitizedTitle,
    description: sanitizedDescription,
    tags: tagsToUse,
    categoryId: YT_CATEGORY_ID, // 28: Science & Technology
    defaultLanguage: defaultLangCode,
    defaultAudioLanguage: defaultLangCode,
  });

  try {
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: buildSnippet(finalTags),
        status,
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });
    return res.data.id || null;
  } catch (err: any) {
    const errMsg = err?.message || err?.cause?.message || String(err);
    if (errMsg.includes('invalid video keywords') || err?.code === 400 || err?.status === 400) {
      console.warn('⚠️ YouTube API từ chối tags tùy chỉnh, tự động fallback về tags chuẩn tối giản...', errMsg);
      // Fallback với mảng tags tối giản an toàn 100%
      const safeFallbackTags = ['phatgiao', 'thien', 'tinhthuc', 'buddhism', 'meditation', 'duongvetinhthuc'];
      const fallbackRes = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: buildSnippet(safeFallbackTags),
          status,
        },
        media: {
          body: fs.createReadStream(filePath),
        },
      });
      return fallbackRes.data.id || null;
    }
    throw err;
  }
}

export async function uploadCustomThumbnail(videoId: string, thumbnailPath: string): Promise<boolean> {
  if (!fs.existsSync(thumbnailPath)) {
    console.warn(`[Thumbnail] File không tồn tại: ${thumbnailPath}`);
    return false;
  }

  // Xác định MIME type dựa trên phần mở rộng (bắt buộc theo YouTube Data API v3)
  const ext = path.extname(thumbnailPath).toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.webp': 'image/webp',
  };
  const mimeType = mimeTypeMap[ext] || 'image/jpeg';

  let uploadPath = thumbnailPath;
  let finalMimeType = mimeType;

  // Kiểm tra kích thước file và nén nếu vượt quá 2MB
  const stats = fs.statSync(thumbnailPath);
  const MAX_SIZE = 2 * 1024 * 1024; // 2MB

  if (stats.size > MAX_SIZE) {
    console.log(`[Thumbnail] Dung lượng ảnh (${stats.size} bytes) vượt quá 2MB. Bắt đầu nén...`);
    const compressedPath = path.join(path.dirname(thumbnailPath), 'thumbnail_compressed.jpg');
    
    try {
      await sharp(thumbnailPath)
        .jpeg({ quality: 80, mozjpeg: true })
        .toFile(compressedPath);
        
      const compressedStats = fs.statSync(compressedPath);
      if (compressedStats.size > MAX_SIZE) {
        console.log(`[Thumbnail] Vẫn lớn hơn 2MB. Đang nén mạnh hơn...`);
        await sharp(thumbnailPath)
          .jpeg({ quality: 60, mozjpeg: true })
          .toFile(compressedPath);
      }
      
      uploadPath = compressedPath;
      finalMimeType = 'image/jpeg';
      console.log(`[Thumbnail] Nén thành công. File upload mới: ${uploadPath}`);
    } catch (err) {
      console.error(`[Thumbnail] Lỗi trong quá trình nén ảnh:`, err);
      // Tiếp tục với file gốc, mặc dù có thể sẽ lỗi do vượt dung lượng
    }
  }

  console.log(`[Thumbnail] Đang upload: ${uploadPath} (${finalMimeType}) cho videoId=${videoId}`);

  try {
    await youtube.thumbnails.set({
      videoId,
      media: {
        mimeType: finalMimeType,
        body: fs.createReadStream(uploadPath),
      },
    });
    console.log(`[Thumbnail] ✅ Đã gắn thumbnail tùy chỉnh cho video ${videoId}`);
    return true;
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error(`[Thumbnail] ❌ Lỗi gắn thumbnail cho video ${videoId}: ${msg}`, error);
    // Throw lại để caller (upload route) biết và có thể log/report
    throw error;
  }
}

export async function addVideoToPlaylist(videoId: string, playlistId: string): Promise<void> {
  try {
    await youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      },
    });
    console.log(`Đã thêm video ${videoId} vào playlist ${playlistId}`);
  } catch (error) {
    console.error(`Lỗi khi thêm video vào playlist ${playlistId}:`, error);
    throw error;
  }
}

export interface Playlist {
  id: string;
  title: string;
}

export async function getPlaylists(): Promise<Playlist[]> {
  try {
    const response = await youtube.playlists.list({
      part: ['snippet'],
      mine: true,
      maxResults: 50,
    });
    return response.data.items?.map(item => ({
      id: item.id || '',
      title: item.snippet?.title || 'Không tên',
    })) || [];
  } catch (error) {
    console.error('Lỗi khi lấy danh sách phát từ YouTube:', error);
    throw error;
  }
}

function parseISODurationToSeconds(duration: string): number {
  const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
  const matches = duration.match(regex);
  if (!matches) return 0;
  const hours   = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

async function checkIsYouTubeShort(videoId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    // Nếu HTTP status là 200 -> Định dạng chuẩn Shorts trên YouTube
    // Nếu status là 302/303 redirect sang /watch?v= -> Định dạng Video Dài
    if (res.status === 200) {
      return true;
    }
    const location = res.headers.get('location') || '';
    if (location.includes('/watch') || res.status === 302 || res.status === 303) {
      return false;
    }
    return res.url.includes('/shorts/');
  } catch (e) {
    return false;
  }
}

export interface ExistingVideo {
  id: string;
  title: string;
  privacy: 'public' | 'private' | 'unlisted';
  publishAt?: string;
  dateStr: string;
  isShort: boolean;
}

export async function getUploadsCountByDate(): Promise<{ counts: Record<string, number>; list: ExistingVideo[] }> {
  try {
    const channelRes = await youtube.channels.list({
      part: ['contentDetails'],
      mine: true,
    });

    const uploadsPlaylistId = channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) return { counts: {}, list: [] };

    const videoIds: string[] = [];
    let pageToken: string | undefined;

    while (videoIds.length < YT_MAX_UPLOAD_RESULTS) {
      const res = await youtube.playlistItems.list({
        playlistId: uploadsPlaylistId,
        part: ['snippet'] as string[],
        maxResults: 50,
        ...(pageToken && { pageToken }),
      } as any);

      const ids = res.data.items
        ?.map(item => item.snippet?.resourceId?.videoId)
        .filter((id): id is string => Boolean(id)) || [];

      videoIds.push(...ids);
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    if (videoIds.length === 0) return { counts: {}, list: [] };

    const counts: Record<string, number> = {};
    const list: ExistingVideo[] = [];

    const vnFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    for (let i = 0; i < videoIds.length; i += 50) {
      const batchIds = videoIds.slice(i, i + 50);
      const videosRes = await youtube.videos.list({
        id: batchIds,
        part: ['snippet', 'status', 'contentDetails', 'fileDetails'],
      });

      videosRes.data.items?.forEach(video => {
        const publishAt = video.status?.publishAt || video.snippet?.publishedAt;
        const privacy   = (video.status?.privacyStatus as ExistingVideo['privacy']) || 'public';
        const duration  = video.contentDetails?.duration || '';
        const seconds   = parseISODurationToSeconds(duration);

        // 1. Kiểm tra Tỷ lệ khung hình 9:16 (Vertical Format: Chiều cao >= Chiều rộng)
        let is916VerticalRatio = false;
        const fileDetails = (video as any).fileDetails;
        if (fileDetails?.videoStreams?.[0]) {
          const stream = fileDetails.videoStreams[0];
          if (stream.widthPixels && stream.heightPixels) {
            is916VerticalRatio = stream.heightPixels >= stream.widthPixels;
          }
        }

        // Video được coi là Short nếu: chuẩn tỷ lệ dọc 9:16 OR thời lượng <= 70 giây
        const isShort = is916VerticalRatio || (seconds > 0 && seconds <= 70);

        if (publishAt) {
          const dateString = vnFormatter.format(new Date(publishAt));
          counts[dateString] = (counts[dateString] || 0) + 1;

          list.push({
            id: video.id || '',
            title: video.snippet?.title || 'Không tên',
            privacy,
            publishAt,
            dateStr: dateString,
            isShort,
          });
        }
      });
    }

    return { counts, list };
  } catch (error) {
    console.error('Lỗi lấy lịch sử upload YT:', error);
    return { counts: {}, list: [] };
  }
}
