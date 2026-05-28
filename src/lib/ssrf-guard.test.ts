import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseIPv4, validateHost, isRateLimited, getClientIp } from './ssrf-guard';

// ---------------------------------------------------------------------------
// parseIPv4
// ---------------------------------------------------------------------------

describe('parseIPv4', () => {
  it('accepts canonical dotted-quad addresses', () => {
    expect(parseIPv4('192.168.1.1')).toBe('192.168.1.1');
    expect(parseIPv4('0.0.0.0')).toBe('0.0.0.0');
    expect(parseIPv4('255.255.255.255')).toBe('255.255.255.255');
    expect(parseIPv4('1.2.3.4')).toBe('1.2.3.4');
    expect(parseIPv4('10.0.0.1')).toBe('10.0.0.1');
  });

  it('rejects octets greater than 255', () => {
    expect(parseIPv4('256.1.1.1')).toBeNull();
    expect(parseIPv4('1.999.1.1')).toBeNull();
    expect(parseIPv4('1.1.1.256')).toBeNull();
    expect(parseIPv4('999.999.999.999')).toBeNull();
  });

  it('rejects decimal integer (non-canonical) forms', () => {
    // 2130706433 = 127.0.0.1 in decimal
    expect(parseIPv4('2130706433')).toBeNull();
    expect(parseIPv4('0')).toBeNull();
    expect(parseIPv4('1')).toBeNull();
  });

  it('rejects hex integer forms', () => {
    expect(parseIPv4('0x7f000001')).toBeNull();
    expect(parseIPv4('0xDEADBEEF')).toBeNull();
  });

  it('rejects octal notation', () => {
    // 0177.0.0.1 is 127.0.0.1 in mixed octal
    expect(parseIPv4('0177.0.0.1')).toBeNull();
    // Short forms
    expect(parseIPv4('127.1')).toBeNull();
    expect(parseIPv4('10.1')).toBeNull();
  });

  it('rejects IPv6 addresses', () => {
    expect(parseIPv4('::1')).toBeNull();
    expect(parseIPv4('::ffff:127.0.0.1')).toBeNull();
    expect(parseIPv4('2001:db8::1')).toBeNull();
  });

  it('rejects hostnames', () => {
    expect(parseIPv4('example.com')).toBeNull();
    expect(parseIPv4('localhost')).toBeNull();
  });

  it('rejects empty / whitespace', () => {
    expect(parseIPv4('')).toBeNull();
    expect(parseIPv4('  ')).toBeNull();
  });

  it('rejects negative octets', () => {
    expect(parseIPv4('-1.0.0.0')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// validateHost — IPv4 literal tests
// ---------------------------------------------------------------------------

describe('validateHost — IPv4 literals', () => {
  it('accepts a public IPv4 address', async () => {
    const result = await validateHost('8.8.8.8');
    expect(result.ok).toBe(true);
    expect(result.resolved).toContain('8.8.8.8');
  });

  it('rejects loopback 127.0.0.1', async () => {
    const result = await validateHost('127.0.0.1');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('reserved');
  });

  it('rejects loopback 127.x.y.z variants', async () => {
    expect((await validateHost('127.0.0.2')).ok).toBe(false);
    expect((await validateHost('127.255.255.255')).ok).toBe(false);
  });

  it('rejects RFC1918 10.x.x.x', async () => {
    expect((await validateHost('10.0.0.1')).ok).toBe(false);
    expect((await validateHost('10.255.255.255')).ok).toBe(false);
  });

  it('rejects RFC1918 172.16.x.x through 172.31.x.x', async () => {
    expect((await validateHost('172.16.0.1')).ok).toBe(false);
    expect((await validateHost('172.31.255.255')).ok).toBe(false);
    // 172.32 should be allowed (outside /12 block)
    expect((await validateHost('172.32.0.1')).ok).toBe(true);
  });

  it('rejects RFC1918 192.168.x.x', async () => {
    expect((await validateHost('192.168.0.1')).ok).toBe(false);
    expect((await validateHost('192.168.255.255')).ok).toBe(false);
  });

  it('rejects cloud metadata 169.254.169.254', async () => {
    const result = await validateHost('169.254.169.254');
    expect(result.ok).toBe(false);
  });

  it('rejects link-local range 169.254.x.x', async () => {
    expect((await validateHost('169.254.0.1')).ok).toBe(false);
    expect((await validateHost('169.254.255.255')).ok).toBe(false);
  });

  it('rejects CGNAT 100.64.x.x', async () => {
    expect((await validateHost('100.64.0.1')).ok).toBe(false);
    expect((await validateHost('100.127.255.255')).ok).toBe(false);
  });

  it('rejects "this" network 0.0.0.0/8', async () => {
    expect((await validateHost('0.0.0.0')).ok).toBe(false);
    expect((await validateHost('0.0.0.1')).ok).toBe(false);
  });

  it('rejects multicast 224.0.0.0/4', async () => {
    expect((await validateHost('224.0.0.1')).ok).toBe(false);
    expect((await validateHost('239.255.255.255')).ok).toBe(false);
  });

  it('rejects reserved 240.0.0.0/4', async () => {
    expect((await validateHost('240.0.0.1')).ok).toBe(false);
    expect((await validateHost('255.255.255.255')).ok).toBe(false);
  });

  it('rejects TEST-NET ranges', async () => {
    expect((await validateHost('192.0.2.1')).ok).toBe(false);   // TEST-NET-1
    expect((await validateHost('198.51.100.1')).ok).toBe(false); // TEST-NET-2
    expect((await validateHost('203.0.113.1')).ok).toBe(false);  // TEST-NET-3
  });

  it('rejects benchmarking range 198.18.0.0/15', async () => {
    expect((await validateHost('198.18.0.1')).ok).toBe(false);
    expect((await validateHost('198.19.255.255')).ok).toBe(false);
    // 198.20 should be allowed
    expect((await validateHost('198.20.0.1')).ok).toBe(true);
  });

  it('rejects IETF protocol assignments 192.0.0.0/24', async () => {
    expect((await validateHost('192.0.0.1')).ok).toBe(false);
    expect((await validateHost('192.0.0.255')).ok).toBe(false);
  });

  it('accepts public IPs outside reserved ranges', async () => {
    expect((await validateHost('1.1.1.1')).ok).toBe(true);
    expect((await validateHost('93.184.216.34')).ok).toBe(true);
    expect((await validateHost('198.20.0.1')).ok).toBe(true);
  });

  it('rejects non-canonical IPv4 forms', async () => {
    // These should be caught by parseIPv4 returning null
    // But isIP from node:net may or may not recognize them;
    // The guard should still reject via the hostname path
    const result = await validateHost('0x7f.0.0.1');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateHost — IPv6 literal tests
// ---------------------------------------------------------------------------

describe('validateHost — IPv6 literals', () => {
  it('rejects loopback ::1', async () => {
    const result = await validateHost('::1');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('reserved');
  });

  it('rejects unspecified ::', async () => {
    expect((await validateHost('::')).ok).toBe(false);
  });

  it('rejects IPv4-mapped IPv6 ::ffff:127.0.0.1', async () => {
    expect((await validateHost('::ffff:127.0.0.1')).ok).toBe(false);
  });

  it('rejects unique-local fc00::/fd00::', async () => {
    expect((await validateHost('fc00::1')).ok).toBe(false);
    expect((await validateHost('fd12:3456::1')).ok).toBe(false);
  });

  it('rejects link-local fe80::', async () => {
    expect((await validateHost('fe80::1')).ok).toBe(false);
  });

  it('rejects documentation 2001:db8::', async () => {
    expect((await validateHost('2001:db8::1')).ok).toBe(false);
  });

  it('rejects multicast ff00::', async () => {
    expect((await validateHost('ff02::1')).ok).toBe(false);
  });

  it('rejects bracketed IPv6 literals', async () => {
    expect((await validateHost('[::1]')).ok).toBe(false);
    expect((await validateHost('[fe80::1]')).ok).toBe(false);
  });

  it('accepts public IPv6 address', async () => {
    // Google public DNS IPv6
    const result = await validateHost('2001:4860:4860::8888');
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateHost — hostname tests
// ---------------------------------------------------------------------------

describe('validateHost — hostnames', () => {
  it('rejects "localhost"', async () => {
    const result = await validateHost('localhost');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('reserved name');
  });

  it('rejects *.localhost', async () => {
    expect((await validateHost('test.localhost')).ok).toBe(false);
    expect((await validateHost('foo.bar.localhost')).ok).toBe(false);
  });

  it('rejects host.docker.internal', async () => {
    expect((await validateHost('host.docker.internal')).ok).toBe(false);
  });

  it('rejects *.local hostnames', async () => {
    expect((await validateHost('myhost.local')).ok).toBe(false);
  });

  it('rejects *.internal hostnames', async () => {
    expect((await validateHost('metadata.google.internal')).ok).toBe(false);
    expect((await validateHost('some-service.internal')).ok).toBe(false);
  });

  it('rejects empty host', async () => {
    expect((await validateHost('')).ok).toBe(false);
    expect((await validateHost('  ')).ok).toBe(false);
  });

  it('rejects invalid hostname syntax', async () => {
    expect((await validateHost('hello world')).ok).toBe(false);
    expect((await validateHost('example.com/path')).ok).toBe(false);
    expect((await validateHost('user@host')).ok).toBe(false);
    expect((await validateHost('.leading-dot')).ok).toBe(false);
  });

  it('accepts well-formed public hostnames (if DNS resolves)', async () => {
    // This test depends on DNS — mock if flaky in CI
    const result = await validateHost('example.com');
    // example.com is a real IANA domain that should resolve to a public IP
    expect(result.ok).toBe(true);
    expect(result.resolved).toBeDefined();
    expect(result.resolved!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// isRateLimited
// ---------------------------------------------------------------------------

describe('isRateLimited', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first request', () => {
    // Use a unique IP for each test to avoid state leakage
    expect(isRateLimited('test-first-1.1.1.1', 5, 60_000)).toBe(false);
  });

  it('allows requests up to the limit', () => {
    const ip = 'test-limit-2.2.2.2';
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip, 5, 60_000)).toBe(false);
    }
  });

  it('blocks requests exceeding the limit', () => {
    const ip = 'test-block-3.3.3.3';
    for (let i = 0; i < 5; i++) {
      isRateLimited(ip, 5, 60_000);
    }
    // 6th request should be blocked
    expect(isRateLimited(ip, 5, 60_000)).toBe(true);
  });

  it('resets after the time window expires', () => {
    const ip = 'test-reset-4.4.4.4';
    for (let i = 0; i < 5; i++) {
      isRateLimited(ip, 5, 60_000);
    }
    expect(isRateLimited(ip, 5, 60_000)).toBe(true);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again
    expect(isRateLimited(ip, 5, 60_000)).toBe(false);
  });

  it('tracks different IPs independently', () => {
    const ipA = 'test-indep-a-5.5.5.5';
    const ipB = 'test-indep-b-6.6.6.6';

    for (let i = 0; i < 5; i++) {
      isRateLimited(ipA, 5, 60_000);
    }
    expect(isRateLimited(ipA, 5, 60_000)).toBe(true);
    // ipB should still be allowed
    expect(isRateLimited(ipB, 5, 60_000)).toBe(false);
  });

  it('respects custom window size', () => {
    const ip = 'test-window-7.7.7.7';
    for (let i = 0; i < 3; i++) {
      isRateLimited(ip, 3, 10_000);
    }
    expect(isRateLimited(ip, 3, 10_000)).toBe(true);

    vi.advanceTimersByTime(11_000);
    expect(isRateLimited(ip, 3, 10_000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getClientIp
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  function makeRequest(headers: Record<string, string>): Request {
    return {
      headers: new Headers(headers),
    } as unknown as Request;
  }

  it('extracts IP from x-forwarded-for (first entry)', () => {
    const req = makeRequest({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });

  it('extracts IP from x-forwarded-for (single entry)', () => {
    const req = makeRequest({ 'x-forwarded-for': '10.20.30.40' });
    expect(getClientIp(req)).toBe('10.20.30.40');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = makeRequest({ 'x-real-ip': '99.99.99.99' });
    expect(getClientIp(req)).toBe('99.99.99.99');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const req = makeRequest({
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
    });
    expect(getClientIp(req)).toBe('1.1.1.1');
  });

  it('returns "unknown" when no IP headers are present', () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe('unknown');
  });

  it('trims whitespace from x-forwarded-for entries', () => {
    const req = makeRequest({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' });
    expect(getClientIp(req)).toBe('1.2.3.4');
  });
});
