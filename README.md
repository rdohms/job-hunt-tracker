# Job Tracker

Zero-dependency job application tracker. Requires Node 20+.

```bash
npm start   # http://localhost:3000
```

- Paste a job URL in the top bar (or paste/drop a URL anywhere on the board) → scraped into a card in **Saved**.
- Drag cards between columns; click a card for the full page with inline Markdown notes (click to edit, Esc / Cmd+Enter to render).
- Data: one JSON file per job in `data/jobs/` — commit freely.

Scraping order: ATS public APIs (Greenhouse, Lever, Ashby) → JSON-LD `JobPosting` → OpenGraph/title → text heuristics (pay, remote/hybrid). Anything missed is editable on the job page.

## NotebookLM match + cover letters (optional)

```bash
npm run bridge:login   # once: Google sign-in for the unofficial notebooklm-py client
npm run start:all      # tracker on :3000 + bridge on :8000
```

On a job page, **Analyze match** and **Generate cover letter** send the job (title, company, URL, scraped description) to the notebook set by `NOTEBOOK_ID` (default in `nblm.js`). Results are stored in the job's JSON (`match`, `coverLetter`). Env: `NOTEBOOK_ID`, `BRIDGE_URL`, `DATA_DIR`, `PORT`, `BRIDGE_PORT`.
