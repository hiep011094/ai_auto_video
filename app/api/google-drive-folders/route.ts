import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const foldersPath = path.join(process.cwd(), 'config', 'google_drive_folders.json');

export async function GET() {
  try {
    let folders = [];
    if (fs.existsSync(foldersPath)) {
      folders = JSON.parse(fs.readFileSync(foldersPath, 'utf8'));
    }
    return NextResponse.json(folders);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const folders = await request.json();
    if (!Array.isArray(folders)) {
      return NextResponse.json({ error: 'Dữ liệu cấu hình phải là một danh sách thư mục' }, { status: 400 });
    }

    const configDir = path.dirname(foldersPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(foldersPath, JSON.stringify(folders, null, 2), 'utf8');
    return NextResponse.json({ status: 'success', message: 'Cập nhật danh sách thư mục thành công!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
