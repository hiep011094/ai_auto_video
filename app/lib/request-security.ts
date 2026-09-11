import { timingSafeEqual } from 'crypto';
export function equalSecret(left: string, right: string): boolean {
  const a = Buffer.from(left), b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function authorizeRequest(request: Request): { status: number; message: string } | null {
  const url = new URL(request.url), host = (request.headers.get('host') || url.host).toLowerCase();
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const secret = process.env.VUTRU_ACCESS_TOKEN;
  const local = ['localhost', '127.0.0.1', '::1'].includes(hostname);
  if (!secret && !local) return { status: 403, message: 'Truy cập LAN cần cấu hình VUTRU_ACCESS_TOKEN.' };
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    let supplied = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (auth.startsWith('Basic ')) {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      supplied = decoded.slice(decoded.indexOf(':') + 1);
    }
    if (!equalSecret(supplied, secret)) return { status: 401, message: 'Cần đăng nhập để sử dụng studio.' };
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin && origin !== `${url.protocol}//${host}`) return { status: 403, message: 'Nguồn yêu cầu không được phép.' };
  if (request.headers.get('sec-fetch-site') === 'cross-site' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return { status: 403, message: 'Không chấp nhận thao tác từ trang khác.' };
  }
  return null;
}
