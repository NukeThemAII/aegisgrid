/**
 * Scanner target allowlist / verification logic.
 *
 * Extracted from the scanner API route so it can be tested in isolation.
 * Semantics match the original inline implementation exactly.
 */

/**
 * Normalize an allowlist entry to a comparable hostname string.
 *
 * - Full URLs are parsed to extract the hostname.
 * - Wildcard entries like `*.example.com` are kept as-is.
 * - All entries are lowercased, trimmed, and stripped of one trailing dot.
 */
export function normalizeAllowlistEntry(value: string): string {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('*.')) return trimmed;
  try {
    return new URL(trimmed).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return trimmed;
  }
}

/**
 * Normalize a submitted scan target to a comparable hostname string.
 *
 * Strips surrounding brackets (for IPv6 literals), leading/trailing whitespace,
 * converts to lowercase, and strips one trailing dot.
 */
export function normalizeTarget(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

/**
 * Check whether a submitted target is permitted by the given configuration.
 *
 * @param target - The raw user-submitted target string.
 * @param allowlist - Pre-normalized allowlist entries (output of `normalizeAllowlistEntry`
 *   for each raw env-var entry, with blanks already filtered out).
 * @param requireVerification - When false, all targets are allowed. When true (default),
 *   the target must match an allowlist entry. Mirrors SCANNER_REQUIRE_VERIFICATION.
 */
export function isAllowedTarget(
  target: string,
  allowlist: readonly string[],
  requireVerification: boolean,
): boolean {
  if (!requireVerification) return true;
  if (allowlist.length === 0) return false;

  const normalizedTarget = normalizeTarget(target);
  return allowlist.some(entry => {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // e.g. ".example.com"
      return normalizedTarget.endsWith(suffix) && normalizedTarget !== suffix.slice(1);
    }
    return normalizedTarget === entry;
  });
}

/**
 * Parse the SCANNER_ALLOWED_TARGETS env-var value into a normalized allowlist.
 */
export function parseAllowlist(raw: string): string[] {
  return raw
    .split(',')
    .map(normalizeAllowlistEntry)
    .filter(Boolean);
}

/**
 * Parse the SCANNER_REQUIRE_VERIFICATION env-var value.
 * Defaults to true unless the value is exactly 'false'.
 */
export function parseRequireVerification(raw: string | undefined): boolean {
  return raw !== 'false';
}
