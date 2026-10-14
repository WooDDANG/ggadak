"""Prepare/import human-reviewed gold and score human semantic matches, offline.

prepare --input AMI.jsonl --output gold.jsonl [--kind ami|service]
validate --input gold.jsonl
score --gold gold.jsonl --run run.json --judgements judgments.json --output score.json
"""
import argparse
import hashlib
import json
from pathlib import Path


def load_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def validate(records):
    ids, groups = set(), {}
    for record in records:
        meeting = record["meetingId"]
        if meeting in ids:
            raise ValueError("duplicate meetingId")
        ids.add(meeting)
        group = record["groupId"]
        if groups.setdefault(group, record["split"]) != record["split"]:
            raise ValueError("same meeting group leaks across splits")
        if record["datasetKind"] not in {"ami", "service"}:
            raise ValueError("unknown datasetKind")
        gold = record["gold"]
        if gold["reviewed"] and not gold["revision"].strip():
            raise ValueError("reviewed gold needs a revision")
        for collection in [gold["candidates"], gold["relations"]]:
            if len({item["id"] for item in collection}) != len(collection):
                raise ValueError("duplicate gold ID")
        if record["datasetKind"] == "ami" and gold["complete"]:
            raise ValueError("AMI summary is not complete service gold")
        nodes = set(gold.get("nodeIds", [])) | {c["id"] for c in gold["candidates"]}
        for edge in gold["relations"]:
            if edge["sourceId"] not in nodes or edge["targetId"] not in nodes:
                raise ValueError("unknown gold relation endpoint")


def prepare(input_path, output_path, kind):
    records = []
    digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    for source in load_jsonl(input_path):
        summaries = source["originalGold"]["summaries"].get("decisions", [])
        records.append({
            "schemaVersion": 1, "meetingId": source["meetingId"], "groupId": source["groupId"],
            "split": source["split"], "language": source["language"], "datasetKind": kind,
            "sourceSha256": digest, "input": source["input"], "originalGold": source["originalGold"],
            "gold": {"reviewed": kind == "ami", "revision": "ami-manual-1.6.2" if kind == "ami" else "", "complete": False,
                     "candidates": [{"id": s["id"], "summary": s["text"], "utteranceIds": s["utteranceIds"]} for s in summaries] if kind == "ami" else [],
                     "nodeIds": [], "relations": []},
        })
    validate(records)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records))
    return {"records": len(records), "kind": kind, "completeServiceGold": False}


def counts(pairs, predicted_ids, gold_ids):
    predicted, matched_gold = set(), set()
    for pair in pairs:
        if len(pair) != 2 or pair[0] not in predicted_ids or pair[1] not in gold_ids:
            raise ValueError("semantic match refers to unknown IDs")
        if pair[0] in predicted or pair[1] in matched_gold:
            raise ValueError("semantic matches must be one-to-one")
        predicted.add(pair[0]); matched_gold.add(pair[1])
    return {"tp": len(pairs), "fp": len(predicted_ids) - len(pairs), "fn": len(gold_ids) - len(pairs)}


def score(gold_records, run, judgements):
    validate(gold_records)
    if not judgements.get("reviewed") or not judgements.get("revision"):
        raise ValueError("human-reviewed matching judgement required")
    digest = hashlib.sha256(json.dumps(gold_records, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if judgements.get("goldDigest") != digest:
        raise ValueError("gold changed after matching; digest mismatch")
    predictions = {r["meetingId"]: r for r in run["records"]}
    if len(predictions) != len(run["records"]):
        raise ValueError("duplicate run meeting")
    annotations = {r["meetingId"]: r for r in judgements["records"]}
    if len(annotations) != len(judgements["records"]):
        raise ValueError("duplicate meeting judgement")
    reports = []
    for record in gold_records:
        if not record["gold"]["reviewed"]:
            raise ValueError("unreviewed gold cannot be scored")
        meeting = record["meetingId"]
        result, judgement = predictions[meeting], annotations[meeting]
        for name in ["baseline", "workflow"]:
            predicted, assessed = result[name], judgement[name]
            candidates = counts(assessed["candidateMatches"], {c["id"] for c in predicted.get("candidates", [])}, {c["id"] for c in record["gold"]["candidates"]})
            complete = record["datasetKind"] == "service" and record["gold"]["complete"]
            precision = candidates["tp"] / (candidates["tp"] + candidates["fp"]) if complete and candidates["tp"] + candidates["fp"] else None
            recall = candidates["tp"] / (candidates["tp"] + candidates["fn"]) if candidates["tp"] + candidates["fn"] else None
            relations = None
            if complete:
                relations = counts(assessed["relationMatches"], {e["id"] for e in predicted.get("relations", [])}, {e["id"] for e in record["gold"]["relations"]})
                node_pairs = assessed["candidateMatches"] + assessed.get("nodeMatches", [])
                mapping = dict(node_pairs)
                if len(mapping) != len(node_pairs) or len(set(mapping.values())) != len(node_pairs):
                    raise ValueError("node mapping must be one-to-one")
                predicted_edges = {e["id"]: e for e in predicted.get("relations", [])}
                gold_edges = {e["id"]: e for e in record["gold"]["relations"]}
                for predicted_id, gold_id in assessed["relationMatches"]:
                    a, b = predicted_edges[predicted_id], gold_edges[gold_id]
                    endpoints = [mapping.get(a["sourceId"]), mapping.get(a["targetId"])]
                    expected = [b["sourceId"], b["targetId"]]
                    if a["type"] == "conflicts_with":
                        endpoints = sorted(endpoints, key=str); expected = sorted(expected)
                    if a["type"] != b["type"] or endpoints != expected:
                        raise ValueError("relation match violates type or mapped endpoints")
            for field in ["falseClaims", "structureErrors"]:
                value = assessed.get(field)
                if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 0):
                    raise ValueError("invalid manual error count")
            reports.append({"meetingId": meeting, "kind": record["datasetKind"], "language": record["language"], "method": name,
                            "outcome": predicted["outcome"], "candidateCounts": candidates, "candidatePrecision": precision, "candidateRecall": recall,
                            "relationCounts": relations, "falseClaims": assessed.get("falseClaims"), "structureErrors": assessed.get("structureErrors"), "usage": predicted.get("usage"),
                            "completeServiceGold": complete})
    # Report micro metrics separately by data kind/language/method; never mix AMI and service.
    aggregates = []
    for key in sorted({(r["kind"], r["language"], r["method"]) for r in reports}):
        rows = [r for r in reports if (r["kind"], r["language"], r["method"]) == key]
        total = {k: sum(r["candidateCounts"][k] for r in rows) for k in ["tp", "fp", "fn"]}
        complete = all(r["completeServiceGold"] for r in rows)
        relation_total = {k: sum(r["relationCounts"][k] for r in rows) for k in ["tp", "fp", "fn"]} if complete else None
        metric = lambda values, denominator: values["tp"] / (values["tp"] + values[denominator]) if values and values["tp"] + values[denominator] else None
        false_claims = sum(r["falseClaims"] for r in rows) if all(isinstance(r["falseClaims"], int) for r in rows) else None
        structure_errors = sum(r["structureErrors"] for r in rows) if all(isinstance(r["structureErrors"], int) for r in rows) else None
        precision = metric(total, "fp") if complete else None
        recall = metric(total, "fn")
        relation_precision, relation_recall = metric(relation_total, "fp"), metric(relation_total, "fn")
        values = [precision, recall, relation_precision, relation_recall]
        aggregates.append({"kind": key[0], "language": key[1], "method": key[2], "meetings": len(rows), "failures": sum(r["outcome"] != 'completed' for r in rows),
                           "candidatePrecision": precision, "candidateRecall": recall, "relationPrecision": relation_precision, "relationRecall": relation_recall,
                           "falseClaims": false_claims, "structureErrors": structure_errors,
                           "targetPassed": complete and all(v is not None and v >= .9 for v in values) and false_claims == 0 and structure_errors == 0 and all(r["outcome"] == 'completed' for r in rows)})
    return {"schemaVersion": 1, "goldDigest": digest, "judgementRevision": judgements["revision"], "aggregates": aggregates, "meetings": reports,
            "limitations": ["null metrics mean N/A", "AMI is not complete proposal/graph gold", "Korean quality unverified unless Korean service gold evaluated"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("prepare"); p.add_argument("--input", type=Path, required=True); p.add_argument("--output", type=Path, required=True); p.add_argument("--kind", choices=["ami", "service"], default="ami")
    p = sub.add_parser("validate"); p.add_argument("--input", type=Path, required=True)
    p = sub.add_parser("score")
    for name in ["gold", "run", "judgements", "output"]: p.add_argument("--" + name, type=Path, required=True)
    args = parser.parse_args()
    if args.command == "prepare": print(json.dumps(prepare(args.input, args.output, args.kind)))
    elif args.command == "validate":
        records = load_jsonl(args.input); validate(records)
        print(json.dumps({"records": len(records), "goldDigest": hashlib.sha256(json.dumps(records, sort_keys=True, ensure_ascii=False).encode()).hexdigest()}))
    else:
        result = score(load_jsonl(args.gold), json.loads(args.run.read_text()), json.loads(args.judgements.read_text()))
        args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps(result["aggregates"], ensure_ascii=False))
