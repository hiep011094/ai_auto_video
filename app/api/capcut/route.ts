import { resolveProjectInput } from '../../lib/security';
const isVietnameseText = (text: string) => {
  return /[àáảãạâầấẩẫậăằắẳẵặđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(text);
};

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { getSceneNumber, buildDraftContent, buildDraftMeta, buildRootEntry } from '../../lib/capcut';
import { readJsonSafe } from '../../lib/storage';
import { validateRequired } from '../../lib/security';
import { invalidateHistoryCache } from '../../lib/history-cache';

interface MetadataFile {
  title?: string;
  youtube_title?: string;
}


async function restartCapcutProcess(): Promise<{ launched: boolean; restarted: boolean }> {
  if (process.platform !== 'win32') return { launched: false, restarted: false };
  const capcutExePath = path.join(os.homedir(), 'AppData', 'Local', 'CapCut', 'Apps', 'CapCut.exe');

  try {
    const { stdout } = await execPromise('tasklist /FI "IMAGENAME eq CapCut.exe" /NH');
    const isRunning = stdout.toLowerCase().includes('capcut.exe');

    if (isRunning) {
      // 1. Kill running CapCut process to force memory release
      await execPromise('taskkill /F /IM CapCut.exe');
      await new Promise(resolve => setTimeout(resolve, 800));

      if (fs.existsSync(capcutExePath)) {
        exec(`start "" "${capcutExePath}"`, { shell: 'cmd.exe' });
        return { launched: true, restarted: true };
      }
    } else {
      // CapCut is not running -> launch CapCut PC directly
      if (fs.existsSync(capcutExePath)) {
        exec(`start "" "${capcutExePath}"`, { shell: 'cmd.exe' });
        return { launched: true, restarted: false };
      }
    }
  } catch (err) {
    console.error('Error opening CapCut:', err);
  }
  return { launched: false, restarted: false };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const folderPath = resolveProjectInput(body.folder_path);
    const customBgmPath: string | undefined = body.bgm_path;

    // Validation
    const missing = validateRequired(body, ['folder_path']);
    if (missing.length > 0) {
      return NextResponse.json({ status: 'error', message: 'Missing folder_path' }, { status: 400 });
    }

    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ status: 'error', message: `Thư mục không tồn tại: ${folderPath}` }, { status: 400 });
    }

    // Scan video & audio files
    const files = fs.readdirSync(folderPath);

    // Read all chapters to get sorted scenes list
    const chapterFiles = files
      .filter(f => f.startsWith('chapter_') && f.endsWith('.json'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('chapter_', '').replace('.json', ''), 10);
        const numB = parseInt(b.replace('chapter_', '').replace('.json', ''), 10);
        return numA - numB;
      });

    if (chapterFiles.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: 'Không tìm thấy file kịch bản phân cảnh (chapter_*.json) trong thư mục dự án!'
      }, { status: 400 });
    }

    let scenes: any[] = [];
    for (const cf of chapterFiles) {
      try {
        const chData = JSON.parse(fs.readFileSync(path.join(folderPath, cf), 'utf8'));
        if (Array.isArray(chData)) {
          scenes = scenes.concat(chData);
        }
      } catch (err) {
        return NextResponse.json({
          status: 'error',
          message: `Lỗi đọc file kịch bản ${cf}: ${err instanceof Error ? err.message : 'Dữ liệu JSON không hợp lệ'}`
        }, { status: 400 });
      }
    }

    if (scenes.length === 0) {
      return NextResponse.json({
        status: 'error',
        message: 'Kịch bản phân cảnh (chapter_*.json) không chứa cảnh (scene) nào!'
      }, { status: 400 });
    }

    // Sort scenes by scene number
    scenes.sort((a, b) => a.scene - b.scene);

    // ─── Kiểm tra & đối soát từng cảnh Video và Audio ─────────────────────────
    const missingVideoScenes: number[] = [];
    const videoPaths: string[] = [];
    const audioPaths: string[] = [];
    const voiceovers: string[] = [];

    for (const scene of scenes) {
      const sceneNum = scene.scene;

      // Find matching video file (e.g. Scene_1_01_1080x1920.mp4, scene_1.mp4, Scene_1.mp4)
      const videoFile = files.find(f => {
        const fLower = f.toLowerCase();
        return fLower.endsWith('.mp4') && !fLower.endsWith('.part') && getSceneNumber(f) === sceneNum;
      });

      if (!videoFile) {
        missingVideoScenes.push(sceneNum);
      } else {
        const fullVidPath = path.join(folderPath, videoFile);
        try {
          const stat = fs.statSync(fullVidPath);
          if (stat.size === 0) {
            missingVideoScenes.push(sceneNum);
          } else {
            videoPaths.push(fullVidPath.replace(/\\/g, '/'));
          }
        } catch {
          missingVideoScenes.push(sceneNum);
        }
      }

      // Find matching audio file — WAV has priority over MP3
      const sceneAudioFiles = files.filter(f => {
        const fLower = f.toLowerCase();
        return (fLower.endsWith('.wav') || fLower.endsWith('.mp3')) &&
          getSceneNumber(f) === sceneNum &&
          fLower.startsWith('scene_');
      });
      // Sort: .wav first, then .mp3
      sceneAudioFiles.sort((a, b) => {
        const aIsWav = a.toLowerCase().endsWith('.wav') ? 0 : 1;
        const bIsWav = b.toLowerCase().endsWith('.wav') ? 0 : 1;
        return aIsWav - bIsWav;
      });
      const audioFile = sceneAudioFiles[0];
      const audioPath = audioFile
        ? path.join(folderPath, audioFile).replace(/\\/g, '/')
        : path.join(folderPath, `scene_${sceneNum}.wav`).replace(/\\/g, '/');

      audioPaths.push(audioPath);
      voiceovers.push(scene.sub || scene.voiceover || '');
    }

    // ─── NẾU THIẾU CẢNH VIDEO: BÁO LỖI VÀ CHẶN TẠO CAPCUT ───────────────────
    if (missingVideoScenes.length > 0) {
      const missingListStr = missingVideoScenes.map(num => `Cảnh ${num}`).join(', ');
      return NextResponse.json({
        status: 'error',
        message: `⚠️ Không thể tạo CapCut: Dự án có tổng cộng ${scenes.length} cảnh nhưng đang THIẾU ${missingVideoScenes.length} cảnh video (${missingListStr}). Vui lòng tạo/tải đủ tất cả video trước khi xuất project!`
      }, { status: 400 });
    }

    // BGM path resolution
    let bgmPath: string | null = null;
    if (customBgmPath && fs.existsSync(customBgmPath)) {
      bgmPath = customBgmPath.replace(/\\/g, '/');
    } else {
      const defaultBgm = path.join(process.cwd(), 'nhac_nen.mp3').replace(/\\/g, '/');
      if (fs.existsSync(defaultBgm)) {
        bgmPath = defaultBgm;
      }
    }

    // CapCut project directory
    const capcutDir = path.join(os.homedir(), 'AppData', 'Local', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
    if (!fs.existsSync(capcutDir)) {
      fs.mkdirSync(capcutDir, { recursive: true });
    }

    const folderBase = path.basename(folderPath);
    const projectDirName = folderBase;
    const projectDir = path.join(capcutDir, projectDirName);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Project name from metadata
    let projectName = projectDirName;
    const dataJsonPath = path.join(folderPath, 'metadata.json');
    const metaData = readJsonSafe<MetadataFile & { videoType?: string; language?: string; capcut_created?: boolean; capcut_created_at?: string }>(dataJsonPath, {});
    if (metaData.title) projectName = metaData.title;
    else if (metaData.youtube_title) projectName = metaData.youtube_title;

    const isLongVideo = body.type === 'long' || metaData.videoType === 'long' || (metaData as any).type === 'long' || folderPath.includes('video_long');

    let historyLanguage: string | undefined;
    const historyPath = path.join(process.cwd(), 'database', 'history.json');
    if (fs.existsSync(historyPath)) {
      try {
        const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
        const list = Array.isArray(history) ? history : (history.topics || []);
        const matched = list.find((h: any) => h.folder === folderBase || h.folder === path.basename(folderPath));
        if (matched && matched.language) historyLanguage = matched.language.toLowerCase();
      } catch (e) { }
    }

    const language = metaData.language || historyLanguage || (isVietnameseText(metaData.title || projectName) ? 'vi' : 'en');

    // Create subdirectories
    ['subdraft', 'Timelines', 'common_attachment', 'Resources', 'matting', 'smart_crop', 'adjust_mask', 'qr_upload'].forEach(sub => {
      fs.mkdirSync(path.join(projectDir, sub), { recursive: true });
    });

    // Copy font file to projectDir Resources for offline/portability independence
    const workspaceRoot = process.cwd();
    const appFontPath = path.join(workspaceRoot, 'resources', 'fonts', 'Bangers.ttf');
    const projectFontDest = path.join(projectDir, 'Resources', 'Bangers.ttf');
    try {
      if (fs.existsSync(appFontPath)) {
        fs.copyFileSync(appFontPath, projectFontDest);
      }

      const appEffectsPath = path.join(workspaceRoot, 'resources', 'capcut_effects');
      const projectEffectsDest = path.join(projectDir, 'Resources', 'capcut_effects');
      if (fs.existsSync(appEffectsPath)) {
        fs.cpSync(appEffectsPath, projectEffectsDest, { recursive: true });

        // Auto-seed local CapCut cache on ANY computer so CapCut PC finds the effect pre-installed!
        const localCapcutCache = path.join(os.homedir(), 'AppData', 'Local', 'CapCut', 'User Data', 'Cache', 'effect');
        if (fs.existsSync(path.dirname(localCapcutCache))) {
          if (!fs.existsSync(localCapcutCache)) {
            fs.mkdirSync(localCapcutCache, { recursive: true });
          }
          const effectFolders = fs.readdirSync(appEffectsPath);
          for (const ef of effectFolders) {
            const srcEf = path.join(appEffectsPath, ef);
            const dstEf = path.join(localCapcutCache, ef);
            if (fs.statSync(srcEf).isDirectory() && !fs.existsSync(dstEf)) {
              fs.cpSync(srcEf, dstEf, { recursive: true });
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to copy resources to project:', err);
    }
    const fontPathForJson = projectFontDest.replace(/\\/g, '/');
    const capcutBaseForJson = path.join(os.homedir(), 'AppData', 'Local', 'CapCut').replace(/\\/g, '/');

    // Combined audio path resolution
    // Priority: tong_hop_loi_thoai_vbee.wav > tong_hop_loi_thoai_vbee.mp3 > tong_hop_loi_thoai.wav > tong_hop_loi_thoai.mp3
    let tongHopPath: string | null = null;
    const vbeeWavTongHop = path.join(folderPath, 'tong_hop_loi_thoai_vbee.wav');
    const vbeeMp3TongHop = path.join(folderPath, 'tong_hop_loi_thoai_vbee.mp3');
    const wavTongHop = path.join(folderPath, 'tong_hop_loi_thoai.wav');
    const mp3TongHop = path.join(folderPath, 'tong_hop_loi_thoai.mp3');

    if (fs.existsSync(vbeeWavTongHop)) {
      tongHopPath = vbeeWavTongHop.replace(/\\/g, '/');
    } else if (fs.existsSync(vbeeMp3TongHop)) {
      tongHopPath = vbeeMp3TongHop.replace(/\\/g, '/');
    } else if (fs.existsSync(wavTongHop)) {
      tongHopPath = wavTongHop.replace(/\\/g, '/');
    } else if (fs.existsSync(mp3TongHop)) {
      tongHopPath = mp3TongHop.replace(/\\/g, '/');
    }

    // Nếu không có file audio tổng hợp, kiểm tra xem có đủ audio riêng lẻ từng cảnh không
    if (!tongHopPath) {
      const missingAudioScenes: number[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const aPath = audioPaths[i];
        if (!fs.existsSync(aPath)) {
          missingAudioScenes.push(scenes[i].scene);
        } else {
          try {
            const aStat = fs.statSync(aPath);
            if (aStat.size === 0) missingAudioScenes.push(scenes[i].scene);
          } catch {
            missingAudioScenes.push(scenes[i].scene);
          }
        }
      }

      if (missingAudioScenes.length > 0) {
        const missingAudioStr = missingAudioScenes.map(num => `Cảnh ${num}`).join(', ');
        return NextResponse.json({
          status: 'error',
          message: `⚠️ Không thể tạo CapCut: Không tìm thấy file audio tổng hợp và đang THIẾU file audio của ${missingAudioScenes.length} cảnh (${missingAudioStr}). Vui lòng tạo giọng đọc trước khi ghép nối!`
        }, { status: 400 });
      }
    }

    const sceneTimelines = scenes.map(s => s.timeline || null);

    // Build CapCut project (delegated to lib/capcut)
    const draftId = crypto.randomUUID().toUpperCase();
    const { draft, vidMats, audMats, bgmMat, totalDur } = await buildDraftContent(
      draftId,
      videoPaths,
      audioPaths,
      bgmPath,
      isLongVideo,
      voiceovers,
      fontPathForJson,
      capcutBaseForJson,
      tongHopPath,
      language,
      sceneTimelines
    );

    fs.writeFileSync(path.join(projectDir, 'draft_content.json'), JSON.stringify(draft, null, 2), 'utf8');

    const meta = buildDraftMeta(draftId, projectName, projectDir, vidMats, audMats, bgmMat, totalDur);
    fs.writeFileSync(path.join(projectDir, 'draft_meta_info.json'), JSON.stringify(meta, null, 2), 'utf8');

    // Extra config files
    const extras: Record<string, string> = {
      'draft.extra': '{"create_type":"default"}',
      'draft_settings': '{"draft_settings_version":164}',
      'draft_virtual_store.json': '{}',
      'key_value.json': '{}',
      'performance_opt_info.json': '{"launch_opt_info":0}',
      'timeline_layout.json': '{"enable":false}',
      'draft_biz_config.json': '',
      'draft_agency_config.json': '{"draft_agency_infos":[]}',
    };
    for (const [fname, content] of Object.entries(extras)) {
      fs.writeFileSync(path.join(projectDir, fname), content, 'utf8');
    }

    // Update root_meta_info.json
    const rootMetaPath = path.join(capcutDir, 'root_meta_info.json');
    const rootMeta = readJsonSafe<{ all_draft_store: Record<string, unknown>[]; draft_ids: number; root_path: string }>(
      rootMetaPath,
      { all_draft_store: [], draft_ids: 0, root_path: capcutDir.replace(/\\/g, '/') }
    );

    const newEntry = buildRootEntry(draftId, projectName, projectDir, totalDur);
    rootMeta.all_draft_store = rootMeta.all_draft_store.filter(
      (d: Record<string, unknown>) => d.draft_name !== projectName
    );
    rootMeta.all_draft_store.unshift(newEntry);
    rootMeta.draft_ids = rootMeta.all_draft_store.length;

    try {
      fs.writeFileSync(rootMetaPath, JSON.stringify(rootMeta, null, 2), 'utf8');
    } catch (e) {
      console.log('[WARN] root_meta_info.json:', e);
    }

    // Update history.json with capcut_created status
    try {
      const nowIso = new Date().toISOString();
      const historyPath = path.join(process.cwd(), 'database', 'history.json');
      if (fs.existsSync(historyPath)) {
        const rawHistory = readJsonSafe<any>(historyPath, []);
        const topicsList = Array.isArray(rawHistory) ? rawHistory : (rawHistory.topics || []);
        const targetTopic = topicsList.find((t: any) => t.folder === folderBase || t.folder === projectDirName);
        if (targetTopic) {
          targetTopic.capcut_created = true;
          targetTopic.capcut_created_at = nowIso;
          // Note: we write back rawHistory (which is an array, or a wrapper object if legacy)
          // Actually, let's normalize it to array to ensure we respect the schema
          fs.writeFileSync(historyPath, JSON.stringify(topicsList, null, 2), 'utf8');
          // Invalidate in-process cache so next GET /api/history reads fresh data
          invalidateHistoryCache();
        }
      }
    } catch (err) {
      console.error('[WARN] Failed to update capcut_created in metadata/history:', err);
    }

    const capcutRes = await restartCapcutProcess();
    const noticeMsg = capcutRes.restarted
      ? ' 🚀 Đã tự động khởi động lại CapCut PC để nạp dự án mới!'
      : capcutRes.launched
        ? ' 🚀 Đã tự động mở phần mềm CapCut PC!'
        : '';

    return NextResponse.json({
      status: 'success',
      message: `Tạo thành công project CapCut: ${projectName}! (${scenes.length} cảnh).${noticeMsg}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('API error:', e);
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
