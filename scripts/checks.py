"""Find new documents that contradict what the library already says.

A document created in the last NEW_DAYS (counted from the newest change in the dataset) is
"new". It is compared with the existing documents on the same topic and in the same country
(not outdated, not client-specific). A contradiction becomes a check in data/checks.json; the
frontend turns it into a micro action: a short Teams message that the right person answers with
yes, no or something else.

Gemini decides when a key is set (the cached verdicts of analyze.py are reused); otherwise a
rule compares amounts (euro) and periods (days) sentence by sentence.

Usage:
    python scripts/checks.py            # Gemini when available, rules as fallback
    python scripts/checks.py --no-llm   # rules only

analyze.py runs this as its last step.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCUMENTS_PATH = ROOT / "data" / "documents.json"
CHECKS_PATH = ROOT / "data" / "checks.json"

NEW_DAYS = 7
# Client agreements may legitimately differ from the general rule.
COMPARABLE_LAYERS = {"wet", "sector", "procedure"}

AMOUNT = re.compile(r"€\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?euro\b", re.IGNORECASE)
DAYS = re.compile(r"\b(\d+)\s+(?:werk)?dagen\b", re.IGNORECASE)


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]


def facts(text: str) -> dict[str, dict[str, str]]:
    """Per kind ('euro', 'dagen') the values in the text and the first sentence naming each."""
    found: dict[str, dict[str, str]] = {"euro": {}, "dagen": {}}
    for s in sentences(text):
        for m in AMOUNT.finditer(s):
            value = (m.group(1) or m.group(2)).replace(".", ",")
            found["euro"].setdefault(value.removesuffix(",00"), s)
        for m in DAYS.finditer(s):
            found["dagen"].setdefault(m.group(1), s)
    return found


def rule_conflict(new: dict, old: dict) -> dict | None:
    """Both documents name an amount (or a number of days) and neither shares the other's value."""
    a, b = facts(new["text"]), facts(old["text"])
    for kind, label in (("euro", "een ander bedrag"), ("dagen", "een andere termijn")):
        if a[kind] and b[kind] and not set(a[kind]) & set(b[kind]):
            new_value, old_value = next(iter(a[kind])), next(iter(b[kind]))
            return {
                "statement_new": a[kind][new_value],
                "statement_existing": b[kind][old_value],
                "explanation": f"Het nieuwe document noemt {label} dan {old['title']}.",
            }
    return None


def llm_conflict(new: dict, old: dict, api_key: str | None, cache: dict) -> dict | None:
    from analyze import CONTRADICTORY, classify_with_llm

    # Same argument order as analyze.py (lower id first), so cached verdicts line up.
    first, second = sorted((new, old), key=lambda d: d["id"])
    verdict = classify_with_llm(first, second, api_key, cache)
    if not verdict or verdict["relation"] != CONTRADICTORY or not verdict["statement_a"] or not verdict["statement_b"]:
        return None
    by_id = {first["id"]: verdict["statement_a"], second["id"]: verdict["statement_b"]}
    return {"statement_new": by_id[new["id"]], "statement_existing": by_id[old["id"]], "explanation": verdict["explanation"]}


def build_checks(docs: list[dict], use_llm: bool) -> list[dict]:
    today = max(date.fromisoformat(d["modified"]) for d in docs)
    since = today - timedelta(days=NEW_DAYS)
    api_key, cache = None, {}
    if use_llm:
        from analyze import load_api_key, load_cache

        api_key, cache = load_api_key(), load_cache()

    checks = []
    for new in docs:
        if date.fromisoformat(new["created"]) < since:
            continue
        candidates = [
            d for d in docs
            if d["id"] != new["id"] and d["topic"] == new["topic"] and d["country"] == new["country"]
            and d["status"] != "verouderd" and d["layer"] in COMPARABLE_LAYERS and d["created"] < new["created"]
        ]
        # Approved and most recent first: that is what a reader would trust today.
        candidates.sort(key=lambda d: d["modified"], reverse=True)
        candidates.sort(key=lambda d: d["status"] != "goedgekeurd")
        for old in candidates:
            conflict = (llm_conflict(new, old, api_key, cache) if use_llm else None) or rule_conflict(new, old)
            if conflict:
                checks.append({
                    "id": f"check:{new['id']}:{old['id']}",
                    "new_doc": new["id"],
                    "existing_doc": old["id"],
                    "topic": new["topic"],
                    "daysAgo": (today - date.fromisoformat(new["created"])).days,
                    **conflict,
                })
                break
    if use_llm:
        from analyze import save_cache

        save_cache(cache)
    return checks


def run(use_llm: bool) -> None:
    with DOCUMENTS_PATH.open(encoding="utf-8") as f:
        docs = json.load(f)
    checks = build_checks(docs, use_llm)
    with CHECKS_PATH.open("w", encoding="utf-8") as f:
        json.dump({"checks": checks}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"{len(checks)} tegenstrijdige nieuwe document(en) → {CHECKS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-llm", action="store_true", help="rules only, no Gemini")
    run(use_llm=not parser.parse_args().no_llm)
