// ============================================================
//  CapCut Project Builder — Type Definitions
// ============================================================

export interface Crop {
  lower_left_x: number;
  lower_left_y: number;
  lower_right_x: number;
  lower_right_y: number;
  upper_left_x: number;
  upper_left_y: number;
  upper_right_x: number;
  upper_right_y: number;
}

export interface Matting {
  flag: number;
  has_use_quick_brush: boolean;
  has_use_quick_eraser: boolean;
  interactiveTime: unknown[];
  path: string;
  strokes: unknown[];
}

export interface Stable {
  matrix_path: string;
  stable_level: number;
  time_range: { duration: number; start: number };
}

export interface VideoMaterial {
  id: string;
  unique_id: string;
  type: string;
  duration: number;
  path: string;
  media_path: string;
  local_id: string;
  has_audio: boolean;
  reverse_path: string;
  intensifies_path: string;
  reverse_intensifies_path: string;
  intensifies_audio_path: string;
  cartoon_path: string;
  width: number;
  height: number;
  category_id: string;
  category_name: string;
  material_id: string;
  material_name: string;
  material_url: string;
  source_platform: number;
  extra_info: string;
  check_flag: number;
  crop: Crop;
  matting: Matting;
  stable: Stable;
  aigc_type: string;
  team_id: string;
  source_file_edit_name: string;
  sub_type: number;
  request_id: string;
  face_info: null;
}

export interface ClipTransform {
  scale: { x: number; y: number };
  rotation: number;
  transform: { x: number; y: number };
  flip: { vertical: boolean; horizontal: boolean };
  alpha: number;
}

export interface Segment {
  id: string;
  source_timerange: { start: number; duration: number };
  target_timerange: { start: number; duration: number };
  render_timerange: { start: number; duration: number };
  material_id: string;
  extra_material_refs: string[];
  speed: number;
  volume: number;
  last_nonzero_volume: number;
  clip: ClipTransform;
  render_index: number;
  track_render_index: number;
  [key: string]: unknown;
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  attribute: number;
  flag: number;
  segments: Segment[];
}

export interface TransitionMaterial {
  id: string;
  type: string;
  name: string;
  effect_id: string;
  resource_id: string;
  third_resource_id: string;
  source_platform: number;
  path: string;
  duration: number;
  is_overlap: boolean;
  platform: string;
  category_id: string;
  category_name: string;
  request_id: string;
  is_ai_transition: boolean;
  video_path: string;
  task_id: string;
}

export interface SpeedMaterial {
  id: string;
  type: string;
  mode: number;
  speed: number;
  curve_speed: null;
}

export interface DraftBuildResult {
  draft: Record<string, unknown>;
  vidMats: VideoMaterial[];
  audMats: VideoMaterial[];
  bgmMat: VideoMaterial | null;
  totalDur: number;
}

export interface MetaMaterial {
  ai_group_type: string;
  create_time: number;
  duration: number;
  enter_from: number;
  extra_info: string;
  file_Path: string;
  height: number;
  id: string;
  import_time: number;
  import_time_ms: number;
  item_source: number;
  md5: string;
  metetype: string;
  roughcut_time_range: { duration: number; start: number };
  sub_time_range: { duration: number; start: number };
  type: number;
  width: number;
}

export interface SceneTimeline {
  start: number;
  end: number;
  duration: number;
  start_formatted?: string;
  end_formatted?: string;
  speed?: number;
}


