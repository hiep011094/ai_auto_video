import { NextResponse } from 'next/server';
import { oauth2Client } from '../../../lib/youtube-auth';
import { createOAuthState, setStateCookie } from '../../../lib/oauth-state';
import { apiError } from '../../../lib/http';
export async function GET(request:Request){try{const state=await createOAuthState('youtube');const url=oauth2Client.generateAuthUrl({access_type:'offline',scope:['https://www.googleapis.com/auth/youtube','https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly','https://www.googleapis.com/auth/youtube.force-ssl'],prompt:'consent',state});const response=NextResponse.redirect(url);setStateCookie(response,request,'youtube',state);return response;}catch(error){return apiError(error);}}
