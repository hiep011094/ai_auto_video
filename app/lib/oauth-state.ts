import { randomBytes, createHash } from 'crypto';
import path from 'path';
import { NextResponse } from 'next/server';
import { updateJson } from './storage';
import { equalSecret } from './request-security';
import { InputError } from './security';
type StateRecord = { hash:string; flow:string; expiresAt:number };
const store=()=>path.join(process.cwd(),'database','operations','oauth-states.json');
const digest=(state:string)=>createHash('sha256').update(state).digest('hex');
export async function createOAuthState(flow:string):Promise<string>{
 const state=randomBytes(32).toString('hex');await updateJson<StateRecord[]>(store(),[],rows=>[...rows.filter(row=>row.expiresAt>Date.now()),{hash:digest(state),flow,expiresAt:Date.now()+600_000}]);return state;
}
export function setStateCookie(response:NextResponse,request:Request,flow:string,state:string){response.cookies.set(`oauth_${flow}`,state,{httpOnly:true,sameSite:'lax',secure:new URL(request.url).protocol==='https:',path:'/',maxAge:600});}
export async function consumeOAuthState(request:Request,flow:string):Promise<void>{
 const query=new URL(request.url).searchParams.get('state')||'';
 const cookie=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`oauth_${flow}=`))?.slice(`oauth_${flow}=`.length)||'';
 if(!query||!cookie||!equalSecret(query,cookie))throw new InputError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',403);
 await updateJson<StateRecord[]>(store(),[],rows=>{if(!rows.some(row=>row.flow===flow&&row.hash===digest(query)&&row.expiresAt>Date.now()))throw new InputError('Phiên đăng nhập đã được dùng hoặc hết hạn.',403);return rows.filter(row=>row.hash!==digest(query)&&row.expiresAt>Date.now());});
}
