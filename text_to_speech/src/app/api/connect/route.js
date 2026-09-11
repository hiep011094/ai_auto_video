import { spawn } from 'child_process';
import path from 'path';

export async function POST() {
  try {
    const pythonScript = path.join(process.cwd(), 'auto_capcut.py');
    
    const runPython = () => new Promise((resolve, reject) => {
      const pyProcess = spawn('python', [pythonScript]);
      
      let stdoutData = '';
      let stderrData = '';
      
      pyProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });
      
      pyProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });
      
      pyProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}. Error: ${stderrData}`));
        } else {
          try {
            const parsed = JSON.parse(stdoutData.trim());
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse python stdout: ${stdoutData}. Error: ${e.message}`));
          }
        }
      });
    });

    const result = await runPython();
    if (!result.success) {
      return Response.json(
        { success: false, error: result.error || 'Lỗi không xác định khi kết nối với CapCut Desktop.' },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: result.message
    });

  } catch (error) {
    console.error('Error in API /api/connect:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
