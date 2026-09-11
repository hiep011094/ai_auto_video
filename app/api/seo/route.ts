import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { resolveProjectInput, resolveProjectPath, InputError } from '../../lib/security';
import { enqueueJob, assertProjectIdle } from '../../lib/jobs';
import { apiError } from '../../lib/http';
export async function POST(request: Request) {
 try {const body=await request.json();const project=resolveProjectInput(body.folder_path);const type=path.basename(path.dirname(project))==='video_long'?'long':'short';if(body.video_type&&body.video_type!==type)throw new InputError('Loại video không khớp dự án.');const job=await enqueueJob('seo',{folder:path.basename(project),type,aiModel:body.aiModel==='codex'?'codex':'agy'});return NextResponse.json({status:'success',success:true,jobId:job.id,message:'Đã xếp hàng tối ưu SEO tiếng Việt.'},{status:202});}catch(error){return apiError(error);}
}
export async function DELETE(request: Request) {
 try {const p=new URL(request.url).searchParams;const project=resolveProjectPath(p.get('folder'),p.get('type'));assertProjectIdle(path.basename(project));const file=path.join(project,'seo_optimized.json');if(fs.existsSync(file))fs.unlinkSync(file);return NextResponse.json({success:true});}catch(error){return apiError(error);}
}
