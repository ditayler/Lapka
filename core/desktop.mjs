/* Entry point owned by the macOS application. stdin is a parent-liveness pipe. */
import os from 'node:os';
import path from 'node:path';

process.env.LAPKA_DATA_DIR ||= path.join(os.homedir(), 'Library', 'Application Support', 'Lapka');
const port = Number(process.env.LAPKA_DESKTOP_PORT ?? 18800);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Invalid LAPKA_DESKTOP_PORT');
  process.exit(1);
}

let app, requested = false, stopping = null;
async function shutdown() {
  requested = true;
  if (!app || stopping) return stopping;
  stopping = (async () => {
    const deadline = setTimeout(() => process.exit(1), 3000);
    deadline.unref();
    const paused = app.saver.pauseAll();
    for (const job of paused) app.state.setSave(job.key, { paused: true });
    try { await app.close({ force: true }); process.exit(0); }
    catch (e) { console.error(e); process.exit(1); }
  })();
  return stopping;
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.stdin.once('end', shutdown);
process.stdin.on('error', shutdown);
process.stdin.resume();

try {
  // Import after setting the desktop directory: storage modules select their defaults once.
  const { start } = await import('./main.mjs');
  app = await start({ port });
  app.ctx.quit = () => { setTimeout(shutdown, 100); };
  if (requested) await shutdown();
  else console.log(JSON.stringify({ type: 'lapka-ready', url: app.base, pid: process.pid }));
} catch (e) {
  console.error(e.code ? `${e.code}: ${e.message}` : e);
  process.exit(1);
}
