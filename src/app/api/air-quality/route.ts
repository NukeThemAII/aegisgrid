import { NextResponse } from 'next/server';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * AEGISGRID — Air Quality Monitoring API
 * Fetches real-time global air quality data from OpenAQ
 * FREE — No API key required
 * Data: PM2.5, PM10, O3, NO2, SO2, CO measurements worldwide
 */

interface OpenAqMeasurement {
  parameter: string;
  value: number;
  unit: string;
  lastUpdated: string;
}

interface AirQualityStation {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  pm25: number;
  unit: string;
  level: string;
  color: string;
  lastUpdated: string;
}

export async function GET(request: Request) {
  const rateLimitResponse = enforceRateLimit(RATE_LIMITS['air-quality'], request);
  if (rateLimitResponse) return rateLimitResponse;
  try {
    // OpenAQ v2 — get latest measurements globally
    // We request PM2.5 (most health-relevant) with coordinates
    const urls = [
      'https://api.openaq.org/v2/latest?limit=500&parameter=pm25&order_by=lastUpdated&sort=desc',
    ];

    const results = await Promise.allSettled(
      urls.map(url =>
        fetch(url, {
          signal: AbortSignal.timeout(10000),
          headers: { 'Accept': 'application/json' },
        }).then(r => r.json())
      )
    );

    const stations: AirQualityStation[] = [];
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const data = result.value;
      for (const loc of data.results || []) {
        if (!loc.coordinates?.latitude || !loc.coordinates?.longitude) continue;
        const pm25 = loc.measurements?.find((m: OpenAqMeasurement) => m.parameter === 'pm25');
        if (!pm25) continue;

        // AQI color coding based on PM2.5 (WHO/EPA scale)
        const val = pm25.value;
        let level = 'Good';
        let color = '#00E676';
        if (val > 150) { level = 'Hazardous'; color = '#8B0000'; }
        else if (val > 100) { level = 'Unhealthy'; color = '#FF1744'; }
        else if (val > 55) { level = 'Unhealthy (Sensitive)'; color = '#FF9500'; }
        else if (val > 35) { level = 'Moderate'; color = '#FFD700'; }

        stations.push({
          id: `aq-${loc.location}`,
          name: loc.location,
          city: loc.city || 'Unknown',
          country: loc.country,
          lat: loc.coordinates.latitude,
          lng: loc.coordinates.longitude,
          pm25: val,
          unit: pm25.unit,
          level,
          color,
          lastUpdated: pm25.lastUpdated,
        });
      }
    }

    return NextResponse.json({
      stations,
      total: stations.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Air Quality API error:', error);
    return NextResponse.json({ stations: [], error: 'Failed to fetch air quality data' }, { status: 500 });
  }
}
