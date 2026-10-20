// Starts the tracker (Node) and the NotebookLM bridge (Python/uv) together.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BRIDGE_PORT = process.env.BRIDGE_PORT || '8000';

const procs = [];
const start = (name, color, cmd, args, env = {}) => {
  const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tag = `\x1b[${color}m[${name}]\x1b[0m`;
  const pipe = (stream, out) =>
    stream.on('data', (d) => d.toString().split('\n').filter(Boolean).forEach((l) => out.write(`${tag} ${l}\n`)));
  pipe(p.stdout, process.stdout);
  pipe(p.stderr, process.stdout);
  p.on('error', (e) => console.log(`${tag} failed to start: ${e.message}${e.code === 'ENOENT' ? ' (is it installed?)' : ''}`));
  procs.push({ name, p });
  return p;
};

const tracker = start('tracker', 36, 'node', ['server.js']);
const bridge = start('bridge', 35, 'uv', [
  'run', '--project', 'bridge', 'uvicorn', 'app:app', '--app-dir', 'bridge', '--host', '127.0.0.1', '--port', BRIDGE_PORT,
]);

// The bridge is optional: if it dies the tracker keeps running. If the tracker dies, stop everything.
bridge.on('exit', (code) => console.log(`\x1b[35m[bridge]\x1b[0m exited (${code}); tracker still running`));
tracker.on('exit', (code) => shutdown(code ?? 0));

let closing = false;
function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const { p } of procs) if (p.exitCode === null) p.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
