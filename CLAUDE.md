# Concorde scroll site

Built from the SR-71 template (marcgoveiawork-bit/sr71-blackbird). Its `PLAYBOOK.md` documents the architecture,
problems already solved and where theme values live; `README.md` here lists what changed for Concorde.

Rules:
- Keep the structure: `index.html` (styles, copy, loader) + `main.js` (scene + scroll engine), no build step.
- Camera keys inherit from the previous key; anchored shots read anchors in the aircraft's resting pose.
- The model has gear doors, so the camera may see the underside once the gear is up.
- Points on the aircraft are in raw model coordinates (measure with `tools/inspect.html`).
- Verify every fact with a web search; credit the model licence in the finale credits; no manufacturer logos.
- Test with Playwright via `tools/screenshot.js` (no local server in the cloud container); sweep 30+ scroll
  positions, check a phone viewport (`PHONE=1`, 390x844) and run the auto-play before publishing.
- Do not push to GitHub until Marc says the site is ready.
