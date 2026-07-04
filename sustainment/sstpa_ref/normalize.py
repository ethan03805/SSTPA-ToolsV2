"""Stage 2 — Normalize (sstpa-ref-normalize, SRS §9.2).

Parses each source format (STIX 2.1 JSON, ATLAS YAML, OSCAL JSON, EMB3D STIX)
into the common Intermediate Normalized Form (INF): typed JSON files with flat
node and edge record lists, per the field mappings of SRS §3.4.1.3, §3.4.2.3,
§3.4.3.3, §3.4.7. Deprecated/revoked objects are filtered to a separate
archive (flagged, not silently dropped). All source records preserved verbatim
in raw_data (§9.5).

2025 Nicholas Triska. All rights reserved. See NOTICE at repository root.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

from .common import base_parser, load_config, setup_logging, truncate, write_json

# ---------------------------------------------------------------- ATT&CK ----

STIX_TYPE_TO_LABEL = {
    "x-mitre-tactic": "AK_Tactic",
    "attack-pattern": "AK_Technique",
    "course-of-action": "AK_Mitigation",
    "intrusion-set": "AK_Group",
    "malware": "AK_Software",
    "tool": "AK_Software",
    "campaign": "AK_Campaign",
    "x-mitre-data-source": "AK_DataSource",
    "x-mitre-data-component": "AK_DataComponent",
    "x-mitre-detection-strategy": "AK_DetectionStrategy",
    "x-mitre-analytic": "AK_Analytic",
    "x-mitre-asset": "AK_Asset",
    "x-mitre-matrix": "AK_Matrix",
}

# STIX relationship_type → SSTPA relationship (SRS §3.4.1.4), gated by types.
def attack_edge_type(rel: dict, types_by_id: dict[str, str]) -> str | None:
    rt = rel.get("relationship_type")
    src = types_by_id.get(rel.get("source_ref", ""), "")
    tgt = types_by_id.get(rel.get("target_ref", ""), "")
    if rt == "subtechnique-of" and src == "attack-pattern" and tgt == "attack-pattern":
        return "AK_SUBTECHNIQUE_OF"
    if rt == "uses" and src in ("intrusion-set", "campaign"):
        if tgt == "attack-pattern":
            return "AK_USES_TECHNIQUE"
        if tgt in ("malware", "tool"):
            return "AK_USES_SOFTWARE"
    if rt == "mitigates" and src == "course-of-action" and tgt == "attack-pattern":
        return "AK_MITIGATES"
    if rt == "detects" and src == "x-mitre-data-component" and tgt == "attack-pattern":
        return "AK_DETECTS"
    if rt == "attributed-to" and src == "campaign" and tgt == "intrusion-set":
        return "AK_ATTRIBUTED_TO"
    if rt == "detection-strategy-for":
        return "AK_DETECTION_STRATEGY_FOR"
    if rt == "analytic-for":
        return "AK_ANALYTIC_FOR"
    if rt == "data-component-of":
        return "AK_DATA_COMPONENT_OF"
    if rt == "revoked-by":
        return "AK_REVOKED_BY"
    return None


def external_id(obj: dict) -> str | None:
    for ref in obj.get("external_references", []):
        if ref.get("source_name") in ("mitre-attack", "mitre-ics-attack", "mitre-mobile-attack"):
            return ref.get("external_id")
    return None


def normalize_attack(path: Path, domain: str, version: str, log) -> tuple[dict, dict]:
    bundle = json.loads(path.read_text())
    objects = bundle.get("objects", [])
    types_by_id = {o["id"]: o["type"] for o in objects if "id" in o and "type" in o}

    nodes, edges, deprecated = [], [], []
    for o in objects:
        label = STIX_TYPE_TO_LABEL.get(o.get("type", ""))
        if not label:
            continue
        rec = {
            "sstpa_label": label,
            "stix_id": o.get("id"),
            "external_id": external_id(o),
            "name": o.get("name"),
            "short_description": truncate(o.get("description")),
            "long_description": o.get("description"),
            "stix_type": o.get("type"),
            "is_deprecated": bool(o.get("x_mitre_deprecated", False)),
            "is_revoked": bool(o.get("revoked", False)),
            "stix_created": o.get("created"),
            "stix_modified": o.get("modified"),
            "stix_version": o.get("x_mitre_version"),
            "platforms": o.get("x_mitre_platforms", []),
            "raw_data": json.dumps(o, ensure_ascii=False),
        }
        if label == "AK_Technique":
            rec.update(
                is_subtechnique=bool(o.get("x_mitre_is_subtechnique", False)),
                parent_technique_id=None,  # derived via AK_SUBTECHNIQUE_OF edges
                tactic_ids=[p.get("phase_name") for p in o.get("kill_chain_phases", [])],
                detection_text=o.get("x_mitre_detection"),
                permissions=o.get("x_mitre_permissions_required", []),
                data_sources=o.get("x_mitre_data_sources", []),
                technique_maturity=o.get("x_mitre_maturity"),
            )
        elif label == "AK_Tactic":
            rec.update(short_name=o.get("x_mitre_shortname"))
        elif label == "AK_Group":
            rec.update(
                aliases=o.get("aliases", []),
                associated_groups=o.get("x_mitre_associated_groups", []),
            )
        elif label == "AK_Software":
            rec.update(software_type=o.get("type"), aliases=o.get("x_mitre_aliases", []))
        elif label == "AK_DetectionStrategy":
            rec.update(
                detection_strategy_type=o.get("x_mitre_detection_type"),
                analytic_type=o.get("x_mitre_analytic_type"),
                data_component_ref=o.get("x_mitre_data_component_ref"),
            )
        if rec["is_deprecated"] or rec["is_revoked"]:
            deprecated.append(rec)
        else:
            nodes.append(rec)

    active_ids = {n["stix_id"] for n in nodes}
    for o in objects:
        if o.get("type") != "relationship":
            continue
        et = attack_edge_type(o, types_by_id)
        if not et:
            continue
        if o.get("source_ref") not in active_ids or o.get("target_ref") not in active_ids:
            continue  # edge touches a filtered object
        edges.append(
            {
                "relationship_type": et,
                "source_stix_id": o["source_ref"],
                "target_stix_id": o["target_ref"],
                "stix_relationship_id": o.get("id"),
            }
        )

    # kill_chain_phases → AK_TACTIC_CONTAINS (tactic shortname → technique).
    shortname_to_stix = {
        n.get("short_name"): n["stix_id"] for n in nodes if n["sstpa_label"] == "AK_Tactic"
    }
    for n in nodes:
        if n["sstpa_label"] != "AK_Technique":
            continue
        for phase in n.get("tactic_ids") or []:
            tac = shortname_to_stix.get(phase)
            if tac:
                edges.append(
                    {
                        "relationship_type": "AK_TACTIC_CONTAINS",
                        "source_stix_id": tac,
                        "target_stix_id": n["stix_id"],
                        "stix_relationship_id": None,
                    }
                )
    # matrix tactic ordering → AK_MATRIX_HAS_TACTIC + TacticOrder
    tactic_order: dict[str, int] = {}
    for o in objects:
        if o.get("type") == "x-mitre-matrix":
            for i, tac_ref in enumerate(o.get("tactic_refs", [])):
                tactic_order[tac_ref] = i
                if tac_ref in active_ids:
                    edges.append(
                        {
                            "relationship_type": "AK_MATRIX_HAS_TACTIC",
                            "source_stix_id": o["id"],
                            "target_stix_id": tac_ref,
                            "stix_relationship_id": None,
                        }
                    )
    for n in nodes:
        if n["sstpa_label"] == "AK_Tactic":
            n["tactic_order"] = tactic_order.get(n["stix_id"])

    log.info(f"ATT&CK {domain}: {len(nodes)} nodes, {len(edges)} edges, {len(deprecated)} filtered")
    inf = {
        "format": "SSTPA-INF-ATT_CK-1.0",
        "framework": "ATT&CK",
        "version": version,
        "domain": domain,
        "nodes": nodes,
        "edges": edges,
    }
    report = {"nodes": len(nodes), "edges": len(edges), "filtered": len(deprecated)}
    return inf, {"deprecated": deprecated, "report": report}


# ----------------------------------------------------------------- ATLAS ----

def normalize_atlas(path: Path, version: str, log) -> tuple[dict, dict]:
    doc = yaml.safe_load(path.read_text())
    matrix = doc["matrices"][0]
    nodes, edges = [], []

    for i, t in enumerate(matrix.get("tactics", [])):
        nodes.append(
            {
                "sstpa_label": "AT_Tactic",
                "external_id": t["id"],
                "name": t.get("name"),
                "short_description": truncate(t.get("description")),
                "long_description": t.get("description"),
                "tactic_order": i,
                "raw_data": json.dumps(t, ensure_ascii=False, default=str),
            }
        )
        edges.append(
            {
                "relationship_type": "AT_MATRIX_HAS_TACTIC",
                "source_external_id": "__ROOT__",
                "target_external_id": t["id"],
            }
        )

    for t in matrix.get("techniques", []):
        is_sub = "subtechnique-of" in t
        atk = t.get("ATT&CK-reference") or {}
        nodes.append(
            {
                "sstpa_label": "AT_Technique",
                "external_id": t["id"],
                "name": t.get("name"),
                "short_description": truncate(t.get("description")),
                "long_description": t.get("description"),
                "is_subtechnique": is_sub,
                "parent_technique_id": t.get("subtechnique-of"),
                "tactic_ids": [x["id"] if isinstance(x, dict) else x for x in t.get("tactics", [])],
                "attack_reference_id": atk.get("id"),
                "attack_reference_url": atk.get("url"),
                "technique_maturity": t.get("technique-maturity"),
                "platforms": t.get("platforms", []),
                "raw_data": json.dumps(t, ensure_ascii=False, default=str),
            }
        )
        for tac in t.get("tactics", []):
            tid = tac["id"] if isinstance(tac, dict) else tac
            edges.append(
                {
                    "relationship_type": "AT_TACTIC_CONTAINS",
                    "source_external_id": tid,
                    "target_external_id": t["id"],
                }
            )
        if is_sub:
            edges.append(
                {
                    "relationship_type": "AT_SUBTECHNIQUE_OF",
                    "source_external_id": t["id"],
                    "target_external_id": t["subtechnique-of"],
                }
            )
        if atk.get("id"):
            edges.append(
                {
                    "relationship_type": "AT_MAPS_TO_ATTACK",
                    "source_external_id": t["id"],
                    "target_external_id": atk["id"],
                }
            )

    for m in matrix.get("mitigations", []):
        nodes.append(
            {
                "sstpa_label": "AT_Mitigation",
                "external_id": m["id"],
                "name": m.get("name"),
                "short_description": truncate(m.get("description")),
                "long_description": m.get("description"),
                "ml_lifecycle_stages": m.get("ml-lifecycle", m.get("ml-lifecycle-stages", [])),
                "mitigation_categories": m.get("category", m.get("categories", [])),
                "raw_data": json.dumps(m, ensure_ascii=False, default=str),
            }
        )
        for use in m.get("techniques", []):
            tid = use["id"] if isinstance(use, dict) else use
            edges.append(
                {
                    "relationship_type": "AT_MITIGATES",
                    "source_external_id": m["id"],
                    "target_external_id": tid,
                }
            )

    for cs in doc.get("case-studies", []) or matrix.get("case-studies", []) or []:
        techniques = [
            step.get("technique")
            for step in cs.get("procedure", [])
            if isinstance(step, dict) and step.get("technique")
        ]
        nodes.append(
            {
                "sstpa_label": "AT_CaseStudy",
                "external_id": cs["id"],
                "name": cs.get("name"),
                "short_description": truncate(cs.get("summary")),
                "long_description": cs.get("summary"),
                "incident_date": str(cs.get("incident-date")) if cs.get("incident-date") else None,
                "incident_date_granularity": cs.get("incident-date-granularity"),
                "reporter_name": cs.get("reporter"),
                "referenced_technique_ids": techniques,
                "raw_data": json.dumps(cs, ensure_ascii=False, default=str),
            }
        )
        for tid in techniques:
            edges.append(
                {
                    "relationship_type": "AT_CASE_USES_TECHNIQUE",
                    "source_external_id": cs["id"],
                    "target_external_id": tid,
                }
            )

    log.info(f"ATLAS: {len(nodes)} nodes, {len(edges)} edges")
    inf = {
        "format": "SSTPA-INF-ATLAS-1.0",
        "framework": "ATLAS",
        "version": version,
        "nodes": nodes,
        "edges": edges,
    }
    return inf, {"report": {"nodes": len(nodes), "edges": len(edges), "filtered": 0}}


# ------------------------------------------------------------------ NIST ----

def _parts_text(control: dict, name: str) -> str | None:
    """Assemble prose for parts named `name`, including prose carried by
    nested sub-parts (OSCAL statements hold their text in nested `item`
    parts, labeled a., b., …)."""
    out: list[str] = []

    def collect_all(part, prefix=""):
        label = ""
        for prop in part.get("props", []):
            if prop.get("name") == "label":
                label = prop.get("value", "") + " "
        if part.get("prose"):
            out.append(prefix + label + part["prose"])
        for sub in part.get("parts", []) or []:
            collect_all(sub, prefix + "  ")

    def walk(parts):
        for p in parts or []:
            if p.get("name") == name:
                collect_all(p)
            else:
                walk(p.get("parts"))

    walk(control.get("parts"))
    return "\n".join(out) if out else None


def _control_record(c: dict, family_id: str, is_enh: bool, parent: str | None) -> dict:
    raw_props = c.get("props", [])
    props = {p.get("name"): p.get("value") for p in raw_props}
    # A control can carry multiple baseline-impact props (LOW/MODERATE/HIGH);
    # collect them from the raw list before the name-keyed dict collapses
    # duplicates to the last value.
    baseline_impact = [
        p.get("value") for p in raw_props if p.get("name") == "baseline-impact"
    ]
    related = [
        (link.get("href") or "").lstrip("#")
        for link in c.get("links", [])
        if link.get("rel") == "related"
    ]
    cid = c["id"]
    display = cid.upper()
    if "-" in cid and "." not in cid:
        fam, num = cid.split("-", 1)
        if num.isdigit():
            display = f"{fam.upper()}-{int(num):02d}"
    return {
        "sstpa_label": "NIST_Enhancement" if is_enh else "NIST_Control",
        "external_id": cid,
        "control_id": display,
        "name": c.get("title"),
        "family_id": family_id,
        "short_description": truncate(_parts_text(c, "statement")),
        "long_description": _parts_text(c, "statement"),
        "supplemental_guidance": _parts_text(c, "guidance"),
        "objectives": _parts_text(c, "objective"),
        "baseline_impact": baseline_impact,
        "priority": props.get("priority"),
        "related_controls": related,
        "is_enhancement": is_enh,
        "parent_control_id": parent,
        "is_withdrawn": props.get("status") == "withdrawn",
        "raw_data": json.dumps(c, ensure_ascii=False),
    }


def normalize_nist(path: Path, version: str, log) -> tuple[dict, dict]:
    doc = json.loads(path.read_text())
    catalog = doc["catalog"]
    nodes, edges, filtered = [], [], 0

    for group in catalog.get("groups", []):
        fam_id = group["id"]
        nodes.append(
            {
                "sstpa_label": "NIST_Family",
                "external_id": fam_id,
                "name": group.get("title"),
                "family_code": fam_id.upper(),
                "raw_data": json.dumps({k: v for k, v in group.items() if k != "controls"}, ensure_ascii=False),
            }
        )
        for c in group.get("controls", []):
            rec = _control_record(c, fam_id, False, None)
            if rec["is_withdrawn"]:
                filtered += 1
                continue
            nodes.append(rec)
            edges.append(
                {
                    "relationship_type": "NIST_FAMILY_CONTAINS",
                    "source_external_id": fam_id,
                    "target_external_id": c["id"],
                }
            )
            for enh in c.get("controls", []):
                erec = _control_record(enh, fam_id, True, c["id"])
                if erec["is_withdrawn"]:
                    filtered += 1
                    continue
                nodes.append(erec)
                edges.append(
                    {
                        "relationship_type": "NIST_CONTROL_HAS_ENHANCEMENT",
                        "source_external_id": c["id"],
                        "target_external_id": enh["id"],
                    }
                )

    ids = {n["external_id"] for n in nodes}
    for n in nodes:
        for rel in n.get("related_controls") or []:
            base = rel.split("_", 1)[0]
            if base in ids:
                edges.append(
                    {
                        "relationship_type": "NIST_RELATED_TO",
                        "source_external_id": n["external_id"],
                        "target_external_id": base,
                    }
                )

    log.info(f"NIST: {len(nodes)} nodes, {len(edges)} edges, {filtered} withdrawn filtered")
    inf = {
        "format": "SSTPA-INF-NIST-1.0",
        "framework": "NIST SP 800-53",
        "version": version,
        "nodes": nodes,
        "edges": edges,
    }
    return inf, {"report": {"nodes": len(nodes), "edges": len(edges), "filtered": filtered}}


# ----------------------------------------------------------------- EMB3D ----

EMB3D_TYPE_TO_LABEL = {
    "vulnerability": "EMB3D_Vulnerability",
    "course-of-action": "EMB3D_CourseOfAction",
    "x-mitre-emb3d-property": "EMB3D_Device",
}


def normalize_emb3d(path: Path, version: str, log) -> tuple[dict, dict]:
    bundle = json.loads(path.read_text())
    objects = bundle.get("objects", [])
    nodes, edges = [], []
    types_by_id = {o["id"]: o["type"] for o in objects if "id" in o}

    for o in objects:
        label = EMB3D_TYPE_TO_LABEL.get(o.get("type", ""))
        if not label:
            continue
        eid = None
        for ref in o.get("external_references", []):
            if ref.get("external_id"):
                eid = ref["external_id"]
                break
        nodes.append(
            {
                "sstpa_label": label,
                "stix_id": o.get("id"),
                "external_id": eid or o.get("id"),
                "name": o.get("name"),
                "short_description": truncate(o.get("description")),
                "long_description": o.get("description"),
                "raw_data": json.dumps(o, ensure_ascii=False),
            }
        )
    active = {n["stix_id"] for n in nodes}
    for o in objects:
        if o.get("type") != "relationship":
            continue
        src_t = types_by_id.get(o.get("source_ref", ""), "")
        tgt_t = types_by_id.get(o.get("target_ref", ""), "")
        et = None
        if o.get("relationship_type") == "mitigates" and src_t == "course-of-action":
            et = "EMB3D_MITIGATES"
        elif src_t == "vulnerability" and tgt_t == "x-mitre-emb3d-property":
            et = "EMB3D_RELATES_TO_DEVICE"
        if et and o.get("source_ref") in active and o.get("target_ref") in active:
            edges.append(
                {
                    "relationship_type": et,
                    "source_stix_id": o["source_ref"],
                    "target_stix_id": o["target_ref"],
                }
            )
    log.info(f"EMB3D: {len(nodes)} nodes, {len(edges)} edges")
    inf = {
        "format": "SSTPA-INF-EMB3D-1.0",
        "framework": "EMB3D",
        "version": version,
        "nodes": nodes,
        "edges": edges,
    }
    return inf, {"report": {"nodes": len(nodes), "edges": len(edges), "filtered": 0}}


# ------------------------------------------------------------------- CLI ----

def run(archive: Path, output: Path, log_dir: Path | None, dry_run: bool) -> int:
    log = setup_logging("normalize", log_dir)
    manifest_path = archive / "acquisition-manifest.json"
    if not manifest_path.exists():
        log.error(f"acquisition manifest not found: {manifest_path}")
        return 1
    manifest = json.loads(manifest_path.read_text())
    by_fw: dict[str, list[dict]] = {}
    for f in manifest["files"]:
        by_fw.setdefault(f["framework"], []).append(f)

    if dry_run:
        log.info(f"would normalize {sum(len(v) for v in by_fw.values())} source files")
        return 0

    reports = {}
    for entry in by_fw.get("attack", []):
        path = archive / entry["file"]
        domain = path.stem.split("-attack")[0].replace("enterprise", "enterprise")
        domain = path.name.split("-attack")[0]
        version = entry["version"].lstrip("v")
        inf, extra = normalize_attack(path, domain, version, log)
        write_json(output / f"attck-{domain}-{version}.json", inf)
        if extra["deprecated"]:
            write_json(output / "deprecated" / f"attck-{domain}-{version}-deprecated.json", extra["deprecated"])
        reports[f"attack-{domain}"] = extra["report"]

    for entry in by_fw.get("atlas", []):
        version = entry["version"].lstrip("v")
        inf, extra = normalize_atlas(archive / entry["file"], version, log)
        write_json(output / f"atlas-{version}.json", inf)
        reports["atlas"] = extra["report"]

    for entry in by_fw.get("nist", []):
        inf, extra = normalize_nist(archive / entry["file"], "Rev 5", log)
        write_json(output / "nist-800-53-r5.json", inf)
        reports["nist"] = extra["report"]

    for entry in by_fw.get("emb3d", []):
        inf, extra = normalize_emb3d(archive / entry["file"], "2.0.1", log)
        write_json(output / "emb3d-2.0.1.json", inf)
        reports["emb3d"] = extra["report"]

    write_json(output / "normalization-report.json", reports)
    log.info(f"normalization report: {json.dumps(reports)}")
    return 0


def main() -> None:
    args = base_parser("normalize", __doc__.split("\n")[0]).parse_args()
    if not args.input or not args.output:
        print("--input (archive dir) and --output (inf dir) are required", file=sys.stderr)
        sys.exit(2)
    sys.exit(run(args.input, args.output, args.log_dir, args.dry_run))


if __name__ == "__main__":
    main()
