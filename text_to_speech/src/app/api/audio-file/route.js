import fs from 'fs';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return new Response('Missing file path', { status: 400 });
    }

    const cleanPath = path.resolve(filePath);
    
    // Security check: Only allow files within workspace output directory or user's CapCut directory
    const allowedOutputDir = path.resolve(process.cwd(), 'output');
    const localAppData = process.env.LOCALAPPDATA || '';
    const allowedCapcutDir = localAppData ? path.resolve(localAppData, 'CapCut') : '';
    
    const isSafe = cleanPath.startsWith(allowedOutputDir) || 
                   (allowedCapcutDir && cleanPath.startsWith(allowedCapcutDir));
                   
    if (!isSafe) {
      return new Response('Access Denied', { status: 403 });
    }
    
    // Check if file exists
    if (!fs.existsSync(cleanPath)) {
      return new Response('File not found', { status: 404 });
    }

    const stat = fs.statSync(cleanPath);
    const fileStream = fs.createReadStream(cleanPath);

    // Get mime type based on extension
    const ext = path.extname(cleanPath).toLowerCase();
    let mimeType = 'audio/aac';
    if (ext === '.mp3') mimeType = 'audio/mpeg';
    if (ext === '.wav') mimeType = 'audio/wav';
    if (ext === '.m4a') mimeType = 'audio/x-m4a';

    const headers = {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    };

    // Return the file stream as response
    // Node.js Streams can be converted or passed as ReadableStream
    // Next.js Response accepts a ReadableStream
    const readable = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      }
    });

    return new Response(readable, { headers });
  } catch (error) {
    console.error('Error serving audio file:', error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
