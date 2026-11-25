import type { IncomingMessage, ServerResponse } from 'node:http';
import crypto from 'node:crypto';

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function timingSafeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    let body = req.body as { email?: string; password?: string } | undefined;
    if (!body || typeof body !== 'object') {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        if (totalBytes > 4096) {
          return sendJson(res, 413, { error: 'Payload too large' });
        }
        chunks.push(buf);
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? (JSON.parse(raw) as { email?: string; password?: string }) : {};
    }

    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    const adminEmail = (
      process.env.PLATFORM_ADMIN_EMAIL ||
      process.env.VITE_PLATFORM_ADMIN_EMAIL ||
      'admin@meftahmisr.com'
    )
      .trim()
      .toLowerCase();
    const adminPassword = (
      process.env.PLATFORM_ADMIN_PASSWORD ||
      process.env.VITE_PLATFORM_ADMIN_PASSWORD ||
      ''
    ).trim();

    if (!adminPassword) {
      return sendJson(res, 503, {
        ok: false,
        unconfigured: true,
        error: 'كلمة مرور الأدمن غير مضافة في متغيرات البيئة على Vercel (PLATFORM_ADMIN_PASSWORD).',
      });
    }

    if (!timingSafeMatch(email, adminEmail) || !timingSafeMatch(password, adminPassword)) {
      return sendJson(res, 401, {
        ok: false,
        error: '⛔ بيانات دخول مالك المنصة غير صحيحة!',
      });
    }

    return sendJson(res, 200, {
      ok: true,
      email: adminEmail,
    });
  } catch {
    return sendJson(res, 400, { ok: false, error: 'Invalid request' });
  }
}
