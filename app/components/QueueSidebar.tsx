'use client';
import { useEffect, useRef, useState } from 'react';
import type { OperationJob, JobStatus, JobKind } from '../lib/jobs';
const labels: Record<JobStatus,string> = {pending:'Đang chờ',processing:'Đang xử lý',completed:'Hoàn tất',error:'Có lỗi',cancel_requested:'Đang hủy',cancelled:'Đã hủy'};
const kinds: Record<JobKind,string> = {script:'Kịch bản',veo:'Cảnh Veo',seo:'SEO',thumbnail:'Ảnh bìa',saydi:'Giọng Saydi','capcut-tts':'Giọng CapCut',vbee:'Giọng Vbee',align:'Căn thời gian'};
export default function QueueSidebar() {
  const [jobs,setJobs]=useState<OperationJob[]>([]), [error,setError]=useState(''), [busy,setBusy]=useState('');
  const previous=useRef(new Map<string,string>());
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;let controller:AbortController;
    const refresh=async()=>{
      controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
      try {
        const res=await fetch('/api/jobs',{signal:controller.signal,cache:'no-store'});
        const payload=await res.json();if(!res.ok)throw new Error(payload.error||'Không đọc được trạng thái tác vụ.');
        const rows:OperationJob[]=payload;
        if(!Array.isArray(rows))throw new Error('Phản hồi hàng đợi không hợp lệ.');
        if(stopped)return;
        for(const job of rows){if(job.status==='completed' && previous.current.has(job.id) && previous.current.get(job.id)!=='completed')window.dispatchEvent(new CustomEvent('operation-completed',{detail:job}));}
        previous.current=new Map(rows.map(job=>[job.id,job.status]));setJobs(rows);setError('');
      } catch(e){if(!stopped)setError(e instanceof Error?e.message:'Mất kết nối hàng đợi; đang thử lại.');}
      finally{clearTimeout(timeout);if(!stopped)timer=setTimeout(refresh,5000);}
    };
    void refresh();return()=>{stopped=true;clearTimeout(timer);controller?.abort();};
  },[]);
  async function control(id:string,action:'cancel'|'retry') {
    setBusy(id);try{const response=await fetch('/api/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Không cập nhật được tác vụ.');setError('');}catch(e){setError(e instanceof Error?e.message:'Không kết nối được máy chủ.');}finally{setBusy('');}
  }
  const active=jobs.filter(job=>['pending','processing','cancel_requested'].includes(job.status));
  const recent=jobs.filter(job=>!active.includes(job)).slice(-8).reverse();
  return <section aria-label="Hàng đợi xử lý" className="panel" style={{marginTop:20}}>
    <h2 style={{fontSize:'1.1rem'}}>Hàng đợi xử lý · {active.length} tác vụ</h2>
    <p style={{fontSize:14}}>Bạn có thể rời trang rồi quay lại để xem kết quả. Các tác vụ chạy lần lượt.</p>
    {error && <p role="alert" style={{color:'#b42318'}}>{error}</p>}
    {jobs.length===0 && <p>Chưa có tác vụ. Bắt đầu bằng một chủ đề Phật giáo ở biểu mẫu phía trên.</p>}
    {[...active,...recent].map(job=><article key={job.id} style={{padding:'12px 0',borderTop:'1px solid #ddd'}}>
      <strong>{kinds[job.kind]} · {String(job.params.topic||job.params.folder||'Dự án mới')}</strong>
      <div role="status">{labels[job.status]} · {new Date(job.updatedAt).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</div>
      {job.error && <p style={{color:'#b42318'}}>{job.error}</p>}
      {job.status==='completed' && job.result && typeof job.result==='object' && 'message' in job.result ? <p>{String(job.result.message)}</p>:null}
      {['pending','processing'].includes(job.status) && <button type="button" className="btn btn-secondary" disabled={busy===job.id} onClick={()=>void control(job.id,'cancel')}>Hủy tác vụ</button>}
      {['error','cancelled'].includes(job.status) && <button type="button" className="btn btn-secondary" disabled={busy===job.id} onClick={()=>void control(job.id,'retry')}>Thử lại</button>}
    </article>)}
  </section>;
}
