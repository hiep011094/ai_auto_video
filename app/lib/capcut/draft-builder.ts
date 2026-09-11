// ============================================================
//  CapCut Project Builder — Draft Assembly
//  Orchestrates materials, segments, tracks into a CapCut project.
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { parseFile, parseBuffer } from 'music-metadata';
import { buildVideoMaterial, buildAudioMaterial } from './materials';
import { buildSegment, buildTransition, buildSpeed } from './segments';
import type { VideoMaterial, Segment, DraftBuildResult, MetaMaterial, ClipTransform } from './types';

// ============================================================
//  Helpers
// ============================================================

export function getSceneNumber(filename: string): number {
  const match = filename.match(/Scene_(\d+)/i);
  return match ? parseInt(match[1], 10) : Infinity;
}

export async function getAudioDurationUs(filepath: string): Promise<number> {
  try {
    // 1st attempt: parseFile (fast — only reads metadata header)
    const metadata = await parseFile(filepath);
    let dur = metadata.format.duration
      ? Math.floor(metadata.format.duration * 1000000)
      : 0;

    if (!dur) {
      // 2nd attempt: parseBuffer (auto-detect format, ignores extension)
      // Only runs when parseFile failed — handles scene_N.wav that are actually MP3/MPEG
      try {
        const buf = await import('fs').then(fs => fs.promises.readFile(filepath));
        const metadata2 = await parseBuffer(buf);
        if (metadata2.format.duration) {
          dur = Math.floor(metadata2.format.duration * 1000000);
        }
      } catch (_e) { /* ignore */ }
    }

    // 3rd: ALWAYS check WAV container data chunk duration for RIFF/WAVE files.
    // WAV wrapping MP3 (audioFmt 85) has a larger container duration than what
    // music-metadata reads from MP3 frames. CapCut decodes per container, so we
    // take MAX to avoid cutting the last 1-2s of audio.
    // Only reads first 1KB (header only — no need to load the full file).
    try {
      const fsModule = await import('fs');
      const headerBuf = Buffer.alloc(1024);
      const fd = await fsModule.promises.open(filepath, 'r');
      const { bytesRead } = await fd.read(headerBuf, 0, 1024, 0);
      await fd.close();
      const hdr = headerBuf.slice(0, bytesRead);

      if (hdr.slice(0, 4).toString() === 'RIFF' && hdr.slice(8, 12).toString() === 'WAVE') {
        const byteRate = hdr.readUInt32LE(28);
        if (byteRate > 0) {
          let offset = 12;
          while (offset < bytesRead - 8) {
            const chunkId = hdr.slice(offset, offset + 4).toString();
            const chunkSize = hdr.readUInt32LE(offset + 4);
            if (chunkId === 'data') {
              const wavDur = Math.floor((chunkSize / byteRate) * 1000000);
              if (wavDur > dur) dur = wavDur; // take MAX — safer for CapCut
              break;
            }
            offset += 8 + chunkSize;
            if (chunkSize === 0) break;
          }
        }
      }
    } catch (_e) { /* ignore WAV header errors */ }

    return dur > 0 ? dur : 8000000;
  } catch (e) {
    console.error(`Error reading audio duration ${filepath}:`, e);
    return 8000000;
  }
}

// ============================================================
//  Simple helper material factories (canvas, animation, etc.)
// ============================================================

function makeCanvas(id: string) {
  return { id, type: 'canvas_color', color: '', blur: 0.0, image: '', album_image: '', image_id: '', image_name: '', source_platform: 0, team_id: '' };
}

function makeAnimation(id: string) {
  return { id, type: 'sticker_animation', animations: [], multi_language_current: 'none' };
}

function makeColor(id: string) {
  return { id, type: 'material_color', color_type: 0, color_value: '' };
}

function makePlaceholder(id: string) {
  return { id, type: 'placeholder', meta_type: 'none', res: '' };
}

function makeChannel(id: string) {
  return { id, type: 'sound_channel_mapping', audio_channel_mapping: 0, is_config_open: false };
}

function makeVocalSep(id: string) {
  return { id, type: 'vocal_separation', choice: 0, production_path: '', time_range: null, vocal_path: '' };
}

function uuid(): string {
  return crypto.randomUUID().toUpperCase();
}

function splitTextIntoChunks(text: string, maxWords: number = 7, maxChars: number = 35): string[] {
  // Step 1: Split by punctuation marks, keeping the punctuation attached to the preceding segment
  const rawSegments = text.split(/([,;:!?—]+)/g);
  const initialSegments: string[] = [];
  let currentSeg = "";

  for (const token of rawSegments) {
    if (token.match(/^[,;:!?—]+$/)) {
      currentSeg += token;
    } else {
      if (currentSeg) {
        initialSegments.push(currentSeg.trim());
      }
      currentSeg = token;
    }
  }
  if (currentSeg) {
    initialSegments.push(currentSeg.trim());
  }

  const filteredSegments = initialSegments.map(s => s.trim()).filter(Boolean);

  // Step 2: Merge adjacent segments if they fit together within the word/char limits
  const mergedSegments: string[] = [];
  let tempSeg = "";

  for (const seg of filteredSegments) {
    if (!tempSeg) {
      tempSeg = seg;
    } else {
      const combined = tempSeg + " " + seg;
      const combinedWords = combined.split(/\s+/).length;
      if (combinedWords <= maxWords && combined.length <= maxChars) {
        tempSeg = combined;
      } else {
        mergedSegments.push(tempSeg);
        tempSeg = seg;
      }
    }
  }
  if (tempSeg) {
    mergedSegments.push(tempSeg);
  }

  // Step 3: Process each merged segment. If it exceeds limits, perform a balanced split
  const chunks: string[] = [];

  for (const seg of mergedSegments) {
    const words = seg.split(/\s+/);
    if (words.length <= maxWords && seg.length <= maxChars) {
      chunks.push(seg);
    } else {
      // Calculate the minimum number of chunks needed
      const chunksByWords = Math.ceil(words.length / maxWords);
      const chunksByChars = Math.ceil(seg.length / maxChars);
      const numChunks = Math.max(chunksByWords, chunksByChars);

      // Target words per chunk (balanced distribution)
      const targetWordsPerChunk = Math.ceil(words.length / numChunks);

      let startIndex = 0;
      for (let i = 0; i < numChunks; i++) {
        const remainingWords = words.length - startIndex;
        const takeWords = (i === numChunks - 1)
          ? remainingWords
          : Math.min(targetWordsPerChunk, remainingWords);

        const chunkWords = words.slice(startIndex, startIndex + takeWords);
        chunks.push(chunkWords.join(" "));
        startIndex += takeWords;
      }
    }
  }

  return chunks;
}

// ============================================================
//  Build Draft Content
// ============================================================

export async function buildDraftContent(
  draftId: string,
  videoPaths: string[],
  audioPaths: string[],
  bgmPath: string | null,
  isLongVideo: boolean = false,
  voiceovers?: string[],
  fontPath?: string,
  capcutBase?: string,
  tongHopPath?: string | null,
  language: string = 'vi',
  sceneTimelines?: ({ start: number; end: number; duration: number } | null)[]
): Promise<DraftBuildResult> {
  const num = videoPaths.length;
  const defaultCapcutBase = path.join(os.homedir(), 'AppData', 'Local', 'CapCut').replace(/\\/g, '/');
  const capcutBaseForJson = (capcutBase || defaultCapcutBase).replace(/\\/g, '/');

  // Pre-calculate audio durations of each scene_N.wav
  const rawAudioDurs: number[] = [];
  for (const aPath of audioPaths) {
    let dur = 4000000;
    if (fs.existsSync(aPath)) {
      dur = await getAudioDurationUs(aPath);
    }
    rawAudioDurs.push(dur);
  }

  let masterTongHopDur: number | null = null;
  if (tongHopPath && fs.existsSync(tongHopPath)) {
    masterTongHopDur = await getAudioDurationUs(tongHopPath);
  }

  const AUDIO_SPEED = 1.15;

  // ─── Tính slot timeline và speed cho từng scene ─────────────────────────────
  // 1. Lấy thời lượng slot cơ bản của từng scene từ sceneTimelines (hoặc rawAudioDurs)
  const rawTargetDurs: number[] = [];
  for (let i = 0; i < num; i++) {
    const tl = sceneTimelines && sceneTimelines[i];
    if (tl && typeof tl.duration === 'number' && tl.duration > 0.05) {
      rawTargetDurs.push(Math.round(tl.duration * 1_000_000));
    } else {
      const rawDur = rawAudioDurs[i] || 4000000;
      rawTargetDurs.push(Math.floor(rawDur / AUDIO_SPEED));
    }
  }

  // 2. Khóa thời lượng tổng thể chuẩn theo file Audio Tổng Hợp (Ground Truth Lock)
  let masterScaledTotal: number | null = null;
  if (masterTongHopDur && masterTongHopDur > 0) {
    masterScaledTotal = Math.floor(masterTongHopDur / AUDIO_SPEED);
  }

  const targetDurs: number[] = [];    // slot timeline chuẩn xác sau chuẩn hóa
  const sourceDurs: number[] = [];    // available video = vDur - 1s
  const videoSpeeds: number[] = [];   // video speed để fit slot
  let totalDur = 0;

  const rawSum = rawTargetDurs.reduce((sum, d) => sum + d, 0);

  if (masterScaledTotal && rawSum > 0) {
    // Chuẩn hóa tỷ lệ bảo đảm tổng Track Video và Subtitle khớp 100.000% với Audio tổng hợp
    let currentAccum = 0;
    for (let i = 0; i < num; i++) {
      if (i === num - 1) {
        const finalSlot = Math.max(500000, masterScaledTotal - currentAccum);
        targetDurs.push(finalSlot);
        currentAccum += finalSlot;
      } else {
        const normalizedSlot = Math.round((rawTargetDurs[i] / rawSum) * masterScaledTotal);
        targetDurs.push(normalizedSlot);
        currentAccum += normalizedSlot;
      }
    }
    totalDur = masterScaledTotal;
  } else {
    for (let i = 0; i < num; i++) {
      targetDurs.push(rawTargetDurs[i]);
      totalDur += rawTargetDurs[i];
    }
  }

  // 3. Tính toán source video và video speed
  for (let i = 0; i < num; i++) {
    let vDur = 5000000; // Default fallback nếu file video không tồn tại
    if (fs.existsSync(videoPaths[i])) {
      vDur = await getAudioDurationUs(videoPaths[i]);
    }
    if (vDur < 2000000) vDur = 5000000;

    const availableVideoDur = vDur - 1000000; // cắt 1s đầu video
    const speed = availableVideoDur / targetDurs[i];

    sourceDurs.push(availableVideoDur);
    videoSpeeds.push(speed);
  }
  // totalDur = ∑(rawAudioDur_i / 1.15) = tổng thời gian timeline thực tế

  let bgmDur = totalDur;
  if (bgmPath && fs.existsSync(bgmPath)) {
    bgmDur = await getAudioDurationUs(bgmPath);
  }

  // Parallel material arrays
  const vidMats: VideoMaterial[] = [];
  const vidIds: string[] = [];
  const speedMats: ReturnType<typeof buildSpeed>[] = [];
  const spdIds: string[] = [];
  const transMats: ReturnType<typeof buildTransition>[] = [];
  const trnIds: string[] = [];
  const canvasMats: ReturnType<typeof makeCanvas>[] = [];
  const canvasIds: string[] = [];
  const animMats: ReturnType<typeof makeAnimation>[] = [];
  const animIds: string[] = [];
  const colorMats: ReturnType<typeof makeColor>[] = [];
  const colorIds: string[] = [];
  const placeholderMats: ReturnType<typeof makePlaceholder>[] = [];
  const phIds: string[] = [];
  const channelMats: ReturnType<typeof makeChannel>[] = [];
  const chIds: string[] = [];
  const vocalMats: ReturnType<typeof makeVocalSep>[] = [];
  const vocalIds: string[] = [];
  const isEnglish = language === 'en';

  // Build per-video materials (1920x1080 for Long Video, 1080x1920 for Short Video)
  const videoWidth = isLongVideo ? 1920 : 1080;
  const videoHeight = isLongVideo ? 1080 : 1920;

  for (let i = 0; i < num; i++) {
    const vidId = uuid(); vidIds.push(vidId);
    vidMats.push(buildVideoMaterial(vidId, videoPaths[i], videoWidth, videoHeight));

    const spdId = uuid(); spdIds.push(spdId);
    speedMats.push(buildSpeed(spdId, videoSpeeds[i]));

    if (i < num - 1) {
      const trnId = uuid(); trnIds.push(trnId);
      transMats.push(buildTransition(trnId));
    }

    const cId = uuid(); canvasIds.push(cId); canvasMats.push(makeCanvas(cId));
    const aId = uuid(); animIds.push(aId); animMats.push(makeAnimation(aId));
    const mcId = uuid(); colorIds.push(mcId); colorMats.push(makeColor(mcId));
    const pId = uuid(); phIds.push(pId); placeholderMats.push(makePlaceholder(pId));
    const scId = uuid(); chIds.push(scId); channelMats.push(makeChannel(scId));
    const vsId = uuid(); vocalIds.push(vsId); vocalMats.push(makeVocalSep(vsId));
  }

  // Audio materials
  const audMats: VideoMaterial[] = [];
  const audSegments: Segment[] = [];
  let currentAudStart = 0;

  for (let i = 0; i < audioPaths.length; i++) {
    const aPath = audioPaths[i];
    if (fs.existsSync(aPath)) {
      // Use actual file duration as source — never exceed real file length
      const aFileDur = rawAudioDurs[i];
      // Target duration on timeline (may be rescaled when tongHop is present)
      const aDur = targetDurs[i];
      // The speed ratio that maps the real file to the target slot
      const aSpeed = aFileDur / aDur;
      const aId = uuid();
      const aMat = buildAudioMaterial(aId, aPath, aFileDur);
      audMats.push(aMat);

      const aSpdId = uuid(); speedMats.push(buildSpeed(aSpdId, aSpeed));
      const aPhId = uuid(); placeholderMats.push(makePlaceholder(aPhId));
      const aChId = uuid(); channelMats.push(makeChannel(aChId));
      const aVsId = uuid(); vocalMats.push(makeVocalSep(aVsId));

      // source_timerange covers the full real file; target_timerange is the timeline slot
      const seg = buildSegment(uuid(), aId, aFileDur, currentAudStart, aDur, aSpeed, [aSpdId, aPhId, aChId, aVsId]);
      seg.volume = 1.0;
      seg.last_nonzero_volume = 1.0;
      seg.speed = aSpeed;
      audSegments.push(seg);

      currentAudStart += aDur;
    }
  }

  // Tong Hop Loi Thoai audio material (placed right below scene_x.wav audio track)
  let tongHopSegment: Segment | null = null;
  const audioEffectsMats: any[] = [];

  if (tongHopPath && fs.existsSync(tongHopPath)) {
    const thRawDur = await getAudioDurationUs(tongHopPath);
    // target slot = toàn bộ timeline, speed = thRawDur/totalDur để CapCut co/giãn file khớp timeline.
    const thTargetDur = totalDur;
    const thSpeed = thRawDur / thTargetDur;
    // SAFETY BUFFER: đặt source_timerange và material.duration lớn hơn thRawDur 500ms.
    // Lý do: WAV container wrapping MP3 (audioFmt=85) báo data chunk lớn hơn
    // thời lượng MP3 frames ~ 1-2s. CapCut decode theo container, nếu source_timerange
    // bị cap ở thRawDur (giá trị music-metadata) thì có thể bị cắt 1-2s ở cuối.
    // Việc đặt source lớn hơn là an toàn vì CapCut tự dừng khi hết data thực của file.
    const TH_SAFETY_BUFFER_US = 500000; // 500ms buffer
    const thSourceDur = thRawDur + TH_SAFETY_BUFFER_US;
    console.log(`[CapCut tong_hop] file="${path.basename(tongHopPath)}" rawDur=${thRawDur}µs (${(thRawDur/1e6).toFixed(2)}s) | sourceDur=${thSourceDur}µs (${(thSourceDur/1e6).toFixed(2)}s) | totalDur=${thTargetDur}µs (${(thTargetDur/1e6).toFixed(2)}s) | speed=${thSpeed.toFixed(4)}x`);
    const thId = uuid();
    // material.duration cũng set = thSourceDur để CapCut không cap sớ mới hơn source
    const thMat = buildAudioMaterial(thId, tongHopPath, thSourceDur);
    audMats.push(thMat);

    const thSpdId = uuid(); speedMats.push(buildSpeed(thSpdId, thSpeed));
    const thPhId = uuid(); placeholderMats.push(makePlaceholder(thPhId));
    const thChId = uuid(); channelMats.push(makeChannel(thChId));
    const thVsId = uuid(); vocalMats.push(makeVocalSep(thVsId));

    // Bộ lọc giọng nói -> "Giọng nói sắc nét" (Tiếng Anh) hoặc "Mãnh liệt" (Tiếng Việt)
    const thFilterId = uuid();
    const filterName = isEnglish ? 'Giọng nói sắc nét' : 'Mãnh liệt';
    const filterResId = isEnglish ? '7491147795483659521' : '7320193885114733057';
    const filterSubFolder = isEnglish ? 'afa899afa9b93e99cce244324bffe563' : '99fee98d58dd023a9f54a772dffe1ac1';

    audioEffectsMats.push({
      id: thFilterId,
      constant_material_id: uuid(),
      type: 'audio_effect',
      name: filterName,
      path: `${capcutBaseForJson}/User Data/Cache/effect/${filterResId}/${filterSubFolder}`,
      production_path: '',
      sub_type: 1,
      time_range: { start: 0, duration: 0 },
      speaker_id: '',
      resource_id: filterResId,
      third_resource_id: filterResId,
      source_platform: 1,
      category_id: 'sound_effect',
      category_name: 'Bộ lọc giọng nói',
      audio_adjust_params: [
        {
          value: 1,
          default_value: 1,
          parameterIndex: 0,
          portIndex: 0,
          name: 'Intensity',
          min_value: 0,
          max_value: 1
        }
      ],
      is_vc_clone_tone: false,
      vc_type: 'none',
      is_ugc: false
    });

    // FIX: is_tone_modify phải = FALSE để dùng simple resample thay vì time-stretch.
    tongHopSegment = buildSegment(uuid(), thId, thSourceDur, 0, thTargetDur, thSpeed, [
      thSpdId,
      thPhId,
      thChId,
      thVsId,
      thFilterId,
    ]);
    tongHopSegment.volume = 1.0;
    tongHopSegment.last_nonzero_volume = 1.0;
    tongHopSegment.speed = thSpeed;
    tongHopSegment.is_tone_modify = false; // FIX: false = simple resample, không cần lookahead, không cắt cuối
  }

  // BGM material
  let bgmMat: VideoMaterial | null = null;
  let bgmId: string | null = null;
  let bgmSpdId: string | undefined, bgmPhId: string | undefined, bgmChId: string | undefined, bgmVsId: string | undefined;
  // BGM always plays at 1.15x speed (same as the synthesized dialogue), then gets trimmed to totalDur.
  const BGM_SPEED = 1.15;

  if (bgmPath) {
    bgmId = uuid();
    bgmMat = buildAudioMaterial(bgmId, bgmPath, bgmDur);
    bgmSpdId = uuid(); speedMats.push(buildSpeed(bgmSpdId, BGM_SPEED));
    bgmPhId = uuid(); placeholderMats.push(makePlaceholder(bgmPhId));
    bgmChId = uuid(); channelMats.push(makeChannel(bgmChId));
    bgmVsId = uuid(); vocalMats.push(makeVocalSep(bgmVsId));
  }

  // Overlay avatar (JPEG for Vietnamese, PNG for English)
  const jpegId = uuid();
  let overlayFileName = isEnglish ? 'overlay_avatar_en.png' : 'overlay_avatar.png';
  let overlayPath = path.join(process.cwd(), overlayFileName).replace(/\\/g, '/');

  if (!fs.existsSync(overlayPath)) {
    const fallbackName = isEnglish ? 'overlay_avatar.png' : 'overlay_avatar_en.png';
    const fallbackPath = path.join(process.cwd(), fallbackName).replace(/\\/g, '/');
    if (fs.existsSync(fallbackPath)) {
      overlayPath = fallbackPath;
    }
  }
  const jpegMat = {
    id: jpegId, unique_id: '', type: 'photo',
    path: overlayPath,
    width: 1080, height: 1920,
    duration: totalDur,
    source_platform: 0, material_name: path.basename(overlayPath),
  } as unknown as VideoMaterial;

  vidMats.push(jpegMat);

  const jpegSpdId = uuid(); speedMats.push(buildSpeed(jpegSpdId, 1.0));
  const jpegPhId = uuid(); placeholderMats.push(makePlaceholder(jpegPhId));

  // Effect
  const effectId = uuid();
  const effectMat = {
    id: effectId, effect_id: '871341',
    resource_id: '6758324919789949453',
    third_resource_id: '', name: 'Brighten',
    report_name: '', type: 'mix_mode',
    sub_type: 'none', path: '',
    value: 0.5, visible: true,
    item_effect_type: 0, category_id: '',
    category_name: '', category_key: '',
    sub_category_id: '', sub_category_name: '',
    platform: 'all', source_platform: 1,
    request_id: '', is_title_effect: false,
  };

  const jpegCanvasId = uuid(); canvasMats.push(makeCanvas(jpegCanvasId));
  const jpegAnimId = uuid(); animMats.push(makeAnimation(jpegAnimId));
  const jpegChId = uuid(); channelMats.push(makeChannel(jpegChId));
  const jpegColorId = uuid(); colorMats.push(makeColor(jpegColorId));

  const loudnessId = uuid();
  const loudnessMat = { id: loudnessId, type: 'loudness', loudness: -100.0, peak: -100.0 };

  const jpegVsId = uuid(); vocalMats.push(makeVocalSep(jpegVsId));

  // Video segments (Short = 106%, Long = 106% zoom ratio)
  const videoScaleVal = 1.06;
  const videoClipTransform: ClipTransform = {
    scale: { x: videoScaleVal, y: videoScaleVal },
    rotation: 0.0,
    transform: { x: 0.0, y: 0.0 },
    flip: { vertical: false, horizontal: false },
    alpha: 1.0,
  };

  const vidSegments = [];
  let curStart = 0;
  for (let i = 0; i < num; i++) {
    const extra = [spdIds[i], phIds[i]];
    if (i < num - 1) extra.push(trnIds[i]);
    extra.push(canvasIds[i], animIds[i], chIds[i], colorIds[i], vocalIds[i]);

    // videoSpeeds[i] = availableVideoDur / scaledTDur
    // speed > 1.0: video dài hơn slot → trim (nhanh hơn)
    // speed = 1.0: vừa khít
    // speed < 1.0: video ngắn hơn slot → slow-motion (chậm lại)
    // Không loop — chỉ điều chỉnh speed
    const rawVideoSpeed = videoSpeeds[i];
    speedMats[i].speed = rawVideoSpeed; // giữ nguyên speed kể cả khi < 1.0

    const seg = buildSegment(
      uuid(), vidIds[i],
      sourceDurs[i],  // source = available clip sau khi cắt 1s đầu
      curStart,
      targetDurs[i],  // target = rawAudioDur / 1.15 (slot đúng bằng audio scene sau 1.15x)
      1.0,            // segment.speed = 1.0 (SpeedMaterial giữ speed thực tế)
      extra, videoClipTransform, 0, 0, '', 1000000, 1.06
    );
    vidSegments.push(seg);
    curStart += targetDurs[i];
  }

  // JPEG overlay segment
  const jpegExtra = [jpegSpdId, jpegPhId, effectId, jpegCanvasId, jpegAnimId, jpegChId, jpegColorId, loudnessId, jpegVsId];
  const overlayClip: ClipTransform = {
    scale: isLongVideo ? { x: 0.08, y: 0.08 } : { x: 0.099175536465998, y: 0.099175536465998 },
    rotation: 0.0,
    transform: isLongVideo ? { x: 0.9114583333333334, y: 0.8333333333333334 } : { x: 0.719665271966527, y: 0.847058823529412 },
    flip: { vertical: false, horizontal: false },
    alpha: 0.5,
  };
  const jpegSegment = buildSegment(uuid(), jpegId, totalDur, 0, totalDur, 1.0, jpegExtra, overlayClip, 1, 1);


  const bgmSegments = [];
  if (bgmId && bgmSpdId && bgmPhId && bgmChId && bgmVsId) {
    // BGM plays at BGM_SPEED (1.15x).
    // - bgmDur is the real file duration (µs).
    // - One "playable" pass of the file on the timeline = Math.floor(bgmDur / BGM_SPEED) µs.
    // - If totalDur <= one pass → one segment, source slice = totalDur * BGM_SPEED (capped at bgmDur).
    // - If totalDur > one pass → loop the file: multiple consecutive segments until we fill totalDur.
    const BGM_PASS_DUR = Math.floor(bgmDur / BGM_SPEED); // timeline duration of one full playback pass

    let timelinePos = 0; // current write position on timeline (µs)
    let isFirstSegment = true;

    while (timelinePos < totalDur) {
      const remainingTimeline = totalDur - timelinePos;
      const thisTargetDur = Math.min(remainingTimeline, BGM_PASS_DUR);
      // How many µs of source we consume for thisTargetDur at BGM_SPEED
      const thisSourceSlice = Math.min(Math.floor(thisTargetDur * BGM_SPEED), bgmDur);

      // For the first segment reuse pre-built material IDs; subsequent clones share the same material
      // (CapCut allows multiple segments pointing to the same material ID)
      let thisSpdId = bgmSpdId;
      let thisPhId = bgmPhId;
      let thisChId = bgmChId;
      let thisVsId = bgmVsId;

      if (!isFirstSegment) {
        // Clone aux materials so each segment gets unique refs (CapCut requirement)
        thisSpdId = uuid(); speedMats.push(buildSpeed(thisSpdId, BGM_SPEED));
        thisPhId = uuid(); placeholderMats.push(makePlaceholder(thisPhId));
        thisChId = uuid(); channelMats.push(makeChannel(thisChId));
        thisVsId = uuid(); vocalMats.push(makeVocalSep(thisVsId));
      }

      const seg = buildSegment(
        uuid(), bgmId, thisSourceSlice, timelinePos, thisTargetDur, BGM_SPEED,
        [thisSpdId, thisPhId, thisChId, thisVsId],
        null, 0, 0, '', 0
      );
      seg.volume = 0.31622776601683794; // -10.0 dB
      seg.last_nonzero_volume = 0.31622776601683794;
      seg.speed = BGM_SPEED;
      bgmSegments.push(seg);

      timelinePos += thisTargetDur;
      isFirstSegment = false;
    }
  }

  // Subtitles / Captions Track
  const textMats: any[] = [];
  const textSegments: Segment[] = [];
  const textTemplates: any[] = [];

  if (voiceovers && voiceovers.length > 0) {
    const capcutBaseForJson = (capcutBase || defaultCapcutBase).replace(/\\/g, '/');
    const isWin = os.platform() === 'win32';
    const sysRoot = process.env.SystemRoot || 'C:/Windows';
    const longVideoFont = isWin ? path.join(sysRoot, 'Fonts', 'times.ttf').replace(/\\/g, '/') : "/Library/Fonts/Times New Roman.ttf";
    const resolvedFontPath = isLongVideo
      ? longVideoFont
      : `${capcutBaseForJson}/User Data/Cache/effect/7044868401998598657/7a1cfa9b4e743762886b5093de3f6e95/Bangers-Regular.ttf`;

    let currentTextStart = 0;
    for (let i = 0; i < voiceovers.length; i++) {
      const textVal = voiceovers[i];
      if (!textVal) continue;

      const tDur = targetDurs[i] || 4000000;

      // Determine text chunks for this voiceover segment
      // For long videos, split into short chunks (max 7 words or 35 chars) to force exactly 1 line
      const chunks = isLongVideo
        ? splitTextIntoChunks(textVal, 12, 60)
        : [textVal];

      const totalChars = chunks.reduce((sum, c) => sum + c.length, 0);
      let chunkStart = currentTextStart;

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        const chunkText = chunks[cIdx];
        // Calculate chunk duration proportionally based on character length
        let chunkDur = totalChars > 0
          ? Math.floor((chunkText.length / totalChars) * tDur)
          : Math.floor(tDur / chunks.length);

        // Adjust last chunk to fill exactly tDur
        if (cIdx === chunks.length - 1) {
          chunkDur = (currentTextStart + tDur) - chunkStart;
        }

        if (chunkDur <= 0) continue;

        const textMatId = uuid();
        const textName = isLongVideo
          ? "D6B3869B-42B9-43ED-8435-C814651D7122"
          : "F5961391-DD01-43AB-A4D5-0799F98A06F5";

        const textContentObj = isLongVideo ? {
          text: chunkText,
          styles: [
            {
              fill: { content: { render_type: "solid", solid: { color: [1, 1, 1] } } },
              font: { path: resolvedFontPath, id: "" },
              strokes: [{ content: { render_type: "solid", solid: { color: [0, 0, 0] } }, width: 0.0599999986588955, mode: 0 }],
              size: 5,
              useLetterColor: true,
              shadows: [{ distance: 5, content: { render_type: "solid", solid: { color: [0, 0, 0] } }, feather: 0.45, angle: -45, thickness_projection_angle: -45, thickness_projection_enable: false, thickness_projection_distance: 0 }],
              range: [0, chunkText.length]
            }
          ]
        } : {
          text: chunkText,
          styles: [
            {
              fill: { content: { render_type: "solid", solid: { color: [0.95686274766922, 0.78039216995239258, 0.058823529630899429] } } },
              font: { path: resolvedFontPath, id: "7044868401998598657" },
              strokes: [{ content: { render_type: "solid", solid: { color: [0, 0, 0] } }, width: 0.0599999986588955, mode: 0 }],
              size: 15,
              useLetterColor: true,
              shadows: [{ distance: 5.54204225540161, content: { render_type: "solid", solid: { color: [0, 0, 0] } }, feather: 0.024343999102711678, angle: -29, thickness_projection_angle: -45, thickness_projection_enable: false, thickness_projection_distance: 0 }],
              range: [0, chunkText.length]
            }
          ]
        };

        // Calculate word-by-word timestamps for karaoke / speech-following animation
        const totalMs = Math.floor(chunkDur / 1000);
        const wordsList = chunkText.trim().split(/\s+/);
        const N = wordsList.length;
        // Make typing animation faster for long videos by finishing it in 65% of chunk duration
        const typingTotalMs = isLongVideo ? Math.floor(totalMs * 0.65) : totalMs;
        const wordDur = Math.max(1, Math.floor(typingTotalMs / N));

        const wordStartTime: number[] = [];
        const wordEndTime: number[] = [];
        const wordText: string[] = [];

        for (let w = 0; w < N; w++) {
          const wStart = w * wordDur;
          const wEnd = (w + 1) * wordDur;

          wordStartTime.push(wStart);
          wordEndTime.push(wEnd);
          wordText.push(wordsList[w]);

          if (w < N - 1) {
            wordStartTime.push(wEnd);
            wordEndTime.push(wEnd);
            wordText.push(" ");
          }
        }

        // Each caption chunk needs its own unique group_id + task_id
        // so CapCut PC treats them as independent subtitle entries
        // (shared group_id causes CapCut to merge all into one text)
        const chunkGroupId = uuid().replace(/-/g, '').toLowerCase().substring(0, 16);
        const chunkTaskId = uuid().replace(/-/g, '').toLowerCase().substring(0, 16);

        textMats.push({
          id: textMatId,
          name: textName,
          type: 'text',
          content: JSON.stringify(textContentObj),
          group_id: chunkGroupId,
          recognize_task_id: chunkTaskId,
          recognize_text: chunkText,
          recognize_model: "",
          punc_model: "",
          recognize_type: 0,
          tts_auto_update: false,
          words: {
            start_time: wordStartTime,
            end_time: wordEndTime,
            text: wordText
          },
          current_words: {
            start_time: [],
            end_time: [],
            text: []
          },
          italic_degree: 10,
          sub_type: 0,
          check_flag: 47,
          text_size: 30,
          add_type: 1,
          font_size: isLongVideo ? 5 : 15,
          alignment: 1, // Centered
          line_feed: 1,
          text_color: isLongVideo ? '#ffffff' : '#f4c70f',
          text_alpha: 1,
          line_spacing: isLongVideo ? 0.05752961029877559 : 0.02,
          letter_spacing: 0,
          layer_weight: 1,
          initial_scale: 1,
          bold_width: 0.008,
          use_effect_default_color: false,
          is_rich_text: false,
          global_alpha: 1,
          font_path: resolvedFontPath,
          font_id: "",
          font_resource_id: isLongVideo ? "" : "7044868401998598657",
          font_title: isLongVideo ? "none" : "BANGERS",
          font_name: "",
          border_color: isLongVideo ? "#000000" : "#000000ff",
          border_width: 0.06,
          border_mode: 0,
          border_alpha: 0,
          shadow_color: isLongVideo ? "" : "#000000ff",
          shadow_alpha: isLongVideo ? 0.9 : 1,
          shadow_smoothing: isLongVideo ? 0.45 : 0.02434399910271168,
          shadow_distance: isLongVideo ? 5 : 5.5420427322387695,
          shadow_angle: isLongVideo ? -45 : -29,
          shadow_thickness_projection_enable: false,
          shadow_thickness_projection_angle: 0,
          shadow_thickness_projection_distance: 0,
          has_shadow: false,
          background_alpha: 1,
          fonts: isLongVideo ? [] : [
            {
              id: uuid(),
              resource_id: "7044868401998598657",
              third_resource_id: "",
              category_id: "preset",
              category_name: "Presets",
              source_platform: 1,
              path: resolvedFontPath,
              effect_id: "7044868401998598657",
              title: "BANGERS",
              team_id: "",
              file_uri: "",
              request_id: ""
            }
          ],
          force_apply_line_max_width: true,
          language: "en-US",
          caption_template_info: {
            resource_id: "",
            third_resource_id: "",
            resource_name: "",
            category_id: "",
            category_name: "",
            effect_id: "",
            request_id: "",
            path: "",
            is_new: false,
            source_platform: 0
          }
        });

        // Build text template and animation link
        const animMatId = uuid();
        const tmplMatId = uuid();

        const animPath = isLongVideo
          ? `${capcutBaseForJson}/User Data/Cache/effect/16746561/12196518b89652860631d196d19b6f45`
          : `${capcutBaseForJson}/User Data/Cache/effect/110456507/d62a12a386bf578a8eb03187095d7c7d`;

        const tmplPath = isLongVideo
          ? `${capcutBaseForJson}/User Data/Cache/effect/7535434348087004433/73ef9bc93f82aca92844cb013cd06369`
          : `${capcutBaseForJson}/User Data/Cache/effect/7535776683626859777/c0d202b2a29af6a6c790d613cb86e0dc`;

        animMats.push(isLongVideo ? {
          id: animMatId,
          type: 'sticker_animation',
          animations: [
            {
              id: "",
              type: "loop",
              start: 0,
              duration: 500000,
              path: animPath,
              platform: "all",
              resource_id: "7208392434831593985",
              third_resource_id: "",
              source_platform: 0,
              name: "",
              category_id: "",
              category_name: "",
              panel: "",
              material_type: "sticker",
              anim_adjust_params: null,
              request_id: ""
            }
          ],
          multi_language_current: "none"
        } as any : {
          id: animMatId,
          type: 'sticker_animation',
          animations: [
            {
              id: "",
              type: "loop",
              start: 0,
              duration: 500000,
              path: animPath,
              platform: "all",
              resource_id: "7289356246623195649",
              third_resource_id: "",
              source_platform: 0,
              name: "",
              category_id: "",
              category_name: "",
              panel: "",
              material_type: "sticker",
              anim_adjust_params: null,
              request_id: ""
            }
          ],
          multi_language_current: "none"
        } as any);

        textTemplates.push(isLongVideo ? {
          id: tmplMatId,
          version: "1.0.0",
          effect_id: "7535434348087004433",
          resource_id: "7535434348087004433",
          third_resource_id: "0",
          name: "打字光标",
          type: "text_template_subtitle",
          path: tmplPath,
          category_id: "",
          category_name: "",
          platform: "all",
          text_to_audio_ids: [],
          source_platform: 1,
          resources: [
            {
              panel: "fonts",
              path: `${capcutBaseForJson}/User Data/Cache/effect/7485588139982081285/268d391c5c523af58ebe6951a02fefd8/font.ttf`,
              resource_id: "7485588139982081285",
              source_platform: 1
            },
            {
              panel: "text",
              path: animPath,
              resource_id: "7208392434831593985",
              source_platform: 0
            }
          ],
          text_info_resources: [
            {
              id: "AAD1DB5D-10C2-4758-8317-BDB4F22054BE",
              attach_info: {
                start_time: 0,
                duration: chunkDur,
                original_size_width: 585.3450317382812,
                original_size_height: 77.76182556152344,
                clip: {
                  scale: { x: 1, y: 1 },
                  rotation: 0,
                  transform: { x: 0.0, y: 0.0 },
                  flip: { vertical: false, horizontal: false },
                  alpha: 1
                }
              },
              text_material_id: textMatId,
              extra_material_refs: [
                animMatId
              ],
              clip_type: "",
              lyric_keyframes: [],
              word_index: [],
              order_in_layer: 0,
              capital: ""
            }
          ],
          non_text_info_resources: [],
          check_flag: 7,
          text_template_preset_resource_id: "",
          is_3d: false,
          is_pre_rendered: false,
          aigc_type: "none",
          text_template_resource_type: "subtitle_template",
          aigc_config: {
            prompt: "",
            seed: 0,
            model: "",
            font_item: {
              id: uuid(),
              resource_id: "",
              third_resource_id: "",
              category_id: "",
              category_name: "",
              source_platform: 0,
              path: "",
              effect_id: "",
              title: "",
              team_id: "",
              file_uri: "",
              request_id: ""
            }
          },
          request_id: "",
          origin_word_info: {
            text: "",
            start_time: 0,
            end_time: 0,
            words: [],
            keyword_ranges: []
          },
          current_word_info: {
            text: "",
            start_time: 0,
            end_time: 0,
            words: [],
            keyword_ranges: []
          },
          is_dynamic_build: false,
          is_ai_emoji: false,
          is_lyric_effect: false,
          lyric_group_id: "",
          merge_content: "",
          is_uneven_animation: false,
          material_text_ranges: [],
          ai_emoji_config: null
        } : {
          id: tmplMatId,
          version: "1.0.0",
          effect_id: "7535776683626859777",
          resource_id: "7535776683626859777",
          third_resource_id: "0",
          name: "红色逐字强调",
          type: "text_template_subtitle",
          path: tmplPath,
          category_id: "",
          category_name: "",
          platform: "all",
          text_to_audio_ids: [],
          source_platform: 1,
          resources: [
            {
              panel: "fonts",
              path: `${capcutBaseForJson}/User Data/Cache/effect/2809097679/6c82e008a1ad49367bd3fcc69b34904a/티몬체.ttf`,
              resource_id: "7236341569236767288",
              source_platform: 0
            },
            {
              panel: "text",
              path: animPath,
              resource_id: "7289356246623195649",
              source_platform: 0
            }
          ],
          text_info_resources: [
            {
              id: "7171B3AE-BC2F-4534-890E-455F9B4EC4A6",
              attach_info: {
                start_time: 0,
                duration: chunkDur,
                original_size_width: 581.0,
                original_size_height: 181.0,
                clip: {
                  scale: { x: 1, y: 1 },
                  rotation: 0,
                  transform: { x: 0.0, y: 0.0 },
                  flip: { vertical: false, horizontal: false },
                  alpha: 1
                }
              },
              text_material_id: textMatId,
              extra_material_refs: [
                animMatId
              ],
              clip_type: "",
              lyric_keyframes: [],
              word_index: [],
              order_in_layer: 0,
              capital: ""
            }
          ],
          non_text_info_resources: [],
          check_flag: 7,
          text_template_preset_resource_id: "",
          is_3d: false,
          is_pre_rendered: false,
          aigc_type: "none",
          text_template_resource_type: "subtitle_template",
          aigc_config: {
            prompt: "",
            seed: 0,
            model: "",
            font_item: {
              id: uuid(),
              resource_id: "",
              third_resource_id: "",
              category_id: "",
              category_name: "",
              source_platform: 0,
              path: "",
              effect_id: "",
              title: "",
              team_id: "",
              file_uri: "",
              request_id: ""
            }
          },
          request_id: "",
          origin_word_info: {
            text: "",
            start_time: 0,
            end_time: 0,
            words: [],
            keyword_ranges: []
          },
          current_word_info: {
            text: "",
            start_time: 0,
            end_time: 0,
            words: [],
            keyword_ranges: []
          },
          is_dynamic_build: false,
          is_ai_emoji: false,
          is_lyric_effect: false,
          lyric_group_id: "",
          merge_content: "",
          is_uneven_animation: false,
          material_text_ranges: [],
          ai_emoji_config: null
        });

        // Build segment
        const textSegId = uuid();
        const textSeg = buildSegment(
          textSegId,
          tmplMatId,
          0,
          chunkStart,
          chunkDur,
          1.0,
          [animMatId],
          null,
          14000,
          2,
          'segmentsourcenormal',
          0
        );
        textSeg.source_timerange = null as any;
        textSeg.clip = isLongVideo ? {
          scale: { x: 0.5, y: 0.5 },
          rotation: 0,
          transform: { x: 0.0, y: -0.8333333333333334 },
          flip: { vertical: false, horizontal: false },
          alpha: 1.0
        } : {
          scale: { x: 1.0, y: 1.0 },
          rotation: 0.0,
          transform: { x: 0.0, y: -0.364583333333333 },
          flip: { vertical: false, horizontal: false },
          alpha: 1.0
        };

        textSegments.push(textSeg);
        chunkStart += chunkDur;
      }

      currentTextStart += tDur;
    }
  }

  // Tracks
  const tracks: { id: string; type: 'video' | 'audio' | 'text'; attribute: number; flag: number; segments: Segment[] }[] = [
    { id: uuid(), type: 'video', attribute: 1, flag: 0, segments: vidSegments },
  ];
  tracks.push({ id: uuid(), type: 'video', attribute: 0, flag: 0, segments: [jpegSegment] });
  if (audSegments.length > 0) {
    tracks.push({ id: uuid(), type: 'audio', attribute: 0, flag: 0, segments: audSegments });
  }
  if (tongHopSegment) {
    tracks.push({ id: uuid(), type: 'audio', attribute: 0, flag: 0, segments: [tongHopSegment] });
  }
  if (bgmSegments.length > 0) {
    tracks.push({ id: uuid(), type: 'audio', attribute: 0, flag: 0, segments: bgmSegments });
  }
  if (textSegments.length > 0) {
    tracks.push({ id: uuid(), type: 'text', attribute: 0, flag: 1, segments: textSegments });
  }

  const nowUs = Math.floor(Date.now() * 1000);
  const emptyArrays = {
    stickers: [], beats: [], flowers: [], tail_leaders: [], images: [],
    audio_fades: [], placeholders: [], common_mask: [], chromas: [],
    realtime_denoises: [], audio_pannings: [], audio_pitch_shifts: [],
    video_trackings: [], hsl: [], drafts: [], color_curves: [], hsl_curves: [],
    primary_color_wheels: [], log_color_wheels: [], video_effects: [], ai_text_effects: [],
    audio_balances: [], handwrites: [], manual_deformations: [], manual_beautys: [],
    plugin_effects: [], green_screens: [], shapes: [], digital_humans: [],
    digital_human_model_dressing: [], smart_crops: [], ai_translates: [], audio_track_indexes: [],
    vocal_beautifys: [], smart_relights: [], time_marks: [], multi_language_refs: [],
    video_shadows: [], video_strokes: [], video_radius: [],
  };

  const draft = {
    id: draftId, version: 364000, new_version: '164.0.0', name: '',
    duration: totalDur, create_time: nowUs, update_time: nowUs, fps: 30.0,
    is_drop_frame_timecode: false, color_space: 0,
    config: {
      adjust_max_index: 1, attachment_info: [], combination_max_index: 0, export_range: null,
      extract_audio_last_index: 0, lyrics_recognition_id: '', lyrics_sync: true, lyrics_taskinfo: [],
      maintrack_adsorb: true, material_save_mode: 0, multi_language_current: 'none',
      multi_language_list: [], multi_language_main: 'none', multi_language_mode: 'none',
      original_sound_last_index: 0, record_audio_last_index: 0, sticker_max_index: 0,
      subtitle_keywords_config: null, subtitle_recognition_id: '', subtitle_sync: true, subtitle_taskinfo: [],
      system_font_list: [], text_cluster_max_index: 0, text_max_index: 0,
      video_mute: false, zoom_info_params: null, voice_change_sync: true,
    },
    canvas_config: {
      height: isLongVideo ? 1080 : 1920,
      ratio: isLongVideo ? '16:9' : 'original',
      width: isLongVideo ? 1920 : 1080
    },
    tracks,
    group_container: null,
    materials: {
      videos: vidMats,
      audios: [...audMats, ...(bgmMat ? [bgmMat] : [])],
      speeds: speedMats, transitions: transMats, effects: [effectMat],
      canvases: canvasMats, material_animations: animMats, material_colors: colorMats,
      placeholder_infos: placeholderMats, sound_channel_mappings: channelMats,
      vocal_separations: vocalMats, loudnesses: [loudnessMat],
      audio_effects: audioEffectsMats,
      ...emptyArrays,
      texts: textMats,
      text_templates: textTemplates,
    },
    keyframes: { adjusts: [], audios: [], effects: [], filters: [], handwrites: [], stickers: [], texts: [], videos: [] },
    keyframe_graph_list: [],
    platform: { app_id: 3704, app_source: 'cc', app_version: '6.5.0', device_id: '', hard_disk_id: '', mac_address: '', os: 'windows', os_version: '10.0.22631' },
    last_modified_platform: { app_id: 3704, app_source: 'cc', app_version: '6.5.0', device_id: '', hard_disk_id: '', mac_address: '', os: 'windows', os_version: '10.0.22631' },
    mutable_config: null, cover: null, retouch_cover: null, extra_info: null, relationships: [],
    mixed_track_mode_on: false, render_index_track_mode_on: false, free_render_index_mode_on: true,
    static_cover_image_path: '', source: 'default',
    time_marks: { type: 'sticker', role: '' },
    path: '', lyrics_effects: [], uneven_animation_template_info: null,
    draft_type: 0, smart_ads_info: null, function_assistant_info: null,
  };

  return { draft, vidMats, audMats, bgmMat, totalDur };
}

// ============================================================
//  Build Draft Meta Info
// ============================================================

export function buildDraftMeta(
  draftId: string,
  projectName: string,
  projectDir: string,
  vidMats: VideoMaterial[],
  audMats: VideoMaterial[],
  bgmMat: VideoMaterial | null,
  totalDur: number
): Record<string, unknown> {
  const nowUs = Math.floor(Date.now() * 1000);
  const metaMats: MetaMaterial[] = [];

  for (const v of vidMats) {
    metaMats.push({
      ai_group_type: '', create_time: 0, duration: 8000000, enter_from: 0,
      extra_info: path.basename(v.path), file_Path: v.path,
      height: 1920, id: v.id, import_time: 0, import_time_ms: 0,
      item_source: 1, md5: '', metetype: 'video',
      roughcut_time_range: { duration: 8000000, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 0, width: 1080,
    });
  }

  for (const audMat of audMats) {
    metaMats.push({
      ai_group_type: '', create_time: 0, duration: audMat.duration, enter_from: 0,
      extra_info: path.basename(audMat.path), file_Path: audMat.path,
      height: 0, id: audMat.id, import_time: 0, import_time_ms: 0,
      item_source: 1, md5: '', metetype: 'music',
      roughcut_time_range: { duration: audMat.duration, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 0, width: 0,
    });
  }

  if (bgmMat) {
    metaMats.push({
      ai_group_type: '', create_time: 0, duration: bgmMat.duration, enter_from: 0,
      extra_info: path.basename(bgmMat.path), file_Path: bgmMat.path,
      height: 0, id: bgmMat.id, import_time: 0, import_time_ms: 0,
      item_source: 1, md5: '', metetype: 'music',
      roughcut_time_range: { duration: bgmMat.duration, start: 0 },
      sub_time_range: { duration: -1, start: -1 },
      type: 0, width: 0,
    });
  }

  return {
    cloud_draft_cover: false, cloud_draft_sync: false,
    cloud_package_completed_time: '', draft_cloud_capcut_purchase_info: '{"need_purchase":false}',
    draft_cloud_last_action_download: false, draft_cloud_package_type: '',
    draft_cloud_purchase_info: '{\n}\n', draft_cloud_template_id: '',
    draft_cloud_tutorial_info: '{\n}\n', draft_cloud_videocut_purchase_info: '{"template_type":"","unlock_type":""}',
    draft_cover: 'draft_cover.jpg', draft_deeplink_url: '',
    draft_enterprise_info: { draft_enterprise_extra: '', draft_enterprise_id: '', draft_enterprise_name: '', enterprise_material_objs: [] },
    draft_fold_path: projectDir.replace(/\\/g, '/'),
    draft_id: draftId, draft_is_ae_produce: false, draft_is_ai_packaging_used: false,
    draft_is_ai_shorts: false, draft_is_ai_translate: false, draft_is_article_video_draft: false,
    draft_is_cloud_temp_draft: false, draft_is_from_deeplink: 'false', draft_is_invisible: false,
    draft_is_pippit_draft: false, draft_is_web_article_video: false,
    draft_materials: [{ type: 0, value: metaMats }],
    draft_materials_copied_info: [], draft_name: projectName,
    draft_need_rename_folder: false, draft_new_version: '164.0.0',
    draft_removable_storage_device: '', draft_root_path: path.dirname(projectDir).replace(/\\/g, '/'),
    draft_segment_extra_info: [], draft_timeline_materials_size_: 0,
    draft_type: '', draft_web_article_video_enter_from: '',
    pippit_avatar_url: '', pippit_extra_info: '', pippit_id: '', pippit_user_name: '',
    tm_draft_cloud_completed: 0, tm_draft_cloud_entry_id: '', tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: '', tm_draft_cloud_space_id: '', tm_draft_cloud_user_id: '',
    tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0, tm_duration: totalDur,
  };
}

// ============================================================
//  Build Root Entry (for root_meta_info.json)
// ============================================================

export function buildRootEntry(
  draftId: string,
  projectName: string,
  projectDir: string,
  totalDur: number
): Record<string, unknown> {
  const nowUs = Math.floor(Date.now() * 1000);
  return {
    cloud_draft_cover: false, cloud_draft_sync: false,
    draft_cloud_last_action_download: false, draft_cloud_purchase_info: '{\n}\n',
    draft_cloud_template_id: '', draft_cloud_tutorial_info: '{\n}\n',
    draft_cloud_videocut_purchase_info: '{"template_type":"","unlock_type":""}',
    draft_cover: path.join(projectDir, 'draft_cover.jpg').replace(/\\/g, '/'),
    draft_fold_path: projectDir.replace(/\\/g, '/'),
    draft_id: draftId, draft_is_ai_shorts: false, draft_is_cloud_temp_draft: false,
    draft_is_invisible: false, draft_is_pippit_draft: false, draft_is_web_article_video: false,
    draft_json_file: path.join(projectDir, 'draft_content.json').replace(/\\/g, '/'),
    draft_name: projectName, draft_new_version: '164.0.0',
    draft_root_path: path.dirname(projectDir).replace(/\\/g, '/'),
    draft_timeline_materials_size: 0, draft_type: '', draft_web_article_video_enter_from: '',
    pippit_avatar_url: '', pippit_extra_info: '', pippit_id: '', pippit_user_name: '',
    streaming_edit_draft_ready: false, tm_draft_cloud_completed: 0, tm_draft_cloud_entry_id: '',
    tm_draft_cloud_modified: 0, tm_draft_cloud_parent_entry_id: '', tm_draft_cloud_space_id: '',
    tm_draft_cloud_user_id: '', tm_draft_create: nowUs, tm_draft_modified: nowUs, tm_draft_removed: 0,
    tm_duration: totalDur,
  };
}
