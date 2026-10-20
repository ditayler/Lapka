/* The same media delivery for the local player and the scoped AirPlay listener. */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { contentType } from '../deliver/index.mjs';

export async function serveStream(req, res, { delivery, entry, kind, target, transform = text => text }) {
  const send = (type, body) => {
    const bytes = Buffer.from(body);
    res.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  };
  if (kind === 'vtt') return send('text/vtt; charset=utf-8', await delivery.text(entry));
  if (kind === 'm3u8' || kind === 'pl') {
    return send('application/vnd.apple.mpegurl', transform(await delivery.playlist(entry, target)));
  }
  if (kind === 'seg' || kind === 'key') {
    const { bytes, hit } = await delivery.piece(entry, target || '');
    res.setHeader('x-lapka-cache', hit ? 'hit' : 'miss');
    return send(contentType(target || ''), bytes);
  }
  const origin = await delivery.file(entry, req.headers.range);
  const headers = { 'content-type': origin.headers.get('content-type') || 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  for (const k of ['content-length', 'content-range']) if (origin.headers.get(k)) headers[k] = origin.headers.get(k);
  res.writeHead(origin.status, headers);
  if (req.method === 'HEAD' || !origin.body) { await origin.body?.cancel(); return res.end(); }
  const body = Readable.fromWeb(origin.body);
  res.once('close', () => body.destroy());
  return pipeline(body, res).catch(() => { if (!res.writableEnded) res.destroy(); });
}
