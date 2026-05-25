export type CommsSourceCategory = 'weather_radio' | 'public_sdr' | 'agency_briefing' | 'aviation_audio';

export interface CommsSource {
  id: string;
  name: string;
  category: CommsSourceCategory;
  region: string;
  country: string;
  url: string;
  source_url: string;
  embed_allowed: boolean;
  attribution: string;
  terms_note: string;
}

const COMMS_REGISTRY: CommsSource[] = [
  {
    id: 'noaa-weather-radio-directory',
    name: 'NOAA Weather Radio live stream directory',
    category: 'weather_radio',
    region: 'United States',
    country: 'US',
    url: 'https://www.weather.gov/nwr/',
    source_url: 'https://www.weather.gov/nwr/',
    embed_allowed: false,
    attribution: 'NOAA / National Weather Service',
    terms_note: 'Use as public weather-alert link-out metadata; do not rebroadcast streams without source-specific review.',
  },
  {
    id: 'websdr-twente',
    name: 'University of Twente WebSDR',
    category: 'public_sdr',
    region: 'Europe',
    country: 'NL',
    url: 'https://websdr.ewi.utwente.nl:8901/',
    source_url: 'https://websdr.ewi.utwente.nl:8901/',
    embed_allowed: false,
    attribution: 'University of Twente WebSDR',
    terms_note: 'External link only unless explicit embedding permission is confirmed; users must follow WebSDR terms.',
  },
  {
    id: 'liveatc-directory',
    name: 'LiveATC public airport audio directory',
    category: 'aviation_audio',
    region: 'Global',
    country: 'GLOBAL',
    url: 'https://www.liveatc.net/',
    source_url: 'https://www.liveatc.net/',
    embed_allowed: false,
    attribution: 'LiveATC.net',
    terms_note: 'Directory/link-out metadata only. Do not embed or rebroadcast aviation audio without explicit permission and jurisdiction review.',
  },
  {
    id: 'fema-youtube',
    name: 'FEMA public briefing channel',
    category: 'agency_briefing',
    region: 'United States',
    country: 'US',
    url: 'https://www.youtube.com/user/FEMA',
    source_url: 'https://www.youtube.com/user/FEMA',
    embed_allowed: true,
    attribution: 'FEMA public YouTube channel',
    terms_note: 'Public agency briefing metadata; use YouTube embed controls and preserve attribution.',
  },
];

export function listCommsSources(): CommsSource[] {
  return COMMS_REGISTRY.map((source) => ({ ...source }));
}
