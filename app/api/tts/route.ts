import { resolveProjectPath } from '../../lib/security';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const folder: string = body.folder;
    const type: string = body.type; // 'short' or 'long'
    const mode: string = body.mode; // 'global' or undefined
    const scene: number = body.scene; // number or undefined

    if (!folder || !type) {
      return NextResponse.json({ status: 'error', message: 'Missing folder or type' }, { status: 400 });
    }

    const baseDir = process.cwd();
    const parentFolder = type === 'long' ? 'video_long' : 'video_short';
    const targetFolder = resolveProjectPath(folder, type);

    if (!fs.existsSync(targetFolder)) {
      return NextResponse.json({ status: 'error', message: `Folder not found: ${targetFolder}` }, { status: 400 });
    }

    let logFileName = 'tts.log';
    if (scene) {
      logFileName = `tts_scene_${scene}.log`;
    }

    const logFile = path.join(targetFolder, logFileName);

    if (fs.existsSync(logFile)) {
      try { fs.unlinkSync(logFile); } catch (e) { }
    }

    // Call the local FastAPI server
    const payload = {
      folder,
      type,
      mode,
      scene,
      log_file: logFile
    };

    try {
      const response = await fetch('http://127.0.0.1:8000/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.status === 'success') {
        return NextResponse.json({
          status: 'success',
          message: `Đã gửi lệnh tới Trạm AI! Vui lòng chờ 2-3 giây...`,
        });
      } else {
        return NextResponse.json({ status: 'error', message: data.message }, { status: 500 });
      }
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      // Báo lỗi nếu chưa bật server AI
      return NextResponse.json({
        status: 'error',
        message: 'Trạm AI chưa được bật! Vui lòng click đúp vào file start_tts.bat để bật Trạm AI trước.'
      }, { status: 500 });
    }

  } catch (e: any) {
    console.error('TTS API error:', e);
    return NextResponse.json({ status: 'error', message: e.message }, { status: 500 });
  }
}
