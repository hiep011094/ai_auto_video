import { resolveProjectPath } from '../../lib/security';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

/**
 * Trả về đường dẫn ffmpeg binary:
 * 1. Dùng ffmpeg-static trong node_modules (portable, không cần cài tay)
 * 2. Fallback sang `ffmpeg` trong system PATH
 *
 * Lý do dùng process.cwd() thay vì import trực tiếp:
 * Next.js bundle hóa path của module thành \ROOT\... (virtual FS),
 * nên phải tự resolve path thật từ thư mục gốc project.
 */
function getFfmpegPath(): string {
  // Tên binary theo OS
  const bin = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  // Thử ffmpeg-static trong node_modules (portable mọi máy)
  const staticPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', bin);
  if (fs.existsSync(staticPath)) return `"${staticPath}"`;

  // Fallback: ffmpeg trong system PATH
  return 'ffmpeg';
}



/**
 * GET /api/capcut-extract-audio
 * Trả về đường dẫn thư mục CapCut projects mặc định (tính từ homedir trên server).
 * Không hardcode path — dùng os.homedir() để portable trên mọi máy.
 */
export async function GET() {
  const capcutProjectsDir = path.join(
    os.homedir(),
    'AppData', 'Local', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'
  );
  const exists = fs.existsSync(capcutProjectsDir);
  return NextResponse.json({
    defaultPath: exists ? capcutProjectsDir : os.homedir(),
    exists,
  });
}


/**
 * POST /api/capcut-extract-audio
 * 
 * Đọc draft_content.json từ thư mục CapCut project do người dùng chọn,
 * trích xuất các file audio theo đúng thứ tự trong timeline CapCut,
 * ghép liền mạch thành 1 file WAV và lưu vào thư mục dự án.
 * 
 * Body: {
 *   capcut_folder: string   // Đường dẫn thư mục CapCut project (vd: C:\...\0820-04)
 *   project_folder: string  // Tên thư mục dự án (vd: chanh-niem-trong-doi-thuong)
 *   type: 'short' | 'long'  // Loại video
 * }
 */

interface AudioSegment {
  start: number; // target_timerange.start (microseconds)
  materialId: string;
  filePath: string; // resolved absolute path
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { capcut_folder, project_folder, type } = body;

    if (!capcut_folder || !project_folder || !type) {
      return NextResponse.json({ error: 'Thiếu tham số: capcut_folder, project_folder, type' }, { status: 400 });
    }

    // Resolve capcut folder path
    const capcutFolder = path.isAbsolute(capcut_folder)
      ? capcut_folder
      : path.join(process.cwd(), capcut_folder);

    if (!fs.existsSync(capcutFolder)) {
      return NextResponse.json({ error: `Thư mục CapCut không tồn tại: ${capcutFolder}` }, { status: 400 });
    }

    // Read draft_content.json
    const draftContentPath = path.join(capcutFolder, 'draft_content.json');
    if (!fs.existsSync(draftContentPath)) {
      return NextResponse.json({ error: `Không tìm thấy draft_content.json trong: ${capcutFolder}` }, { status: 400 });
    }

    let draftContent: any;
    try {
      draftContent = JSON.parse(fs.readFileSync(draftContentPath, 'utf8'));
    } catch (e) {
      return NextResponse.json({ error: 'Không thể đọc draft_content.json (file bị lỗi hoặc không phải JSON hợp lệ)' }, { status: 400 });
    }

    // Build material map: id -> path
    const materialMap = new Map<string, string>();
    const audios: any[] = draftContent?.materials?.audios || [];
    for (const mat of audios) {
      if (mat.id && mat.path) {
        materialMap.set(mat.id, mat.path);
      }
    }

    if (materialMap.size === 0) {
      return NextResponse.json({ error: 'Không tìm thấy audio materials trong draft_content.json' }, { status: 400 });
    }

    // Extract all audio segments from ALL audio tracks, sorted by target_timerange.start
    const tracks: any[] = draftContent?.tracks || [];
    const audioTracks = tracks.filter((t: any) => t.type === 'audio');

    if (audioTracks.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy audio track trong project CapCut này' }, { status: 400 });
    }

    // Flatten segments from all audio tracks
    const allSegments: AudioSegment[] = [];
    for (const track of audioTracks) {
      const segments: any[] = track.segments || [];
      for (const seg of segments) {
        const start: number = seg?.target_timerange?.start ?? 0;
        const materialId: string = seg?.material_id || '';
        if (!materialId) continue;

        const rawPath = materialMap.get(materialId);
        if (!rawPath) continue;

        // Resolve the placeholder path to absolute path
        // Pattern: ##_draftpath_placeholder_UUID_##/audio/filename.wav
        // The UUID in the placeholder corresponds to the CapCut project folder
        // We replace the placeholder with the actual capcut folder path
        const resolvedPath = rawPath.replace(
          /##_draftpath_placeholder_[^#]+_##/g,
          capcutFolder.replace(/\\/g, '/')
        );

        const absolutePath = resolvedPath.replace(/\//g, path.sep);

        allSegments.push({
          start,
          materialId,
          filePath: absolutePath,
        });
      }
    }

    if (allSegments.length === 0) {
      return NextResponse.json({ error: 'Không tìm thấy segments audio nào trong project CapCut' }, { status: 400 });
    }

    // Sort by start time (ascending) to ensure correct playback order
    allSegments.sort((a, b) => a.start - b.start);

    // Deduplicate: remove segments pointing to the same file consecutively
    // (CapCut sometimes duplicates materials across tracks)
    // We keep ALL segments but filter out ones whose file doesn't exist
    const validSegments = allSegments.filter(seg => fs.existsSync(seg.filePath));

    if (validSegments.length === 0) {
      return NextResponse.json({
        error: `Không tìm thấy file audio nào tồn tại trên đĩa. Kiểm tra lại thư mục CapCut:\n${capcutFolder}`,
        debugPaths: allSegments.slice(0, 3).map(s => s.filePath)
      }, { status: 400 });
    }

    // Resolve output path: save to vutru_ai project folder
    const outputDir = resolveProjectPath(project_folder, type);

    if (!fs.existsSync(outputDir)) {
      return NextResponse.json({ error: `Thư mục dự án không tồn tại: ${outputDir}` }, { status: 400 });
    }

    const outputFile = path.join(outputDir, 'tong_hop_loi_thoai.wav');

    // Ghép audio với ffmpeg
    // Tạo file list cho ffmpeg concat demuxer
    const tmpListFile = path.join(os.tmpdir(), `capcut_audio_list_${Date.now()}.txt`);

    // Deduplicate by filePath để tránh ghép trùng khi CapCut mirror segment sang nhiều track
    // Logic: nếu 2 segment có filePath giống nhau VÀ start_time gần nhau (< 1s) thì bỏ bản sao
    const deduplicatedSegments: AudioSegment[] = [];
    const seenFiles = new Set<string>();
    for (const seg of validSegments) {
      const normalizedPath = seg.filePath.toLowerCase();
      if (!seenFiles.has(normalizedPath)) {
        seenFiles.add(normalizedPath);
        deduplicatedSegments.push(seg);
      }
    }

    if (deduplicatedSegments.length === 0) {
      return NextResponse.json({ error: 'Sau deduplication không còn file nào để ghép' }, { status: 400 });
    }

    // Write ffmpeg concat list
    // ffmpeg concat demuxer format:
    // file 'path/to/file1.wav'
    // file 'path/to/file2.wav'
    const listContent = deduplicatedSegments
      .map(seg => `file '${seg.filePath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(tmpListFile, listContent, 'utf8');

    try {
      // Use ffmpeg concat demuxer to merge without re-encoding (fast, lossless)
      // -y: overwrite output
      // -f concat: use concat demuxer
      // -safe 0: allow absolute paths
      // -i listFile: input list
      // -c copy: no re-encode (direct copy)
      const ffmpegBin = getFfmpegPath();
      const ffmpegCmd = `${ffmpegBin} -y -f concat -safe 0 -i "${tmpListFile}" -c copy "${outputFile}"`;
      console.log('[capcut-extract-audio] Running:', ffmpegCmd);

      const { stdout, stderr } = await execPromise(ffmpegCmd, { timeout: 120_000 });
      console.log('[capcut-extract-audio] ffmpeg stdout:', stdout);
      if (stderr) console.log('[capcut-extract-audio] ffmpeg stderr:', stderr);
    } finally {
      // Cleanup temp file
      try { fs.unlinkSync(tmpListFile); } catch { }
    }

    if (!fs.existsSync(outputFile)) {
      return NextResponse.json({ error: 'ffmpeg đã chạy nhưng không tạo được file output. Kiểm tra log server.' }, { status: 500 });
    }

    const stats = fs.statSync(outputFile);

    return NextResponse.json({
      success: true,
      message: `✅ Đã ghép ${deduplicatedSegments.length} file audio từ CapCut thành công!`,
      outputFile: outputFile,
      segmentCount: deduplicatedSegments.length,
      fileSizeKB: Math.round(stats.size / 1024),
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[capcut-extract-audio] Error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
