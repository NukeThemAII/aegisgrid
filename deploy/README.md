# AegisGrid V2 — VPS Deployment Guide

## Prerequisites

- Ubuntu 22.04+ VPS with root or sudo access
- Node 20, npm (for systemd approach) or Docker + Docker Compose
- A domain pointed at the VPS IP (for TLS)

## Quick path — systemd on existing VPS

You already have the repo cloned at `/home/xaos/aegisgrid`.

### 1. Install dependencies and build

```bash
cd /home/xaos/aegisgrid
npm install
cp .env.example .env.local
# Edit .env.local: set at least:
#   NEXT_PUBLIC_APP_URL=http://localhost:3000
#   DATABASE_URL=postgresql://aegisgrid:PASS@localhost:5432/aegisgrid
#   (all other keys optional for public-only use)
npm run build
```

### 2. Install systemd unit

```bash
sudo cp deploy/aegisgrid.service /etc/systemd/system/
# Edit the unit to match your paths/user:
#   sudoedit /etc/systemd/system/aegisgrid.service
sudo systemctl daemon-reload
sudo systemctl enable --now aegisgrid
sudo systemctl status aegisgrid
```

### 3. Install nginx

```bash
sudo apt update && sudo apt install -y nginx
sudo cp deploy/nginx-aegisgrid.conf /etc/nginx/sites-available/aegisgrid
sudo ln -sf /etc/nginx/sites-available/aegisgrid /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Get TLS certificate

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example
# Follow prompts, choose redirect HTTP→HTTPS
```

### 5. Verify

```bash
curl -I http://localhost:3000/api/health
curl -I https://your-domain.example/api/health
```

Open `https://your-domain.example` in your browser.

## Docker Compose path

```bash
cd /home/xaos/aegisgrid
cp .env.example .env.local   # edit values
docker compose up -d
docker compose logs -f aegisgrid
```

Then set up nginx + TLS as above, proxying to `127.0.0.1:3000`.

## Troubleshooting

```bash
# App logs
journalctl -u aegisgrid -f          # systemd
docker compose logs -f aegisgrid    # docker

# Check health
curl http://localhost:3000/api/health

# Check nginx
sudo nginx -t
sudo journalctl -u nginx -f
```
