# AegisGrid source register

This is the initial V2 foundation source register. Each production adapter should keep source URL, attribution, license/terms notes, update frequency, key requirements, and confidence metadata in code and documentation.

| Layer / feature | Current source | Source URL | Key requirement | Update cadence | License / terms note | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Earthquakes | USGS earthquake feeds plus regional fallbacks where configured | https://earthquake.usgs.gov/ | none | minutes | Public USGS data; preserve attribution | active |
| Severe weather | NASA EONET | https://eonet.gsfc.nasa.gov/api/v3/events | none | minutes-hours | NASA open data; preserve attribution | active |
| Fires | NASA FIRMS open CSV plus NASA EONET volcano fallback | https://firms.modaps.eosdis.nasa.gov/ | optional `NASA_FIRMS_MAP_KEY` for future keyed endpoints | hours | NASA FIRMS terms apply; preserve attribution | active |
| Space weather | NOAA SWPC | https://www.swpc.noaa.gov/ | none | minutes-hours | NOAA public data; preserve attribution | active |
| Satellites | CelesTrak/N2YO link-outs depending on route implementation | https://celestrak.org/ and https://www.n2yo.com/ | optional `N2YO_API_KEY` for future keyed API use | minutes-hours | Verify endpoint terms before expanding ingestion | active / partial |
| Flights | ADS-B/OpenSky-style public feeds as implemented in route | route implementation | optional `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` for future OpenSky OAuth | minutes | Source-specific terms must be reviewed before production use | active / review needed |
| CCTV | Public transport/road cameras and curated public webcams | route implementation | optional `IPCAMLIVE_API_SECRET` for IPCamLive helper | minutes-hours | Embed/link only when source terms allow; preserve source names | active / review needed |
| Live news | Curated public broadcaster links and YouTube embeds | route implementation | none | static/periodic | Embed only where allowed; otherwise use external-link cards | active |
| GDELT/global incidents | GDELT/RSS fallback mapping | https://www.gdeltproject.org/ | none | minutes-hours | GDELT terms and source article attribution apply | active / fallback |
| Markets | Public market/crypto endpoints in route implementation | route implementation | none | minutes-hours | Verify API terms and rate limits before production scaling | active / review needed |
| Maritime | Static ports/chokepoints and optional future AIS | static dataset / https://aisstream.io/ | optional `AISSTREAM_API_KEY` | static/minutes if AIS enabled | Link out or ingest only where terms allow | static / partial |
| Infrastructure | Curated/static nuclear and critical infrastructure dataset | static route data | none | manual | Treat as contextual open-source reference, not live telemetry | static |
| Country risk / region dossier | Public country and encyclopedia APIs where implemented | route implementation | none | on demand | Preserve source attribution and avoid private personal data | active |
| Passive cyber OSINT | DNS, RDAP/WHOIS, CT, MITRE CVE, CIRCL fallback, OTX public feeds, Shodan InternetDB for sweep | route implementation | optional `OTX_API_KEY`, `SHODAN_API_KEY`, etc. for future enrichment | on demand | Passive lookup only for anonymous users | active / partial |
| Scanner proxy | Separate scanner backend only | `SCANNER_URL` | `SCANNER_URL` and `SCANNER_KEY` | on demand | Active scans require authorization/ownership verification; route returns 503 when unconfigured | guarded |
| Balloons/radiosondes | TBD | TBD | TBD | TBD | Source/licensing review required before real adapter | placeholder returns empty |
| Radiation | TBD (Safecast/EU public networks under review) | TBD | TBD | TBD | Source/licensing review required before real adapter | placeholder returns empty |

Notes:
- Placeholder routes intentionally return empty normalized responses with `status: source_unavailable` instead of fake telemetry.
- Any simulated UI metric must be labeled as demo-only until wired to real backend telemetry.
- Do not scrape or embed sources that prohibit automated collection or third-party embedding.
