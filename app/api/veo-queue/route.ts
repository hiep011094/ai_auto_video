import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { resolveProjectInput, InputError } from '../../lib/security';
import { readJsonStrict, updateJson } from '../../lib/storage';
import { toVNTime } from '../../lib/time';
import { apiError } from '../../lib/http';

interface VeoTask {
  id: string;
  status: string;
  outputFolder: string;
  topic?: string;
  videoType?: string;
  language?: string;
  voiceStyle?: string;
  aiModel?: string;
  skill?: string;
  progress?: number;
  retryCount?: number;
  createdAt?: string;
  updatedAt?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

const filename = () => path.join(process.cwd(), 'veo_queue.json');

export async function GET() {
  return NextResponse.json(readJsonStrict<VeoTask[]>(filename(), []), {
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = resolveProjectInput(body.outputFolder);
    if (body.language !== 'vi' || !['short', 'long'].includes(body.videoType) || !['agy', 'codex'].includes(body.aiModel || 'agy')) {
      throw new InputError('Chỉ nhận dự án Phật giáo tiếng Việt với công cụ AI hợp lệ.');
    }
    if (path.basename(path.dirname(project)) !== `video_${body.videoType}`) {
      throw new InputError('Loại video không khớp đường dẫn dự án.');
    }
    if (!fs.existsSync(path.join(project, 'master_script.txt'))) {
      throw new InputError('Dự án chưa có master_script.txt.');
    }

    const outputFolder = path.relative(process.cwd(), project).replace(/\\/g, '/');
    const task: VeoTask = {
      id: randomUUID(),
      status: 'pending',
      skill: 'GenerateVeoPrompts',
      topic: String(body.topic || path.basename(project)),
      videoType: body.videoType,
      language: 'vi',
      voiceStyle: 'contemplative',
      aiModel: body.aiModel || 'agy',
      outputFolder,
      progress: 0,
      retryCount: 0,
      createdAt: toVNTime(),
      updatedAt: toVNTime(),
    };

    await updateJson<VeoTask[]>(filename(), [], queue => {
      if (queue.some(t => t.outputFolder === outputFolder && ['pending', 'processing'].includes(t.status))) {
        throw new InputError('Dự án đang chờ/chạy tạo Veo.', 409);
      }
      return [...queue, task];
    });

    const cwd = process.cwd();
    const prompt = `You MUST follow the instructions in the GenerateVeoPrompts skill and .agents/06_veo_prompt_guide.md exactly. Read .agents/AGENTS.md, .agents/06_veo_prompt_guide.md, and .agents/12_veo_policy_compliance.md. The veo queue file is located at ${cwd.replace(/\\/g, '/')}/veo_queue.json. Find and process the specific pending task with ID: ${task.id} to completion.`;

    let commandToRun: string;

    if (task.aiModel === 'codex') {
      let codexPath = 'codex';
      if (os.platform() === 'win32') {
        const appData = process.env.APPDATA;
        if (appData) {
          const npmCodex = path.join(appData, 'npm', 'codex.cmd');
          if (fs.existsSync(npmCodex)) codexPath = npmCodex;
        }
      }

      const escapedPrompt = prompt.replace(/'/g, "''");
      const escapedCwd = cwd.replace(/'/g, "''");
      const codexArgs = `'-a' 'never' '--add-dir' '${escapedCwd}' '-C' '${escapedCwd}' '${escapedPrompt}'`;
      commandToRun = `start powershell.exe -NoExit -Command "& '${codexPath}' ${codexArgs}"`;
    } else {
      let agyPath = 'agy';
      if (os.platform() === 'win32' && process.env.LOCALAPPDATA) {
        const localAgyPath = path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe');
        if (fs.existsSync(localAgyPath)) {
          agyPath = localAgyPath;
        }
      }

      const agyArgs = [
        '--dangerously-skip-permissions',
        '--add-dir',
        cwd,
        '--prompt-interactive',
        prompt,
      ];

      const psArgs = agyArgs.map(arg => `'${arg.replace(/'/g, "''")}'`).join(' ');
      commandToRun = `start powershell.exe -NoExit -Command "& '${agyPath}' ${psArgs}"`;
    }

    exec(commandToRun, { cwd });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, status, progress, errorMessage, retryCount } = body;
    if (!id || !status) throw new InputError('Thiếu id hoặc status.');

    await updateJson<VeoTask[]>(filename(), [], queue => {
      const taskIndex = queue.findIndex((t) => t.id === id);
      if (taskIndex === -1) throw new InputError('Không tìm thấy tác vụ.', 404);
      queue[taskIndex] = {
        ...queue[taskIndex],
        status,
        ...(progress !== undefined ? { progress } : {}),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
        updatedAt: toVNTime(),
      };
      return [...queue];
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new InputError('Thiếu mã tác vụ.');
    await updateJson<VeoTask[]>(filename(), [], queue => {
      if (id === 'all') return [];
      return queue.filter(t => t.id !== id);
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
