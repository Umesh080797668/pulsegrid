# Cost-Safe CI/CD (No GitHub-hosted minutes)

This project is configured for **manual, self-hosted** GitHub Actions workflows:

- [.github/workflows/ci-manual-self-hosted.yml](../.github/workflows/ci-manual-self-hosted.yml)
- [.github/workflows/deploy-manual-self-hosted.yml](../.github/workflows/deploy-manual-self-hosted.yml)

These use `runs-on: self-hosted`, so they do not consume GitHub-hosted runner minutes.

## 1) Run CI locally (recommended day-to-day)

Use:

- scripts/ci_local.sh

It runs:

- API: `npm ci`, `npx tsc --noEmit`, `npm test`
- Core: `cargo check`, `cargo test`
- Dashboard: `npm ci`, `npx tsc --noEmit`, `npm run build`

## 2) Set up a self-hosted runner (optional)

In GitHub repo:

- Settings → Actions → Runners → New self-hosted runner
- Follow GitHub instructions on your machine/VM

Once connected, run workflows manually from Actions tab:

- **PulseGrid CI (Manual, Self-Hosted)**
- **PulseGrid Deploy (Manual, Self-Hosted)**

## 3) Deployment script

Deployment workflow calls:

- scripts/deploy.sh

This is a template. Replace placeholder comments with your real deploy commands (Railway/Fly/Vercel/etc.).

## 4) Why this avoids charges

- No `push`/`pull_request` auto-triggered hosted jobs
- No `runs-on: ubuntu-latest` in committed workflows
- Manual + self-hosted only

## 5) Optional: pre-push local CI hook

To ensure quality before every push (with zero GitHub minutes), enable the git hook:

- `scripts/setup_git_hooks.sh`

This configures:

- `.githooks/pre-push` → runs `scripts/ci_local.sh`

Bypass once if needed:

- `SKIP_LOCAL_CI=1 git push`
