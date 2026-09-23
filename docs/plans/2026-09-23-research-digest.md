# Research Digest Plan (scheduled search for new papers)

> **For agentic workers:** Work phase by phase, in order. Steps use checkbox (`- [ ]`) syntax for tracking. Check items off as they ship and keep them for traceability.

**Goal:** A scheduled job finds newly published, publicly available research relevant to this project (contagion models, sovereign debt networks, the data sources used here) and adds it to the repo as a dated digest, in a PR, for review.

**Evaluation is manual.** The owner reviews each digest with AI tools of their own choosing. The job only *finds and lists* papers. It does not summarise, judge relevance with an LLM, or map papers to plan phases, so no model API key or usage cost is involved.

**Companion plans:** see [`README.md`](README.md). This plan follows the refresh plan (#25): scheduled job → PR → a person merges, plus a single issue if it breaks.

## Sources (checked 2026-09-23)

| Source | Query | Status |
| --- | --- | --- |
| **OpenAlex**, papers citing the core works | `filter=cites:<id>,from_publication_date:<since>` | Works without a key. Anonymous *search* was rate-limited, so use the free API key (repo secret `OPENALEX_API_KEY`). Responses now report `cost_usd`, so check the free-tier limits |
| **arXiv API** | abstract phrase search, sorted by `submittedDate` | Works (`https://export.arxiv.org/api/query`) |
| **BIS working papers** RSS | `https://www.bis.org/doclist/wppubls.rss` (RSS 1.0 / RDF) | Returns 200 |
| IMF, ECB, NBER working-paper feeds | RSS | **Not checked yet** |

**Core papers to track citations of** (OpenAlex ids checked):

- `W2117899923`: Battiston et al. 2012, *DebtRank: Too Central to Fail?* (936 citations)
- `W1944269902`: Bardoscia et al. 2015, *DebtRank: A Microscopic Foundation for Shock Propagation* (150)
- `W2162337502`: Eisenberg & Noe 2001, *Systemic Risk in Financial Systems* (1,431)

**Noise is the main risk.** Citations alone are too loose: of the 20 papers citing DebtRank since 2026-08-01, the first one returned was about urban innovation networks in the Yangtze River Delta. So a paper needs a citation **and** a keyword match to be included, or at least two keyword matches without a citation.

## Design

- **Script:** `research/digest.py`, standard library only (`urllib`, `xml.etree`, `json`), so there is no dependency install in CI.
- **Settings at the top of the script:** the core-paper ids, the keywords (e.g. "contagion", "systemic risk", "DebtRank", "sovereign debt", "cross-border", "interbank", "fire sale", "network"), the arXiv queries and the feed URLs. Changing what it looks for is a one-line edit.
- **State:** `docs/research/seen.json` stores `last_run` plus the ids already listed (DOI, OpenAlex id, arXiv id or URL), so nothing appears twice.
- **Output:** `docs/research/YYYY-MM-DD.md`, one row per paper: title, authors, date, source, link, **why it matched** (which core paper it cites, and/or which keywords), plus an empty "Notes" column for the manual review.
- **Ranking and cap:** citing a core paper +3, a keyword in the title +2, a keyword in the description +1. The 15 highest-scoring papers are listed, and the digest says how many more matched.
- **No copied abstracts** (copyright): only links and metadata, plus the match reason written by the script.
- **Workflow:** `.github/workflows/research-digest.yml`, weekly cron plus `workflow_dispatch`. If a digest was written, it opens a PR on the branch `research/digest-YYYY-MM-DD`. If nothing new was found, it does nothing.

**Review loop:** merge the PR to keep the digest (after filling in "Notes"), or close it to discard. `seen.json` is updated in the same PR, so a closed PR means those papers are shown again next week. **Decide in Phase 0** whether closing should still mark them as seen.

---

## Phase 0: Sanity check (do this first)

- [ ] **Re-check the sources** and record the date and results here:
  - the OpenAlex `cites:` filter;
  - OpenAlex's free-tier limits and what `cost_usd` means for a weekly run;
  - the arXiv API;
  - the BIS RSS feed.
  Check the IMF, ECB and NBER feeds; add the ones that work, drop the ones that don't.
- [ ] **Measure the noise before building the output:** run the queries by hand for the last 3 months. Count how many papers pass the "citation plus keyword" rule, and how many of those are actually relevant. Adjust the keywords and the cap until a typical week lists about 5–15 papers.
- [ ] **Check the core-paper list.** Should the literature from granularity-plan Phase 7 be tracked too (Bardoscia 2017 *Pathways towards instability*, Cimini 2015, Greenwood–Landier–Thesmar)? Look up and verify their OpenAlex ids before adding them.
- [ ] **Decide the review loop:** does a closed PR mark its papers as seen or not? Record the decision here.
- [ ] **Line up with the companion plans:** the same PR and failure-alert pattern as #25, and failure alerts can share its single-issue helper.
- [ ] Write the result here (what changed, what was dropped) before starting Phase 1.

## Phase 1: Script

- [ ] `research/digest.py`: fetchers for OpenAlex, arXiv and RSS; normalising results into one record shape; removing duplicates (by DOI, otherwise by normalised title); scoring; the cap; writing the digest; updating `seen.json`.
- [ ] Each source fails on its own: one source being down is noted in the digest ("BIS feed unavailable this run"), and the others still produce results.
- [ ] Be polite to the APIs: a `mailto` / user agent, the OpenAlex key from the environment, and a pause between requests, since the arXiv API asks for ~3 s.
- [ ] Tests (`research/test_digest.py`) using recorded fixture responses, with no network: scoring, duplicate removal, the cap, `seen.json` round-trip, and the "one source down" path. Add a `research` job to `ci.yml` (per test-strategy plan #26, Phase 4).

## Phase 2: Workflow

- [ ] `.github/workflows/research-digest.yml`: weekly cron (e.g. Monday 06:00 UTC) plus `workflow_dispatch`, `permissions: contents: write, pull-requests: write`, and `shell: bash` for any command piped into `tee`. The latter follows `refresh-data.yml`'s reasoning: it makes a crash fail the job instead of passing silently.
- [ ] Open the PR with a body giving the number of papers per source, which sources were unavailable, and a link to the digest file.
- [ ] Failure: open or update **one** `research-digest-failed` issue, not one per run.
- [ ] Run `workflow_dispatch` once by hand, and check the first PR before relying on the schedule.

## Phase 3: Tune after a month

- [ ] After 4 digests, review what was useful and adjust the keywords, cap, sources and schedule (weekly vs. every two weeks). Record the changes here.
- [ ] Optional: a `docs/research/README.md` index of the papers that were kept, grouped by the plan phase they informed. Written by hand during review, not generated.

## Out of scope

- LLM summarising or relevance judgement inside the job. The owner evaluates manually.
- Downloading or storing PDFs or full abstracts.
- Paywalled sources.
