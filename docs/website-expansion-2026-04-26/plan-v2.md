# XLIIs Website Expansion — Plan v2

Post-fit-test revision. Supersedes `strategy.md` (the ChatGPT baseline) and the v1 plan I shared in chat earlier today.

---

## 0. The fit test (project-wide rule)

The website only contains things that genuinely belong to the XLIIs project: four specific themed collections, four specific (fictional) collectors, the 170 specific shows in those collections, the J-cards, the cassette aesthetic, the curatorial voice, the foreign-language conceit. Anything not a natural extension of those — generic Dead content, SEO bait, "would attract traffic" filler, references to other Dead apps in any form — is out, even when it would help rankings.

Two hard project-wide rules that fall out of this:

- **No public-facing references to other Dead apps** anywhere. Not in schema fields, social posts, footer links, comparison pages, or essay text.
- **No image generation of any kind.** Pages may only use existing assets already in the repo: collection artwork (4), J-cards (170), country flags (4), site illustrations already shipped.

---

## 1. Current state (verified)

- **Source:** `xliis-app/` on `main` of `github.com/unwashedlugosi/xliis-app`. Hand-rolled static HTML on Vercel. 16 HTML pages including 4 collection pages.
- **Indexing:** no `sitemap.xml`, no `robots.txt`, no Search Console, no Google Analytics. Effectively invisible as a structured library.
- **Analytics that do exist:** Supabase `xlii_web_analytics` (page / visitor_id / referrer / user_agent on every page load). Live dashboard at `xliis.app/dev.html`.
- **App-side:** no universal links, no `apple-app-site-association`, no campaign params on App Store badges. The app cannot tell that an install came from xliis.app.
- **Show data:** `xlii-build/www/shows.json` (170 records). Fields: `identifier`, `date`, `title`, `venue_name`, `city`, `state`, `era`, `cases`, `about`, `review`.
- **Canonical prose field (researched):** `review` is the only field the iOS app displays (now-playing liner notes modal, show detail panel, collection card preview). `about` is dead data — validation-only, never rendered. The website should mirror `review`.
- **Caps treatment in the app:** iOS renders `review` as-is, no `text-transform`. The caps are baked into source. To move to CSS-applied caps without breaking the app, both surfaces need the same change in lockstep (shows.json → sentence case; iOS CSS → `text-transform: uppercase` on `.show-detail-review` and `.about-text`).
- **J-cards:** 170 JPGs in `xlii-build/jcards-v3/`, named by archive.org identifier.
- **Setlists:** cached in `xlii-build/setlist-cache.json`, keyed by date.

---

## 2. Goals

| # | Goal | In/Out |
|---|---|---|
| G1 | Indexable surface (10 → ~200 pages) | In |
| G2 | Installs from organic search | In |
| G3 | Companion-reading experience for in-app users | In |
| G4 | AI-assistant citations | In (cheap) |
| G5 | Community legitimacy / backlinks | In |
| — | Paid acquisition | Out |
| — | Newsletter / accounts / on-site forum | Out |
| — | Framework rewrite | Out |

---

## 3. Audiences

- **Companion-Reader** — listening in app, second screen open. Wants legible J-card + prose, no scanline animation, search.
- **Searcher** — cold from Google. Wants date / venue / setlist / why-it-matters / play link.
- **AI-Retriever** — Claude/Perplexity asked about a show. Wants schema.org + clean prose.
- **Forum Lurker** — knows more than us; will share weird, well-made artifacts (J-card walls, collector backstories).
- **Curiosity-Driven Newcomer** — heard "Cornell '77" once. Wants gentle entry.

---

## 4. Strategic moves — fit-tested

Each move below has passed the fit test (project, not graft). For each I name **why it belongs to the actual project**, not just to Google.

### Phase 1 — Ship the library (1a decisions + 1b generation)

**M1. Per-show pages (170)** — `/shows/<slug>.html`. Template: title, J-card, **"From the [Collector] collection"** with 1-line collector blurb (Buddy's note from v1 — makes the conceit load-bearing where traffic lands), `review` prose verbatim, setlist, schema.org `MusicEvent`, campaign-tagged App Store CTA, prev/next within collection, archive.org link to the source recording.
*Belongs:* the 170 shows ARE the project; the collector framing surrounds every one of them.

**M2. Schema.org `MusicEvent` + `sitemap.xml` + `robots.txt` + Search Console submission** — required infrastructure.
*Belongs:* describes our actual entities (shows, dates, venues, recordings).

**M3. Campaign-tagged App Store links** — `?pt=…&ct=show-1977-05-08` on every "Open in App Store" link, globally. (Promoted from Phase 3 per Buddy.)
*Belongs:* pure measurement, no content.

**M4. Collection page link-through with one-line summaries** — make every existing show row on the 4 collection pages link to its show page. Summary source: spot-check first sentences (often `DATE — VENUE`), fall back to second sentence or hand-write one-liners. 170 × 30sec = 90 min if hand-written. Decide in 1a after spot-check.
*Belongs:* extends existing collection pages; doesn't add new content.

**M5. Canonicalize the data flow** — see §6.

**M6. Caps treatment** — see §6.

**M7. `?listening=1` instrumentation** — log the param to Supabase analytics so we can tell whether anyone uses the companion-reader entry point before we build the full mode.
*Belongs:* free measurement on the second-screen audience.

### Phase 2 — Cheap differentiation

**M8. Per-collector pages (4)** — one page per collector (Rhys Morgan / Cardiff, anonymous Budapest, Andrei Petrescu / Bucharest, Hendrik Tamm / Tallinn-via-Toronto). Existing assets only: that collector's collection artwork + J-cards from their case + country flag + the existing prose from `collections.html` (already on the site, just expanded). Every show in their collection linked. **No generated portraits, no fictional attic photos.**
*Belongs:* the collectors ARE the project.

**M9. Multilingual collector capsules** — each collector page also published with their bio in their home language (Welsh, Romanian, Hungarian, Estonian). Nonfiction voice, mirrors what's already on the site. No translation of the show pages themselves; just the collector capsule that already exists.
*Belongs:* the foreign-language conceit IS the project. Extends existing material rather than inventing new fiction. Nobody else publishes Dead writing in Welsh.

**M10. J-card gallery** — single page, all 170 J-cards as a wall, hover/tap reveals show, click → show page. Existing assets only.
*Belongs:* the J-cards ARE the project; the cassette aesthetic IS the project.

**M11. Client-side fuzzy search** (Buddy add) — search shows.json by date / venue / song / collector. Half-day. Serves the Companion-Reader directly and gives all 170 pages real navigation.
*Belongs:* searching OUR library, not the Dead universe.

### Phase 3 — Loop-closing (only if Phase 1 indexing shows life at the 90-day gate)

**M12. Companion-Reader mode (full)** — `?listening=1` (or saved preference) kills scanlines, bumps type, hides nav, keeps J-card visible. Becomes the second-screen surface the iOS app can deep-link to.
*Belongs:* serves a known XLIIs audience (in-app users), not generic web visitors.

**M13. Universal links + in-app share-to-web** — `apple-app-site-association` on the website + share button in iOS that produces `xliis.app/shows/...` URL. Closes the web-to-app loop and creates a shareable canonical URL per show.
*Belongs:* both surfaces are the project; this stitches them together.

**M14. Archive.org cross-linking** — every show page already links to its archive.org item (Phase 1). The Phase 3 addition: comment on archive.org show pages with a link back to the XLIIs annotated version. High-authority backlink, native to the Dead-tape world.
*Belongs:* archive.org IS the source of these specific tapes; the link is provenance, not promotion.

**M15. Targeted artifact outreach** — share specific XLIIs artifacts (J-card gallery, a specific collector page, a specific show page) with Lost Live Dead, Light Into Ashes, r/gratefuldead, Headyversion. Only artifacts. Never posts about "the app." Never compared to other apps.
*Belongs:* sharing what's specifically ours.

### Phase 4 — Deferred pending review burden

**M16. Sensory sidebars** per show — pull WEATHER / TAPER / WORLD-THAT-WEEK details out of `review` into typed sidebars ("sun set behind Bob Weir's head," "Billy Degen had eaten mushrooms," "Nixon had nine days left"). Genuinely uses voice as leverage but requires per-show curation/review. Defer until Phase 1-3 are validated.
*Belongs:* extracts that already exist in our prose; doesn't invent.

### CUT (failed fit test)

- **Old M4 "the tape itself" treatment** — image generation work; cut per project rule.
- **Old M7 AI-citation comparison page** — references other Dead apps; permanently cut and rule extended project-wide.
- **Old M9 song aggregator pages (`/songs/dark-star/`)** — songs aren't part of the XLIIs project framing; collections, collectors, and shows are. A `/songs/` axis would be SEO graft. **Cut.** (Could be revisited only if reframed as "Notable performances *from the four collectors' picks*" — but that's a project for later, not now.)
- **Old M14 "this week in Dead history"** — generic Dead content, doesn't belong to our four collections; cut.

### DEFERRED to Phase 2 wholesale

- All social presence (Bluesky, Mastodon, X, Reddit). Phase 1 needs to ship and have something worth linking to before social makes sense.

---

## 5. Recommendation (sequenced with measurement)

**Phase 0 — Baseline (½ day).** Snapshot today's web page views, App Store weekly installs by source, and submit current sitemap-less site to Search Console so we have a "before."

**Phase 1a — Decide & prototype (1 session).** Three decisions in §6. Hand-build 5 show pages as the template pressure test before generating the other 165.

**Phase 1b — Ship the library (1-2 sessions).** Python generator emits `/shows/<slug>.html` for the other 165 + sitemap + robots + schema + Search Console submit + collection page link-through + global App Store campaign params + `?listening=1` instrumentation.

**Phase 2 — Cheap differentiation (week 2).** M8 (collector pages), M9 (multilingual capsules), M10 (J-card gallery), M11 (fuzzy search).

**Phase 3 — Loop-closing (only after 90-day gate).** M12, M13, M14, M15.

**Phase 4 — Deferred.** M16.

**Decision gate at 90 days** (longer than v1's 60 — Buddy's note on Google indexing latency for new sites): Search Console showing impressions on show pages? Weekly App Store installs moved vs Phase 0 baseline? Any single show pages getting >5 organic sessions/week? If indexing is dead at 90 days with sitemap + 170 pages live + schema, Google rejected it — don't ship Phase 3 expecting attribution to fix it.

---

## 6. Phase 1a decisions to nail down before generating

### 6.1 Canonical prose field — RESOLVED

`review` is canonical. The iOS app displays only `review` (now-playing liner notes modal, show detail panel, collection card preview, all in `xlii-build/www/index.html`). `about` is dead data (validation only). The website mirrors `review` verbatim.

### 6.2 ALL-CAPS treatment — RECOMMENDED PATH

Per your instruction: source = sentence case, visual caps via CSS `text-transform: uppercase` where the identity calls for it. Reason: crawlers, AI assistants, and screen readers read the underlying HTML, not the rendered display.

**Concrete plan:**
1. One-time pass to convert `shows.json` `review` field from ALL CAPS → proper sentence case. Mechanical lowercase + sentence-case-after-period mangles proper nouns (`hartford`, `garcia`, `bob weir`). Three options:
   - **(a) LLM-assisted conversion + manual review.** Faster, but introduces a content-edit step. ~2-3 hours total to convert all 170 + spot-check.
   - **(b) Hand-edit all 170.** ~25 hours. Highest fidelity, no review burden.
   - **(c) Mechanical lowercase + CSS uppercase + accept that screen readers/crawlers see lowercase proper nouns.** Cheapest, worst for accessibility, fine for SEO (Google handles it). The "no proper nouns" version is uglier but defensible.

   **Recommendation: (a).** The LLM pass is one-shot, reviewable as a diff, and the result is a permanent improvement to the data — not a runtime behavior. ~3 hours, one time.

2. iOS app change in lockstep: add `text-transform: uppercase` to `.show-detail-review` and `.about-text` in `xlii-build/www/index.html` so the app displays the same visual identity from the new sentence-case source. Required to ship together — drift would mean the app suddenly shows lowercase prose.

3. Website CSS: same — `.review-prose { text-transform: uppercase; }` (or whatever class we settle on). On Companion-Reader mode in Phase 3, this gets toggled off for legibility.

### 6.3 Single source of truth — RECOMMENDED PATH

Two surfaces (xliis-app website, xlii-build iOS app) currently hold the same data via copy-paste. Drift is guaranteed if we just fork it. Four options:

- **(a) Symlink** — fragile across machines.
- **(b) Copy at build time** — the xliis-app build script reads `xlii-build/www/shows.json` directly. Brittle if directory structure changes; requires both checkouts on the same machine.
- **(c) Move shows.json to a third repo, both consume.** Clean but adds a third repo.
- **(d) Publish shows.json as a JSON endpoint, both consume at build time + cache.** Cleanest long-term.
- **(e) Pragmatic: xlii-build remains canonical. xliis-app's generator script reads `../../xlii-build/www/shows.json` at generation time, fails noisily if file missing or hash unchanged from last commit (so we notice when iOS data updates).**

**Recommendation: (e) for Phase 1.** Note (d) as the right Phase 4 cleanup if this site survives the 90-day gate. The relative path constraint is fine because both repos live under the same workspace on the only machine that builds either.

### 6.4 URL slugs

`/shows/YYYY-MM-DD-venue-slug` where venue-slug is `lower(venue_name)` with non-alphanumerics → `-`. Multi-night runs at the same venue get distinct dates so no collision. Pre-flight: dedupe-check the 170 generated slugs before publishing.

---

## 7. Out of scope

- Framework rewrite (stay static + Python generator).
- Comments, accounts, on-site forum.
- Paid acquisition.
- Newsletter.
- LLM-rewriting curatorial prose at runtime (only meta tags get auto-generated; the one-time caps→sentence-case conversion is a single reviewable diff, not a pipeline).
- Public-facing references to other Dead apps anywhere (project-wide rule).
- Generated images of any kind (project-wide rule).
- Generic Dead content not tied to our four collections (project-wide fit-test rule).
- Songs as a navigation axis (fails fit test).
- Social posting in Phase 1; deferred to Phase 2.

---

## 8. Buddy review of v2

Run after the fit-test revision. Buddy was specifically asked: are any remaining moves still SEO-driven grafts that don't belong to the actual project?

> Pending — see appendix in next commit.

---

## Appendix A — open questions for Dave

1. **Caps conversion path (§6.2).** OK to use option (a) — LLM-assisted convert + manual review of the diff?
2. **iOS lockstep change.** Adding `text-transform: uppercase` to `.show-detail-review` / `.about-text` in the iOS web view is a low-risk visual no-op IF the conversion is correct. OK to ship as one PR alongside the website launch?
3. **Multilingual translations (M9).** Use existing collector prose translated by LLM + native-speaker review where available, or write fresh in each language? Fresh = much more work; translated = mirrors the existing English nonfiction voice.
4. **Phase 3 universal links.** Closing the web-to-app loop touches the iOS app's entitlements, which means a new App Store build. Is it OK to plan for this as part of the next iOS release rather than a hot patch?
