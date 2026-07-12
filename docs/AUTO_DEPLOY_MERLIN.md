# Auto-deploy Merlin on push (self-hosted runner)

Merlin is a self-hosted Next app running as the interactive scheduled task **`Merlin`**
(owns :3000) on the IONOS box. This gives it "push to main → auto-deploy" like Vercel,
using the standard pattern for self-hosted apps: a **GitHub Actions self-hosted runner**
on the box runs the existing `refresh-merlin.ps1` (pull → refresh brain → install →
build → restart the task).

Workflow: `.github/workflows/deploy-merlin.yml` (triggers on push to `main` + manual
`workflow_dispatch`). The runner is a **separate process** from the Merlin service, so it
can stop/build/start it cleanly — a webhook-into-the-app can't restart itself mid-request.

## One-time setup (on the IONOS box)

1. **Register the runner:** GitHub → the `merlin` repo → **Settings → Actions → Runners
   → New self-hosted runner → Windows**. Follow the download/config commands it shows.
   When it asks for labels, add: `merlin` (the default `self-hosted` + `windows` labels
   are added automatically). The workflow targets `[self-hosted, windows, merlin]`.

2. **Run it as a service** so it survives reboots:
   ```powershell
   # from the runner folder, elevated
   ./config.cmd --labels merlin        # if not already labeled during config
   ./svc.cmd install
   ./svc.cmd start
   ```
   The runner service must run as (or as a user with rights to) run
   `refresh-merlin.ps1` and restart the `Merlin` scheduled task — the same account that
   normally runs the task is simplest.

3. **Verify:** push a trivial commit to `main` (or run the workflow manually via
   *Actions → Deploy Merlin → Run workflow*). Watch the run: it should pull, build,
   restart, and pass the `/api/health` check. Merlin is now auto-deployed on every push.

## Notes
- `concurrency` prevents overlapping deploys; an in-flight deploy finishes rather than
  being cancelled.
- If a deploy fails the health check, the run goes red and you'll see the build/restart
  logs in Actions — fix forward and push again.
- `refresh-merlin.ps1 -NoPull` still exists for a local rebuild-only; the workflow uses
  the full pull+build+restart.
- This is orthogonal to the DB backup engine (`src/lib/db-backup.ts`) — deploy != backup.
