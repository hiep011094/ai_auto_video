import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveProjectPath, InputError } from '../../lib/security';
import { readJsonStrict, writeJsonSafe, withFileLock } from '../../lib/storage';
import { apiError } from '../../lib/http';
import type { Scene } from '../../types';
export async function POST(request: Request) {
  try {
    const { folder, type } = await request.json();
    const project = resolveProjectPath(folder, type);
    const result = await withFileLock(path.join(project, 'all_veo_prompt.json'), () => {
      const chapters = fs.readdirSync(project).filter(f => /^chapter_\d+\.json$/.test(f)).sort((a,b) => Number(a.match(/\d+/)?.[0])-Number(b.match(/\d+/)?.[0]));
      if (!chapters.length) throw new InputError('Không tìm thấy chapter.', 404);
      const scenes: Array<{ scene: number; veo_prompt: string }> = [];
      for (const [chapterIndex, filename] of chapters.entries()) {
        if (Number(filename.match(/\d+/)?.[0]) !== chapterIndex + 1) throw new InputError('Danh sách chapter bị thiếu hoặc trùng số.');
        const chapter = readJsonStrict<Scene[]>(path.join(project, filename), []);
        if (!Array.isArray(chapter) || !chapter.length) throw new InputError(`${filename} không có cảnh hợp lệ.`);
        for (const scene of chapter) {
          const prompt = scene.veo_prompt;
          if (scene.scene !== scenes.length + 1 || typeof prompt !== 'string' || [...prompt].length < 900 || [...prompt].length > 4000) throw new InputError(`${filename}: số cảnh hoặc độ dài Veo prompt không hợp lệ.`);
          if (!prompt.startsWith('Create exactly one uninterrupted continuous shot in one visual setup for the entire clip.') || !prompt.includes('Negative:')) throw new InputError(`${filename}: Veo prompt chưa đạt cấu trúc V9.`);
          scenes.push({ scene: scene.scene, veo_prompt: prompt });
        }
      }
      writeJsonSafe(path.join(project, 'all_veo_prompt.json'), scenes);
      return { totalScenes: scenes.length, totalChapters: chapters.length };
    });
    return NextResponse.json({ success: true, ...result, outputFile: 'all_veo_prompt.json', message: `Đã kiểm tra và gộp đủ ${result.totalScenes} cảnh.` });
  } catch (error) { return apiError(error); }
}
