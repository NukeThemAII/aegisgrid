import { describe, it, expect } from 'vitest';
import { e, html, rawHtml, safeExternalHref, safeCssColor } from './html';

// ── e() — HTML entity escaping ──────────────────────────────────────

describe('e', () => {
  it('escapes &', () => {
    expect(e('a&b')).toBe('a&amp;b');
  });

  it('escapes <', () => {
    expect(e('a<b')).toBe('a&lt;b');
  });

  it('escapes >', () => {
    expect(e('a>b')).toBe('a&gt;b');
  });

  it('escapes double quotes', () => {
    expect(e('a"b')).toBe('a&quot;b');
  });

  it("escapes single quotes", () => {
    expect(e("a'b")).toBe('a&#39;b');
  });

  it('escapes all special characters together', () => {
    expect(e('<script>"alert(\'xss\')&"</script>')).toBe(
      '&lt;script&gt;&quot;alert(&#39;xss&#39;)&amp;&quot;&lt;/script&gt;',
    );
  });

  it('coerces null/undefined to empty string', () => {
    expect(e(null)).toBe('');
    expect(e(undefined)).toBe('');
  });

  it('coerces numbers to string', () => {
    expect(e(42)).toBe('42');
  });

  it('returns safe strings unchanged', () => {
    expect(e('hello world')).toBe('hello world');
  });
});

// ── html tagged template ────────────────────────────────────────────

describe('html tagged template', () => {
  it('escapes interpolated values', () => {
    const user = '<b>evil</b>';
    expect(html`<p>${user}</p>`).toBe('<p>&lt;b&gt;evil&lt;/b&gt;</p>');
  });

  it('does not escape string parts', () => {
    expect(html`<div class="safe"></div>`).toBe('<div class="safe"></div>');
  });

  it('handles multiple interpolations', () => {
    const a = '&';
    const b = '<';
    expect(html`${a}|${b}`).toBe('&amp;|&lt;');
  });
});

// ── rawHtml ─────────────────────────────────────────────────────────

describe('rawHtml', () => {
  it('bypasses escaping when used in html template', () => {
    const fragment = rawHtml('<strong>bold</strong>');
    expect(html`<p>${fragment}</p>`).toBe('<p><strong>bold</strong></p>');
  });

  it('stores the raw string in the branded fragment object', () => {
    const fragment = rawHtml('<em>hi</em>');
    expect(fragment).toEqual({ __htmlFragment: '<em>hi</em>' });
  });
});

// ── safeExternalHref ────────────────────────────────────────────────

describe('safeExternalHref', () => {
  it('allows http URLs', () => {
    expect(safeExternalHref('http://example.com')).toBe('http://example.com/');
  });

  it('allows https URLs', () => {
    expect(safeExternalHref('https://example.com/path?q=1')).toBe(
      'https://example.com/path?q=1',
    );
  });

  it('rejects javascript: protocol', () => {
    expect(safeExternalHref('javascript:alert(1)')).toBe('#');
  });

  it('rejects data: protocol', () => {
    expect(safeExternalHref('data:text/html,<h1>xss</h1>')).toBe('#');
  });

  it('rejects invalid/unknown protocols', () => {
    expect(safeExternalHref('ftp://files.example.com')).toBe('#');
  });

  it('returns fallback for empty/null/undefined', () => {
    expect(safeExternalHref('')).toBe('#');
    expect(safeExternalHref(null)).toBe('#');
    expect(safeExternalHref(undefined)).toBe('#');
  });

  it('returns custom fallback', () => {
    expect(safeExternalHref('javascript:void(0)', '/safe')).toBe('/safe');
  });

  it('rejects bare strings that are not valid URLs', () => {
    expect(safeExternalHref('not-a-url')).toBe('#');
  });
});

// ── safeCssColor ────────────────────────────────────────────────────

describe('safeCssColor', () => {
  it('allows #rgb shorthand', () => {
    expect(safeCssColor('#abc')).toBe('#abc');
  });

  it('allows #rrggbb', () => {
    expect(safeCssColor('#aabbcc')).toBe('#aabbcc');
  });

  it('allows #rrggbbaa', () => {
    expect(safeCssColor('#aabbccdd')).toBe('#aabbccdd');
  });

  it('allows rgb()', () => {
    expect(safeCssColor('rgb(10, 20, 30)')).toBe('rgb(10, 20, 30)');
  });

  it('allows rgba()', () => {
    expect(safeCssColor('rgba(10, 20, 30, 0.5)')).toBe('rgba(10, 20, 30, 0.5)');
  });

  it('rejects arbitrary CSS strings', () => {
    expect(safeCssColor('expression(alert(1))')).toBe('#E8E6E0');
  });

  it('rejects url() values', () => {
    expect(safeCssColor('url(evil.png)')).toBe('#E8E6E0');
  });

  it('rejects plain words', () => {
    expect(safeCssColor('red')).toBe('#E8E6E0');
  });

  it('returns custom fallback', () => {
    expect(safeCssColor('invalid', '#000')).toBe('#000');
  });

  it('returns fallback for null/undefined/empty', () => {
    expect(safeCssColor(null)).toBe('#E8E6E0');
    expect(safeCssColor(undefined)).toBe('#E8E6E0');
    expect(safeCssColor('')).toBe('#E8E6E0');
  });
});
