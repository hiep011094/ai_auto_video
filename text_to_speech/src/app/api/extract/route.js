import { extractAudio } from '@/utils/capcut';
import fs from 'fs';
import path from 'path';

export async function POST(request) {
  try {
    const { projectId, outputDir } = await request.json();

    if (!projectId) {
      return Response.json(
        { success: false, error: 'Thiếu projectId.' },
        { status: 400 }
      );
    }

    const result = extractAudio(projectId, outputDir || null);
    
    // Enrich result with download URLs or audio base64 if needed, 
    // or let the web interface serve files.
    // For local web apps, serving files or copying them is very fast.
    // Let's add client-side audio player capability by serving the file content!
    // Since Next.js API routes run on the local server, we can read the file 
    // from the output directory and return a download link or list files.
    
    if (result.success && result.files) {
      result.files = result.files.map(f => {
        if (f.status === 'success' && f.filePath) {
          // Add a relative url or local api url to play this audio
          return {
            ...f,
            playUrl: `/api/audio-file?path=${encodeURIComponent(f.filePath)}`
          };
        }
        return f;
      });
    }

    return Response.json(result);
  } catch (error) {
    console.error('Error in API /api/extract:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
