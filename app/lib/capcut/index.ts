// ============================================================
//  CapCut Project Builder — Public API
// ============================================================

export { buildVideoMaterial, buildAudioMaterial } from './materials';
export { buildSegment, buildTransition, buildSpeed } from './segments';
export {
  getSceneNumber,
  getAudioDurationUs,
  buildDraftContent,
  buildDraftMeta,
  buildRootEntry,
} from './draft-builder';
export type * from './types';
