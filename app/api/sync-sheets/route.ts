import { resolveProjectPath } from '../../lib/security';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { sanitizePath } from '../../lib/security';
import { invalidateHistoryCache } from '../../lib/history-cache';

// Helper to sign JWT using native crypto
function generateJwt(clientEmail: string, privateKey: string): string {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat
  };

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${base64Header}.${base64Payload}`);
  const formattedKey = privateKey.replace(/\\n/g, '\n');
  const signature = sign.sign(formattedKey, 'base64');
  const base64UrlSignature = signature
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${base64Header}.${base64Payload}.${base64UrlSignature}`;
}

// Helper to get OAuth access token from JWT
async function getAccessToken(jwt: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get OAuth token: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Helper to get access token from refresh token (OAuth 2.0 authorized user)
async function getAccessTokenFromRefreshToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh access token: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

// Helper to upload file via streaming multipart upload
async function uploadToDrive(
  accessToken: string,
  filePath: string,
  fileName: string,
  parentFolderId: string
): Promise<string> {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '-------314159265358979323846';

  const metadata = {
    name: fileName,
    parents: [parentFolderId]
  };

  const multipartBody = Buffer.concat([
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: video/mp4\r\nContent-Transfer-Encoding: binary\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': multipartBody.length.toString()
    },
    body: multipartBody
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload to Drive: ${text}`);
  }

  const data = await res.json();
  return data.id;
}

// Helper to share file publicly and get share link
async function makeFilePublic(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set permissions: ${text}`);
  }

  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!fileRes.ok) {
    const text = await fileRes.text();
    throw new Error(`Failed to get webViewLink: ${text}`);
  }

  const data = await fileRes.json();
  return data.webViewLink;
}

const configPath = path.join(process.cwd(), 'config', 'google_sheets.json');

export async function POST(request: Request) {
  try {
    const { folder, type, driveFolderId } = await request.json();

    if (!folder || !type) {
      return NextResponse.json({ error: 'Thiếu tham số folder hoặc type' }, { status: 400 });
    }

    // Read config
    let webAppUrl = '';
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      webAppUrl = configData.webAppUrl || '';
    }

    if (!webAppUrl) {
      return NextResponse.json({
        status: 'unconfigured',
        message: 'Google Sheets Web App URL chưa được cấu hình. Vui lòng thiết lập URL trước.'
      }, { status: 200 });
    }

    const parentFolder = type === 'long' ? 'video_long' : 'video_short';
    const projectPath = resolveProjectPath(folder, type);
    const safePath = sanitizePath(projectPath);

    if (!safePath) {
      return NextResponse.json({ error: 'Đường dẫn thư mục không hợp lệ' }, { status: 403 });
    }

    const seoOptimizedPath = path.join(safePath, 'seo_optimized.json');

    if (!fs.existsSync(seoOptimizedPath)) {
      return NextResponse.json({
        error: 'Chưa có nội dung SEO tối ưu. Vui lòng bấm tối ưu SEO trước khi đồng bộ!'
      }, { status: 400 });
    }

    // Read and parse SEO optimized data
    const seoData = JSON.parse(fs.readFileSync(seoOptimizedPath, 'utf8'));
    let title = '';
    let description = '';

    if (type === 'short' && seoData.short) {
      title = seoData.short.title || '';
      description = seoData.short.description || '';
    } else if (type === 'long' && seoData.long) {
      title = seoData.long.title || '';
      description = seoData.long.description || '';
    } else {
      return NextResponse.json({ error: 'Định dạng dữ liệu SEO không khớp với loại video.' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Nội dung tiêu đề SEO trống, không thể đồng bộ.' }, { status: 400 });
    }

    // Detect compiled video file (.mp4 and not starting with "scene_")
    const configPathDrive = path.join(process.cwd(), 'config', 'google_drive_credentials.json');
    let videoUrl = '';
    let videoPayload: any = null;

    try {
      const files = fs.readdirSync(safePath);
      const mp4File = files.find(f => {
        const ext = path.extname(f).toLowerCase();
        const name = path.basename(f, ext).toLowerCase();
        return ext === '.mp4' && !name.startsWith('scene_');
      });

      if (mp4File) {
        const videoFilePath = path.join(safePath, mp4File);

        // 1. Try direct upload if Google credentials file exists
        if (fs.existsSync(configPathDrive)) {
          try {
            const driveCreds = JSON.parse(fs.readFileSync(configPathDrive, 'utf8'));
            let token = '';

            if (driveCreds.type === 'service_account') {
              console.log(`Directly uploading ${mp4File} to Google Drive using Service Account...`);
              const jwt = generateJwt(driveCreds.client_email, driveCreds.private_key);
              token = await getAccessToken(jwt);
            } else if (driveCreds.type === 'authorized_user' && driveCreds.refresh_token) {
              console.log(`Directly uploading ${mp4File} to Google Drive using OAuth 2.0 (User)...`);
              token = await getAccessTokenFromRefreshToken(
                driveCreds.client_id,
                driveCreds.client_secret,
                driveCreds.refresh_token
              );
            } else {
              console.warn('Google credentials file type is not supported or not fully authorized yet.');
            }

            if (token) {
              const folderId = driveFolderId || '16opy1ZPxDFFSauAbkqctKUhx9N2Zrp8F'; // Use dynamic folder ID or default Drive folder
              const fileId = await uploadToDrive(token, videoFilePath, mp4File, folderId);
              videoUrl = await makeFilePublic(token, fileId);
              console.log(`Uploaded video to Drive. Link: ${videoUrl}`);
            }
          } catch (driveErr) {
            console.error('Error during direct Drive upload, falling back to base64 upload:', driveErr);
          }
        }

        // 2. Fallback to base64 payload if direct upload did not occur or failed
        if (!videoUrl) {
          const stats = fs.statSync(videoFilePath);
          if (stats.size <= 50 * 1024 * 1024) { // Apps Script limit
            const videoBuffer = fs.readFileSync(videoFilePath);
            videoPayload = {
              fileName: mp4File,
              fileBase64: videoBuffer.toString('base64'),
              mimeType: 'video/mp4'
            };
          } else {
            console.warn(`Video file ${mp4File} exceeds 50MB, skipped base64 fallback upload.`);
          }
        }
      }
    } catch (videoErr) {
      console.error('Error scanning/reading video file:', videoErr);
    }

    // Send to Google Sheets Web App
    const response = await fetch(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, description, video: videoPayload, videoUrl, folderId: driveFolderId }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `Gửi dữ liệu lên Google Sheets thất bại: ${errText}` }, { status: 500 });
    }

    const resJson = await response.json();
    if (resJson.status === 'success' || resJson.status === 'duplicate') {
      try {
        const historyPath = path.join(process.cwd(), 'database', 'history.json');
        if (fs.existsSync(historyPath)) {
          const rawHistory = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
          const topics = Array.isArray(rawHistory) ? rawHistory : (rawHistory.topics || []);
          const topic = topics.find((t: any) => t.folder === folder);
          if (topic) {
            topic.sheets_synced = true;
            fs.writeFileSync(historyPath, JSON.stringify(topics, null, 2), 'utf8');
            // Invalidate in-process cache so next GET /api/history reads fresh data
            invalidateHistoryCache();
          }
        }
      } catch (err) {
        console.error('Error updating history.json synced state:', err);
      }
    }

    if (resJson.status === 'success') {
      return NextResponse.json({
        status: 'success',
        message: 'Đã đồng bộ tiêu đề và mô tả lên Google Sheets thành công!'
      });
    } else if (resJson.status === 'duplicate') {
      return NextResponse.json({
        status: 'duplicate',
        message: resJson.message || 'Tiêu đề này đã tồn tại trong Google Sheets!'
      });
    } else {
      return NextResponse.json({
        error: `Lỗi từ Google Sheets: ${resJson.message || 'Không rõ nguyên nhân'}`
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error syncing to Google Sheets:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folder = searchParams.get('folder');
    const type = searchParams.get('type');

    if (!folder || !type) {
      return NextResponse.json({ error: 'Thiếu tham số folder hoặc type' }, { status: 400 });
    }

    const parentFolder = type === 'long' ? 'video_long' : 'video_short';
    const projectPath = resolveProjectPath(folder, type);
    const safePath = sanitizePath(projectPath);

    let title = '';
    if (safePath) {
      const seoOptimizedPath = path.join(safePath, 'seo_optimized.json');
      if (fs.existsSync(seoOptimizedPath)) {
        const seoData = JSON.parse(fs.readFileSync(seoOptimizedPath, 'utf8'));
        if (type === 'short' && seoData.short) {
          title = seoData.short.title || '';
        } else if (type === 'long' && seoData.long) {
          title = seoData.long.title || '';
        }
      }
    }

    // Call Google Sheets Web App to delete the row if title is found and webAppUrl is configured
    let sheetDeleteMessage = '';
    let webAppUrl = '';
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      webAppUrl = configData.webAppUrl || '';
    }

    if (webAppUrl && title) {
      try {
        console.log(`Sending delete request to Google Sheets for title: "${title}"`);
        const response = await fetch(webAppUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'delete', title }),
        });
        if (response.ok) {
          const resJson = await response.json();
          sheetDeleteMessage = ` và ${resJson.message || 'đồng bộ xóa dòng trên Sheets'}`;
        } else {
          sheetDeleteMessage = ` (Lưu ý: Không thể kết nối Web App để xóa dòng trên Sheets)`;
        }
      } catch (sheetErr: any) {
        console.error('Lỗi khi gọi API xóa dòng trên Google Sheets:', sheetErr);
        sheetDeleteMessage = ` (Lưu ý: Không thể kết nối để xóa dòng trên Sheets: ${sheetErr.message})`;
      }
    }

    const historyPath = path.join(process.cwd(), 'database', 'history.json');
    if (fs.existsSync(historyPath)) {
      const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      if (historyData.topics && Array.isArray(historyData.topics)) {
        const topic = historyData.topics.find((t: any) => t.folder === folder);
        if (topic) {
          delete topic.sheets_synced;
          fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
          // Invalidate in-process cache
          invalidateHistoryCache();
        }
      }
    }
    return NextResponse.json({
      status: 'success',
      message: `Đã reset trạng thái đồng bộ cục bộ${sheetDeleteMessage}!`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
