// Client for the local NotebookLM bridge (bridge/app.py) + prompts for job matching and cover letters.

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:8000';
const NOTEBOOK_ID = process.env.NOTEBOOK_ID || 'REPLACED-NOTEBOOK-ID';

// NotebookLM keeps one running conversation per notebook, so serialize calls and make every prompt standalone.
let queue = Promise.resolve();

export function askNotebook(question) {
  const run = async () => {
    let res;
    try {
      res = await fetch(`${BRIDGE_URL}/notebooks/${NOTEBOOK_ID}/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(180_000),
      });
    } catch (e) {
      const down = e.cause?.code === 'ECONNREFUSED';
      throw new Error(down ? 'NotebookLM bridge is not running (use `npm run start:all`)' : `NotebookLM bridge error: ${e.message}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || `NotebookLM bridge returned ${res.status}`);
    return data.answer;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

// NotebookLM reads the posting from the inline URL, so we send only the link (long pasted text trips its size limit).
const jobBlock = (job) => job.url;

const STANDALONE =
  'This is a standalone task: ignore any other jobs discussed earlier in this conversation. ' +
  "Base everything on the candidate's real background in this notebook's sources (resume etc.) and never invent experience.";

export const matchPrompt = (job) => `${STANDALONE}

Evaluate how well the candidate fits the job posting at this URL.
Respond with ONLY a JSON object (no markdown fences, no commentary) with exactly these keys:
{"score": integer 0-100, "verdict": "strong" | "maybe" | "weak", "summary": "max 2 sentences", "strengths": [short strings], "gaps": [short strings], "redFlags": [short strings about the posting: seniority/pay/location/stack mismatches, or empty]}

${jobBlock(job)}`;

export const letterPrompt = (job) => `${STANDALONE}

Write a short, objective cover letter for the job posting at this URL: 150-200 words, at most 3 short paragraphs. Plain factual tone, no flattery, buzzwords or filler. Lead with the most relevant concrete experience and results for this role. Use "Hiring Team" if no name is known. Output ONLY the letter text.

${jobBlock(job)}`;

export function parseMatch(answer) {
  const text = String(answer).replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('NotebookLM did not return JSON');
  let o;
  try {
    o = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('NotebookLM returned malformed JSON');
  }
  const list = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const score = Math.max(0, Math.min(100, Math.round(Number(o.score))));
  if (!Number.isFinite(score)) throw new Error('NotebookLM match had no numeric score');
  const verdict = ['strong', 'maybe', 'weak'].includes(o.verdict) ? o.verdict : score >= 75 ? 'strong' : score >= 50 ? 'maybe' : 'weak';
  return { score, verdict, summary: String(o.summary || ''), strengths: list(o.strengths), gaps: list(o.gaps), redFlags: list(o.redFlags) };
}
