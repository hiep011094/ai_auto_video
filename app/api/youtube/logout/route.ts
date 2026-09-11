import { NextResponse } from 'next/server';
import { oauth2Client } from '@/app/lib/youtube-auth';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const tokenPath = path.join(process.cwd(), 'config', 'token.json');
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }
    oauth2Client.setCredentials({});
  } catch (e) {
    console.error('Lỗi khi đăng xuất token:', e);
  }

  // Redirect sang trang xin cấp đủ quyền Google OAuth full scope
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/youtube.force-ssl'
    ],
    prompt: 'consent'
  });

  return NextResponse.redirect(authUrl);
}
