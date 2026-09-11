import { createOAuthState, setStateCookie } from '../../lib/oauth-state';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  try {
    const credsPath = path.join(process.cwd(), 'config', 'google_drive_credentials.json');
    if (!fs.existsSync(credsPath)) {
      return NextResponse.json({ error: 'OAuth client credentials not configured. Please place google_drive_credentials.json in the config folder.' }, { status: 400 });
    }

    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    const clientId = creds.client_id;
    if (!clientId) {
      return NextResponse.json({ error: 'client_id is missing from google_drive_credentials.json' }, { status: 400 });
    }

    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || new URL('/api/google-auth/callback', request.url).href;
    const state = await createOAuthState('drive');
    const scopes = [
      'https://www.googleapis.com/auth/drive.file'
    ].join(' ');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes,
        access_type: 'offline',
        prompt: 'consent', state
      }).toString();

    const response = NextResponse.redirect(authUrl);
    setStateCookie(response, request, 'drive', state);
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
