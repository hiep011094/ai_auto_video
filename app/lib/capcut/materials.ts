// ============================================================
//  CapCut Project Builder — Material Factories
// ============================================================

import path from 'path';
import type { VideoMaterial, Crop, Matting, Stable } from './types';

const DEFAULT_CROP: Crop = {
  lower_left_x: 0.0, lower_left_y: 1.0,
  lower_right_x: 1.0, lower_right_y: 1.0,
  upper_left_x: 0.0, upper_left_y: 0.0,
  upper_right_x: 1.0, upper_right_y: 0.0,
};

const DEFAULT_MATTING: Matting = {
  flag: 0, has_use_quick_brush: false,
  has_use_quick_eraser: false, interactiveTime: [],
  path: '', strokes: [],
};

const DEFAULT_STABLE: Stable = {
  matrix_path: '', stable_level: 0,
  time_range: { duration: 0, start: 0 },
};

function createBaseMaterial(
  matId: string,
  filepath: string,
  type: string,
  duration: number,
  hasAudio: boolean,
  width: number,
  height: number
): VideoMaterial {
  return {
    id: matId, unique_id: '', type,
    duration,
    path: filepath, media_path: '', local_id: '',
    has_audio: hasAudio, reverse_path: '', intensifies_path: '',
    reverse_intensifies_path: '', intensifies_audio_path: '',
    cartoon_path: '',
    width, height,
    category_id: '', category_name: 'local',
    material_id: '', material_name: path.basename(filepath),
    material_url: '', source_platform: 0, extra_info: '',
    check_flag: 1,
    crop: { ...DEFAULT_CROP },
    matting: { ...DEFAULT_MATTING },
    stable: { ...DEFAULT_STABLE },
    aigc_type: 'none', team_id: '',
    source_file_edit_name: '', sub_type: 0,
    request_id: '', face_info: null,
  };
}

export function buildVideoMaterial(
  matId: string,
  filepath: string,
  width = 1080,
  height = 1920
): VideoMaterial {
  return createBaseMaterial(matId, filepath, 'video', 8000000, false, width, height);
}

export function buildAudioMaterial(matId: string, filepath: string, duration: number): VideoMaterial {
  return createBaseMaterial(matId, filepath, 'extract_music', duration, true, 0, 0);
}
