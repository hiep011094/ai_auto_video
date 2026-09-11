import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'config', 'google_sheets.json');

export async function GET() {
  try {
    let webAppUrl = '';
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      webAppUrl = data.webAppUrl || '';
    }
    return NextResponse.json({ webAppUrl });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { webAppUrl } = await request.json();
    
    // Ensure config directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify({ webAppUrl }, null, 2));
    return NextResponse.json({ status: 'success', message: 'Đã lưu cấu hình Google Sheets thành công!' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
