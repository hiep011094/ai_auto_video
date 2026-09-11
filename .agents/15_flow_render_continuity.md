# 15 — Flow Render Continuity Strategy (Optional downstream companion)

This guide does **not** change any final JSON schema and does not add audio instructions. It exists because text-only prompting cannot guarantee pixel-identical recurring characters, props, or environments across independently generated clips.

## 1. Approved reference assets are stronger than prose memory

When the rendering workflow has approved character/location/object reference images available in the Flow project, reuse the **same approved asset** every time that recurring entity appears. Keep the canonical `visual_bible.json` wording in `veo_prompt` as text guidance, but treat the approved reference asset as the render-time visual source of truth. Do not silently replace it with a newly generated lookalike halfway through the project.

Recommended reference priority:
1. recurring character identity;
2. recurring hero object/vehicle/instrument;
3. recurring environment/location;
4. style reference when needed.

Do not attach unrelated references merely because slots are available; every reference should solve a real continuity problem.

## 2. First-frame carryover only for true continuous-action handoffs

Use the `continuity_ref` relationship to decide whether a frame handoff is appropriate:

- `Editorial relationship: continuous action.` → when the downstream renderer supports it, the final approved frame of scene N may be used as the starting frame/reference for scene N+1. This is ideal for the same subject, same location, same time, same action.
- `Editorial relationship: matched conceptual cut.` → do **not** force the previous final frame as the next starting frame. Reuse relevant identity/style references only; let the edit cut between two separate shots.
- `Editorial relationship: intentional location/time shift.` → never force frame carryover. Start the new location/time cleanly with its own approved references and canonical visual-bible anchor.

The purpose is continuity, not an artificial morph. Each generated scene remains one independent continuous shot.

## 3. Reference consistency ledger — scratch only

While rendering a long video, maintain a temporary human/tool-side ledger mapping canonical visual-bible entities to the exact approved reference asset used. This ledger is outside the final video JSON and should not be invented as scene fields. If an asset changes deliberately, record the scene boundary and reason before rendering the next batch.

## 4. Never use reference frames to override Semantic Lock

A beautiful previous frame is not permission to keep showing an old idea. Current `voiceover` remains the visual authority. If narration changes concept, evidence, location, era, or certainty level, choose the correct new shot and preserve only the continuity that still makes editorial sense.

## 5. Render-batch discipline

Render/review in the same small batches used for prompt production. Before approving the next batch, compare recurring face/outfit, object geometry, spatial layout, screen direction, time-of-day, color grade, and the previous scene's end state. Reject drift early rather than accepting it and trying to hide it in editing.

## Absolute clip-boundary rule — no transitions inside generated clips

Flow/Veo receives one scene prompt as one clean source clip. The generated clip must contain no internal cut, fade, dissolve, morph, montage, flashback/time jump, location jump, domain switch, or second setup. Start directly inside the correct visual world for the current narration beat and remain there until the end-frame state.

All scene-to-scene transitions are applied **after generation** in CapCut/After Effects/the NLE. A `matched conceptual cut` in `continuity_ref` describes how the editor should join two independent clips; it is never an instruction for Veo to create a transition internally.

Every prompt starts with `Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.` and every Negative clause contains `internal cuts, scene transitions, fades, dissolves, morph transitions, montage, time jumps, location changes, visual-domain changes`.
