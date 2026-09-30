"""Precompute the knowledge graph for the "Kennisgraaf" view.

Reads data/documents.json and writes data/analysis.json with:
  - edges between related documents and their relation,
  - duplicate groups (copies of one original source),
  - per cluster the number of independent sources,
  - the recommended document per cluster and the reasons why,
  - per document the number of content/formatting changes per author.

Usage:
    python scripts/analyze.py            # classify the strongest pairs with Gemini
    python scripts/analyze.py --no-llm   # rule-based fallback only

The Gemini API key is read from GEMINI_API_KEY (environment or .env). LLM results are
cached in data/llm_cache.json, so repeated runs make no API calls.

See CLAUDE.md, section 5.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

ROOT = Path(__file__).resolve().parent.parent
DOCUMENTS_PATH = ROOT / "data" / "documents.json"
ANALYSIS_PATH = ROOT / "data" / "analysis.json"
LLM_CACHE_PATH = ROOT / "data" / "llm_cache.json"
ENV_PATH = ROOT / ".env"

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_TIMEOUT_SECONDS = 60

# Tunable thresholds.
SIM_EDGE = 0.35  # minimum similarity for a candidate edge
SIM_DUP = 0.9  # fallback: similarity at or above this counts as a duplicate
MAX_LLM_PAIRS = 12  # only the most similar same-country pairs go to the LLM

# Relations that can appear on an edge.
DUPLICATE = "duplicaat"
CONTRADICTORY = "tegenstrijdig"
SIMILAR = "gelijkaardig"
OTHER_SCOPE = "ander_toepassingsgebied"
CONSISTENT = "consistent"  # LLM verdict; the UI shows it as "gelijkaardig"
LLM_RELATIONS = {DUPLICATE, CONTRADICTORY, CONSISTENT}

# Common Dutch function words; without these every pair looks alike.
DUTCH_STOP_WORDS = sorted(
    set(
        """
        aan al alle alles als altijd andere ben bij daar dan dat de der deze die dit doch doen door
        dus een eens en er ge geen geweest haar had heb hebben heeft hem het hier hij hoe hun iemand
        iets ik in is ja je kan kon kunnen maar me meer men met mij mijn moet na naar niet niets nog
        nu of om omdat onder ons ook op over reeds te tegen toch toen tot u uit uw van veel voor want
        waren was wat we wel werd wezen wie wil worden wordt zal ze zelf zich zij zijn zo zonder zou
        elk elke hun jouw jij mag mogen moeten per steeds zoals
        """.split()
    )
)


def load_documents() -> list[dict]:
    with DOCUMENTS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def similarity_matrix(docs: list[dict]):
    corpus = [f"{d['title']}\n{d['text']}" for d in docs]
    vectorizer = TfidfVectorizer(lowercase=True, stop_words=DUTCH_STOP_WORDS)
    return cosine_similarity(vectorizer.fit_transform(corpus))


def candidate_pairs(docs: list[dict], sim) -> list[tuple[int, int, float]]:
    pairs = []
    for i in range(len(docs)):
        for j in range(i + 1, len(docs)):
            s = float(sim[i, j])
            if s >= SIM_EDGE:
                pairs.append((i, j, s))
    # Highest similarity first; ids as tie-breaker keep the output deterministic.
    pairs.sort(key=lambda p: (-p[2], docs[p[0]]["id"], docs[p[1]]["id"]))
    return pairs


def format_similarity(s: float) -> str:
    return f"{s:.2f}".replace(".", ",")


def fallback_relation(a: dict, b: dict, s: float) -> dict:
    if s >= SIM_DUP:
        return {
            "relation": DUPLICATE,
            "statement_a": "",
            "statement_b": "",
            "explanation": f"Vrijwel identieke tekst (gelijkenis {format_similarity(s)}).",
        }
    return {"relation": SIMILAR, "statement_a": "", "statement_b": "", "explanation": ""}


# --- LLM classification -------------------------------------------------------------

PROMPT = """Je vergelijkt twee interne documenten van een HR- en payrolldienstverlener.

Antwoord uitsluitend met één JSON-object, zonder uitleg of opmaak eromheen:
{{"relation": "duplicaat" | "tegenstrijdig" | "consistent", "statement_a": "...", "statement_b": "...", "explanation": "..."}}

- "duplicaat": in essentie dezelfde inhoud.
- "tegenstrijdig": ze doen een verschillende uitspraak over hetzelfde feit (bedrag, termijn, regel).
- "consistent": verwant, geen conflict.
- "statement_a" / "statement_b": de LETTERLIJKE zin uit document A en uit document B die van elkaar verschillen. Kopieer de zin exact, teken voor teken. Nooit parafraseren of verzinnen. Laat leeg ("") als er geen conflict is.
- "explanation": één zin in het Nederlands.

Document A
Titel: {title_a}
Land: {country_a}
Laag: {layer_a}
Tekst:
{text_a}

Document B
Titel: {title_b}
Land: {country_b}
Laag: {layer_b}
Tekst:
{text_b}
"""


def load_api_key() -> str | None:
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == "GEMINI_API_KEY":
                return value.strip().strip("\"'") or None
    return None


def cache_key(a: dict, b: dict) -> str:
    return "|".join(sorted((a["id"], b["id"])))


def content_hash(a: dict, b: dict) -> str:
    """Invalidates a cached verdict when either document's text changes."""
    first, second = sorted((a, b), key=lambda d: d["id"])
    return hashlib.sha256(f"{first['text']}\0{second['text']}".encode()).hexdigest()[:16]


def load_cache() -> dict:
    if not LLM_CACHE_PATH.exists():
        return {}
    try:
        return json.loads(LLM_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        print("Waarschuwing: llm_cache.json is onleesbaar en wordt genegeerd.", file=sys.stderr)
        return {}


def save_cache(cache: dict) -> None:
    LLM_CACHE_PATH.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def call_gemini(prompt: str, api_key: str) -> str:
    body = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}]}).encode()
    request = urllib.request.Request(
        GEMINI_URL.format(model=GEMINI_MODEL),
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=GEMINI_TIMEOUT_SECONDS) as response:
        payload = json.load(response)
    parts = payload["candidates"][0]["content"]["parts"]
    return "".join(p.get("text", "") for p in parts if not p.get("thought"))


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_verdict(raw: str, a: dict, b: dict) -> dict | None:
    """Validates the model output. Returns None when it is unusable."""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or data.get("relation") not in LLM_RELATIONS:
        return None
    fields = ("statement_a", "statement_b", "explanation")
    if not all(isinstance(data.get(f, ""), str) for f in fields):
        return None
    verdict = {"relation": data["relation"], **{f: normalize_space(data.get(f, "")) for f in fields}}

    # Statements must be quoted literally. Drop any that do not occur in the document.
    for field, doc in (("statement_a", a), ("statement_b", b)):
        if verdict[field] and verdict[field] not in normalize_space(doc["text"]):
            print(f"  Waarschuwing: {field} voor {a['id']}–{b['id']} staat niet letterlijk in {doc['id']}; weggelaten.",
                  file=sys.stderr)
            verdict[field] = ""
    if verdict["relation"] != CONTRADICTORY:
        verdict["statement_a"] = verdict["statement_b"] = ""
    return verdict


def classify_with_llm(a: dict, b: dict, api_key: str | None, cache: dict) -> dict | None:
    key, digest = cache_key(a, b), content_hash(a, b)
    cached = cache.get(key)
    if cached and cached.get("hash") == digest:
        return cached["verdict"]
    if not api_key:
        return None

    prompt = PROMPT.format(
        title_a=a["title"], country_a=a["country"], layer_a=a["layer"], text_a=a["text"],
        title_b=b["title"], country_b=b["country"], layer_b=b["layer"], text_b=b["text"],
    )
    try:
        raw = call_gemini(prompt, api_key)
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, IndexError, ValueError) as err:
        print(f"  Gemini-fout voor {key}: {err}; fallback wordt gebruikt.", file=sys.stderr)
        return None

    verdict = parse_verdict(raw, a, b)
    if verdict is None:
        print(f"  Ongeldige Gemini-output voor {key}; relatie wordt 'gelijkaardig'.", file=sys.stderr)
        verdict = {"relation": SIMILAR, "statement_a": "", "statement_b": "", "explanation": ""}
    else:
        print(f"  {key}: {verdict['relation']}")
    cache[key] = {"hash": digest, "model": GEMINI_MODEL, "verdict": verdict}
    return verdict


def build_edges(docs: list[dict], sim, use_llm: bool) -> list[dict]:
    api_key = load_api_key() if use_llm else None
    cache = load_cache() if use_llm else {}
    if use_llm and not api_key:
        print("Geen GEMINI_API_KEY gevonden: alleen gecachte LLM-resultaten worden gebruikt, de rest via fallback.",
              file=sys.stderr)

    edges, llm_pairs = [], 0
    for i, j, s in candidate_pairs(docs, sim):
        a, b = docs[i], docs[j]
        if a["country"] != b["country"]:
            rel = {
                "relation": OTHER_SCOPE,
                "statement_a": "",
                "statement_b": "",
                "explanation": f"Ander land ({a['country']} en {b['country']}): ander toepassingsgebied, geen tegenstrijdigheid.",
            }
        else:
            verdict = None
            # Pairs are sorted by similarity, so these are the strongest same-country pairs.
            if use_llm and llm_pairs < MAX_LLM_PAIRS:
                llm_pairs += 1
                verdict = classify_with_llm(a, b, api_key, cache)
            if verdict and verdict["relation"] in (CONSISTENT, SIMILAR) and s >= SIM_DUP:
                # Near-identical text is a copy, even if the model calls it merely consistent.
                verdict = None
            rel = verdict or fallback_relation(a, b, s)
        edges.append({"source": a["id"], "target": b["id"], "similarity": round(s, 2), **rel})

    if use_llm and cache:
        save_cache(cache)
    return edges


def connected_components(ids: list[str], edges: list[dict]) -> list[list[str]]:
    parent = {i: i for i in ids}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in edges:
        parent[find(e["source"])] = find(e["target"])

    groups: dict[str, list[str]] = defaultdict(list)
    for i in ids:
        groups[find(i)].append(i)
    return sorted((sorted(g) for g in groups.values()), key=lambda g: g[0])


def duplicate_groups(docs_by_id: dict[str, dict], edges: list[dict]) -> list[dict]:
    dup_edges = [e for e in edges if e["relation"] == DUPLICATE]
    groups = []
    for component in connected_components(list(docs_by_id), dup_edges):
        if len(component) < 2:
            continue
        # Heuristic: the oldest document is the original source.
        original = min(component, key=lambda d: (docs_by_id[d]["created"], d))
        groups.append({"original": original, "copies": [d for d in component if d != original]})
    return groups


def format_date(iso: str) -> str:
    return date.fromisoformat(iso).strftime("%d/%m/%Y")


def recommend(component: list[str], docs_by_id: dict[str, dict], edges: list[dict]) -> tuple[str, list[str]] | None:
    members = set(component)
    contradictions = [
        e for e in edges if e["relation"] == CONTRADICTORY and e["source"] in members and e["target"] in members
    ]

    def overruled(doc: dict) -> bool:
        """Contradicted by a newer approved document of the same country."""
        for e in contradictions:
            other_id = e["target"] if e["source"] == doc["id"] else e["source"] if e["target"] == doc["id"] else None
            if other_id is None:
                continue
            other = docs_by_id[other_id]
            if other["status"] == "goedgekeurd" and other["country"] == doc["country"] and other["modified"] > doc["modified"]:
                return True
        return False

    candidates = [
        docs_by_id[d] for d in component if docs_by_id[d]["status"] != "verouderd" and not overruled(docs_by_id[d])
    ]
    if not candidates:
        return None

    status_rank = {"goedgekeurd": 0, "concept": 1}
    # Sort by date descending first, then stable-sort by the stronger criteria.
    candidates.sort(key=lambda d: (d["modified"], d["id"]), reverse=True)
    candidates.sort(key=lambda d: (status_rank.get(d["status"], 2), d["owner"] is None))
    best = candidates[0]

    reasons = []
    if best["modified"] == max(docs_by_id[d]["modified"] for d in component):
        reasons.append(f"Meest recent ({format_date(best['modified'])})")
    else:
        reasons.append(f"Laatst gewijzigd {format_date(best['modified'])}")
    if best["status"] == "goedgekeurd":
        reasons.append("Goedgekeurd")
    if best["owner"]:
        reasons.append(f"Eigenaar: {best['owner']}")
    for e in contradictions:
        if best["id"] in (e["source"], e["target"]):
            other_id = e["target"] if e["source"] == best["id"] else e["source"]
            if docs_by_id[other_id]["modified"] < best["modified"]:
                reasons.append(f"Nieuwer dan tegenstrijdige versie {other_id}")
    outdated = sorted(d for d in component if docs_by_id[d]["status"] == "verouderd")
    if outdated:
        reasons.append(f"Vervangt verouderde versie {', '.join(outdated)}")
    return best["id"], reasons


def clusters_and_recommendations(docs_by_id: dict[str, dict], edges: list[dict], dup_groups: list[dict]):
    # A document from another country is a different scope, not a competing version,
    # so those edges do not join clusters.
    same_scope = [e for e in edges if e["relation"] != OTHER_SCOPE]
    copy_ids = {c for g in dup_groups for c in g["copies"]}

    clusters, recommended = [], {}
    for component in connected_components(list(docs_by_id), same_scope):
        if len(component) < 2:
            continue
        clusters.append(
            {
                "documents": component,
                # Copies are not independent: each duplicate group counts once, via its original.
                "independent_sources": sum(1 for d in component if d not in copy_ids),
            }
        )
        result = recommend(component, docs_by_id, edges)
        if result:
            recommended[result[0]] = result[1]
    return clusters, recommended


def author_stats(docs: list[dict]) -> dict:
    stats = {}
    for d in docs:
        per_author: dict[str, dict[str, int]] = {}
        for entry in d["history"]:
            counts = per_author.setdefault(entry["author"], {"inhoud": 0, "opmaak": 0})
            counts[entry["change"]] += 1
        stats[d["id"]] = dict(sorted(per_author.items(), key=lambda kv: (-kv[1]["inhoud"], kv[0])))
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--no-llm", action="store_true", help="skip the LLM and use rule-based relations only")
    args = parser.parse_args()

    docs = load_documents()
    docs_by_id = {d["id"]: d for d in docs}

    edges = build_edges(docs, similarity_matrix(docs), use_llm=not args.no_llm)
    dup_groups = duplicate_groups(docs_by_id, edges)
    clusters, recommended = clusters_and_recommendations(docs_by_id, edges, dup_groups)

    analysis = {
        "edges": edges,
        "recommended": recommended,
        "duplicate_groups": dup_groups,
        "clusters": clusters,
        "author_stats": author_stats(docs),
    }
    with ANALYSIS_PATH.open("w", encoding="utf-8") as f:
        json.dump(analysis, f, ensure_ascii=False, indent=2)
        f.write("\n")

    by_relation = defaultdict(int)
    for e in edges:
        by_relation[e["relation"]] += 1
    print(f"{len(edges)} verbanden ({dict(sorted(by_relation.items()))}), "
          f"{len(dup_groups)} duplicaatgroepen, {len(recommended)} aanbevelingen → {ANALYSIS_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
