/**
 * AEGISGRID — Structured Logger (pino)
 *
 * Singleton pino logger with AegisGrid branding and request-context support.
 * All server-side code should use this instead of console.log/error.
 *
 * In development: pretty-printed with timestamps.
 * In production: JSON lines for log aggregation (CloudWatch, Datadog, etc.).
 */

import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  name: 'aegisgrid',
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
            messageFormat: '[{name}] {msg}',
          },
        },
      }),
});

/**
 * Create a child logger with request context (route, method, client IP).
 */
export function requestLogger(req: {
  url?: string;
  method?: string;
  headers?: { get(name: string): string | null };
}) {
  const url = req.url || 'unknown';
  const method = req.method || 'UNKNOWN';
  const clientIp = req.headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers?.get('x-real-ip')
    || 'unknown';

  return logger.child({
    route: new URL(url, 'http://localhost').pathname,
    method,
    ip: clientIp,
  });
}
