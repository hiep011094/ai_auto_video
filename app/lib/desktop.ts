import { execFile } from 'child_process';
import { promisify } from 'util';
const execute = promisify(execFile);
/** No shell interpolation. On Windows the path is a PowerShell parameter, never executable text. */
export async function openDesktopPath(target: string): Promise<void> {
  if (process.platform === 'win32') {
    const source = `Invoke-Item -LiteralPath '${target.replace(/'/g, "''")}'`;
    await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(source, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10_000 });
  } else { await execute(process.platform === 'darwin' ? 'open' : 'xdg-open', [target], { timeout: 10_000 }); }
}
