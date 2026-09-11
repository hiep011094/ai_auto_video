'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type { QueueTask } from '../types';
import * as api from '../lib/api';
export function useQueue() {
  const [queue,setQueue]=useState<QueueTask[]>([]), [isSubmitting,setIsSubmitting]=useState(false),[error,setError]=useState('');
  const mounted=useRef(false), fetching=useRef(false);
  const refreshQueue=useCallback(async()=>{
    if(fetching.current)return;fetching.current=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const res=await fetch('/api/queue',{signal:controller.signal,cache:'no-store'});const data=await res.json();if(!res.ok||!Array.isArray(data))throw new Error(data.error||'Không đọc được hàng đợi.');if(mounted.current){setQueue(data.sort((a:QueueTask,b:QueueTask)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)));setError('');}}
    catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Mất kết nối, đang thử lại.');}
    finally{fetching.current=false;clearTimeout(timer);}
  },[]);
  useEffect(()=>{mounted.current=true;void refreshQueue();const timer=setInterval(()=>void refreshQueue(),5000);return()=>{mounted.current=false;clearInterval(timer);};},[refreshQueue]);
  async function mutation(action:()=>Promise<unknown>):Promise<boolean>{try{await action();await refreshQueue();return true;}catch(e){setError(e instanceof Error?e.message:'Không thực hiện được yêu cầu.');return false;}}
  async function submitTask(form:Parameters<typeof api.submitTask>[0],type:Parameters<typeof api.submitTask>[1],model?:string){setIsSubmitting(true);try{return await mutation(()=>api.submitTask(form,type,model));}finally{setIsSubmitting(false);}}
  return {queue,error,isSubmitting,refreshQueue,submitTask,deleteTask:(id:string)=>mutation(()=>api.deleteTask(id)),clearAll:()=>mutation(api.clearAllTasks)};
}
