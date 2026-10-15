# outreach-pipeline

Recruiter outreach pipeline for Aaron Ramírez (React / React Native / Angular / .NET / Java full stack, C2C-first).
Private repo. Contains personal contact info and resumes; keep it private.

## Layout
- `pipeline/collector.js` – LinkedIn content-search post collector (run in the page console / Chrome MCP; accumulates in `sessionStorage['__posts2']`).
- `pipeline/make_spec.py overlays/<name>.json [dest]` – merges an overlay (tagline, location, summary, core_skills, tech_overrides, role_tweaks) with `specs/base_web.json` or `specs/base_mobile.json`, then calls `build_resume.py` which fills the Pages-exported docx template and exports PDF/.pages via Pages.
- `pipeline/gen_tracker.py [data_dir]` – rebuilds `Opportunity_Tracker_<date>.html/.csv` from `tracker_rows.json`; print to PDF with headless Chrome.
- `pipeline/overlays/` – one overlay per tailored resume (reusable per role family).
- `data/<date>/` – tracker rows, `Outreach_Log.csv` (dedupe source), `leads_feed.jsonl` (Telegram notifier feed), `messages/NN_<slug>.txt` (exact email sent), `resumes/` (PDF + docx).

## Rules that live in the emails
- TN visa stated plainly; ask once when a visa list omits TN. Never commit to a rate ("glad to discuss").
- No negative framing (no "may not be the right fit", no "I have not used X"); lead with what matches.
- Never invent experience or metrics. Claimable stacks: React, React Native, Angular, Ionic, Java / Spring Boot, C# / .NET.
- Dedupe against `Outreach_Log.csv`: same recruiter + same role = never twice. Second role from the same recruiter = short email referencing the first.
- Identity documents (SSN, DOB, passport, license, I-94) are never filled or committed.

## Daily sweep
LinkedIn content search, past 24h, sorted by date: `"React" C2C`, `"React Native" C2C`, `"ReactJS" C2C`, `"Front End" C2C`, `"Angular" C2C`, `"React Native" hiring email`, `"Ionic" OR "Angular" hiring developer email`, `".NET" (React OR Angular OR Ionic) C2C`; plus Google Groups C2C lists and inbox. Build overlay → `make_spec.py` → Gmail compose with PDF → append tracker row, log, leads feed → regenerate tracker PDF.
