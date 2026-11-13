# Setup guide (Hindi) — laptop se live tak, 20 minute

## 1. Laptop par ek baar
- Node.js 20 install karein: https://nodejs.org (LTS)
- Git install karein: https://git-scm.com
- Claude Code install karein (terminal/PowerShell mein): `npm install -g @anthropic-ai/claude-code`
- GitHub par login ho jayein: `gh auth login` (GitHub CLI: https://cli.github.com) — ya browser se repo banayein

## 2. Repo GitHub par daalein
Zip ko unzip karke folder `coaching-connect` mein terminal kholein, phir:
```
git init
git add .
git commit -m "Phase 0 scaffold: API, admin panel, Flutter skeleton, Docker deploy files"
gh repo create everkumud-code/coaching-connect --private --source=. --push
```
(gh nahi hai to GitHub par naya private repo `coaching-connect` banayein aur `git remote add origin ...` + `git push -u origin main`.)

## 3. Apne server par deploy
- `deploy/vps/README.md` padhein: Docker se API, admin panel, Postgres aur Redis ek hi server par chalte hain (nginx ke peeche).
- `deploy/vps/2-deploy-app.sh` chalayein, phir `3-vhost-nginx.sh` se domain aur https lagayein.
- Admin panel ka domain kholein aur login karein.

## 4. Ab Claude Code se aage banwayein
Repo folder mein:
```
claude
```
Phir bolein, ek-ek karke (CLAUDE.md ki Phase 1 list ke hisaab se):
- "CLAUDE.md padho. Phase 1 ka pehla item karo: Redis-backed OTP aur rate limit. Build pass hona chahiye, phir commit karo."
- "Agla item: students ka Excel bulk import — upload, preview, confirm."
- ... aise hi list ke neeche jaate rahein. Commit push karne ke baad server par `deploy/vps/2-deploy-app.sh` chalayein.

## 5. Asli SMS / payment chalu karne ke liye (jab pilot shuru ho)
- MSG91 account → auth key → server ki `.env` mein `OTP_MODE=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` env vars
- Razorpay account → key id/secret → `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` (Phase 1 item)
- Firebase project (free) → push notifications ke liye service account JSON

## Mobile app
`apps/mobile` mein `flutter create . --org in.boombites --project-name coaching_connect` ek baar chalayein, phir `flutter run`. Play Store build Phase 2 mein.
