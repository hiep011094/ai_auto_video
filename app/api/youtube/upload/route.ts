import { NextResponse } from 'next/server';
import { uploadToYouTube, addVideoToPlaylist, uploadCustomThumbnail } from '../../../lib/youtube-auth';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { readHistory, updateHistory } from '../../../lib/history-store';
import { readJsonStrict, writeJsonSafe, withFileLock } from '../../../lib/storage';
import { resolveProjectPath, resolveWithin, InputError } from '../../../lib/security';
import { apiError, errorMessage } from '../../../lib/http';
import { toVNTime } from '../../../lib/time';
interface UploadReceipt { state: 'uploading'|'uploaded'|'uncertain'; videoId?: string; startedAt: string; publishAt?: string; error?: string }
interface Seo { title?: string; description?: string; keywords?: string[]; short?: Seo; long?: Seo }
export function uploadReceiptPath(id: string): string { return path.join(process.cwd(),'database','operations','uploads',createHash('sha256').update(id).digest('hex')+'.json'); }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { historyId, publishAt, playlistId } = body;
    if (typeof historyId !== 'string' || !historyId) throw new InputError('Thiếu historyId.');
    if (publishAt && (typeof publishAt !== 'string' || !Number.isFinite(Date.parse(publishAt)) || Date.parse(publishAt) <= Date.now())) throw new InputError('Thời điểm đăng phải ở tương lai.');
    return await withFileLock(uploadReceiptPath(historyId), async () => {
      const topic = readHistory().find(row=>row.id===historyId);
      if (!topic) throw new InputError('Không tìm thấy video.',404);
      if (topic.language && topic.language !== 'vi') throw new InputError('Kênh này chỉ đăng nội dung tiếng Việt.');
      const receipt = readJsonStrict<UploadReceipt|null>(uploadReceiptPath(historyId),null);
      const priorId = topic.youtube_video_id || receipt?.videoId;
      if (priorId) {
        await updateHistory(rows=>rows.map(row=>row.id===historyId?{...row,youtube_video_id:priorId,youtube_status:receipt?.publishAt?'scheduled':(row.youtube_status==='scheduled'?'scheduled':'published')}:row));
        return NextResponse.json({success:true,videoId:priorId,alreadyUploaded:true,message:'Video đã được tải lên; không tạo bản trùng.'});
      }
      if (receipt) throw new InputError('Lần upload trước chưa xác định kết quả. Kiểm tra YouTube Studio trước khi upload lại để tránh bản trùng.',409);
      const folder = resolveProjectPath(topic.folder,topic.type);
      const directories = [folder,path.join(folder,'export')];
      let video = '';
      for (const directory of directories) {
        if (!fs.existsSync(directory)) continue;
        const candidates=fs.readdirSync(directory).filter(name=>name.toLowerCase().endsWith('.mp4')&&!/^scene[_\-\s]/i.test(name)).map(name=>resolveWithin(folder,path.join(directory,name))).filter((name):name is string=>Boolean(name)).filter(name=>fs.statSync(name).isFile()).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
        if(candidates.length){video=candidates[0];break;}
      }
      if(!video)throw new InputError('Chưa có video MP4 hoàn chỉnh.',404);
      const raw=readJsonStrict<Seo>(path.join(folder,'seo_optimized.json'),{}),seo=raw[topic.type]||raw;
      const meta=readJsonStrict<Seo>(path.join(folder,'metadata.json'),{});
      const title=seo.title||meta.title||topic.title,description=seo.description||meta.description||'',keywords=seo.keywords||meta.keywords||[];
      if(!title||[...title].length>100||Buffer.byteLength(description,'utf8')>5000||!Array.isArray(keywords)||keywords.some(k=>typeof k!=='string'))throw new InputError('Tiêu đề/mô tả/từ khóa chưa hợp lệ để đăng YouTube.');
      const startedAt=toVNTime();writeJsonSafe(uploadReceiptPath(historyId),{state:'uploading',startedAt,publishAt});
      let videoId: string | null;
      try { videoId=await uploadToYouTube(video,title,description,publishAt,keywords,'vi'); if(!videoId)throw new Error('YouTube không trả mã video.'); }
      catch(error){writeJsonSafe(uploadReceiptPath(historyId),{state:'uncertain',startedAt,publishAt,error:errorMessage(error)});throw error;}
      // Persist external success BEFORE optional thumbnail/playlist work and before response.
      writeJsonSafe(uploadReceiptPath(historyId),{state:'uploaded',videoId,startedAt,publishAt});
      await updateHistory(rows=>rows.map(row=>row.id===historyId?{...row,youtube_status:publishAt?'scheduled':'published',youtube_video_id:videoId}:row));
      let thumbnailUploaded=false,thumbnailError:string|null=null;
      if(topic.type==='long') {
        const thumb=['thumbnail.png','thumbnail.jpg','thumbnail.jpeg','thumbnail.webp'].map(name=>resolveWithin(folder,path.join(folder,name))).find((name):name is string=>Boolean(name&&fs.existsSync(name)));
        if(thumb)try{thumbnailUploaded=await uploadCustomThumbnail(videoId,thumb);}catch(error){thumbnailError=errorMessage(error);}
      }
      let playlistError:string|null=null;
      if(typeof playlistId==='string'&&playlistId)try{await addVideoToPlaylist(videoId,playlistId);}catch(error){playlistError=errorMessage(error);}
      return NextResponse.json({success:true,videoId,thumbnailUploaded,thumbnailError,playlistError});
    },300);
  }catch(error){return apiError(error);}
}
