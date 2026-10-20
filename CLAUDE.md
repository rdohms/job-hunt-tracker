# Job Tracker

## Always preserve `data/`

`data/jobs/*.json` is the user's live data and is edited through the app, often with uncommitted changes. Treat it as irreplaceable.

- Never run `git checkout`, `git restore`, `git reset --hard`, `git clean`, or `git stash` against `data/` (or repo-wide commands that include it).
- Never delete, overwrite, or bulk-rewrite files in `data/`. Don't use it for test fixtures.
- Test against a throwaway data dir instead (the server reads `data/jobs` relative to `server.js`; copy the project to the scratchpad or add a `DATA_DIR` override before testing writes).
- Don't `pkill` node broadly; the user's server may be running on port 3000. Test on another port and kill by PID.
- Check `git status` before any destructive git command and look at what it would discard.
