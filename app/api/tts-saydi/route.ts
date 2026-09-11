import { NextResponse } from 'next/server';
import fs from 'fs';
import { resolveProjectPath, InputError } from '../../lib/security';
import { enqueueJob } from '../../lib/jobs';
import { apiError } from '../../lib/http';
export async function POST(request: Request) {
  try {
    const body = await request.json(); const project = resolveProjectPath(body.folder, body.type);
    if (!fs.existsSync(project)) throw new InputError('Không tìm thấy dự án.', 404);
    if (body.scene !== undefined && (!Number.isInteger(body.scene) || body.scene < 1)) throw new InputError('Số cảnh không hợp lệ.');
    if (body.language !== undefined && body.language !== 'vi') throw new InputError('Chỉ tạo giọng/timeline tiếng Việt.');
    if (body.mode !== undefined && !['global','all_scenes'].includes(body.mode)) throw new InputError('Chế độ giọng đọc không hợp lệ.');
    if (body.speed !== undefined && (typeof body.speed !== 'number' || !Number.isFinite(body.speed) || body.speed < 0.5 || body.speed > 2)) throw new InputError('Tốc độ phải từ 0.5 đến 2.');
    if (body.speed_mode !== undefined && !['apply','already_applied'].includes(body.speed_mode)) throw new InputError('Chế độ tốc độ không hợp lệ.');
    if (body.model !== undefined && !['tiny','base','small','medium','large','large-v2','large-v3','large-v3-turbo','turbo'].includes(body.model)) throw new InputError('Mô hình nhận dạng không hợp lệ.');
    const job = await enqueueJob('saydi', {...body, language: 'vi'});
    return NextResponse.json({status:'success',success:true,jobId:job.id,jobStatus:'pending',message:'Đã xếp hàng xử lý. Theo dõi trạng thái tác vụ để biết kết quả.'},{status:202});
  } catch(error){return apiError(error);}
}
