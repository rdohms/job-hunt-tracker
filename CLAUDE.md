# Job Tracker

## Always preserve `data/`

`data/jobs/*.json` is the user's live data and is edited through the app, often with uncommitted changes. Treat it as irreplaceable.

- Never run `git checkout`, `git restore`, `git reset --hard`, `git clean`, or `git stash` against `data/` (or repo-wide commands that include it).
- Never delete, overwrite, or bulk-rewrite files in `data/`. Don't use it for test fixtures.
- Test against a throwaway data dir instead (set `DATA_DIR=<scratchpad dir>` and a non-default `PORT`; stop test servers by port with `lsof -nP -iTCP:<port> -sTCP:LISTEN -t`, since `$!` of a backgrounded `cd && node` is not the node PID).
- Don't `pkill` node broadly; the user's server may be running on port 3000. Test on another port and kill by PID.
- Check `git status` before any destructive git command and look at what it would discard.
