# OWN BOOK — make it run on its own

Everything in this folder goes into the GitHub repo **olamprou01-droid/kraken-desk**.
Once it is there, the software runs without you and without Claude:

- the app at `https://olamprou01-droid.github.io/kraken-desk/` refreshes itself when you open it or come back to it
- a watcher runs the same rule on GitHub's servers **every 30 minutes** and pushes to your phone
- it proves itself against the app on every run (`watch/test.js`) and refuses to notify if the rule has drifted

Three one-time steps. Ten minutes.

---

## 1. Put the files in the repo

**Either** double-click **`deploy.bat`** in this folder (needs Git for Windows — if it is missing the script tells you where to get it, and the first push opens a GitHub login window for you to sign in yourself). After that, every update is the same double-click.

**Or** by hand, on the GitHub website: open the repo → **Add file → Upload files** → drag in
`index.html`, `kraken-journal.json`, the `watch` folder and the `.github` folder → **Commit changes**.
(`.github` is hidden in Windows Explorer — View → Show → Hidden items.)

## 2. Switch the watcher on

Repo → **Actions** tab → if it asks, "I understand my workflows, go ahead and enable them" →
click **watch** in the left list → **Run workflow** → Run.
A green tick within a minute means it works. From then on it runs itself every 30 minutes.

## 3. Get it on your phone

Install **ntfy** (App Store or Google Play, free, no account) → **+** → subscribe to topic

```
ownbook-356ba5c8fc6a5b7454
```

Notifications arrive with the phone locked or asleep. You can also open
`https://ntfy.sh/ownbook-356ba5c8fc6a5b7454` in any browser to see the history.

---

## What it will send you

| when | message | priority |
|---|---|---|
| a coin passes every gate | **BUY UNI** — in, stop, target, size · open the app and press ↻ before you buy | high |
| a signal or open position is at or under its stop | **SELL UNI NOW** | urgent, breaks through silent mode |
| a position reaches target | **TARGET UNI** | high |
| BTC crosses its 20-day average | **REGIME ON** / **REGIME OFF** | normal |
| 09:00 Cyprus, every day | **Own Book · date** — regime, nearest coin, open count, equity | quiet |

Nothing else. If you get no daily message, something is off — open the repo's Actions tab.

## What the app shows you

Bottom bar: **WATCHER 12M AGO · REGIME OFF · UNI +3.0%**. Green under 40 min, amber to 90, red after.
Click it to open the ntfy channel.

## Optional, recommended: make the topic private

The topic name above is in a public file, so anyone who reads it could subscribe.
Repo → Settings → Secrets and variables → Actions → **New repository secret** →
name `NTFY_TOPIC`, value any long random word you invent. Subscribe your phone to that instead.
The watcher uses the secret automatically and the name in the file becomes dead.

## Your open positions

The watcher watches stops on two things: rows marked OPEN in `kraken-journal.json`, and every BUY it
itself sent. So even if you never update the journal, a stop on a watcher signal still reaches you.
To make it watch a trade you took *without* a watcher signal, save the journal from the app (📁) and
upload it, or run `deploy.bat`.
