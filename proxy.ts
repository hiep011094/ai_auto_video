import { NextResponse, type NextRequest } from 'next/server';
import { authorizeRequest } from './app/lib/request-security';
export function proxy(request: NextRequest) {
  const denied = authorizeRequest(request);
  if (!denied) return NextResponse.next();
  const response = NextResponse.json({ error: denied.message }, { status: denied.status });
  if (denied.status === 401) response.headers.set('WWW-Authenticate', 'Basic realm="Duong ve tinh thuc", charset="UTF-8"');
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
