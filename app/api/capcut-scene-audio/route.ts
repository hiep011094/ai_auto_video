import { resolveProjectPath } from '../../lib/security';
﻿import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

export async function GET() {
  const capcutProjectsDir = path.join(
    os.homedir(),
    'AppData', 'Local', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'
  );
  const exists = fs.existsSync(capcutProjectsDir);
  return NextResponse.json({
    defaultPath: exists ? capcutProjectsDir : os.homedir(),
    exists,
  });
}

interface AudioSegment {
  start: number;
  materialId: string;
  filePath: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { capcut_folder, project_folder, type } = body;

    if (!capcut_folder || !project_folder || !type) {
      return NextResponse.json({ error: 'Missing params: capcut_folder, project_folder, type' }, { status: 400 });
    }

    const capcutFolder = path.isAbsolute(capcut_folder)
      ? capcut_folder
      : path.join(process.cwd(), capcut_folder);

    if (!fs.existsSync(capcutFolder)) {
      return NextResponse.json({ error: `CapCut folder not found: ${capcutFolder}` }, { status: 400 });
    }

    const draftContentPath = path.join(capcutFolder, 'draft_content.json');
    if (!fs.existsSync(draftContentPath)) {
      return NextResponse.json({ error: `draft_content.json not found in: ${capcutFolder}` }, { status: 400 });
    }

    let draftContent: any;
    try {
      draftContent = JSON.parse(fs.readFileSync(draftContentPath, 'utf8'));
    } catch (e) {
      return NextResponse.json({ error: 'Cannot read draft_content.json' }, { status: 400 });
    }

    const materialMap = new Map<string, string>();
    const audios: any[] = draftContent?.materials?.audios || [];
    for (const mat of audios) {
      if (mat.id && mat.path) materialMap.set(mat.id, mat.path);
    }

    if (materialMap.size === 0) {
      return NextResponse.json({ error: 'No audio materials found in draft_content.json' }, { status: 400 });
    }

    const tracks: any[] = draftContent?.tracks || [];
    const audioTracks = tracks.filter((t: any) => t.type === 'audio');

    if (audioTracks.length === 0) {
      return NextResponse.json({ error: 'No audio track found in this CapCut project' }, { status: 400 });
    }

    const allSegments: AudioSegment[] = [];
    for (const track of audioTracks) {
      const segments: any[] = track.segments || [];
      for (const seg of segments) {
        const start: number = seg?.target_timerange?.start ?? 0;
        const materialId: string = seg?.material_id || '';
        if (!materialId) continue;
        const rawPath = materialMap.get(materialId);
        if (!rawPath) continue;
        const resolvedPath = rawPath.replace(
          /##_draftpath_placeholder_[^#]+_##/g,
          capcutFolder.replace(/\\/g, '/')
        );
        const absolutePath = resolvedPath.replace(/\//g, path.sep);
        allSegments.push({ start, materialId, filePath: absolutePath });
      }
    }

    if (allSegments.length === 0) {
      return NextResponse.json({ error: 'No audio segments found in CapCut project' }, { status: 400 });
    }

    allSegments.sort((a, b) => a.start - b.start);

    const validSegments = allSegments.filter(seg => fs.existsSync(seg.filePath));
    if (validSegments.length === 0) {
      return NextResponse.json({
        error: 'No audio files found on disk.',
        debugPaths: allSegments.slice(0, 3).map(s => s.filePath)
      }, { status: 400 });
    }

    const deduplicatedSegments: AudioSegment[] = [];
    const seenFiles = new Set<string>();
    for (const seg of validSegments) {
      const normalizedPath = seg.filePath.toLowerCase();
      if (!seenFiles.has(normalizedPath)) {
        seenFiles.add(normalizedPath);
        deduplicatedSegments.push(seg);
      }
    }

    if (deduplicatedSegments.length === 0) {
      return NextResponse.json({ error: 'No files left after deduplication' }, { status: 400 });
    }

    const outputDir = resolveProjectPath(project_folder, type);

    if (!fs.existsSync(outputDir)) {
      return NextResponse.json({ error: `Project folder not found: ${outputDir}` }, { status: 400 });
    }

    const copiedFiles: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < deduplicatedSegments.length; i++) {
      const seg = deduplicatedSegments[i];
      const sceneNumber = i + 1;
      const destFileName = `scene_${sceneNumber}.wav`;
      const destPath = path.join(outputDir, destFileName);
      try {
        fs.copyFileSync(seg.filePath, destPath);
        copiedFiles.push(destFileName);
      } catch (copyErr: any) {
        errors.push(`scene_${sceneNumber}: ${copyErr.message}`);
      }
    }

    if (copiedFiles.length === 0) {
      return NextResponse.json({
        error: `No files copied. Errors: ${errors.join('; ')}`,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Copied ${copiedFiles.length} audio files from CapCut in scene order!`,
      copiedFiles,
      sceneCount: copiedFiles.length,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[capcut-scene-audio] Error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}