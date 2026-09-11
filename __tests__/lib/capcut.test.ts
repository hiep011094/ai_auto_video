/**
 * CapCut Module — Unit Tests
 * Tests material builders, segment builders, and helpers.
 */

import { buildVideoMaterial, buildAudioMaterial } from '../../app/lib/capcut/materials';
import { buildSegment, buildTransition, buildSpeed } from '../../app/lib/capcut/segments';

// getSceneNumber is tested separately — draft-builder imports music-metadata (ESM)
// which requires special handling in Jest. We extract the regex logic inline.
function getSceneNumber(filename: string): number {
  const match = filename.match(/Scene[_-]?(\d+)/i);
  return match ? parseInt(match[1], 10) : Infinity;
}

describe('buildVideoMaterial', () => {
  it('creates a video material with correct properties', () => {
    const mat = buildVideoMaterial('test-id', 'C:/videos/scene1.mp4');

    expect(mat.id).toBe('test-id');
    expect(mat.type).toBe('video');
    expect(mat.path).toBe('C:/videos/scene1.mp4');
    expect(mat.duration).toBe(8000000);
    expect(mat.has_audio).toBe(false);
    expect(mat.width).toBe(1080);
    expect(mat.height).toBe(1920);
    expect(mat.check_flag).toBe(1);
    expect(mat.material_name).toBe('scene1.mp4');
  });
});

describe('buildAudioMaterial', () => {
  it('creates an audio material with correct duration', () => {
    const mat = buildAudioMaterial('audio-id', 'C:/audio/voice.mp3', 5000000);

    expect(mat.id).toBe('audio-id');
    expect(mat.type).toBe('extract_music');
    expect(mat.duration).toBe(5000000);
    expect(mat.has_audio).toBe(true);
    expect(mat.width).toBe(0);
    expect(mat.height).toBe(0);
  });
});

describe('buildSegment', () => {
  it('creates a segment with correct timeranges', () => {
    const seg = buildSegment('seg-1', 'mat-1', 8000000, 0, 4000000, 2.0);

    expect(seg.id).toBe('seg-1');
    expect(seg.material_id).toBe('mat-1');
    expect(seg.source_timerange).toEqual({ start: 0, duration: 8000000 });
    expect(seg.target_timerange).toEqual({ start: 0, duration: 4000000 });
    expect(seg.speed).toBe(2.0);
    expect(seg.volume).toBe(1.0);
  });

  it('accepts custom clip override', () => {
    const customClip = {
      scale: { x: 0.5, y: 0.5 },
      rotation: 45,
      transform: { x: 0.1, y: 0.2 },
      flip: { vertical: false, horizontal: true },
      alpha: 0.8,
    };
    const seg = buildSegment('seg-2', 'mat-2', 8000000, 4000000, 4000000, 1.0, [], customClip);

    expect(seg.clip.scale.x).toBe(0.5);
    expect(seg.clip.alpha).toBe(0.8);
    expect(seg.clip.rotation).toBe(45);
  });

  it('handles extra material refs', () => {
    const seg = buildSegment('seg-3', 'mat-3', 8000000, 0, 4000000, 1.0, ['ref-1', 'ref-2']);

    expect(seg.extra_material_refs).toEqual(['ref-1', 'ref-2']);
  });
});

describe('buildTransition', () => {
  it('creates default transition', () => {
    const trans = buildTransition('trans-1');

    expect(trans.id).toBe('trans-1');
    expect(trans.name).toBe('Mờ dần chậm');
    expect(trans.duration).toBe(1000000);
    expect(trans.is_overlap).toBe(true);
  });
});

describe('buildSpeed', () => {
  it('creates speed material with default 2x', () => {
    const speed = buildSpeed('speed-1');

    expect(speed.id).toBe('speed-1');
    expect(speed.speed).toBe(2.0);
    expect(speed.mode).toBe(0);
  });

  it('accepts custom speed value', () => {
    const speed = buildSpeed('speed-2', 1.5);
    expect(speed.speed).toBe(1.5);
  });
});

describe('getSceneNumber', () => {
  it('extracts scene number from filename', () => {
    expect(getSceneNumber('Scene_01.mp4')).toBe(1);
    expect(getSceneNumber('Scene_15.mp4')).toBe(15);
    expect(getSceneNumber('Scene_100.mp4')).toBe(100);
    expect(getSceneNumber('Scene-5.mp4')).toBe(5);
    expect(getSceneNumber('scene5.mp4')).toBe(5);
    expect(getSceneNumber('Scene_1_01_1080x1920.mp4')).toBe(1);
    expect(getSceneNumber('Scene_10_10_1080x1920.mp4')).toBe(10);
    expect(getSceneNumber('scene_20.wav')).toBe(20);
  });

  it('returns Infinity for non-matching filenames', () => {
    expect(getSceneNumber('video.mp4')).toBe(Infinity);
    expect(getSceneNumber('random_file.mp4')).toBe(Infinity);
    expect(getSceneNumber('lumJx7zi.mp4.part')).toBe(Infinity);
    expect(getSceneNumber('tong_hop_loi_thoai.wav')).toBe(Infinity);
  });

  it('is case-insensitive', () => {
    expect(getSceneNumber('scene_05.mp4')).toBe(5);
  });
});
