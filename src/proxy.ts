import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 100;

const CSRF_EXEMPT_PREFIXES = ['/api/billing/webhook', '/api/x402/report', '/api/x402/enrich', '/api/auth'];
function isCsrfExempt(p: string) { return CSRF_EXEMPT_PREFIXES.some(x => p.startsWith(x)); }

function validateCsrf(req: NextRequest): { allowed: boolean; reason?: string } {
  const m = req.method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return { allowed: true };
  const origin = req.headers.get('origin'), referer = req.headers.get('referer');
  const allowed = [process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000','http://94.16.122.69:3004','http://94.16.122.69:3000','http://94.16.122.69:17492','https://cipherops.shop:3443','https://cipherops.shop'];
  const chk = (v: string|null) => { if(!v) return false; try { const u=new URL(v); const b=`${u.protocol}//${u.hostname}${u.port?':'+u.port:''}`; return allowed.some(a=>{try{const au=new URL(a);return`${au.protocol}//${au.hostname}${au.port?':'+au.port:''}`===b}catch{return false}})} catch {return false} };
  if (chk(origin)) return { allowed: true };
  if (chk(referer)) return { allowed: true };
  const h = req.headers.get('host');
  if (h && (origin||referer)) { try { if (new URL(origin||referer||'').hostname===h.split(':')[0]) return {allowed:true} } catch {} }
  const ct = req.headers.get('content-type')||'';
  if (!origin && !referer && ct.includes('application/json')) return { allowed: true };
  return { allowed: false, reason: 'CSRF validation failed.' };
}

function applySecurityHeaders(res: NextResponse, req: NextRequest) {
  res.headers.set('X-Content-Type-Options','nosniff');
  res.headers.set('X-Frame-Options','DENY');
  res.headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(self)');
  res.headers.set('X-DNS-Prefetch-Control','off');
  const host = req.headers.get('host')??'';
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1'))
    res.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
}

const LANDING = `<!DOCTYPE html><html><head><title>AegisGrid</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a14;color:#d4af37;font-family:monospace;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{border:1px solid rgba(212,175,55,0.3);border-radius:12px;padding:40px;text-align:center;max-width:400px;background:rgba(212,175,55,0.03)}
h1{font-size:20px;letter-spacing:0.3em;margin-bottom:16px}p{font-size:11px;color:#888;margin-bottom:20px;line-height:1.6}
input{width:100%;background:#111;border:1px solid rgba(212,175,55,0.3);color:#d4af37;padding:10px;border-radius:6px;font-family:monospace;text-align:center;font-size:14px;margin-bottom:12px}
input:focus{outline:none;border-color:#d4af37}button{width:100%;background:rgba(212,175,55,0.15);color:#d4af37;border:1px solid rgba(212,175,55,0.3);padding:10px;border-radius:6px;font-family:monospace;font-size:12px;cursor:pointer;letter-spacing:0.2em}
button:hover{background:rgba(212,175,55,0.25)}</style></head><body><div class="box"><h1>AEGISGRID</h1><p>Development mode — access restricted.</p><form method="GET"><input type="password" name="pw" placeholder="Access password" autofocus><button type="submit">ENTER</button></form></div></body></html>`;

export function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith('/api');
  const isStatic = request.nextUrl.pathname.startsWith('/_next') || request.nextUrl.pathname.startsWith('/favicon');

  const pw = process.env.APP_ACCESS_PASSWORD?.trim();
  if (pw && !isApi && !isStatic) {
    const hasPw = request.nextUrl.searchParams.get('pw') === pw;
    const hasCookie = request.cookies.get('aegisgrid_access')?.value === pw;
    if (!hasPw && !hasCookie) {
      return new NextResponse(LANDING, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (hasPw && !hasCookie) {
      const r = NextResponse.next();
      r.cookies.set('aegisgrid_access', pw, { path: '/', maxAge: 86400, httpOnly: true });
      applySecurityHeaders(r, request);
      return r;
    }
  }

  if (!isApi) { const r = NextResponse.next(); applySecurityHeaders(r, request); return r; }

  if (!isCsrfExempt(request.nextUrl.pathname)) {
    const csrf = validateCsrf(request);
    if (!csrf.allowed) {
      const r = new NextResponse(JSON.stringify({ error: 'csrf_validation_failed', message: csrf.reason }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      applySecurityHeaders(r, request);
      return r;
    }
  }

  const fwd = request.headers.get('x-forwarded-for');
  const rip = request.headers.get('x-real-ip')?.trim();
  const ip = rip || (fwd ? fwd.split(',')[0].trim() : 'unknown');
  const now = Date.now();
  let ld = rateLimitMap.get(ip);
  if (ld && now > ld.resetTime) ld = undefined;
  if (!ld) { ld = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS }; rateLimitMap.set(ip, ld); }
  else ld.count++;
  if (Math.random() < 0.01) for (const [k,v] of rateLimitMap) if (now > v.resetTime) rateLimitMap.delete(k);

  if (ld.count > MAX_REQUESTS_PER_WINDOW) {
    const r = new NextResponse(JSON.stringify({ error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((ld.resetTime-now)/1000)) } });
    applySecurityHeaders(r, request);
    return r;
  }

  const r = NextResponse.next();
  r.headers.set('X-RateLimit-Limit', String(MAX_REQUESTS_PER_WINDOW));
  r.headers.set('X-RateLimit-Remaining', String(Math.max(0, MAX_REQUESTS_PER_WINDOW-ld.count)));
  applySecurityHeaders(r, request);
  return r;
}

export const config = { matcher: '/api/:path*' };
