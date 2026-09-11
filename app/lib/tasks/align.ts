import { resolveProjectPath } from '../security';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function getPythonExecutable(): string {
  const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) return venvPython;
  const venvBinPython = path.join(process.cwd(), '.venv', 'bin', 'python');
  if (fs.existsSync(venvBinPython)) return venvBinPython;
  return 'python';
}

export const maxDuration = 1800; // 30 phút cho audio dài
export const dynamic = 'force-dynamic';

export async function runTask(request: Request) {
  try {
    const body = await request.json();
    const { folder, type, speed = 1.15, speed_mode = 'apply', model = 'base', language, allow_fallback = false } = body;

    if (!folder || !type) {
      return NextResponse.json(
        { success: false, error: 'Thiếu tham số bắt buộc: folder, type' },
        { status: 400 }
      );
    }

    const parentFolder = type === 'long' ? 'video_long' : 'video_short';
    const projectDir = resolveProjectPath(folder, type);

    if (!fs.existsSync(projectDir)) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy thư mục dự án: ${projectDir}` },
        { status: 404 }
      );
    }

    const pythonBin = getPythonExecutable();
    const scriptPath = path.join(process.cwd(), '.agents', 'tools', 'audio_timeline_aligner.py');

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy script: ${scriptPath}` },
        { status: 500 }
      );
    }

    const args = [
      scriptPath,
      '--folder', projectDir,
      '--speed', String(speed),
      '--speed-mode', String(speed_mode),
      '--model', String(model)
    ];

    if (allow_fallback === true) {
      args.push('--allow-proportional-fallback');
    }

    if (language) {
      args.push('--language', String(language));
    }

    const minBoundaryConfidence = body.min_boundary_confidence ?? body.minBoundaryConfidence;
    if (typeof minBoundaryConfidence === 'number' && minBoundaryConfidence >= 0 && minBoundaryConfidence <= 1) {
      args.push('--min-boundary-confidence', String(minBoundaryConfidence));
    }

    if (body.no_cache) {
      args.push('--no-cache');
    }

    console.log(`[align-timeline] Đang chạy: ${pythonBin} ${args.join(' ')}`);

    const { stdout, stderr } = await execFileAsync(pythonBin, args, {
      timeout: 1_800_000, // 30 phút timeout
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    console.log('[align-timeline] stdout:', stdout);
    if (stderr) console.warn('[align-timeline] stderr:', stderr);

    const estimated = stdout.includes('Timeline is estimated');
    return NextResponse.json({
      success: true,
      method: estimated ? 'estimated' : 'speech-aligned',
      estimated,
      message: estimated ? 'Đã tạo timeline ước lượng theo số từ. Cần nghe và kiểm tra lại các ranh giới cảnh.' : `Đã căn timeline theo âm thanh (tốc độ ${speed}x).`,
      output: stdout
    });

  } catch (error: any) {
    console.error('[align-timeline] Lỗi:', error);
    const msg = error.stderr || error.stdout || error.message || 'Lỗi không xác định khi đồng bộ timeline';
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
