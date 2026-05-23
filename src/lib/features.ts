export const FEATURES = {
  aiReports: process.env.FEATURE_AI_REPORTS === 'true',
  x402: process.env.X402_ENABLED === 'true' || process.env.FEATURE_X402 === 'true',
  scanner: Boolean(process.env.SCANNER_URL && process.env.SCANNER_KEY),
  comms: process.env.FEATURE_COMMS === 'true',
  premium: process.env.FEATURE_PREMIUM === 'true',
} as const;

export type FeatureKey = keyof typeof FEATURES;
