import { resolveProjectPath } from '../../lib/security';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sanitizePath } from '../../lib/security';

/**
 * Splits the master_script.txt into subtitle segments where:
 * - Each segment does NOT exceed maxChars characters
 * - Splits only happen at sentence boundaries (. ! ? … hoặc \n)
 * - Returns array of segment strings
 */
function splitIntoSegments(text: string, maxChars: number = 500): string[] {
  // Normalize whitespace but preserve sentence structure
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  // Split into sentences using Vietnamese-aware sentence boundary detection
  // Sentence enders: . ! ? … followed by space/newline, or \n\n (paragraph break)
  const rawSentences: string[] = [];
  let current = '';

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    current += ch;

    const isEndChar = ch === '.' || ch === '!' || ch === '?' || ch === '…';
    const nextCh = normalized[i + 1] || '';
    const isFollowedBySpaceOrNewline = nextCh === ' ' || nextCh === '\n' || nextCh === '';

    // Also split on double newlines (paragraph breaks)
    const isDoubleNewline =
      ch === '\n' && nextCh === '\n';

    if ((isEndChar && isFollowedBySpaceOrNewline) || isDoubleNewline) {
      const trimmed = current.trim();
      if (trimmed) {
        rawSentences.push(trimmed);
      }
      current = '';
    }
  }

  // Don't forget the last piece if no trailing punctuation
  const lastPiece = current.trim();
  if (lastPiece) {
    rawSentences.push(lastPiece);
  }

  // Now group sentences into segments respecting maxChars
  const segments: string[] = [];
  let currentSegment = '';

  for (const sentence of rawSentences) {
    // If a single sentence is already over limit, we must force-split it
    if (sentence.length > maxChars) {
      // Flush current segment first
      if (currentSegment) {
        segments.push(currentSegment.trim());
        currentSegment = '';
      }
      // Force-split long sentence by word boundaries
      const words = sentence.split(' ');
      let chunk = '';
      for (const word of words) {
        if ((chunk + (chunk ? ' ' : '') + word).length > maxChars) {
          if (chunk) {
            segments.push(chunk.trim());
          }
          chunk = word;
        } else {
          chunk += (chunk ? ' ' : '') + word;
        }
      }
      if (chunk.trim()) {
        currentSegment = chunk.trim();
      }
      continue;
    }

    const candidate = currentSegment
      ? currentSegment + ' ' + sentence
      : sentence;

    if (candidate.length <= maxChars) {
      currentSegment = candidate;
    } else {
      // Flush and start new segment
      if (currentSegment) {
        segments.push(currentSegment.trim());
      }
      currentSegment = sentence;
    }
  }

  if (currentSegment.trim()) {
    segments.push(currentSegment.trim());
  }

  return segments.filter(s => s.length > 0);
}

/**
 * Formats a time in seconds to SRT timestamp format: HH:MM:SS,mmm
 */
function formatSrtTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':') + ',' + String(ms).padStart(3, '0');
}

/**
 * Estimates reading duration for a segment in seconds.
 * Vietnamese average narration speed ~14 chars/sec, minimum 2 seconds.
 */
function estimateDuration(text: string, charsPerSecond: number = 14): number {
  const minDuration = 2.0;
  const estimated = text.length / charsPerSecond;
  return Math.max(minDuration, estimated);
}

/**
 * Generates SRT content from an array of text segments.
 */
function generateSrtContent(segments: string[]): string {
  const lines: string[] = [];
  let currentTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const duration = estimateDuration(segment);
    const startTime = currentTime;
    const endTime = currentTime + duration;

    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(startTime)} --> ${formatSrtTime(endTime)}`);
    lines.push(segment);
    lines.push(''); // blank line between entries

    currentTime = endTime + 0.1; // 100ms gap between subtitles
  }

  return lines.join('\n');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { folder, type, mode = 'both' } = body;
    // mode: 'audio' | 'scene' | 'both'

    if (!folder || !type) {
      return NextResponse.json(
        { error: 'Thiếu tham số folder hoặc type' },
        { status: 400 }
      );
    }

    const projectPath = resolveProjectPath(folder, type);
    const safePath = sanitizePath(projectPath);
    if (!safePath) {
      return NextResponse.json({ error: 'Đường dẫn không hợp lệ' }, { status: 403 });
    }
    if (!fs.existsSync(safePath)) {
      return NextResponse.json({ error: 'Thư mục dự án không tồn tại' }, { status: 404 });
    }

    const audioSrtFileName = `AUDIO_${folder}.srt`;
    const sceneSrtFileName = `SCENE_${folder}.srt`;

    let masterSrtContent = '';
    let masterSegmentCount = 0;
    let sceneSrtContent = '';
    let sceneSegmentCount = 0;

    // ── AUDIO SRT: from master_script.txt ──────────────────────────────────────
    if (mode === 'audio' || mode === 'both') {
      const masterScriptPath = path.join(safePath, 'master_script.txt');
      if (fs.existsSync(masterScriptPath)) {
        const masterText = fs.readFileSync(masterScriptPath, 'utf-8');
        const masterSegments = splitIntoSegments(masterText.trim(), 500);
        masterSrtContent = generateSrtContent(masterSegments);
        masterSegmentCount = masterSegments.length;
        fs.writeFileSync(path.join(safePath, audioSrtFileName), masterSrtContent, 'utf-8');
        // (subtitles.srt legacy removed)
      } else if (mode === 'audio') {
        return NextResponse.json({ error: 'Không tìm thấy master_script.txt' }, { status: 404 });
      }
    }

    // ── SCENE SRT: voiceover from chapter_*.json (1 scene = 1 item) ───────────
    if (mode === 'scene' || mode === 'both') {
      const allFiles = fs.readdirSync(safePath);
      const chapterFiles = allFiles
        .filter(f => /^chapter_\d+\.json$/i.test(f))
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)![0], 10);
          const numB = parseInt(b.match(/\d+/)![0], 10);
          return numA - numB;
        });

      if (chapterFiles.length === 0) {
        if (mode === 'scene') {
          return NextResponse.json({ error: 'Không tìm thấy chapter_*.json trong dự án này' }, { status: 404 });
        }
      } else {
        interface SceneEntry { scene: number; voiceover: string; }
        const sceneSegments: string[] = [];

        for (const chapterFile of chapterFiles) {
          const chapterPath = path.join(safePath, chapterFile);
          let scenes: SceneEntry[];
          try {
            const raw = fs.readFileSync(chapterPath, 'utf-8');
            scenes = JSON.parse(raw);
          } catch {
            return NextResponse.json({ error: `Không thể đọc/parse ${chapterFile}` }, { status: 500 });
          }
          if (!Array.isArray(scenes)) continue;
          scenes
            .slice()
            .sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0))
            .forEach(s => {
              const text = (s.voiceover ?? '').trim();
              if (text) sceneSegments.push(text);
            });
        }

        if (sceneSegments.length > 0) {
          sceneSrtContent = generateSrtContent(sceneSegments);
          sceneSegmentCount = sceneSegments.length;
          fs.writeFileSync(path.join(safePath, sceneSrtFileName), sceneSrtContent, 'utf-8');
        }
      }
    }

    const activeSrtContent = mode === 'scene' ? sceneSrtContent : masterSrtContent || sceneSrtContent;

    if (!activeSrtContent) {
      return NextResponse.json({ error: 'Không có nội dung nào để tạo SRT' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      mode,
      // AUDIO SRT
      masterSegmentCount,
      hasMasterSrt: !!masterSrtContent,
      audioSrtFileName,
      // SCENE SRT
      sceneSegmentCount,
      hasSceneSrt: !!sceneSrtContent,
      sceneSrtFileName,
      // Legacy
      srtContent: activeSrtContent,
      segmentCount: masterSegmentCount || sceneSegmentCount,
    });

  } catch (err: any) {
    console.error('[generate-srt] Error:', err);
    return NextResponse.json({ error: `Lỗi server: ${err.message}` }, { status: 500 });
  }
}



/**
 * GET /api/generate-srt?folder=...&type=...&srtType=audio|scene&download=1
 * Serves AUDIO_xxx.srt or SCENE_xxx.srt as a download (for phone QR scanning).
 * download=1 forces Content-Disposition: attachment so phone saves the file.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');
    const type = searchParams.get('type');
    const srtType = searchParams.get('srtType') || 'audio'; // 'audio' | 'scene'
    const forceDownload = searchParams.get('download') === '1';

    if (!folder || !type) {
      return NextResponse.json({ error: 'Missing params: folder, type' }, { status: 400 });
    }

    const projectPath = resolveProjectPath(folder, type);
    const safePath = sanitizePath(projectPath);

    if (!safePath) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }

    // Determine which file to serve
    let srtFileName: string;
    if (srtType === 'scene') {
      srtFileName = `SCENE_${folder}.srt`;
    } else {
      srtFileName = `AUDIO_${folder}.srt`;
    }

    const srtPath = path.join(safePath, srtFileName);

    // Fallback to legacy subtitles.srt if new file not found
    if (!fs.existsSync(srtPath)) {
      const legacyPath = path.join(safePath, 'subtitles.srt');
      if (fs.existsSync(legacyPath)) {
        const fileContent = fs.readFileSync(legacyPath);
        return new Response(fileContent, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-subrip',
            'Content-Disposition': `attachment; filename="${srtFileName}"`,
            'Content-Length': String(fileContent.byteLength),
            'Cache-Control': 'no-cache',
          },
        });
      }
      return NextResponse.json(
        { error: `File ${srtFileName} not found. Please generate it first.` },
        { status: 404 }
      );
    }

    const fileContent = fs.readFileSync(srtPath);

    const disposition = forceDownload
      ? `attachment; filename="${srtFileName}"`
      : `inline; filename="${srtFileName}"`;

    return new Response(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-subrip',
        'Content-Disposition': disposition,
        'Content-Length': String(fileContent.byteLength),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
