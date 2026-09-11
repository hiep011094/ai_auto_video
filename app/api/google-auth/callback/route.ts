import { consumeOAuthState } from '../../../lib/oauth-state';
import { updateJson } from '../../../lib/storage';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    await consumeOAuthState(request, 'drive');
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      return NextResponse.json({ error: `Google OAuth error: ${errorParam}` }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 });
    }

    const credsPath = path.join(process.cwd(), 'config', 'google_drive_credentials.json');
    if (!fs.existsSync(credsPath)) {
      return NextResponse.json({ error: 'OAuth credentials file not found' }, { status: 400 });
    }

    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const { client_id, client_secret } = creds;

    if (!client_id || !client_secret) {
      return NextResponse.json({ error: 'client_id or client_secret is missing' }, { status: 400 });
    }

    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || new URL('/api/google-auth/callback', request.url).href;

    // Exchange auth code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return NextResponse.json({ error: `Failed to exchange authorization code: ${errText}` }, { status: 400 });
    }

    const tokens = await tokenRes.json();
    const { refresh_token } = tokens;

    if (!refresh_token) {
      // If prompt=consent was sent, this shouldn't happen, but we display a helpful warning if it does
      return new NextResponse(
        `<html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #ea4335;">⚠️ Thiếu Refresh Token</h1>
            <p>Tài khoản này đã từng được liên kết trước đó. Bạn hãy vào <a href="https://myaccount.google.com/connections" target="_blank">Google Connections</a>, xóa quyền truy cập ứng dụng của bạn và bấm liên kết lại nhé.</p>
          </body>
        </html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }

    // Save refresh token to credentials file
    await updateJson<Record<string, unknown>>(credsPath, {}, current => ({ ...current, refresh_token }));

    // Display success page
    return new NextResponse(
      `<html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f0fdf4; color: #15803d;">
          <h1 style="font-size: 2.5rem; margin-bottom: 10px;">🎉 Liên kết thành công!</h1>
          <p style="font-size: 1.2rem; color: #166534; margin-bottom: 20px;">Tài khoản Google Drive của bạn đã được kết nối thành công với ứng dụng Tỉnh Thức AI.</p>
          <p style="font-size: 1rem; color: #374151;">Bây giờ bạn có thể đóng tab này và bắt đầu Đồng bộ video bình thường.</p>
          <script>
            setTimeout(() => { window.close(); }, 5000);
          </script>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
