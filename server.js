import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { scrape } from './scraper.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data', 'jobs');
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;

const STATUSES = ['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected'];
const EDITABLE = ['title', 'company', 'url', 'ats', 'status', 'notes', 'referral', 'pay', 'workType', 'location', 'order'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

await fs.mkdir(DATA, { recursive: true });

const file = (id) => path.join(DATA, `${id}.json`);
const validId = (id) => /^[a-z0-9-]+$/i.test(id);

async function readAll() {
  const names = (await fs.readdir(DATA)).filter((n) => n.endsWith('.json'));
  const jobs = await Promise.all(names.map(async (n) => JSON.parse(await fs.readFile(path.join(DATA, n), 'utf8'))));
  return jobs.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

// Stable, diff-friendly output so commits stay small.
const write = (job) => fs.writeFile(file(job.id), JSON.stringify(job, null, 2) + '\n');

const send = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
};

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const [resource, id, sub] = parts;
  if (resource !== 'jobs') return send(res, 404, { error: 'not found' });

  if (req.method === 'GET' && !id) return send(res, 200, { statuses: STATUSES, jobs: await readAll() });

  if (req.method === 'POST' && !id) {
    const { url: target } = await readBody(req);
    let parsed;
    try {
      parsed = new URL(target);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      return send(res, 400, { error: 'Invalid URL' });
    }
    const existing = (await readAll()).find((j) => j.url === parsed.href);
    if (existing) return send(res, 409, { error: 'Already tracked', job: existing });

    const scraped = await scrape(parsed.href);
    const now = new Date().toISOString();
    const all = await readAll();
    const job = {
      id: randomUUID(),
      title: scraped.title,
      company: scraped.company,
      url: parsed.href,
      ats: scraped.ats,
      status: 'saved',
      referral: false,
      pay: scraped.pay,
      workType: scraped.workType,
      location: scraped.location,
      notes: '',
      description: scraped.description,
      order: Math.min(0, ...all.filter((j) => j.status === 'saved').map((j) => j.order)) - 1,
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
    };
    await write(job);
    return send(res, 201, { job, scrapeError: scraped.error });
  }

  // Bulk reorder after a drag: { columns: { status: [id, ...] } }
  if (req.method === 'POST' && id === 'reorder') {
    const { columns } = await readBody(req);
    const byId = new Map((await readAll()).map((j) => [j.id, j]));
    const now = new Date().toISOString();
    const writes = [];
    for (const [status, ids] of Object.entries(columns)) {
      if (!STATUSES.includes(status)) continue;
      ids.forEach((jid, i) => {
        const j = byId.get(jid);
        if (!j || (j.status === status && j.order === i)) return;
        if (j.status !== status && status === 'applied' && !j.appliedAt) j.appliedAt = now;
        Object.assign(j, { status, order: i, updatedAt: now });
        writes.push(write(j));
      });
    }
    await Promise.all(writes);
    return send(res, 200, { ok: true });
  }

  if (!id || !validId(id)) return send(res, 404, { error: 'not found' });

  let job;
  try {
    job = JSON.parse(await fs.readFile(file(id), 'utf8'));
  } catch {
    return send(res, 404, { error: 'not found' });
  }

  if (req.method === 'GET') return send(res, 200, { job });

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    for (const k of EDITABLE) if (k in body) job[k] = body[k];
    if (!STATUSES.includes(job.status)) return send(res, 400, { error: 'Invalid status' });
    job.updatedAt = new Date().toISOString();
    await write(job);
    return send(res, 200, { job });
  }

  if (req.method === 'DELETE') {
    await fs.unlink(file(id));
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: 'method not allowed' });
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const full = path.join(PUBLIC, rel);
      if (!full.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'forbidden' });
      const body = await fs.readFile(full);
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      if (e.code === 'ENOENT') return send(res, 404, { error: 'not found' });
      console.error(e);
      send(res, 500, { error: e.message });
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log(`Job tracker running at http://localhost:${PORT}`));
