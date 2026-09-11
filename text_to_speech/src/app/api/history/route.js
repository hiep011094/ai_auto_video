import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'output');

export async function GET(request) {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return Response.json({ success: true, files: [] });
    }

    const files = fs.readdirSync(OUTPUT_DIR);
    const audioFiles = files
      .filter(f => f.endsWith('.mp3'))
      .map(file => {
        const filePath = path.join(OUTPUT_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          size: stats.size,
          createdAt: stats.birthtime.getTime() || stats.mtime.getTime(), // Fallback to mtime if birthtime isn't reliable
          playUrl: `/api/audio-file?path=${encodeURIComponent(filePath)}`
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt); // Newest first

    return Response.json({
      success: true,
      files: audioFiles
    });
  } catch (error) {
    console.error('Error in API /api/history GET:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const file = searchParams.get('file');
    const all = searchParams.get('all');

    if (!fs.existsSync(OUTPUT_DIR)) {
      return Response.json({ success: true, message: 'Nothing to delete' });
    }

    if (all === 'true') {
      const files = fs.readdirSync(OUTPUT_DIR);
      let count = 0;
      files.forEach(f => {
        if (f.endsWith('.mp3')) {
          fs.unlinkSync(path.join(OUTPUT_DIR, f));
          count++;
        }
      });
      return Response.json({ success: true, message: `Deleted ${count} files` });
    }

    if (file) {
      const filePath = path.join(OUTPUT_DIR, file);
      // Security check: ensure the file is within the output directory
      if (!filePath.startsWith(OUTPUT_DIR) || !file.endsWith('.mp3')) {
        return Response.json({ success: false, error: 'Invalid file name' }, { status: 400 });
      }

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return Response.json({ success: true, message: `Deleted ${file}` });
      } else {
        return Response.json({ success: false, error: 'File not found' }, { status: 404 });
      }
    }

    return Response.json({ success: false, error: 'Missing file or all parameter' }, { status: 400 });
  } catch (error) {
    console.error('Error in API /api/history DELETE:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
