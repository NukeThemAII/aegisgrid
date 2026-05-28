import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './route';

describe('GET /api/osint/dns', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockRequest(url: string, headers: Record<string, string> = {}) {
    return new Request(url, { headers: new Headers(headers) });
  }

  it('returns 400 when domain parameter is missing', async () => {
    const req = mockRequest('http://localhost/api/osint/dns');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing domain parameter' });
  });

  it('returns 400 for invalid domain format', async () => {
    const req = mockRequest('http://localhost/api/osint/dns?domain=invalid domain.com');
    const res = await GET(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid domain format' });
  });

  it('performs DNS lookups for multiple types', async () => {
    // Return empty arrays for most, but some records for A and MX
    vi.mocked(fetch).mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      let answers: Array<Record<string, unknown>> = [];
      if (urlStr.includes('type=A')) {
        answers = [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }];
      } else if (urlStr.includes('type=MX')) {
        answers = [{ name: 'example.com.', type: 15, TTL: 300, data: '10 mail.example.com.' }];
      }
      
      return new Response(JSON.stringify({
        Status: 0,
        TC: false,
        RD: true,
        RA: true,
        AD: true,
        CD: false,
        Question: [],
        Answer: answers,
      }));
    });

    const req = mockRequest('http://localhost/api/osint/dns?domain=example.com');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.domain).toBe('example.com');
    expect(data.records.A).toHaveLength(1);
    expect(data.records.A[0].data).toBe('93.184.216.34');
    expect(data.records.MX).toHaveLength(1);
    
    expect(data.summary.ip_addresses).toContain('93.184.216.34');
    expect(data.summary.mail_servers).toContain('10 mail.example.com.');
    
    // We expect fetch to have been called 7 times for 7 record types
    expect(fetch).toHaveBeenCalledTimes(7);
  });

  it('handles upstream failures without crashing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('DNS Timeout'));

    const req = mockRequest('http://localhost/api/osint/dns?domain=example.com');
    const res = await GET(req);
    
    expect(res.status).toBe(200);
    const data = await res.json();
    
    // All lookups failed, should just return empty records
    expect(data.domain).toBe('example.com');
    expect(data.summary.total_records).toBe(0);
  });
});
