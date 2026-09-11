// ============================================================
//  CapCut Project Builder — Segment, Transition, Speed
// ============================================================

import type { ClipTransform, Segment, TransitionMaterial, SpeedMaterial } from './types';

const DEFAULT_CLIP: ClipTransform = {
  scale: { x: 1.0, y: 1.0 },
  rotation: 0.0,
  transform: { x: 0.0, y: 0.0 },
  flip: { vertical: false, horizontal: false },
  alpha: 1.0,
};

export function buildSegment(
  segId: string,
  materialId: string,
  sourceDur: number,
  targetStart: number,
  targetDur: number,
  speed = 1.0,
  extraRefs: string[] = [],
  clipOverride: ClipTransform | null = null,
  renderIndex = 0,
  trackRenderIndex = 0,
  sourceTag = '',
  sourceStart = 0,
  uniformScaleValue = 1.0
): Segment {
  return {
    id: segId,
    source_timerange: { start: sourceStart, duration: sourceDur },
    target_timerange: { start: targetStart, duration: targetDur },
    render_timerange: { start: 0, duration: 0 },
    desc: '', state: 0, speed,
    is_loop: false, is_tone_modify: false,
    reverse: false, intensifies_audio: false,
    cartoon: false, volume: 1.0, last_nonzero_volume: 1.0,
    clip: clipOverride || { ...DEFAULT_CLIP },
    uniform_scale: { on: true, value: uniformScaleValue },
    material_id: materialId,
    extra_material_refs: extraRefs,
    render_index: renderIndex, keyframe_refs: [],
    enable_lut: true, enable_adjust: true,
    enable_hsl: false, visible: true, group_id: '',
    enable_color_curves: true, enable_hsl_curves: true,
    track_render_index: trackRenderIndex,
    hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    enable_color_wheels: true, track_attribute: 0,
    is_placeholder: false, template_id: '',
    enable_smart_color_adjust: false,
    template_scene: 'default',
    common_keyframes: [], caption_info: null,
    responsive_layout: {
      enable: false, horizontal_pos_layout: 0,
      size_layout: 0, vertical_pos_layout: 0,
      target_follow: '',
    },
    enable_color_match_adjust: false,
    enable_color_correct_adjust: false,
    enable_adjust_mask: false, raw_segment_id: '',
    lyric_keyframes: null, enable_video_mask: true,
    digital_human_template_group_id: '',
    color_correct_alg_result: '',
    source: sourceTag || 'segmentsourcenormal',
    enable_mask_stroke: false, enable_mask_shadow: false,
    enable_color_adjust_pro: false,
  };
}

export function buildTransition(transId: string): TransitionMaterial {
  return {
    id: transId, type: 'transition',
    name: 'Mờ dần chậm',
    effect_id: '7626674915898445074',
    resource_id: '7626674915898445074',
    third_resource_id: '7626674915898445074',
    source_platform: 1,
    path: '',
    duration: 1000000, // 1.0 giây
    is_overlap: true, platform: 'all',
    category_id: '100000', category_name: '',
    request_id: '', is_ai_transition: false,
    video_path: '', task_id: '',
  };
}

export function buildSpeed(speedId: string, speedVal = 2.0): SpeedMaterial {
  return {
    id: speedId, type: 'speed',
    mode: 0, speed: speedVal, curve_speed: null,
  };
}
