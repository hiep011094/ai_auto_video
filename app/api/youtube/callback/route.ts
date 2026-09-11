import { NextResponse } from 'next/server';
import { oauth2Client } from '../../../lib/youtube-auth';
import { consumeOAuthState } from '../../../lib/oauth-state';
import { updateJson } from '../../../lib/storage';
import { apiError } from '../../../lib/http';
import { InputError } from '../../../lib/security';
import path from 'path';
export async function GET(request:Request){try{await consumeOAuthState(request,'youtube');const url=new URL(request.url);if(url.searchParams.has('error'))throw new InputError('Đăng nhập Google đã bị hủy.');const code=url.searchParams.get('code');if(!code)throw new InputError('Thiếu mã xác thực.');const {tokens}=await oauth2Client.getToken(code);await updateJson<Record<string,unknown>>(path.join(process.cwd(),'config','token.json'),{},old=>({...old,...tokens}));const response=NextResponse.redirect(new URL('/',request.url));response.cookies.delete('oauth_youtube');return response;}catch(error){return apiError(error);}}
