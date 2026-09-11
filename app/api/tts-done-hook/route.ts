import { NextResponse } from 'next/server';
import { resolveProjectPath } from '../../lib/security';
import { enqueueJob } from '../../lib/jobs';
import { apiError } from '../../lib/http';
export async function POST(request:Request){try{const {folder,type}=await request.json();resolveProjectPath(folder,type);const seo=await enqueueJob('seo',{folder,type,aiModel:'agy'});const thumbnail=await enqueueJob('thumbnail',{folder,type,aiModel:'agy'});return NextResponse.json({status:'accepted',success:true,jobs:[seo.id,thumbnail.id],message:'SEO và thumbnail được xử lý lần lượt trong hàng đợi.'},{status:202});}catch(error){return apiError(error);}}
