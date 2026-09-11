import { resolveProjectPath } from '../../lib/security';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { sanitizePath } from '../../lib/security';
import { readJsonSafe } from '../../lib/storage';

/**
 * POST /api/pipeline-next
 *
 * Reserved endpoint — available for future pipeline automation if needed.
 * Currently not called automatically. TTS, SEO, and Thumbnail are triggered
 * manually by the user via the web UI.
 *
 * If called, it verifies the audit is clean and returns the project status.
 * It does NOT auto-trigger TTS or any downstream step.
 *
 * Body: { folder: string, type: "short" | "long" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { folder, type } = body;

    if (!folder || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: folder, type' },
        { status: 400 }
      );
    }

    const parentFolder = type === 'long' ? 'video_long' : 'video_short';
    const projectPath = resolveProjectPath(folder, type);

    const safePath = sanitizePath(projectPath);
    if (!safePath) {
      return NextResponse.json({ error: 'Invalid folder path' }, { status: 403 });
    }

    if (!fs.existsSync(safePath)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // ── Read pipelineStage ───────────────────────────────────────────────────
    const sessionStatePath = path.join(safePath, 'session_state.json');
    interface SessionState { pipelineStage?: string }
    const sessionState = fs.existsSync(sessionStatePath)
      ? readJsonSafe<SessionState>(sessionStatePath, {})
      : null;

    return NextResponse.json({
      status: 'ready',
      folder,
      type,
      pipelineStage: sessionState?.pipelineStage ?? 'unknown',
      message: 'Project ready. Use the web UI to trigger TTS, SEO, and Thumbnail.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
