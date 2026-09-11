import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Voice IDs — khớp với saydi_tts_api.py (hỗ trợ override qua .env.local)
const VOICE_VI = process.env.SAYDI_VOICE_VI || 'ng-c-huy-n-2-0-69140efab3d5d05406bafb22';   // Ngọc Huyền 2.0
const VOICE_EN = process.env.SAYDI_VOICE_EN || 'adam-american-dark-and-tough-IRHApOXLvnW57QJPQH2P'; // Adam

function getPythonExecutable(): string {
  const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
  return fs.existsSync(venvPython) ? venvPython : 'python';
}

function getScriptPath(): string {
  return path.join(process.cwd(), 'text_to_speech', 'saydi_tts_api.py');
}

/**
 * Chạy tiến trình Python và ghi log trực tiếp theo thời gian thực (realtime streaming)
 */
function runSaydiProcess(
  python: string,
  args: string[],
  logFile: string,
  timeoutMs = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(python, args, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let isSettled = false;
    let stdoutBuffer = '';
    let stderrBuffer = '';

    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try { proc.kill(); } catch (e) { }
          reject(new Error(`Tiến trình Saydi TTS quá thời gian chờ (${Math.round(timeoutMs / 1000)}s)`));
        }
      }, timeoutMs);
    }

    proc.stdout.on('data', (data) => {
      const text = data.toString('utf8');
      stdoutBuffer += text;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) continue; // Skip raw json
        fs.appendFileSync(logFile, `-> ${trimmed}\n`);
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString('utf8');
      stderrBuffer += text;
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        fs.appendFileSync(logFile, `[stderr] ${trimmed}\n`);
      }
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (isSettled) return;
      isSettled = true;
      if (code === 0) {
        resolve();
      } else {
        let cleanErr = '';
        try {
          const lines = (stdoutBuffer + '\n' + stderrBuffer).split(/\r?\n/);
          for (const l of lines) {
            const trimmed = l.trim();
            if (trimmed.startsWith('{') && trimmed.includes('"error"')) {
              try {
                const j = JSON.parse(trimmed);
                if (j && j.error) { cleanErr = j.error; break; }
              } catch (_) { }
            }
            if (trimmed.startsWith('[Saydi] [LỖI]')) {
              cleanErr = trimmed.replace('[Saydi] [LỖI]', '').trim();
            }
          }
        } catch (_) { }

        const finalMsg = cleanErr || `Tiến trình Saydi dừng với mã lỗi ${code}.\n${stdoutBuffer || stderrBuffer}`;
        reject(new Error(finalMsg));
      }
    });

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (isSettled) return;
      isSettled = true;
      reject(err);
    });
  });
}

/**
 * Tự động nhận diện ngôn ngữ:
 * 1. Ưu tiên tra cứu database/history.json theo tên folder
 * 2. Đọc trường language từ metadata.json
 * 3. Kiểm tra dấu tiếng Việt từ kịch bản hoặc tiêu đề
 */
function detectLanguage(outputDir: string, folder: string): string {
  // 1. Kiểm tra database/history.json
  const historyPath = path.join(process.cwd(), 'database', 'history.json');
  if (fs.existsSync(historyPath)) {
    try {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      const list = Array.isArray(history) ? history : (history.topics || []);
      const folderName = folder.trim();
      const baseName = path.basename(outputDir).trim();
      const matched = list.find((h: any) => h.folder === folderName || h.folder === baseName);
      if (matched && matched.language) {
        return matched.language.toLowerCase();
      }
    } catch (e) {
      console.error('Error reading history.json for language detection:', e);
    }
  }

  // 2. Đọc metadata.json
  const metadataPath = path.join(outputDir, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (meta.language) return meta.language.toLowerCase();
    } catch (e) { }
  }

  // 3. Fallback: Kiểm tra dấu tiếng Việt
  let sampleText = '';
  const masterPath = path.join(outputDir, 'master_script.txt');
  if (fs.existsSync(masterPath)) {
    sampleText = fs.readFileSync(masterPath, 'utf8').substring(0, 500);
  }
  if (!sampleText && fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      sampleText = meta.title || '';
    } catch (e) { }
  }

  if (sampleText) {
    const isVietnamese = /[àáảãạâầấẩẫậăằắẳẵặđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(sampleText);
    return isVietnamese ? 'vi' : 'en';
  }

  return 'vi';
}

export async function processSaydiTts(
  folder: string,
  type: string,
  mode: string | undefined,
  sceneNum: number | undefined,
  logFile: string
) {
  const parentFolder = type === 'long' ? 'video_long' : 'video_short';
  const outputDir = path.join(process.cwd(), 'data', parentFolder, folder);

  if (!fs.existsSync(outputDir)) {
    fs.appendFileSync(logFile, `LỖI: Không tìm thấy thư mục dự án tại ${outputDir}\n`);
    throw new Error(`Project directory not found: ${outputDir}`);
  }

  // Nhận diện ngôn ngữ (ưu tiên history.json -> metadata.json -> kiểm tra dấu tiếng Việt)
  const language = detectLanguage(outputDir, folder);
  const sampleId = language === 'en' ? VOICE_EN : VOICE_VI;
  const python = getPythonExecutable();
  const script = getScriptPath();

  // ── MODE GLOBAL: gửi toàn bộ text → tong_hop_loi_thoai.wav (hỗ trợ auto-chunking) ──────────
  if (mode === 'global') {
    fs.appendFileSync(logFile, `================ BẮT ĐẦU TẠO GIỌNG NÓI TỔNG HỢP (Saydi TTS, Language: ${language.toUpperCase()}) ================\n`);

    // Đọc master_script.txt hoặc ghép voiceover từ chapters
    let masterText = '';
    const masterPath = path.join(outputDir, 'master_script.txt');
    if (fs.existsSync(masterPath)) {
      masterText = fs.readFileSync(masterPath, 'utf8').trim();
      fs.appendFileSync(logFile, `-> Đã đọc kịch bản từ master_script.txt (${masterText.length} ký tự)\n`);
    }

    if (!masterText) {
      const chFiles = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
        .sort((a, b) => parseInt(a.replace('chapter_', '')) - parseInt(b.replace('chapter_', '')));
      let scenes: any[] = [];
      for (const cf of chFiles) {
        const d = JSON.parse(fs.readFileSync(path.join(outputDir, cf), 'utf8'));
        if (Array.isArray(d)) scenes = scenes.concat(d);
      }
      masterText = scenes.map(s => s.voiceover || '').filter(Boolean).join(' ');
      fs.appendFileSync(logFile, `-> Không có master_script.txt, dùng thoại tổng hợp (${masterText.length} ký tự)\n`);
    }

    if (!masterText) {
      fs.appendFileSync(logFile, `LỖI: Nội dung kịch bản rỗng!\n`);
      throw new Error('Nội dung master_script rỗng');
    }

    const outWav = path.join(outputDir, 'tong_hop_loi_thoai.wav');
    fs.appendFileSync(logFile, `-> Bắt đầu xử lý kịch bản với Saydi TTS...\n`);
    const startTime = Date.now();

    // Ghi text vào file tạm để tránh giới hạn độ dài command line Windows (~32767 ký tự)
    const textTmpFile = path.join(outputDir, '_saydi_master_tmp.txt');
    fs.writeFileSync(textTmpFile, masterText, 'utf8');

    try {
      await runSaydiProcess(
        python,
        [script, `@${textTmpFile}`, sampleId, outWav],
        logFile,
        0 // Không giới hạn thời gian chờ, đợi Saydi phản hồi
      );
      if (!fs.existsSync(outWav) || fs.statSync(outWav).size === 0) {
        throw new Error('File WAV rỗng sau khi tạo.');
      }
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      fs.appendFileSync(logFile, `-> Đã lưu thành công: tong_hop_loi_thoai.wav (${elapsed}s)\n`);
    } catch (err: any) {
      fs.appendFileSync(logFile, `[LỖI] ${err.message}\n`);
      throw err;
    } finally {
      try { fs.unlinkSync(textTmpFile); } catch (e) { }
    }

    fs.appendFileSync(logFile, `\n================ TẤT CẢ ĐÃ HOÀN TẤT ! ================\n`);
    return;
  }

  // ── MODE SCENES ('all_scenes' hoặc scene đơn lẻ): từng cảnh tuần tự ─────────
  const chapterFiles = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
    .sort((a, b) => parseInt(a.replace('chapter_', '')) - parseInt(b.replace('chapter_', '')));

  if (chapterFiles.length === 0) {
    fs.appendFileSync(logFile, `LỖI: Không tìm thấy file chapter_*.json trong ${outputDir}\n`);
    throw new Error('No chapter files found');
  }

  let scenes: any[] = [];
  for (const cf of chapterFiles) {
    const d = JSON.parse(fs.readFileSync(path.join(outputDir, cf), 'utf8'));
    if (Array.isArray(d)) scenes = scenes.concat(d);
  }

  // Lọc scene nếu chỉ render 1 cảnh
  if (sceneNum !== undefined) {
    scenes = scenes.filter(s => s.scene === sceneNum);
    if (scenes.length === 0) {
      fs.appendFileSync(logFile, `LỖI: Không tìm thấy cảnh số ${sceneNum}\n`);
      throw new Error(`Scene ${sceneNum} not found`);
    }
  }

  fs.appendFileSync(logFile, `================ BẮT ĐẦU RENDER ${scenes.length} AUDIO (Language: ${language.toUpperCase()}, Voice: Saydi ${language === 'en' ? 'Adam' : 'Ngọc Huyền 2.0'}) ================\n`);

  for (let i = 0; i < scenes.length; i++) {
    const item = scenes[i];
    const sid = item.scene;
    const text = item.voiceover;
    if (!text) continue;

    fs.appendFileSync(logFile, `  [Đang Render] Scene ${sid}: "${text.substring(0, 30)}..."\n`);
    const startTime = Date.now();
    const wavPath = path.join(outputDir, `scene_${sid}.wav`);
    const textTmpFile = path.join(outputDir, `_saydi_scene_${sid}_tmp.txt`);
    fs.writeFileSync(textTmpFile, text, 'utf8');

    let success = false;
    let lastError: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await runSaydiProcess(
          python,
          [script, `@${textTmpFile}`, sampleId, wavPath],
          logFile,
          180_000  // 3 phút / scene
        );

        if (!fs.existsSync(wavPath) || fs.statSync(wavPath).size === 0) {
          throw new Error(`File WAV rỗng cho Scene ${sid}.`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        fs.appendFileSync(logFile, `  [Hoàn Thành] Scene ${sid} (WAV) - Mất: ${elapsed}s\n`);
        success = true;
        break;
      } catch (err: any) {
        lastError = err;
        if (attempt < 2) {
          fs.appendFileSync(logFile, `  [Cảnh báo] Scene ${sid} thử lại lần 2 sau 2s... Lỗi: ${err.message}\n`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } finally {
        try { fs.unlinkSync(textTmpFile); } catch (e) { }
      }
    }

    if (!success) {
      fs.appendFileSync(logFile, `  [LỖI] Scene ${sid} - ${lastError?.message || 'Không thể tạo audio'}\n`);
      throw lastError;
    }

    // Delay nhỏ giữa các cảnh tránh spam
    if (i < scenes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
    }
  }

  fs.appendFileSync(logFile, `\n================ TẤT CẢ ĐÃ HOÀN TẤT ! ================\n`);
}
