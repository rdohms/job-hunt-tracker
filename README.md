# Job Hunt Tracker

A local-first job application tracker. Paste a job URL, get a scraped card on a drag-and-drop kanban board, and keep Markdown notes per job. Everything is stored as plain JSON files, one per job, so you can commit your search to git as often as you like.

- **No dependencies, no build step.** Just Node.
- **Your data stays yours.** The server binds to `127.0.0.1` and writes only to a folder you choose.
- **Optional AI extras.** Match scoring and cover letters via NotebookLM (unofficial, see below).

## Quick start

Requires Node 20.12 or newer.

```bash
git clone https://github.com/rdohms/job-hunt-tracker.git
cd job-hunt-tracker
cp -r data.example data     # optional: start with a few sample jobs
npm start                   # http://localhost:3000
```

## Using it

- **Add a job:** paste a URL into the top bar, or paste or drop a link anywhere on the board. The card lands in **Saved**.
- **Move it:** drag cards between Saved, Applied, Screening, Interviewing, Offer and Rejected. Dropping into Rejected asks for a reason and notes (skippable).
- **Open it:** click a card for the full page. Fields autosave. Notes are inline Markdown: click to edit, Esc or Cmd+Enter to render. `- [ ]` task checkboxes can be ticked directly.
- **Re-scrape:** the job page has a button to re-fetch scraped fields. Notes, status and referral are kept.
- **Insider referral:** a 🤝 toggle on each card and job page.

### What gets scraped

Title, company, recruitment system (Greenhouse, Lever, Ashby, Workday, LinkedIn and about 20 more), pay, work type, location and the description. In order of preference:

1. Public ATS APIs (Greenhouse, Lever, Ashby), including career pages that embed them (`?ashby_jid=`, `?gh_jid=`)
2. A LinkedIn-specific parser for logged-out job pages
3. JSON-LD `JobPosting` data
4. OpenGraph tags and the page title
5. Text heuristics for pay and remote/hybrid/on-site

Scraping is best effort. Anything it misses is editable on the job page.

## Configuration

Settings come from environment variables, or from a `.env` file in the directory you launch from (see `.env.example`). Real environment variables win over the file.

| Variable | Default | Purpose |
|---|---|---|
| `DATA_DIR` | `./data` | Folder holding the job JSON files. Relative paths resolve from where you launch. |
| `PORT` | `3000` | Web UI port |
| `NOTEBOOK_ID` | empty | Enables the NotebookLM features when set |
| `BRIDGE_PORT` | `8000` | NotebookLM bridge port |
| `BRIDGE_URL` | `http://127.0.0.1:8000` | Where the server finds the bridge |

### Keeping your data in its own repo

The app and your data are meant to live apart. Keep a private repo with a `.env` and a `jobs/` folder, and launch the app from there:

```bash
cd my-job-data                       # contains .env with DATA_DIR=./jobs
node ../job-hunt-tracker/server.js   # or scripts/dev.js to include the bridge
```

Because `DATA_DIR` resolves from the launch directory, the app code and your job files never share a repository.

## Optional: NotebookLM match + cover letters

> **Unofficial.** This uses [`notebooklm-py`](https://github.com/teng-lin/notebooklm-py), which drives undocumented Google APIs with your signed-in session. It can break without notice and may violate Google's terms. Use a dedicated account if you can, and use it at your own risk.

You need [`uv`](https://docs.astral.sh/uv/) and a NotebookLM notebook set up as described below.

### Setting up your notebook

The notebook is the only thing the match and cover-letter features know about you, so build it deliberately. Create a notebook in NotebookLM and add sources such as:

- your resume (and older versions if they cover different work)
- recommendations, reviews and testimonials
- general information about you: achievements with numbers, projects, skills, career goals, what you want and don't want in a role, location and work-type preferences, salary expectations
- past cover letters, if you want the output to sound like you

NotebookLM suits this because it is a reference-based space: it answers from the sources you give it, with citations, instead of drawing on general knowledge. That keeps matches and letters tied to what you have actually provided, and the prompts also tell it never to invent experience. It reduces made-up details but does not make them impossible, so read every letter before sending it. The quality of the output follows the quality of the sources: vague sources give vague matches, and anything missing from the notebook will show up as a "gap".

Then copy the notebook's id from its URL (`notebook.google.com/notebook/<id>`) into `NOTEBOOK_ID`.

```bash
npm run bridge:login      # once: Google sign-in (downloads Chromium for Playwright)
# set NOTEBOOK_ID in .env (the id from the notebook URL)
npm run start:all         # tracker + bridge together
```

On a job page, **Analyze match** returns a score, verdict, strengths, gaps and red flags, stored in the job's JSON. **Generate cover letter** writes a short, objective letter into an editable Markdown box. Both send only the job URL to NotebookLM, so it must be able to read the posting. Without `NOTEBOOK_ID`, these controls are hidden and `start:all` starts only the tracker.

## Data format

One file per job in `DATA_DIR`, named `<id>.json`. See `data.example/` for samples. Files are pretty-printed with a trailing newline so diffs stay small.

## Development

```bash
npm run dev        # server with --watch
```

Test against a throwaway data folder so you never touch real data:

```bash
DATA_DIR=/tmp/jobs-test PORT=3999 node server.js
```

## License

[MIT](LICENSE)
