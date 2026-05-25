export type StripeProduct = 'pro_monthly' | 'pro_yearly' | 'report_pack';
export type CheckoutMode = 'subscription' | 'payment';

export interface StripeProductConfig {
  product: StripeProduct;
  priceId: string | null;
  mode: CheckoutMode;
  capability?: 'premium';
  credits?: number;
}

export interface CheckoutRequestInput {
  product: StripeProduct;
  successPath: string;
  cancelPath: string;
}

export type CheckoutRequestResult =
  | { ok: true; value: CheckoutRequestInput }
  | { ok: false; code: 'INVALID_JSON' | 'INVALID_PRODUCT' | 'INVALID_REDIRECT_PATH'; error: string };

const PRODUCTS = new Set<StripeProduct>(['pro_monthly', 'pro_yearly', 'report_pack']);
const DEFAULT_SUCCESS_PATH = '/?billing=success';
const DEFAULT_CANCEL_PATH = '/?billing=cancelled';

function positiveIntEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function stripeProductConfig(product: StripeProduct): StripeProductConfig {
  switch (product) {
    case 'pro_monthly':
      return {
        product,
        priceId: process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null,
        mode: 'subscription',
        capability: 'premium',
      };
    case 'pro_yearly':
      return {
        product,
        priceId: process.env.STRIPE_PRICE_PRO_YEARLY?.trim() || null,
        mode: 'subscription',
        capability: 'premium',
      };
    case 'report_pack':
      return {
        product,
        priceId: process.env.STRIPE_PRICE_REPORT_PACK?.trim() || null,
        mode: 'payment',
        credits: positiveIntEnv('STRIPE_REPORT_PACK_CREDITS', 10),
      };
  }
}

function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function parseProduct(value: unknown): StripeProduct | null {
  return typeof value === 'string' && PRODUCTS.has(value as StripeProduct) ? value as StripeProduct : null;
}

function isSafeLocalPath(value: string): boolean {
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  try {
    // Reject encoded network-path and path traversal-like control variants.
    const decoded = decodeURIComponent(value);
    return decoded.startsWith('/') && !decoded.startsWith('//') && !/[\r\n]/.test(decoded);
  } catch {
    return false;
  }
}

function localPath(input: unknown, fallback: string): string | null {
  if (input === undefined || input === null || input === '') return fallback;
  if (typeof input !== 'string') return null;
  return isSafeLocalPath(input) ? input : null;
}

export function parseCheckoutRequest(input: unknown): CheckoutRequestResult {
  if (!isObject(input)) {
    return { ok: false, code: 'INVALID_JSON', error: 'Request body must be a JSON object.' };
  }

  const product = parseProduct(input.product);
  if (!product) {
    return { ok: false, code: 'INVALID_PRODUCT', error: 'Unsupported checkout product.' };
  }

  const successPath = localPath(input.success_path ?? input.successPath, DEFAULT_SUCCESS_PATH);
  const cancelPath = localPath(input.cancel_path ?? input.cancelPath, DEFAULT_CANCEL_PATH);
  if (!successPath || !cancelPath) {
    return {
      ok: false,
      code: 'INVALID_REDIRECT_PATH',
      error: 'Redirect paths must be local absolute paths.',
    };
  }

  return { ok: true, value: { product, successPath, cancelPath } };
}

export function resolveAppUrl(req: Request): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return new URL(configured.endsWith('/') ? configured : `${configured}/`);
  }
  const requestUrl = new URL(req.url);
  return new URL(requestUrl.origin);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function isStripeCheckoutConfigured(product: StripeProduct): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim() && stripeProductConfig(product).priceId);
}

export function stripeLiveModeExpected(): boolean {
  return process.env.STRIPE_LIVE_MODE === 'true';
}
