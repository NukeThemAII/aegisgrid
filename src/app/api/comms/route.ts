import { NextResponse } from 'next/server';
import { listCommsSources } from '@/lib/adapters/comms';

function sourceMeta() {
  return {
    source: 'AegisGrid comms source registry',
    source_url: 'docs/sources.md',
    fetched_at: new Date().toISOString(),
    license: 'source-specific',
    attribution: 'Curated public-source metadata. Comms feature flag controls exposure; restricted/tactical feeds are excluded.',
    confidence: 'medium',
  };
}

export async function GET() {
  const enabled = process.env.FEATURE_COMMS === 'true';

  return NextResponse.json({
    status: enabled ? 'ok' : 'disabled',
    message: enabled
      ? 'Public comms registry enabled. Respect source terms and embed_allowed flags.'
      : 'Comms registry disabled by feature flag; returning no sources.',
    sources: enabled ? listCommsSources() : [],
    source: {
      ...sourceMeta(),
      ...(!enabled ? { attribution: 'Comms registry withheld until FEATURE_COMMS=true feature flag is enabled.' } : {}),
    },
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}
