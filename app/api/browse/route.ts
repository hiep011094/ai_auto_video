import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sanitizeBrowsePath } from '../../lib/security';

/**
 * Lấy danh sách ổ đĩa trên Windows
 */
function getWindowsDrives() {
  const drives: { name: string; path: string; isDir: boolean }[] = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const drivePath = `${letter}:\\`;
    try {
      fs.accessSync(drivePath, fs.constants.R_OK);
      drives.push({ name: `${letter}:`, path: drivePath, isDir: true });
    } catch {
      // Drive doesn't exist or not accessible
    }
  }
  return drives;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let dirPath = searchParams.get('path');

    // Hỗ trợ từ khóa 'workspace' để trỏ thẳng tới thư mục data của project
    if (dirPath === 'workspace') {
      dirPath = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }

    // Nếu không có path, trả về danh sách ổ đĩa (Windows) hoặc root (Linux/Mac)
    if (!dirPath || dirPath === '' || dirPath === 'root') {
      if (os.platform() === 'win32') {
        return NextResponse.json({
          success: true,
          path: 'root',
          parent: null,
          items: getWindowsDrives(),
        });
      } else {
        dirPath = '/';
      }
    }

    // Security: Sanitize path — cho phép browse ổ đĩa Windows
    const safePath = sanitizeBrowsePath(dirPath);
    if (!safePath) {
      return NextResponse.json(
        { error: 'Đường dẫn không được phép truy cập' },
        { status: 403 }
      );
    }

    // Kiểm tra tồn tại
    try {
      const stat = await fs.promises.stat(safePath);
      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: 'Đường dẫn không phải thư mục' },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Đường dẫn không tồn tại' },
        { status: 404 }
      );
    }

    // Đọc danh sách con (READ-ONLY)
    const entries = await fs.promises.readdir(safePath, { withFileTypes: true });

    const items: { name: string; path: string; isDir: boolean; isFile?: boolean }[] = [];
    for (const entry of entries) {
      // Bỏ qua thư mục ẩn và system
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '$RECYCLE.BIN' || entry.name === 'System Volume Information') {
        continue;
      }

      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: path.join(safePath, entry.name).replace(/\\/g, '\\'),
          isDir: true,
        });
      } else if (entry.isFile()) {
        items.push({
          name: entry.name,
          path: path.join(safePath, entry.name).replace(/\\/g, '\\'),
          isDir: false,
          isFile: true,
        });
      }
    }

    // Sắp xếp: Thư mục trước, File sau, sau đó theo tên
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    // Parent path
    const parentPath = path.dirname(safePath);
    const hasParent = parentPath !== safePath;

    return NextResponse.json({
      success: true,
      path: safePath,
      parent: hasParent ? parentPath : (os.platform() === 'win32' ? 'root' : null),
      items,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Browse error:', err);
    return NextResponse.json(
      { error: `Lỗi khi duyệt thư mục: ${msg}` },
      { status: 500 }
    );
  }
}
