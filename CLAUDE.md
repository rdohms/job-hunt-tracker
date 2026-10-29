# Job Hunt Tracker

Zero-dependency Node app (`server.js`, `scraper.js`, `nblm.js`, static `public/`) plus an optional Python bridge (`bridge/`) for NotebookLM.

## Conventions

- Plain ESM, no build step, no runtime npm dependencies. Keep it that way.
- Job data is one JSON file per job in `DATA_DIR` (default `./data`, gitignored). Never write user data into the repo.
- Treat any `DATA_DIR` as the user's live data: don't delete or bulk-rewrite it. Test against a throwaway `DATA_DIR` and a non-default `PORT`, and stop test servers by port (`lsof -nP -iTCP:<port> -sTCP:LISTEN -t`), not with a broad `pkill`.
- NotebookLM features are optional and off unless `NOTEBOOK_ID` is set.
- Config comes from env vars / `.env` (see `.env.example`).
