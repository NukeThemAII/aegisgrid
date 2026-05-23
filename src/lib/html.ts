const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function e(value: unknown): string {
  return String(value ?? '').replace(HTML_ESCAPE_RE, char => HTML_ESCAPE_MAP[char] ?? char);
}

type HtmlFragment = { readonly __htmlFragment: string };

export function rawHtml(value: string): HtmlFragment {
  return { __htmlFragment: value };
}

function isHtmlFragment(value: unknown): value is HtmlFragment {
  return typeof value === 'object' && value !== null && '__htmlFragment' in value;
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let output = strings[0] ?? '';
  values.forEach((value, index) => {
    output += isHtmlFragment(value) ? value.__htmlFragment : e(value);
    output += strings[index + 1] ?? '';
  });
  return output;
}

export function safeExternalHref(value: unknown, fallback = '#'): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function safeCssColor(value: unknown, fallback = '#E8E6E0'): string {
  const raw = String(value ?? '').trim();
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?$/.test(raw)) return raw;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(raw)) return raw;
  return fallback;
}
