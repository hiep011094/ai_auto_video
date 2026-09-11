import { NextResponse } from 'next/server';
import path from 'path';
import { resolveProjectInput } from '../../lib/security';
import { enqueueJob } from '../../lib/jobs';
import { apiError } from '../../lib/http';
export async function POST(request:Request){try{const body=await request.json();const project=resolveProjectInput(body.folder_path);const type=path.basename(path.dirname(project))==='video_long'?'long':'short';const job=await enqueueJob('thumbnail',{folder:path.basename(project),type,aiModel:body.aiModel==='codex'?'codex':'agy'});return NextResponse.json({status:'success',success:true,jobId:job.id,message:'Đã xếp hàng tạo thumbnail Phật giáo.'},{status:202});}catch(error){return apiError(error);}}
