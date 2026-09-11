import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import { readJsonStrict, updateJson } from '../../lib/storage';
import { validateTaskInput } from '../../lib/channel';
import { InputError } from '../../lib/security';
import { apiError } from '../../lib/http';
import { toVNTime } from '../../lib/time';
import type { QueueTask } from '../../types';

const queueFile = () => path.join(process.cwd(), 'queue.json');

export async function GET() {
  try {
    return NextResponse.json(readJsonStrict<QueueTask[]>(queueFile(), []), {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = validateTaskInput(body);
    const task: QueueTask = {
      ...input,
      id: randomUUID(),
      status: 'pending',
      retryCount: 0,
      progress: 0,
      createdAt: toVNTime(),
      updatedAt: toVNTime(),
    };

    await updateJson<QueueTask[]>(queueFile(), [], queue => [...queue, task]);

    // AGY hiểu "ProcessQueue skill" (Antigravity skill system).
    // Codex không có khái niệm "skill" nên cần chỉ đường dẫn cụ thể tới docs.
    const cwd = process.cwd();
    const agyPrompt = `You MUST follow the instructions in the ProcessQueue skill exactly. The queue file is located at ${cwd.replace(/\\/g, '/')}/queue.json. Find and process the specific pending task with ID: ${task.id} to completion.`;

    const codexPrompt = `Read and follow the documentation in ${cwd.replace(/\\/g, '/')}/.agents/AGENTS.md (then 01_workflow.md through 12_veo_policy_compliance.md in order). The queue file is at ${cwd.replace(/\\/g, '/')}/queue.json. Find and process only the pending task with ID: ${task.id} to completion.`;

    const prompt = task.aiModel === 'codex' ? codexPrompt : agyPrompt;

    let commandToRun: string;

    if (task.aiModel === 'codex') {
      let codexPath = 'codex';
      if (os.platform() === 'win32') {
        const nvm4wBase = ['C:', 'nvm4w', 'nodejs'].join(path.sep);
        const candidates = [
          path.join(nvm4wBase, 'codex.cmd'),
          ...(process.env.NVM_SYMLINK ? [path.join(process.env.NVM_SYMLINK, 'codex.cmd')] : []),
          ...(process.env.APPDATA ? [path.join(process.env.APPDATA, 'npm', 'codex.cmd')] : []),
        ];
        const found = candidates.find(p => fs.existsSync(p));
        if (found) codexPath = found;
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
      ];

      agyArgs.push('--prompt-interactive', prompt);

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
    const { id, status, progress, errorMessage, retryCount, outputFolder, lockedAt, workerId } = body;

    if (!id || !status) {
      throw new InputError('Thiếu id hoặc status.');
    }

    await updateJson<QueueTask[]>(queueFile(), [], queue => {
      const taskIndex = queue.findIndex((t) => t.id === id);
      if (taskIndex === -1) throw new InputError('Không tìm thấy tác vụ.', 404);

      queue[taskIndex] = {
        ...queue[taskIndex],
        status,
        ...(progress !== undefined ? { progress } : {}),
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
        ...(outputFolder !== undefined ? { outputFolder } : {}),
        ...(lockedAt !== undefined ? { lockedAt } : {}),
        ...(workerId !== undefined ? { workerId } : {}),
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

    await updateJson<QueueTask[]>(queueFile(), [], queue => {
      if (id === 'all') return [];
      return queue.filter(t => t.id !== id);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
