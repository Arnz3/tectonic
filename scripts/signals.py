"""Derive expertise signals for the "Wie weet het?" view.

Every source ends up as one list of signals: a person linked to a topic, with a role and an age.

    data/meetings.json   fictional meeting transcripts → explained / decided / asked / attended
    data/workspace.json  people, topics, Teams answers and resolved tickets
    data/documents.json  document owners and content contributors

Output: data/signals.json (people, topics, signals). Confidential sources are dropped here,
so no part of the UI can ever show them.

Usage:
    python scripts/signals.py            # meetings classified by Gemini (cached), rules as fallback
    python scripts/signals.py --no-llm   # rules only

analyze.py runs this as its last step.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MEETINGS_PATH = ROOT / "data" / "meetings.json"
WORKSPACE_PATH = ROOT / "data" / "workspace.json"
DOCUMENTS_PATH = ROOT / "data" / "documents.json"
SIGNALS_PATH = ROOT / "data" / "signals.json"

VISIBILITY = {"open", "beperkt", "vertrouwelijk"}
CONFIDENTIAL = "vertrouwelijk"
MEETING_ROLES = {"explained", "decided", "asked"}

# A statement this long (in words) on a topic counts as an explanation.
MIN_EXPLAIN_WORDS = 20
DECISION_PATTERN = re.compile(r"\b(we beslissen|beslist|besluiten|afgesproken|we spreken af|vanaf nu)\b", re.IGNORECASE)


def load_json(path: Path):
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def topic_patterns(topics: list[dict]) -> dict[str, re.Pattern]:
    """Whole-word match on the topic id and its synonyms."""
    patterns = {}
    for t in topics:
        words = sorted({t["id"], *t["synonyms"]}, key=len, reverse=True)
        patterns[t["id"]] = re.compile(r"\b(" + "|".join(re.escape(w) for w in words) + r")\b", re.IGNORECASE)
    return patterns


def topics_in(text: str, patterns: dict[str, re.Pattern]) -> list[str]:
    """Topics mentioned in the text, in order of first mention."""
    found = []
    for topic, pattern in patterns.items():
        match = pattern.search(text)
        if match:
            found.append((match.start(), topic))
    return [t for _, t in sorted(found)]


def best_sentence(text: str, pattern: re.Pattern | None) -> str:
    """A literal sentence from the line, preferably one that names the topic."""
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]
    if pattern:
        for s in sentences:
            if pattern.search(s) and len(s.split()) >= 6:
                return s
    return next((s for s in sentences if len(s.split()) >= 6), text.strip())


# --- Rules -------------------------------------------------------------------------

# Same order as the weights in the frontend: explaining shows more knowledge than deciding.
ROLE_RANK = {"explained": 3, "decided": 2, "asked": 1}


def rule_based_meeting(meeting: dict, patterns: dict[str, re.Pattern]) -> list[dict]:
    """Per (topic, person) the strongest role and its quote. A line without topic words
    continues the topic of the previous line."""
    found: dict[tuple[str, str], dict] = {}
    current: str | None = None
    for line in meeting["transcript"]:
        text, speaker = line["text"], line["speaker"]
        mentioned = topics_in(text, patterns)
        if mentioned and current not in mentioned:
            current = mentioned[0]
        if current is None:
            continue
        if text.rstrip().endswith("?"):
            role = "asked"
        elif DECISION_PATTERN.search(text):
            role = "decided"
        elif len(text.split()) >= MIN_EXPLAIN_WORDS:
            role = "explained"
        else:
            role = None  # spoke briefly: counts as attended
        key = (current, speaker)
        found.setdefault(key, {"topic": current, "person": speaker, "role": None, "quote": ""})
        if role and ROLE_RANK[role] > ROLE_RANK.get(found[key]["role"] or "", 0):
            sentence = text.strip() if role == "asked" else best_sentence(text, patterns[current])
            if role == "decided":
                sentence = next((s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if DECISION_PATTERN.search(s)), sentence)
            found[key].update(role=role, quote=sentence)
    return [f for f in found.values() if f["role"]] + [
        {"topic": t, "person": p, "role": "attended", "quote": ""} for (t, p), f in found.items() if not f["role"]
    ]


# --- LLM ---------------------------------------------------------------------------

PROMPT = """Je leest het transcript van een interne meeting bij een HR- en payrolldienstverlener.
Bepaal wie welke kennis toonde over welk onderwerp.

Antwoord uitsluitend met één JSON-object, zonder uitleg of opmaak eromheen:
{{"signals": [{{"topic": "...", "person": "...", "role": "explained" | "decided" | "asked", "quote": "..."}}]}}

- "topic": exact één van deze id's: {topic_ids}. Onderwerpen die niet in de lijst staan, laat je weg.
- "person": exact de naam van de spreker zoals in het transcript.
- "role": "explained" als de persoon inhoudelijk uitleg gaf, "decided" als de persoon een beslissing nam of vastlegde, "asked" als de persoon een vraag stelde.
- "quote": de LETTERLIJKE zin van die persoon die dit aantoont. Kopieer exact, teken voor teken. Nooit parafraseren.
- Hooguit één signaal per combinatie van onderwerp en persoon: kies de sterkste rol (explained > decided > asked).

Onderwerpen:
{topic_list}

Transcript van "{title}":
{transcript}
"""


def meeting_hash(meeting: dict, topics: list[dict]) -> str:
    payload = json.dumps([meeting["transcript"], [t["id"] for t in topics]], ensure_ascii=False)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def parse_meeting_verdict(raw: str, meeting: dict, topic_ids: set[str]) -> list[dict] | None:
    from analyze import normalize_space

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("signals"), list):
        return None
    said: dict[str, str] = {}
    for line in meeting["transcript"]:
        said[line["speaker"]] = said.get(line["speaker"], "") + " " + normalize_space(line["text"])
    result, seen = [], set()
    for s in data["signals"]:
        if not isinstance(s, dict) or not all(isinstance(s.get(k), str) for k in ("topic", "person", "role", "quote")):
            continue
        quote = normalize_space(s["quote"])
        if s["topic"] not in topic_ids or s["person"] not in said or s["role"] not in MEETING_ROLES:
            continue
        # Quotes must be literal; anything else is dropped.
        if not quote or quote not in said[s["person"]]:
            print(f"  Waarschuwing: citaat van {s['person']} in {meeting['id']} staat niet letterlijk in het transcript; weggelaten.",
                  file=sys.stderr)
            continue
        if (s["topic"], s["person"]) in seen:
            continue
        seen.add((s["topic"], s["person"]))
        result.append({"topic": s["topic"], "person": s["person"], "role": s["role"], "quote": quote})
    return result


def llm_meeting(meeting: dict, topics: list[dict], api_key: str | None, cache: dict) -> list[dict] | None:
    from analyze import GEMINI_MODEL, call_gemini

    key, digest = f"meeting:{meeting['id']}", meeting_hash(meeting, topics)
    cached = cache.get(key)
    if cached and cached.get("hash") == digest:
        return cached["signals"]
    if not api_key:
        return None
    prompt = PROMPT.format(
        topic_ids=", ".join(t["id"] for t in topics),
        topic_list="\n".join(f"- {t['id']}: {t['label']} ({', '.join(t['synonyms'])})" for t in topics),
        title=meeting["title"],
        transcript="\n".join(f"{l['speaker']}: {l['text']}" for l in meeting["transcript"]),
    )
    try:
        raw = call_gemini(prompt, api_key)
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, IndexError, ValueError) as err:
        print(f"  Gemini-fout voor {key}: {err}; regels worden gebruikt.", file=sys.stderr)
        return None
    result = parse_meeting_verdict(raw, meeting, {t["id"] for t in topics})
    if result is None:
        print(f"  Ongeldige Gemini-output voor {key}; regels worden gebruikt.", file=sys.stderr)
        return None
    print(f"  {key}: {len(result)} signalen")
    cache[key] = {"hash": digest, "model": GEMINI_MODEL, "signals": result}
    return result


# --- Signals -----------------------------------------------------------------------

def check_visibility(item: dict) -> bool:
    if item.get("visibility") not in VISIBILITY:
        print(f"  Waarschuwing: {item.get('id')} heeft geen geldige visibility; overgeslagen.", file=sys.stderr)
        return False
    return item["visibility"] != CONFIDENTIAL


def meeting_signals(meetings: list[dict], topics: list[dict], use_llm: bool) -> list[dict]:
    from analyze import load_api_key, load_cache, save_cache

    patterns = topic_patterns(topics)
    api_key = load_api_key() if use_llm else None
    cache = load_cache() if use_llm else {}
    if use_llm and not api_key:
        print("Geen GEMINI_API_KEY gevonden; meetings uit de cache of met regels.", file=sys.stderr)

    signals = []
    skipped = 0
    for m in meetings:
        if not check_visibility(m):
            skipped += 1
            continue
        extracted = (llm_meeting(m, topics, api_key, cache) if use_llm else None) or rule_based_meeting(m, patterns)
        # Attendees who said nothing on a topic that was discussed were still there.
        discussed = sorted({e["topic"] for e in extracted}, key=[t["id"] for t in topics].index)
        for topic in discussed:
            people = [
                {"name": e["person"], "role": e["role"], "quote": e["quote"]}
                for e in extracted if e["topic"] == topic
            ]
            named = {p["name"] for p in people}
            people += [{"name": a, "role": "attended", "quote": ""} for a in m["attendees"] if a not in named]
            people = [p for p in people if p["role"] != "attended"] + [p for p in people if p["role"] == "attended"]
            signals.append({
                "id": f"{m['id']}:{topic}",
                "type": "meeting",
                "topic": topic,
                "daysAgo": m["daysAgo"],
                "title": m["title"],
                "organizer": m["organizer"],
                "people": people,
                "visibility": m["visibility"],
                "allowed": m["allowed"],
            })
    if use_llm:
        save_cache(cache)
    if skipped:
        print(f"{skipped} vertrouwelijke meeting(s) overgeslagen.")
    return signals


def workspace_signals(workspace: dict) -> list[dict]:
    signals = []
    for msg in workspace["teams_messages"]:
        if check_visibility(msg):
            signals.append({
                "id": msg["id"], "type": "teams", "topic": msg["topic"], "daysAgo": msg["daysAgo"],
                "title": f"{msg['channel']}: {msg['title']}",
                "people": [{"name": msg["answered_by"], "role": "answered", "quote": msg["quote"]}],
                "visibility": msg["visibility"], "allowed": msg["allowed"],
            })
    for ticket in workspace["tickets"]:
        if check_visibility(ticket):
            signals.append({
                "id": ticket["id"], "type": "ticket", "topic": ticket["topic"], "daysAgo": ticket["daysAgo"],
                "title": ticket["title"],
                "people": [{"name": ticket["resolved_by"], "role": "resolved", "quote": ticket["quote"]}],
                "visibility": ticket["visibility"], "allowed": ticket["allowed"],
            })
    return signals


def document_signals(docs: list[dict], topic_ids: set[str]) -> list[dict]:
    """Owners and content contributors. Age is measured from the newest change in the dataset,
    so the demo stays the same on every run."""
    today = max(date.fromisoformat(d["modified"]) for d in docs)
    signals = []
    for d in docs:
        if d["topic"] not in topic_ids:
            continue
        latest: dict[str, str] = {}
        for h in d["history"]:
            if h["change"] == "inhoud" and h["date"] > latest.get(h["author"], ""):
                latest[h["author"]] = h["date"]
        people = []
        if d["owner"]:
            people.append({"name": d["owner"], "role": "owner", "quote": ""})
        people += [{"name": a, "role": "contributed", "quote": ""} for a in sorted(latest) if a != d["owner"]]
        if not people:
            continue
        # Client documents are only open to the payroll team serving that client.
        restricted = d["layer"] == "klant"
        signals.append({
            "id": d["id"], "type": "document", "topic": d["topic"],
            "daysAgo": (today - date.fromisoformat(d["modified"])).days,
            "title": d["title"], "status": d["status"],
            "people": people,
            "visibility": "beperkt" if restricted else "open",
            "allowed": ["Payroll BE"] if restricted else [],
        })
    return signals


def build_signals(use_llm: bool) -> dict:
    workspace = load_json(WORKSPACE_PATH)
    topics = workspace["topics"]
    signals = (
        meeting_signals(load_json(MEETINGS_PATH), topics, use_llm)
        + workspace_signals(workspace)
        + document_signals(load_json(DOCUMENTS_PATH), {t["id"] for t in topics})
    )
    known = {p["name"] for p in workspace["people"]}
    for s in signals:
        unknown = {p["name"] for p in s["people"]} - known
        if unknown:
            print(f"  Waarschuwing: onbekende personen in {s['id']}: {', '.join(sorted(unknown))}", file=sys.stderr)
    signals.sort(key=lambda s: (s["daysAgo"], s["id"]))
    return {"people": workspace["people"], "topics": topics, "signals": signals}


def run(use_llm: bool) -> None:
    result = build_signals(use_llm)
    with SIGNALS_PATH.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write("\n")
    by_type: dict[str, int] = {}
    for s in result["signals"]:
        by_type[s["type"]] = by_type.get(s["type"], 0) + 1
    print(f"{len(result['signals'])} signalen ({dict(sorted(by_type.items()))}) → {SIGNALS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-llm", action="store_true", help="rules only, no Gemini")
    run(use_llm=not parser.parse_args().no_llm)
