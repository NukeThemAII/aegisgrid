import type { NextConfig } from "next";

import path from 'path';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['react-map-gl', 'mapbox-gl', 'maplibre-gl'],
  turbopack: {
    root: path.resolve(__dirname),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
