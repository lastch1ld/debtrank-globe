"""The probe's logic, against canned responses: no network."""
import datetime as dt
import json

import pytest

import probe_issues
import probe_sources as probe

TODAY = dt.date(2026, 10, 9)


def source(**over):
    base = {
        "id": "s",
        "name": "A source",
        "url": "https://example.test/data",
        "fetch": "fetch_s.py",
        "may_change": ["edges"],
        "probe": "change+stale",
        "detect": {"type": "header"},
        "cadence": "quarterly",
        "stale_after_days": 100,
        "licence": "CC BY 4.0",
        "attribution": "Someone",
    }
    return {**base, **over}


def fake(headers=None, body=b""):
    """A fetch() that answers HEAD with `headers` and GET with `body`."""
    calls = []

    def fetch(url, method="GET"):
        calls.append(method)
        return {k.lower(): v for k, v in (headers or {}).items()}, (b"" if method == "HEAD" else body)

    fetch.calls = calls
    return fetch


class TestRegistry:
    def test_the_real_registry_is_valid_and_every_source_has_a_licence(self):
        registry = json.loads(probe.REGISTRY.read_text(encoding="utf-8"))
        assert probe.validate_registry(registry) == []
        for s in registry["sources"]:
            assert s["licence"] and s["attribution"], s["id"]

    def test_the_lock_only_names_registered_sources(self):
        registry = json.loads(probe.REGISTRY.read_text(encoding="utf-8"))
        lock = json.loads(probe.LOCK.read_text(encoding="utf-8"))
        assert set(lock["sources"]) <= {s["id"] for s in registry["sources"]}

    @pytest.mark.parametrize("field", ["licence", "attribution", "fetch", "may_change"])
    def test_a_missing_required_field_is_rejected(self, field):
        s = source()
        del s[field]
        assert any(field in e for e in probe.validate_registry({"sources": [s]}))

    def test_other_mistakes_are_rejected(self):
        assert probe.validate_registry({"sources": [source(probe="sometimes")]})
        assert probe.validate_registry({"sources": [source(), source()]})  # duplicate id
        assert probe.validate_registry({"sources": [source(stale_after_days=None)]})
        assert probe.validate_registry({"sources": [source(detect=None)]})
        assert probe.validate_registry({"sources": [source(detect={"type": "json"})]})
        assert probe.validate_registry({"sources": [source(detect={"type": "hash"})]})
        assert probe.validate_registry({"sources": []})

    def test_an_unprobed_source_needs_no_detect_or_threshold(self):
        s = source(probe="none")
        del s["detect"], s["stale_after_days"]
        assert probe.validate_registry({"sources": [s]}) == []


class TestObserve:
    def test_an_etag_is_the_version_and_last_modified_the_as_of_date(self):
        got = probe.observe(source(), fake({"ETag": 'W/"abc"', "Last-Modified": "Wed, 07 Oct 2026 09:45:49 GMT"}))
        assert got == {"value": 'W/"abc"', "as_of": "2026-10-07", "how": "etag"}

    def test_last_modified_is_the_fallback_version(self):
        got = probe.observe(source(), fake({"Last-Modified": "Wed, 07 Oct 2026 09:45:49 GMT"}))
        assert got["how"] == "last-modified" and got["as_of"] == "2026-10-07"

    def test_with_neither_it_hashes_the_body(self):
        fetch = fake({}, b"hello")
        got = probe.observe(source(), fetch)
        assert got["how"] == "sha256" and got["as_of"] is None
        assert fetch.calls == ["HEAD", "GET"]
        assert got == probe.observe(source(), fake({}, b"hello"))
        assert got["value"] != probe.observe(source(), fake({}, b"hello!"))["value"]

    def test_json_reads_a_dotted_path_through_lists_and_dicts(self):
        body = json.dumps({"datasets": {"docs": [{"updated_at": "2025-04-08"}]}}).encode()
        s = source(detect={"type": "json", "path": "datasets.docs.0.updated_at"})
        assert probe.observe(s, fake(body=body)) == {"value": "2025-04-08", "as_of": "2025-04-08", "how": "json"}

    def test_json_value_that_is_not_a_date_gives_no_as_of(self):
        s = source(detect={"type": "json", "path": "0.rev"})
        assert probe.observe(s, fake(body=b'[{"rev": 7}]')) == {"value": "7", "as_of": None, "how": "json"}


class TestEvaluate:
    obs = {"value": "v2", "as_of": "2026-09-01", "how": "etag"}

    def test_same_version_is_neither_changed_nor_stale(self):
        v = probe.evaluate(source(), self.obs, {"value": "v2"}, TODAY)
        assert (v["changed"], v["unlocked"], v["stale"], v["age_days"]) == (False, False, False, 38)

    def test_a_different_version_is_changed(self):
        assert probe.evaluate(source(), self.obs, {"value": "v1"}, TODAY)["changed"]

    def test_no_lock_entry_counts_as_changed_and_says_so(self):
        v = probe.evaluate(source(), self.obs, None, TODAY)
        assert v["changed"] and v["unlocked"]

    def test_stale_comes_from_the_sources_own_date_not_from_the_lock(self):
        old = {"value": "v1", "as_of": "2025-04-08", "how": "json"}
        v = probe.evaluate(source(), old, {"value": "v1"}, TODAY)
        assert v["stale"] and not v["changed"] and v["age_days"] == 549

    def test_the_age_threshold_is_exclusive(self):
        on_the_line = {"value": "v", "as_of": (TODAY - dt.timedelta(days=100)).isoformat(), "how": "etag"}
        assert not probe.evaluate(source(), on_the_line, {"value": "v"}, TODAY)["stale"]

    def test_unknown_age_is_not_reported_stale(self):
        v = probe.evaluate(source(), {"value": "v", "as_of": None, "how": "sha256"}, {"value": "v"}, TODAY)
        assert not v["stale"] and v["age_days"] is None

    def test_a_stale_only_source_never_reports_a_change(self):
        v = probe.evaluate(source(probe="stale"), self.obs, None, TODAY)
        assert not v["changed"] and not v["unlocked"]


class TestRun:
    registry = {"sources": [source(id="a"), source(id="b", url="https://example.test/b"), source(id="c", probe="none")]}

    def test_one_failing_source_does_not_stop_the_others(self):
        def fetch(url, method="GET"):
            if url.endswith("/b"):
                raise OSError("connection reset")
            return {"etag": "v1"}, b""

        verdicts, errors, observations = probe.run(self.registry, {"sources": {}}, TODAY, fetch)
        assert [v["id"] for v in verdicts] == ["a"]
        assert errors == [{"id": "b", "error": "OSError: connection reset"}]
        assert set(observations) == {"a"}

    def test_unprobed_sources_are_not_contacted(self):
        fetch = fake({"etag": "v"})
        probe.run(self.registry, {"sources": {}}, TODAY, fetch)
        assert fetch.calls == ["HEAD", "HEAD"]

    def test_only_limits_which_sources_are_probed(self):
        verdicts, _, _ = probe.run(self.registry, {"sources": {}}, TODAY, fake({"etag": "v"}), only={"b"})
        assert [v["id"] for v in verdicts] == ["b"]


def test_the_lock_only_records_change_and_stale_sources():
    registry = {"sources": [source(id="a"), source(id="w", probe="stale")]}
    obs = {"a": {"value": "v", "as_of": None, "how": "etag"}, "w": {"value": "x", "as_of": None, "how": "json"}}
    lock = probe.updated_lock(registry, {"sources": {"keep": {"value": "k"}}}, obs, TODAY)
    assert set(lock["sources"]) == {"keep", "a"}
    assert lock["sources"]["a"]["observed_at"] == "2026-10-09"


class TestIssues:
    def verdict(self, **over):
        return {
            "id": "s", "name": "A source", "probe": "change+stale", "changed": False, "unlocked": False, "stale": False,
            "as_of": "2026-10-07", "age_days": 2, "stale_after_days": 150, "version": "v2", "how": "etag", "fetch": "fetch_s.py",
            **over,
        }

    def report(self, *results, errors=()):
        return {"today": "2026-10-09", "results": list(results), "errors": list(errors)}

    def test_a_quiet_week_opens_nothing(self):
        assert probe_issues.plan_issues(self.report(self.verdict()), 0) == []

    def test_a_change_and_a_stale_source_each_get_their_own_labelled_issue(self):
        issues = probe_issues.plan_issues(self.report(self.verdict(changed=True), self.verdict(name="B", stale=True, age_days=549)), 0)
        assert [(i.label, i.title) for i in issues] == [
            ("data-changed", "Source changed: A source"),
            ("data-stale", "Source stale: B"),
        ]
        assert "549 days" in issues[1].body

    def test_a_missing_baseline_is_explained(self):
        (issue,) = probe_issues.plan_issues(self.report(self.verdict(changed=True, unlocked=True)), 0)
        assert "no baseline" in issue.body.lower()

    def test_an_unreachable_source_is_a_failure_issue_and_the_rest_still_report(self):
        report = self.report(self.verdict(changed=True), errors=[{"id": "b", "error": "OSError: boom"}])
        labels = [i.label for i in probe_issues.plan_issues(report, 1)]
        assert labels == ["data-changed", "data-refresh-failed"]

    @pytest.mark.parametrize("report,code", [(None, 0), (None, 2), ({"results": [], "errors": []}, 2)])
    def test_a_probe_that_died_is_one_failure_issue(self, report, code):
        (issue,) = probe_issues.plan_issues(report, code)
        assert issue.label == "data-refresh-failed" and issue.title == "Data probe failed"

    def test_an_issue_already_open_is_not_opened_again(self):
        wanted = probe_issues.plan_issues(self.report(self.verdict(changed=True), self.verdict(name="B", stale=True)), 0)
        open_now = {"data-changed": {"Source changed: A source"}, "data-stale": set()}
        assert [i.title for i in probe_issues.new_issues(wanted, open_now)] == ["Source stale: B"]

    def test_the_same_title_under_another_label_does_not_count(self):
        wanted = probe_issues.plan_issues(self.report(self.verdict(changed=True)), 0)
        assert probe_issues.new_issues(wanted, {"data-stale": {"Source changed: A source"}}) == wanted
