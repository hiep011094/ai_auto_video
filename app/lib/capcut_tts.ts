import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const TTS_SIGN_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmTd34Lw4b7IuldSXh/zY
CMla+ITdGG5TeWz6ad+OySd4r+IrY45AoqrYUxhQ2dl+7z+i7r/5vEa8rr39BYfB
8AGMQLmZA8HmgpWBsqrn/V6daUALkKnkLb70Fn32CJigIuGXAYqxUdGuI340aC+0
v5Es3puJsHyzf01/AelE4Cdc6bZhQrASJLBh8R3BQToYClmDVSDUQk28o8sl/guA
Z4n303Vj+6Siv1HayPCdV6kpVVnMBAG4+umUbwGmn132N3fgpzLarFF3XyWmS1zh
D/J07iM/rP8GDO9IskHNHd2phrO0G6KzrcFAnTBHjVv+hCBEfzN/no3FNA9AuC36
mwIDAQAB
-----END PUBLIC KEY-----`;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeTtsPayloadSign(ssml: string, extraInfo: string, deviceId: string, appId: string): string {
  const ssmlMd5 = crypto.createHash('md5').update(ssml, 'utf8').digest('hex');
  let signInput = `appid:${appId}&did:${deviceId}&creditDisable:false&ssml:${ssmlMd5}`;
  if (extraInfo) {
    signInput += `&extraInfo:${extraInfo}`;
  }

  const buffer = Buffer.from(signInput, 'utf8');
  const encrypted = crypto.publicEncrypt({
    key: TTS_SIGN_PUBLIC_KEY_PEM,
    padding: crypto.constants.RSA_PKCS1_PADDING
  }, buffer);

  return encrypted.toString('base64');
}

function stripID3(buffer: any): any {
  // Strip ID3v2 header at the start only.
  // We do NOT strip ID3v1 (last 128 bytes) here because CapCut TTS never
  // produces ID3v1 tags, and the "TAG" signature can false-positive on raw MP3 data.
  let startOffset = 0;
  if (buffer.length > 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) |
      ((buffer[7] & 0x7F) << 14) |
      ((buffer[8] & 0x7F) << 7) |
      (buffer[9] & 0x7F);
    startOffset = 10 + size;
    // Sanity: don't strip more than the buffer holds
    if (startOffset >= buffer.length) startOffset = 0;
  }
  return startOffset > 0 ? buffer.subarray(startOffset) : buffer;
}

function stripID3Trailer(buffer: any): any {
  let endOffset = buffer.length;
  if (buffer.length > 128) {
    const v1TagOffset = buffer.length - 128;
    if (buffer[v1TagOffset] === 0x54 && buffer[v1TagOffset + 1] === 0x41 && buffer[v1TagOffset + 2] === 0x47) {
      endOffset = v1TagOffset;
    }
  }
  return endOffset < buffer.length ? buffer.subarray(0, endOffset) : buffer;
}

// Strip all known tail tags: APEv2, Lyrics3v2
// NOTE: We intentionally do NOT strip ID3v1 here — CapCut TTS never produces ID3v1 tags,
// and the 3-byte "TAG" signature false-positives on raw MP3 PCM data, causing audio loss.
function stripAllTailTags(buffer: any): any {
  let end = buffer.length;

  // APEv2 footer: last 32 bytes starting with "APETAGEX"
  if (end >= 32) {
    const off = end - 32;
    if (buffer.slice(off, off + 8).toString('ascii') === 'APETAGEX') {
      const version = buffer.readUInt32LE(off + 8);
      const tagSize = buffer.readUInt32LE(off + 12);
      // flags are at offset +20 (4 bytes), bit 31 = has header
      const flags = buffer.readUInt32LE(off + 20);
      const hasHeader = (flags >>> 31) & 1;
      // sanity check: version must be 1000 or 2000, tagSize must be reasonable
      if ((version === 1000 || version === 2000) && tagSize > 0 && tagSize < 1024 * 1024) {
        end = off - tagSize - (hasHeader ? 32 : 0);
        if (end < 0) end = 0;
      }
    }
  }

  // Lyrics3v2: ends with "LYRICS200" (9 bytes) preceded by a 6-digit size
  if (end >= 15) {
    const tag = buffer.slice(end - 9, end).toString('ascii');
    if (tag === 'LYRICS200') {
      const sizeStr = buffer.slice(end - 15, end - 9).toString('ascii');
      const lyricsSize = parseInt(sizeStr, 10);
      if (!isNaN(lyricsSize)) end = end - 15 - lyricsSize;
      if (end < 0) end = 0;
    }
  }

  return end < buffer.length ? buffer.subarray(0, end) : buffer;
}

function removeXingHeader(buffer: any): any {
  let offset = 0;
  while (offset < buffer.length - 4) {
    if (buffer[offset] === 0xFF && (buffer[offset + 1] & 0xE0) === 0xE0) {
      let nextFrameOffset = -1;
      let nextOffset = offset + 4;
      while (nextOffset < buffer.length - 4) {
        if (buffer[nextOffset] === 0xFF && (buffer[nextOffset + 1] & 0xE0) === 0xE0) {
          nextFrameOffset = nextOffset;
          break;
        }
        nextOffset++;
      }

      if (nextFrameOffset !== -1) {
        const firstFrame = buffer.subarray(offset, nextFrameOffset);
        if (firstFrame.includes('Xing') || firstFrame.includes('Info')) {
          return buffer.subarray(nextFrameOffset);
        }
      }
      break;
    }
    offset++;
  }
  return buffer;
}

function sanitizeHeaders(rawHeaders: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders || {})) {
    const keyLower = k.toLowerCase();
    if (keyLower === 'host' || keyLower === 'content-length' || keyLower === 'accept-encoding') {
      continue;
    }
    cleaned[k] = v;
  }
  return cleaned;
}

export async function processTts(
  folder: string,
  type: string,
  mode: string | undefined,
  sceneNum: number | undefined,
  logFile: string
) {
  // Load configuration
  const headersConfigPath = path.join(process.cwd(), 'config', 'capcut_headers.json');
  if (!fs.existsSync(headersConfigPath)) {
    fs.appendFileSync(logFile, `LỖI: Không tìm thấy file cấu hình tại ${headersConfigPath}\n`);
    throw new Error('Missing capcut_headers.json config');
  }

  const config = JSON.parse(fs.readFileSync(headersConfigPath, 'utf8'));
  const newUrl = config.new_url;
  const newHeaders = sanitizeHeaders(config.new_headers);
  const queryUrl = config.query_url;
  const queryHeaders = sanitizeHeaders(config.query_headers);
  const deviceId = '7386498879850792449';
  const appId = '359289';

  const parentFolder = type === 'long' ? 'video_long' : 'video_short';
  const outputDir = path.join(process.cwd(), 'data', parentFolder, folder);
  if (!fs.existsSync(outputDir)) {
    fs.appendFileSync(logFile, `LỖI: Không tìm thấy thư mục dự án tại ${outputDir}\n`);
    throw new Error(`Project directory not found: ${outputDir}`);
  }

  // Load chapter JSON files
  const files = fs.readdirSync(outputDir);
  const chapterFiles = files
    .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
    .sort((a, b) => {
      const numA = parseInt(a.replace('chapter_', '').replace('.json', ''), 10);
      const numB = parseInt(b.replace('chapter_', '').replace('.json', ''), 10);
      return numA - numB;
    });

  if (chapterFiles.length === 0) {
    fs.appendFileSync(logFile, `LỖI: Không tìm thấy bất kỳ file chapter_*.json nào trong ${outputDir}\n`);
    throw new Error('No chapter files found');
  }

  // Extract all scenes
  let scenes: any[] = [];
  for (const cf of chapterFiles) {
    const chData = JSON.parse(fs.readFileSync(path.join(outputDir, cf), 'utf8'));
    if (Array.isArray(chData)) {
      scenes = scenes.concat(chData);
    }
  }

  // Filter by scene if specified
  if (sceneNum !== undefined) {
    scenes = scenes.filter(s => s.scene === sceneNum);
    if (scenes.length === 0) {
      fs.appendFileSync(logFile, `LỖI: Không tìm thấy cảnh số ${sceneNum}\n`);
      throw new Error(`Scene ${sceneNum} not found`);
    }
  }

  // Detect language from metadata.json
  let language = 'vi';
  const metadataPath = path.join(outputDir, 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      if (meta.language) {
        language = meta.language.toLowerCase();
      }
    } catch (e) { }
  }

  // Set default voice based on language:
  // - Vietnamese ('vi'): "giọng nữ phổ thông" (vi_female_huong, sami)
  // - English ('en'): "Adam" (pNInz6obpgDQGcFmaJgB, 11labs)
  let voiceId = 'vi_female_huong';
  let resourceId = '7264854897953083905';
  let platform = 'sami';

  if (language === 'en') {
    voiceId = 'pNInz6obpgDQGcFmaJgB';
    resourceId = '7369525170723099153';
    platform = '11labs';
  }

  const venvPython = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
  const pythonExecutable = fs.existsSync(venvPython) ? venvPython : 'python';
  const scriptPath = path.join(process.cwd(), 'text_to_speech', 'capcut_tts_api.py');

  // MODE GLOBAL: Read master_script.txt directly, cut into short sentences by period '.', and merge to tong_hop_loi_thoai.wav
  if (mode === 'global') {
    fs.appendFileSync(logFile, `================ BẮT ĐẦU TẠO GIỌNG NÓI TỔNG HỢP TỪ MASTER_SCRIPT.TXT (CapCut TTS) ================\n`);

    let masterText = '';
    const masterPath = path.join(outputDir, 'master_script.txt');
    if (fs.existsSync(masterPath)) {
      masterText = fs.readFileSync(masterPath, 'utf8').trim();
      fs.appendFileSync(logFile, `-> Đã đọc kịch bản từ file master_script.txt (${masterText.length} ký tự)\n`);
    }

    if (!masterText) {
      const chapterFiles = fs.readdirSync(outputDir)
        .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
        .sort((a, b) => parseInt(a.replace('chapter_', ''), 10) - parseInt(b.replace('chapter_', ''), 10));

      let scenesArr: any[] = [];
      for (const cf of chapterFiles) {
        const chData = JSON.parse(fs.readFileSync(path.join(outputDir, cf), 'utf8'));
        if (Array.isArray(chData)) scenesArr = scenesArr.concat(chData);
      }
      masterText = scenesArr.map(s => s.voiceover || '').filter(Boolean).join(' ');
      fs.appendFileSync(logFile, `-> Không tìm thấy master_script.txt, dùng thoại tổng hợp từ các cảnh (${masterText.length} ký tự)\n`);
    }

    if (!masterText) {
      fs.appendFileSync(logFile, `LỖI: Nội dung kịch bản tổng hợp rỗng!\n`);
      throw new Error('Nội dung master_script.txt rỗng');
    }

    // Split text into short sentence chunks at sentence-ending punctuation (. ! ?)
    // Then further split any chunk that's still > 250 chars at word boundary
    // Use matchAll to capture both the sentence content AND any trailing punctuation,
    // so the final segment is ALWAYS included even when it doesn't end with punctuation.
    const rawChunks: string[] = [];
    {
      // Match sequences ending with .!? followed by whitespace/end, OR the final leftover segment
      const pattern = /[^.!?]*[.!?]+\s*|[^.!?]+$/g;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(masterText)) !== null) {
        const seg = m[0].replace(/\n+/g, ' ').trim();
        if (seg.length > 0) rawChunks.push(seg);
      }
    }
    const sentenceChunks: string[] = [];
    for (const chunk of rawChunks) {
      if (chunk.length <= 250) {
        sentenceChunks.push(chunk);
      } else {
        // Break long chunks at whitespace near the 220-char mark
        const words = chunk.split(/\s+/);
        let current = '';
        for (const word of words) {
          if (current && (current + ' ' + word).length > 220) {
            sentenceChunks.push(current.trim());
            current = word;
          } else {
            current = current ? current + ' ' + word : word;
          }
        }
        if (current.trim()) sentenceChunks.push(current.trim());
      }
    }

    fs.appendFileSync(logFile, `-> Đã cắt kịch bản master_script.txt thành ${sentenceChunks.length} đoạn ngắn tại các dấu câu để gửi CapCut TTS...\n`);

    const tempMasterFiles: string[] = [];
    for (let i = 0; i < sentenceChunks.length; i++) {
      const sentenceText = sentenceChunks[i];
      fs.appendFileSync(logFile, `  [CapCut TTS] Câu ${i + 1}/${sentenceChunks.length}: "${sentenceText.substring(0, 35)}..."\n`);
      const startTime = Date.now();
      const tempChunkPath = path.join(outputDir, `master_part_${i + 1}.mp3`);

      try {
        const { stdout, stderr } = await execFileAsync(
          pythonExecutable,
          [scriptPath, sentenceText, voiceId, resourceId, tempChunkPath, platform],
          { timeout: 90000 }
        );

        if (!fs.existsSync(tempChunkPath) || fs.statSync(tempChunkPath).size === 0) {
          throw new Error(`Chuyển đổi câu ${i + 1} thất bại. Stderr: ${stderr || stdout}`);
        }

        tempMasterFiles.push(tempChunkPath);
        const elapsed = (Date.now() - startTime) / 1000;
        fs.appendFileSync(logFile, `  [Hoàn Thành] Câu ${i + 1} - Mất: ${elapsed.toFixed(2)}s\n`);
      } catch (err: any) {
        fs.appendFileSync(logFile, `  [LỖI] Câu ${i + 1} - ${err.message}\n`);
        throw err;
      }

      if (i < sentenceChunks.length - 1) {
        const delay = 600 + Math.random() * 400;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Merge all chunk files into tong_hop_loi_thoai.mp3
    // Strategy: raw concatenation — no stripping, no silence insertion, no modification.
    // Each temp file is written as-is so nothing is lost.
    fs.appendFileSync(logFile, `\n-> Đang ghép nối ${tempMasterFiles.length} đoạn âm thanh thành tong_hop_loi_thoai.mp3...\n`);
    const targetMp3Path = path.join(outputDir, 'tong_hop_loi_thoai.mp3');

    const writeStream = fs.createWriteStream(targetMp3Path);
    for (let i = 0; i < tempMasterFiles.length; i++) {
      const fileData = fs.readFileSync(tempMasterFiles[i]);
      fs.appendFileSync(logFile, `  [Ghép] Chunk ${i + 1}/${tempMasterFiles.length}: ${fileData.length}B — "${sentenceChunks[i]?.substring(0, 50)}"\n`);
      writeStream.write(fileData);
    }
    writeStream.end();
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', () => resolve());
      writeStream.on('error', reject);
    });

    // Clean up temporary chunk files
    for (const f of tempMasterFiles) {
      try { fs.unlinkSync(f); } catch (e) { }
    }
    fs.appendFileSync(logFile, `-> Đã xóa ${tempMasterFiles.length} file tạm.\n`);

    fs.appendFileSync(logFile, `-> Đã lưu thành công: tong_hop_loi_thoai.mp3\n`);
    fs.appendFileSync(logFile, `\n================ TẤT CẢ ĐÃ HOÀN TẤT ! ================\n`);
    return;
  }

  fs.appendFileSync(logFile, `================ BẮT ĐẦU RENDER ${scenes.length} AUDIO (Language: ${language.toUpperCase()}, Voice: ${voiceId}) ================\n`);

  const tempFiles: string[] = [];

  for (let i = 0; i < scenes.length; i++) {
    const item = scenes[i];
    const sceneId = item.scene;
    const text = item.voiceover;
    if (!text) continue;

    fs.appendFileSync(logFile, `  [Đang Render] Scene ${sceneId}: "${text.substring(0, 30)}..."\n`);
    const startTime = Date.now();
    // Use .mp3 as initial output path (CapCut API may return WAV or MP3)
    const mp3Path = path.join(outputDir, `scene_${sceneId}.mp3`);
    const wavPath = path.join(outputDir, `scene_${sceneId}.wav`);

    try {
      const { stdout, stderr } = await execFileAsync(
        pythonExecutable,
        [scriptPath, text, voiceId, resourceId, mp3Path, platform],
        { timeout: 90000 }
      );

      if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size === 0) {
        throw new Error(`Tạo audio CapCut cho Scene ${sceneId} thất bại. Stderr: ${stderr || stdout}`);
      }

      // Detect if CapCut returned WAV (RIFF) or MP3
      const fileBuf = fs.readFileSync(mp3Path);
      const isActualWav = fileBuf.length > 4 && fileBuf.toString('ascii', 0, 4) === 'RIFF';
      if (isActualWav) {
        // CapCut returned real WAV — rename to .wav, keep .mp3 for compatibility
        fs.renameSync(mp3Path, wavPath);

        tempFiles.push(wavPath);
      } else {
        // MP3 returned — keep .mp3 only, do NOT create .wav alias (causes Windows EBUSY lock)
        tempFiles.push(mp3Path);
      }

      const elapsed = (Date.now() - startTime) / 1000;
      fs.appendFileSync(logFile, `  [Hoàn Thành] Scene ${sceneId} (${isActualWav ? 'WAV' : 'MP3'}) - Mất: ${elapsed.toFixed(2)}s\n`);
    } catch (err: any) {
      fs.appendFileSync(logFile, `  [LỖI] Scene ${sceneId} - ${err.message}\n`);
      throw err;
    }

    if (i < scenes.length - 1) {
      const delay = 800 + Math.random() * 400;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  fs.appendFileSync(logFile, `\n================ TẤT CẢ ĐÃ HOÀN TẤT ! ================\n`);
}
