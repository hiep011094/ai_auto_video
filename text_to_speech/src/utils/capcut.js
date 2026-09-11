const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Get the local CapCut drafts folder path dynamically (supports custom locations)
function getCapcutDraftsDir() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error('LOCALAPPDATA environment variable is not defined.');
  }
  
  // Default fallback path
  let draftsPath = path.join(localAppData, 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft');
  
  try {
    const configPath = path.join(localAppData, 'CapCut', 'User Data', 'Config', 'globalSetting');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const match = content.match(/currentCustomDraftPath\s*=\s*(.+)/);
      if (match && match[1]) {
        let customPath = match[1].trim();
        // Replace double backslashes
        customPath = customPath.replace(/\\\\/g, '\\');
        if (fs.existsSync(customPath)) {
          draftsPath = customPath;
        }
      }
    }
  } catch (err) {
    console.error('Error reading custom CapCut draft path from globalSetting:', err);
  }
  
  return draftsPath;
}

// Helper to format date
function formatDate(timestampMs) {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  return date.toLocaleString('vi-VN');
}

// List all draft projects sorted by last modified time
function listProjects() {
  try {
    const draftsDir = getCapcutDraftsDir();
    if (!fs.existsSync(draftsDir)) {
      return [];
    }

    const files = fs.readdirSync(draftsDir);
    const projects = [];

    for (const file of files) {
      const draftPath = path.join(draftsDir, file);
      if (!fs.statSync(draftPath).isDirectory() || file.startsWith('.')) {
        continue;
      }

      const metaPath = path.join(draftPath, 'draft_meta_info.json');
      const contentPath = path.join(draftPath, 'draft_content.json');

      if (fs.existsSync(metaPath) && fs.existsSync(contentPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          
          // Count texts and audios in draft
          let textCount = 0;
          let audioCount = 0;
          try {
            const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
            textCount = content.materials?.texts?.length || 0;
            audioCount = content.materials?.audios?.length || 0;
          } catch (e) {
            // Ignore error parsing content
          }

          projects.push({
            id: file, // folder name serves as draft ID/folder
            name: meta.draft_name || file,
            path: draftPath,
            lastModified: meta.tm_draft_modified ? Math.floor(meta.tm_draft_modified / 1000) : fs.statSync(metaPath).mtimeMs,
            formattedDate: formatDate(meta.tm_draft_modified ? Math.floor(meta.tm_draft_modified / 1000) : fs.statSync(metaPath).mtimeMs),
            textCount,
            audioCount
          });
        } catch (e) {
          console.error(`Error parsing meta for ${file}:`, e);
        }
      }
    }

    // Sort by last modified DESC
    return projects.sort((a, b) => b.lastModified - a.lastModified);
  } catch (error) {
    console.error('Error listing projects:', error);
    return [];
  }
}

// Inject text list into CapCut draft
function injectText(projectId, rawText, splitOption = 'paragraph') {
  const draftsDir = getCapcutDraftsDir();
  const draftPath = path.join(draftsDir, projectId);
  const contentPath = path.join(draftPath, 'draft_content.json');

  if (!fs.existsSync(contentPath)) {
    throw new Error(`Dự án ${projectId} không tồn tại.`);
  }

  // Split text into chunks
  let chunks = [];
  if (splitOption === 'line') {
    chunks = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  } else if (splitOption === 'paragraph') {
    chunks = rawText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0);
  } else if (splitOption === 'sentence') {
    chunks = rawText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
  } else {
    // default character count split (~500 chars)
    const words = rawText.split(/\s+/);
    let current = [];
    let currentLength = 0;
    for (const word of words) {
      if (currentLength + word.length > 400) {
        chunks.push(current.join(' '));
        current = [word];
        currentLength = word.length;
      } else {
        current.push(word);
        currentLength += word.length + 1;
      }
    }
    if (current.length > 0) {
      chunks.push(current.join(' '));
    }
  }

  if (chunks.length === 0) {
    throw new Error('Văn bản trống hoặc không hợp lệ.');
  }

  // Parse draft_content.json
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));

  // Ensure materials and tracks exist
  if (!content.materials) content.materials = {};
  if (!content.materials.texts) content.materials.texts = [];
  if (!content.materials.material_animations) content.materials.material_animations = [];
  if (!content.tracks) content.tracks = [];

  // 1. Find or create text track
  let textTrack = content.tracks.find(t => t.type === 'text');
  if (!textTrack) {
    textTrack = {
      id: crypto.randomUUID().toUpperCase(),
      type: 'text',
      segments: [],
      flag: 0,
      attribute: 0,
      name: '',
      is_default_name: true
    };
    content.tracks.push(textTrack);
  } else {
    // Clear existing segments on the text track
    textTrack.segments = [];
  }

  // 2. We can clear old text materials to keep draft clean
  content.materials.texts = [];
  // Keep material_animations clean too if we want, or keep existing ones
  content.materials.material_animations = [];

  // Dynamic font path discovery (CapCut PC default font)
  let latestFont = '';
  try {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const appsDir = path.join(localAppData, 'CapCut', 'Apps');
      if (fs.existsSync(appsDir)) {
        const versions = fs.readdirSync(appsDir)
          .filter(f => fs.statSync(path.join(appsDir, f)).isDirectory() && /^\d+\.\d+\.\d+/.test(f));
        if (versions.length > 0) {
          versions.sort((a, b) => {
            const partsA = a.split('.').map(Number);
            const partsB = b.split('.').map(Number);
            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
              const numA = partsA[i] || 0;
              const numB = partsB[i] || 0;
              if (numA !== numB) return numB - numA;
            }
            return 0;
          });
          const fontCandidate = path.join(appsDir, versions[0], 'Resources', 'Font', 'SystemFont', 'en.ttf');
          if (fs.existsSync(fontCandidate)) {
            latestFont = fontCandidate.replace(/\\/g, '/');
          }
        }
      }
    }
  } catch (err) {
    console.error('Error finding latest CapCut font path:', err);
  }

  const defaultFontPath = latestFont || path.join(process.env.LOCALAPPDATA || 'C:/Users/vtryh/AppData/Local', 'CapCut', 'Apps', '8.9.1.3802', 'Resources', 'Font', 'SystemFont', 'en.ttf').replace(/\\/g, '/');

  // 3. Insert each chunk as a text segment
  const segmentDuration = 3000000; // 3 seconds in microseconds

  chunks.forEach((chunkText, index) => {
    const textMaterialId = crypto.randomUUID().toUpperCase();
    const segmentId = crypto.randomUUID().toUpperCase();
    const animId = crypto.randomUUID().toUpperCase();

    // Start time of segment in microseconds
    const startTime = index * segmentDuration;

    // Create Text Material
    const textStyle = {
      fill: {
        content: {
          render_type: 'solid',
          solid: { color: [1, 1, 1] }
        }
      },
      font: {
        path: defaultFontPath,
        id: ''
      },
      size: 15,
      range: [0, chunkText.length]
    };

    const textContentJson = {
      text: chunkText,
      styles: [textStyle]
    };

    const textMaterial = {
      id: textMaterialId,
      name: chunkText.slice(0, 10),
      type: 'text',
      content: JSON.stringify(textContentJson),
      text_to_audio_ids: [],
      bold_width: 0.0,
      font_size: 15.0,
      font_path: defaultFontPath,
      text_color: '#FFFFFF',
      text_alpha: 1.0,
      line_spacing: 0.02,
      font_name: '',
      font_title: 'none',
      border_width: 0.08,
      bold: false,
      italic: false,
      underline: false,
      alignment: 1, // center
      line_feed: 1,
      font_source_platform: 0,
      add_type: 0,
      ssml_content: '',
      tts_auto_update: false
    };

    content.materials.texts.push(textMaterial);

    // Create Animation Material
    const animMaterial = {
      id: animId,
      type: 'sticker_animation',
      animations: [],
      multi_language_current: 'none'
    };
    content.materials.material_animations.push(animMaterial);

    // Create Segment
    const segment = {
      id: segmentId,
      source_timerange: null,
      target_timerange: {
        start: startTime,
        duration: segmentDuration
      },
      render_timerange: {
        start: 0,
        duration: 0
      },
      desc: '',
      state: 0,
      speed: 1.0,
      is_loop: false,
      is_tone_modify: false,
      reverse: false,
      intensifies_audio: false,
      cartoon: false,
      volume: 1.0,
      last_nonzero_volume: 1.0,
      clip: {
        scale: { x: 1.0, y: 1.0 },
        rotation: 0.0,
        transform: { x: 0.0, y: 0.0 },
        flip: { vertical: false, horizontal: false },
        alpha: 1.0
      },
      uniform_scale: { on: true, value: 1.0 },
      material_id: textMaterialId,
      extra_material_refs: [animId],
      render_index: 14000 + index,
      keyframe_refs: [],
      enable_lut: false,
      enable_adjust: false,
      enable_hsl: false,
      visible: true,
      group_id: '',
      enable_color_curves: true,
      enable_hsl_curves: true,
      track_render_index: 1,
      hdr_settings: null,
      enable_color_wheels: true,
      track_attribute: 0,
      is_placeholder: false,
      template_id: '',
      enable_smart_color_adjust: false,
      template_scene: 'default',
      common_keyframes: [],
      caption_info: null,
      responsive_layout: {
        enable: false,
        target_follow: '',
        size_layout: 0,
        horizontal_pos_layout: 0,
        vertical_pos_layout: 0
      },
      enable_color_match_adjust: false,
      enable_color_correct_adjust: false,
      enable_adjust_mask: false,
      raw_segment_id: '',
      lyric_keyframes: null,
      enable_video_mask: true,
      digital_human_template_group_id: '',
      color_correct_alg_result: '',
      source: 'segmentsourcenormal',
      enable_mask_stroke: false,
      enable_mask_shadow: false,
      enable_color_adjust_pro: false
    };

    textTrack.segments.push(segment);
  });

  // Write content back to draft_content.json
  fs.writeFileSync(contentPath, JSON.stringify(content, null, 2), 'utf8');

  // Update meta duration in draft_meta_info.json
  const metaPath = path.join(draftPath, 'draft_meta_info.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      meta.tm_duration = chunks.length * segmentDuration;
      meta.tm_draft_modified = Date.now() * 1000; // CapCut modified time is in microseconds
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    } catch (e) {
      console.error('Error updating meta duration:', e);
    }
  }

  return {
    success: true,
    chunksCount: chunks.length,
    chunks: chunks
  };
}

// Extract TTS Audio files from CapCut project after user click "Text to speech"
function extractAudio(projectId, customOutputDir = null) {
  const draftsDir = getCapcutDraftsDir();
  const draftPath = path.join(draftsDir, projectId);
  const contentPath = path.join(draftPath, 'draft_content.json');

  if (!fs.existsSync(contentPath)) {
    throw new Error(`Dự án ${projectId} không tồn tại.`);
  }

  // Parse draft_content.json
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  const materials = content.get ? content.get('materials', {}) : (content.materials || {});
  const texts = materials.texts || [];
  const audios = materials.audios || [];

  if (texts.length === 0) {
    return { success: false, message: 'Dự án không có đoạn văn bản nào.' };
  }

  // Map audios by ID for easy lookup
  const audioMap = {};
  audios.forEach(audio => {
    audioMap[audio.id] = audio;
  });

  // Create default output folder inside workspace
  let outputDir = customOutputDir;
  if (!outputDir) {
    outputDir = path.join(process.cwd(), 'output', projectId);
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results = [];
  let index = 1;

  texts.forEach(textMaterial => {
    let rawText = '';
    try {
      const textJson = JSON.parse(textMaterial.content);
      rawText = textJson.text || '';
    } catch (e) {
      rawText = textMaterial.name || 'Text';
    }

    const ttsAudioIds = textMaterial.text_to_audio_ids || [];
    if (ttsAudioIds.length === 0) {
      // Audio is not yet generated for this text
      results.push({
        index: index++,
        text: rawText,
        status: 'pending',
        message: 'Chưa chuyển đổi giọng nói (cần chạy TTS trên CapCut PC).'
      });
      return;
    }

    // Find the audio material
    let audioMaterial = null;
    for (const audId of ttsAudioIds) {
      if (audioMap[audId]) {
        audioMaterial = audioMap[audId];
        break;
      }
    }

    if (!audioMaterial) {
      results.push({
        index: index++,
        text: rawText,
        status: 'error',
        message: 'Không tìm thấy thông tin âm thanh ánh xạ.'
      });
      return;
    }

    // Resolve audio file path
    const audioRawPath = audioMaterial.path || '';
    if (!audioRawPath) {
      results.push({
        index: index++,
        text: rawText,
        status: 'error',
        message: 'Đường dẫn âm thanh trống.'
      });
      return;
    }

    // Replace placeholder ##_draftpath_placeholder_<UUID>_## with actual draft path
    let actualAudioPath = audioRawPath;
    if (audioRawPath.includes('##_draftpath_placeholder_')) {
      const parts = audioRawPath.split('/');
      // The first part is the placeholder, skip it and join with draftPath
      const relativePath = parts.slice(1).join('/');
      actualAudioPath = path.join(draftPath, relativePath);
    }

    // Clean text for filename
    const cleanText = rawText
      .toLowerCase()
      .replace(/[\\/:*?"<>|]/g, '') // remove forbidden characters
      .replace(/\s+/g, '_')         // replace spaces with underscores
      .slice(0, 30);                // limit text length

    const ext = path.extname(actualAudioPath) || '.aac';
    const outFilename = `${String(index).padStart(2, '0')}_${cleanText}${ext}`;
    const outFullPath = path.join(outputDir, outFilename);

    if (fs.existsSync(actualAudioPath)) {
      try {
        fs.copyFileSync(actualAudioPath, outFullPath);
        results.push({
          index: index++,
          text: rawText,
          status: 'success',
          fileName: outFilename,
          filePath: outFullPath,
          sourcePath: actualAudioPath
        });
      } catch (err) {
        results.push({
          index: index++,
          text: rawText,
          status: 'error',
          message: `Lỗi copy file: ${err.message}`
        });
      }
    } else {
      results.push({
        index: index++,
        text: rawText,
        status: 'error',
        message: `File âm thanh gốc không tồn tại ở: ${actualAudioPath}`
      });
    }
  });

  return {
    success: true,
    outputDirectory: outputDir,
    files: results
  };
}

module.exports = {
  getCapcutDraftsDir,
  listProjects,
  injectText,
  extractAudio
};
