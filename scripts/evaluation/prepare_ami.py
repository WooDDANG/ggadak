"""Convert official AMI NXT XML to local evaluation JSONL; no AI calls.

Usage: python3 scripts/evaluation/prepare_ami.py
Requires Python 3.10+; uses only the standard library and reads ZIP in place.
"""

import argparse
from collections import Counter, defaultdict
from functools import lru_cache
import hashlib
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

NITE = "{http://nite.sourceforge.net/}"
SOURCE = "https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip"
SPLIT_SOURCE = "https://groups.inf.ed.ac.uk/ami/corpus/datasets.shtml"
SCENARIO_GROUPS = {
    "train": "ES2002 ES2005 ES2006 ES2007 ES2008 ES2009 ES2010 ES2012 ES2013 ES2015 ES2016 IS1000 IS1001 IS1002 IS1003 IS1004 IS1005 IS1006 IS1007 TS3005 TS3008 TS3009 TS3010 TS3011 TS3012".split(),
    "dev": "ES2003 ES2011 IS1008 TS3004 TS3006".split(),
    "test": "ES2004 ES2014 IS1009 TS3003 TS3007".split(),
}


def identifier(element):
    return element.get(NITE + "id")


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


class Corpus:
    def __init__(self, archive):
        self.archive = archive
        self.names = set(archive.namelist())
        self.members = defaultdict(list)
        self.issues = []
        for name in sorted(self.names):
            if name.endswith(".xml"):
                self.members[Path(name).name].append(name)

    @lru_cache(maxsize=40)
    def root(self, name):
        return ET.fromstring(self.archive.read(name))

    @lru_cache(maxsize=40)
    def index(self, name):
        elements = [e for e in self.root(name).iter() if identifier(e)]
        return elements, {identifier(e): i for i, e in enumerate(elements)}

    def resolve(self, href, origin):
        """Resolve NXT single/range references in document order, never numeric ID order."""
        try:
            filename, fragment = href.split("#", 1)
            match = re.fullmatch(r"id\(([^)]+)\)(?:\.\.id\(([^)]+)\))?", fragment)
            if not match:
                raise ValueError("unsupported reference syntax")
            direct = str(Path(origin).parent / filename)
            candidates = [direct] if direct in self.names else self.members[filename]
            if len(candidates) != 1:
                raise ValueError("missing or ambiguous file")
            elements, positions = self.index(candidates[0])
            start = positions[match[1]]
            end = positions[match[2]] if match[2] else start
            if end < start:
                raise ValueError("reversed range")
            return elements[start : end + 1]
        except (ValueError, KeyError, ET.ParseError) as error:
            self.issues.append({"origin": origin, "href": href, "error": str(error)})
            return []

    def words(self, element, origin):
        result = []
        for child in element.findall(NITE + "child"):
            result.extend(e for e in self.resolve(child.get("href", ""), origin) if e.tag == "w")
        return result

    def utterance(self, element, origin):
        words = self.words(element, origin)
        starts = [t for w in words if (t := number(w.get("starttime"))) is not None]
        ends = [t for w in words if (t := number(w.get("endtime"))) is not None]
        return {
            "id": identifier(element),
            "speaker": Path(origin).name.split(".")[1],
            "startSeconds": min(starts) if starts else None,
            "endSeconds": max(ends) if ends else None,
            "text": " ".join(w.text or "" for w in words).strip(),
        }

    def meeting(self, meeting_id):
        issue_start = len(self.issues)
        summary_file = f"abstractive/{meeting_id}.abssumm.xml"
        utterances = []
        transcript_layer = "dialogueActs"
        for name in sorted(self.names):
            if name.startswith(f"dialogueActs/{meeting_id}.") and name.endswith(".dialog-act.xml"):
                utterances.extend(self.utterance(e, name) for e in self.root(name).findall("dact"))
        if not utterances:
            transcript_layer = "segments"
            for name in sorted(self.names):
                if name.startswith(f"segments/{meeting_id}.") and name.endswith(".segments.xml"):
                    utterances.extend(self.utterance(e, name) for e in self.root(name).findall("segment"))
        utterances.sort(key=lambda e: (e["startSeconds"] is None, e["startSeconds"] or 0, e["id"]))
        utterance_ids = {u["id"] for u in utterances}
        links = defaultdict(set)
        link_file = f"extractive/{meeting_id}.summlink.xml"
        if link_file in self.names:
            for link in self.root(link_file).findall("summlink"):
                pointers = defaultdict(list)
                for pointer in link.findall(NITE + "pointer"):
                    pointers[pointer.get("role")].extend(self.resolve(pointer.get("href", ""), link_file))
                for summary in pointers["abstractive"]:
                    for act in pointers["extractive"]:
                        if identifier(act) in utterance_ids:
                            links[identifier(summary)].add(identifier(act))
                        else:
                            self.issues.append({"origin": link_file, "error": "summary link target not in input", "targetId": identifier(act)})
        summaries = {}
        placeholders = []
        for section in self.root(summary_file):
            entries = []
            for sentence in section.findall("sentence"):
                text = " ".join("".join(sentence.itertext()).split())
                if not text or text.upper().replace(" ", "") in {"*NA*", "N/A", "NA"}:
                    placeholders.append({"section": section.tag, "id": identifier(sentence), "text": text})
                    continue
                entries.append({"id": identifier(sentence), "text": text, "utteranceIds": sorted(links[identifier(sentence)])})
            summaries[section.tag] = entries
        decisions = []
        decision_file = f"decision/manual/{meeting_id}.decision.xml"
        if decision_file in self.names:
            for element in self.root(decision_file).findall("decision"):
                words = self.words(element, decision_file)
                decisions.append({"id": identifier(element), "attributes": dict(element.attrib), "wordIds": [identifier(w) for w in words]})
        group = re.sub(r"[a-z]$", "", meeting_id)
        split = next((s for s, groups in SCENARIO_GROUPS.items() if group in groups), "unassigned")
        return {
            "meetingId": meeting_id, "groupId": group, "split": split, "language": "en",
            "input": {"transcriptLayer": transcript_layer, "utterances": utterances},
            "originalGold": {"summaries": summaries, "decisionPoints": decisions, "placeholders": placeholders},
            "coverage": {"allProposalsAnnotated": False, "ggaddakGraphAnnotated": False, "needsAdditionalAnnotation": True},
            "sourceIssues": self.issues[issue_start:],
        }


def prepare(archive_path, output):
    output.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive_path) as archive:
        bad_file = archive.testzip()
        if bad_file:
            raise ValueError(f"ZIP CRC failed: {bad_file}")
        corpus = Corpus(archive)
        for name in ["LICENCE.txt", "00README_MANUAL.txt", "MANIFEST_MANUAL.txt"]:
            (output / name).write_bytes(archive.read(name))
        inventory = {}
        for prefix in ["abstractive/", "decision/manual/", "argumentation/ae/", "argumentation/ar/", "argumentation/dis/"]:
            members = sorted(n for n in corpus.names if n.startswith(prefix) and n.endswith(".xml"))
            tags = Counter()
            for name in members:
                tags.update(e.tag for e in corpus.root(name) if not e.tag.startswith("{"))
            inventory[prefix] = {"files": len(members), "elements": dict(tags)}
        inventory["argumentationOntologies"] = {
            name: [{"id": identifier(e), "name": e.get("name"), "gloss": e.get("gloss")} for e in corpus.root(name) if identifier(e)]
            for name in ["ontologies/ae-types.xml", "ontologies/ar-types.xml"]
        }
        write_json(output / "annotation-inventory.json", inventory)
        counts = Counter()
        label_counts = Counter()
        meeting_ids = []
        excluded = []
        with (output / "meetings.jsonl").open("w") as all_file:
            handles = {split: (output / f"{split}.jsonl").open("w") for split in ["train", "dev", "test", "unassigned"]}
            try:
                for name in sorted(n for n in corpus.names if n.startswith("abstractive/") and n.endswith(".abssumm.xml")):
                    record = corpus.meeting(Path(name).name.split(".")[0])
                    if not record["input"]["utterances"]:
                        excluded.append({"meetingId": record["meetingId"], "reason": "no dialogue-act or segment transcript in release"})
                        continue
                    line = json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n"
                    all_file.write(line)
                    handles[record["split"]].write(line)
                    counts[record["split"]] += 1
                    label_counts.update({s: len(entries) for s, entries in record["originalGold"]["summaries"].items()})
                    meeting_ids.append({"meetingId": record["meetingId"], "split": record["split"]})
                    if record["meetingId"] == "TS3004a":
                        write_json(output / "sample-TS3004a.json", record)
            finally:
                for handle in handles.values():
                    handle.close()
        write_json(output / "source-issues.json", corpus.issues)
        manifest = {
            "schemaVersion": 1, "dataset": "AMI manual annotations", "downloadVersion": "1.6.2",
            "embeddedReadmeVersion": "1.7 (16 June 2014)",
            "sourceUrl": SOURCE, "license": "CC BY 4.0", "archiveSha256": digest,
            "archiveBytes": archive_path.stat().st_size,
            "partition": "official scenario-only; other meetings unassigned", "splitSource": SPLIT_SOURCE,
            "meetingCount": len(meeting_ids), "splitCounts": dict(counts), "summaryCounts": dict(label_counts),
            "sourceIssueCount": len(corpus.issues), "meetings": meeting_ids,
            "excludedMeetings": excluded,
            "conversion": "Original summaries and links retained; word tokens joined with spaces; dialogue acts (segments when absent) sorted by start time, untimed acts last; non-word vocal markers excluded.",
            "completeCandidateGold": False, "completeGraphGold": False,
            "artifacts": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(output.iterdir()) if p.is_file() and p.name != "manifest.json"},
        }
        write_json(output / "manifest.json", manifest)
        print(json.dumps({k: manifest[k] for k in ["meetingCount", "splitCounts", "summaryCounts", "sourceIssueCount", "archiveSha256"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, default=Path(".data/evaluation/ami/ami_public_manual_1.6.2.zip"))
    parser.add_argument("--output", type=Path, default=Path(".data/evaluation/ami/prepared"))
    args = parser.parse_args()
    prepare(args.archive, args.output)
