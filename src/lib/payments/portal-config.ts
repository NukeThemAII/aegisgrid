export function isStripeConfiguredForPortal(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function isSafeLocalPath(value: string): boolean {
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith('/') && !decoded.startsWith('//') && !/[\r\n]/.test(decoded);
  } catch {
    return false;
  }
}

export function portalReturnPath(input: unknown): string | null {
  if (!isObject(input) || input.return_path === undefined || input.return_path === null || input.return_path === '') {
    return '/';
  }
  return typeof input.return_path === 'string' && isSafeLocalPath(input.return_path) ? input.return_path : null;
}
