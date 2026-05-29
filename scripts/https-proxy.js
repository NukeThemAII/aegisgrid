/**
 * AEGISGRID — HTTPS Proxy Server
 *
 * Simple Node.js HTTPS → HTTP proxy using the existing Let's Encrypt cert.
 * Listens on port 3443, proxies to the Next.js app on port 3004.
 * Starts automatically when the VPS boots via systemd.
 */

const https = require('node:https');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CERT_DIR = '/home/xaos/aegisgrid/certs';
const PROXY_PORT = 3443;
const TARGET_PORT = 3004;

const options = {
  cert: fs.readFileSync(path.join(CERT_DIR, 'fullchain.pem')),
  key: fs.readFileSync(path.join(CERT_DIR, 'privkey.pem')),
};

const server = https.createServer(options, (req, res) => {
  const targetUrl = new URL(req.url, `http://localhost:${TARGET_PORT}`);

  const proxyReq = http.request({
    hostname: 'localhost',
    port: TARGET_PORT,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: 'localhost',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      'x-real-ip': req.socket.remoteAddress,
    },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
  console.log(`AegisGrid HTTPS proxy: https://cipherops.shop:${PROXY_PORT} → port ${TARGET_PORT}`);
});
