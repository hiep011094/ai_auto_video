import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import voicesData from '../../../config/voices.json';

const VOICE_MAP = {};
const PLATFORM_MAP = {};
voicesData.voices.forEach(v => {
  VOICE_MAP[v.id] = v.resource_id;
  PLATFORM_MAP[v.id] = v.platform || 'sami';
});

function splitTextIntoChunks(text, maxLength = 350) {
  const cleanText = text.replace(/\r\n/g, '\n');
  const sentences = cleanText.split(/([?!;\n]|(?<!\d)\.|\.(?!\d))/);
  const chunks = [];
  let currentChunk = '';
  
  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    if (!part) continue;
    
    if (part.match(/^[.\n?!;]$/)) {
      currentChunk += part;
      continue;
    }
    
    if (part.length > maxLength) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      const words = part.split(/(\s+)/);
      let temp = '';
      for (const word of words) {
        if (temp.length + word.length > maxLength) {
          if (temp.trim()) chunks.push(temp.trim());
          temp = word;
        } else {
          temp += word;
        }
      }
      if (temp.trim()) {
        currentChunk = temp;
      }
    } else {
      if (currentChunk.length + part.length > maxLength) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = part;
      } else {
        currentChunk += part;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function stripID3(buffer) {
  let startOffset = 0;
  // Check for ID3v2 header (starts with "ID3" / 0x49 0x44 0x33)
  if (buffer.length > 10 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    const size = ((buffer[6] & 0x7F) << 21) | 
                 ((buffer[7] & 0x7F) << 14) | 
                 ((buffer[8] & 0x7F) << 7) | 
                 (buffer[9] & 0x7F);
    startOffset = 10 + size;
  }
  
  let endOffset = buffer.length;
  // Check for ID3v1 trailer at the end (starts with "TAG" / 0x54 0x41 0x47)
  if (buffer.length > 128) {
    const v1TagOffset = buffer.length - 128;
    if (buffer[v1TagOffset] === 0x54 && buffer[v1TagOffset + 1] === 0x41 && buffer[v1TagOffset + 2] === 0x47) {
      endOffset = v1TagOffset;
    }
  }
  
  return startOffset > 0 || endOffset < buffer.length ? buffer.subarray(startOffset, endOffset) : buffer;
}

function stripID3Trailer(buffer) {
  let endOffset = buffer.length;
  if (buffer.length > 128) {
    const v1TagOffset = buffer.length - 128;
    if (buffer[v1TagOffset] === 0x54 && buffer[v1TagOffset + 1] === 0x41 && buffer[v1TagOffset + 2] === 0x47) {
      endOffset = v1TagOffset;
    }
  }
  return endOffset < buffer.length ? buffer.subarray(0, endOffset) : buffer;
}

export async function POST(request) {
  try {
    const { text, voice, outputPath } = await request.json();

    if (!text) {
      return Response.json(
        { success: false, error: 'Thiếu nội dung văn bản (text).' },
        { status: 400 }
      );
    }
    if (!voice) {
      return Response.json(
        { success: false, error: 'Thiếu định danh giọng đọc (voice).' },
        { status: 400 }
      );
    }

    const resourceId = VOICE_MAP[voice];
    const platform = PLATFORM_MAP[voice];
    if (!resourceId) {
      return Response.json(
        { success: false, error: `Không tìm thấy resource_id cho giọng đọc: ${voice}` },
        { status: 400 }
      );
    }

    // Ensure target directory exists
    const defaultDir = path.join(process.cwd(), 'output');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }

    // Generate filename slug from the first 10 characters
    let slug = text.trim()
      .substring(0, 10)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (accents)
      .replace(/[^a-zA-Z0-9]/g, "_") // Replace non-alphanumeric with underscore
      .replace(/_+/g, "_") // Replace multiple underscores with a single one
      .replace(/^_|_$/g, ""); // Remove leading or trailing underscores

    if (!slug) {
      slug = 'audio';
    }

    // Handle collision (add _1, _2, etc.)
    let targetPath = path.join(defaultDir, `${slug}.mp3`);
    let counter = 1;
    while (fs.existsSync(targetPath)) {
      targetPath = path.join(defaultDir, `${slug}_${counter}.mp3`);
      counter++;
    }

    const chunks = splitTextIntoChunks(text, 350);
    console.log(`TTS API: Split input text into ${chunks.length} chunks.`);

    const tempFiles = [];
    const pythonScript = path.join(process.cwd(), 'capcut_tts_api.py');
    
    // Helper to spawn a single python chunk process
    const runPythonChunk = (chunkText, chunkIdx, tempPath) => new Promise((resolve, reject) => {
      console.log(`TTS API: Spawning python for chunk ${chunkIdx + 1}/${chunks.length} (${chunkText.length} chars)...`);
      const pyProcess = spawn('python', [pythonScript, chunkText, voice, resourceId, tempPath, platform]);
      
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
          reject(new Error(`Chunk ${chunkIdx + 1} failed: Python exited with code ${code}. Error: ${stderrData}`));
        } else {
          try {
            const parsed = JSON.parse(stdoutData.trim());
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Chunk ${chunkIdx + 1} failed to parse JSON: ${stdoutData}. Error: ${e.message}`));
          }
        }
      });
    });

    const timestamp = Date.now();
    const partFiles = [];
    
    try {
      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const partPath = path.join(defaultDir, `${slug}_part_${i + 1}_${timestamp}.mp3`);
        tempFiles.push(partPath);
        
        partFiles.push({
          index: i + 1,
          text: chunkText,
          filePath: partPath,
          fileName: path.basename(partPath),
          playUrl: `/api/audio-file?path=${encodeURIComponent(partPath)}`
        });
        
        const result = await runPythonChunk(chunkText, i, partPath);
        if (!result.success) {
          throw new Error(result.error || `Chunk ${i + 1} failed to generate.`);
        }
        
        // Wait 5-6.5 seconds before next chunk (except for the last one)
        if (i < chunks.length - 1) {
          const delay = 5000 + Math.random() * 1500;
          console.log(`TTS API: Waiting ${Math.round(delay)}ms before next chunk request...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Concatenate files using ID3 tag stripping to prevent clicks, pops and distortion
      console.log(`TTS API: All chunks generated successfully. Merging ${tempFiles.length} files...`);
      const writeStream = fs.createWriteStream(targetPath);
      
      for (let i = 0; i < tempFiles.length; i++) {
        const tempFile = tempFiles[i];
        try {
          let fileData = fs.readFileSync(tempFile);
          
          if (i > 0) {
            // Strip ID3v2 header and ID3v1 trailer from subsequent chunks
            fileData = stripID3(fileData);
          } else {
            // Strip ID3v1 trailer from first chunk
            fileData = stripID3Trailer(fileData);
          }
          
          writeStream.write(fileData);
          // Keep tempFile (partPath) so it can be played individually by the client
        } catch (err) {
          console.error(`Failed to process and merge temp file ${tempFile}:`, err.message);
          writeStream.destroy();
          throw err;
        }
      }
      writeStream.end();
      
      // Wait for writeStream to finish writing to disk
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      
      console.log(`TTS API: Merge completed successfully. Final file size: ${fs.statSync(targetPath).size} bytes.`);
      
    } catch (error) {
      console.error("TTS API: Generation error, cleaning up files...", error.message);
      // Clean up generated files only on error
      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (err) {
            console.error(`Failed to clean up file ${tempFile}:`, err.message);
          }
        }
      }
      return Response.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      filePath: targetPath,
      fileName: path.basename(targetPath),
      playUrl: `/api/audio-file?path=${encodeURIComponent(targetPath)}`,
      parts: partFiles
    });

  } catch (error) {
    console.error('Error in API /api/tts:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
