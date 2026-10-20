/* Terminal progress, with a plain append-only fallback for CI and log files. */
import { stripVTControlCharacters } from 'node:util';

export function createBuildProgress({ total, stream = process.stderr, env = process.env }) {
  const interactive = !!stream.isTTY && !env.CI && env.TERM !== 'dumb';
  const color = interactive && env.NO_COLOR === undefined;
  const paint = (code, text) => color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let completed = 0, active = null, drawn = false, frame = 0;

  // This bar counts completed stages; it does not estimate build time.
  const progress = () => {
    const filled = Math.round(completed / total * 18);
    return paint(36, '[' + '#'.repeat(filled) + '-'.repeat(18 - filled) + ']') + ` ${completed}/${total} steps`;
  };
  const clear = () => {
    if (drawn) { stream.write('\r\x1b[2K'); drawn = false; }
  };
  const render = () => {
    if (!interactive || !active) return;
    clear();
    // Limit only the animated label, so narrow terminals never wrap the live
    // line. Full stage names and details remain in the permanent log below.
    const spinner = paint(33, frames[frame++ % frames.length]);
    const prefix = (stream.columns || 80) < 60 ? `${spinner} ${completed}/${total} ` : `${progress()}  ${spinner} `;
    const label = active.label;
    const room = Math.max(0, (stream.columns || 80) - stripVTControlCharacters(prefix).length - 1);
    if (!room) return;
    stream.write(prefix + (label.length > room ? label.slice(0, room - 1) + '…' : label));
    drawn = true;
  };
  const log = message => {
    clear();
    stream.write('  ' + message + '\n');
    render();
  };
  const step = async (label, action) => {
    // Print one full name even when the animated version must be shortened.
    stream.write(`${progress()}  ${paint(33, '→')} ${label}\n`);
    active = { label };
    render();
    const timer = setInterval(() => {
      if (interactive) render();
      else log(`${label}: still working`);
    }, interactive ? 100 : 10000);
    timer.unref();
    try {
      const result = await action();
      completed++;
      clear();
      stream.write(`${progress()}  ${paint(32, '✓')} ${label}\n`);
      return result;
    } catch (error) {
      clear();
      stream.write(`${progress()}  ${paint(31, '✗')} ${label} — failed\n`);
      throw error;
    } finally {
      clearInterval(timer);
      active = null;
    }
  };
  return { log, step };
}
