/* A lazily opened media-only listener. Tokens grant one stream, never the app API. */
import http from 'node:http';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { serveStream } from './stream.mjs';

const TTL = 24 * 60 * 60 * 1000;
const fail = (message, code) => Object.assign(new Error(message), { code });

export function airplayAddress(interfaces = os.networkInterfaces(), preferred = process.env.LAPKA_AIRPLAY_HOST) {
  const all = Object.entries(interfaces).flatMap(([name, values]) => (values || []).filter(v => v.family === 'IPv4' && !v.internal).map(v => ({ name, address: v.address })));
  if (preferred) {
    if (!all.some(v => v.address === preferred)) throw fail('AirPlay: LAPKA_AIRPLAY_HOST must be a local network IPv4 address', 503);
    return preferred;
  }
  // Prefer physical adapters to VPNs and virtual bridges.
  const usable = all.filter(v => !/^(utun|tun|tap|docker|veth|bridge|vmnet)/i.test(v.name));
  const choice = usable.find(v => /^(en|eth|wlan|wi-?fi)/i.test(v.name)) || usable[0];
  if (!choice) throw fail('AirPlay: no local network IPv4 address; connect to Wi-Fi or Ethernet', 503);
  return choice.address;
}

// Pin a multi-dub master to the selected rendition in each audio group.
// A receiver cannot see hls.js's local audioTrack selection.
function selectAudio(text, index) {
  if (index == null) return text;
  const counts = new Map();
  return text.split('\n').filter(line => {
    if (!/^#EXT-X-MEDIA:.*\bTYPE=AUDIO(?:,|$)/.test(line)) return true;
    const group = /GROUP-ID="([^"]*)"/.exec(line)?.[1] || '';
    const n = counts.get(group) || 0;
    counts.set(group, n + 1);
    return n === index;
  }).map(line => /^#EXT-X-MEDIA:.*\bTYPE=AUDIO(?:,|$)/.test(line)
    ? line.replace(/,DEFAULT=(YES|NO)/g, '').replace(/,AUTOSELECT=(YES|NO)/g, '') + ',DEFAULT=YES,AUTOSELECT=YES' : line).join('\n');
}

export function createAirplay({ delivery, host, now = Date.now } = {}) {
  const sessions = new Map();
  let listener = null, starting = null, base = null;
  const prune = () => { for (const [token, s] of sessions) if (s.expires <= now()) sessions.delete(token); };
  async function listen() {
    if (base) return;
    if (starting) return starting;
    starting = (async () => {
      const address = host || airplayAddress();
      const server = http.createServer(async (req, res) => {
        const error = (code, message) => {
          if (res.headersSent) return res.destroy();
          res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: message }));
        };
        try {
          prune();
          const u = new URL(req.url, base || 'http://localhost');
          const m = /^\/airplay\/([a-f0-9]{48})\/(stream\.(m3u8|mp4)|pl|seg|key)$/.exec(u.pathname);
          const session = m && sessions.get(m[1]);
          if (!session || !['GET', 'HEAD'].includes(req.method) || req.headers.host !== new URL(base).host) return error(403, 'invalid AirPlay session');
          const kind = m[3] || m[2];
          if (kind === 'm3u8' && session.entry.stream.kind !== 'hls' || kind === 'mp4' && session.entry.stream.kind !== 'mp4') return error(403, 'not in this stream');
          const prefix = `${base}/airplay/${m[1]}/`;
          await serveStream(req, res, {
            delivery, entry: session.entry, kind, target: u.searchParams.get('u') || undefined,
            transform: text => selectAudio(text, session.audio).replaceAll(`/api/stream/${session.entry.id}/`, prefix),
          });
        } catch (e) { error(Number.isInteger(e.code) ? e.code : 502, e.message); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, address, resolve); });
      listener = server;
      base = `http://${address}:${server.address().port}`;
    })();
    try { await starting; } finally { starting = null; }
  }
  async function prepare(id, audio = null) {
    const entry = delivery.get(id);
    if (!entry || !['hls', 'mp4'].includes(entry.stream.kind)) throw fail('unknown stream', 404);
    if (audio != null && (!Number.isInteger(audio) || audio < 0 || audio > 100)) throw fail('invalid audio track', 400);
    await listen();
    prune();
    if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(24).toString('hex');
    const expires = now() + TTL;
    sessions.set(token, { entry, audio, expires });
    return { token, expires, url: `${base}/airplay/${token}/stream.${entry.stream.kind === 'hls' ? 'm3u8' : 'mp4'}` };
  }
  const revoke = token => sessions.delete(token);
  async function close() {
    if (starting) await starting.catch(() => {});
    sessions.clear();
    if (listener) await new Promise(r => { listener.close(r); listener.closeAllConnections(); });
    listener = base = null;
  }
  return { prepare, revoke, close };
}
