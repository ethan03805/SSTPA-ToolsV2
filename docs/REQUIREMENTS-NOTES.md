# Requirements Notes — Deviations, Risks, and Interpretations

Per SRS §1.1, "Should" statements are treated as SHALL unless justification is given,
and "Will" statements likely not to occur require notification and explanation. This
file is that record. Items needing the owner's decision are marked **[NEEDS DECISION]**.

## Interpretations (best-judgement calls on gaps/contradictions)

| # | SRS ref | Issue | Interpretation taken |
|---|---|---|---|
| I-1 | §5.3 / §5.5 vs §5.7.4 | §5.3/§5.5 say to group reverse proxy + Grafana in "the same container" and DB + non-user-facing apps in "a single container", but §5.7.4's authoritative compose topology runs each named image as its own service. | Followed §5.7.4 (one service per image, standard for the named images). The "container" statements are honored as network/zone groupings: user-facing (edge) vs non-user-facing (backend). |
| I-2 | §3.4.1.1 | SRS baselines ATT&CK v19.1, ATLAS v5.4, NIST 5.2.0 with exact counts. Availability at acquisition time may differ. | Sustainment acquires the SRS-named versions when published; otherwise the latest published version is acquired and recorded in the acquisition manifest. Counts validated against the actual bundle rather than hard-coded SRS figures. |
| I-3 | §3.2 | Password stored as SHA-384 hash (no salt specified). | Implemented exactly as specified (unsalted SHA-384), consistent with §2/§4 note that security features are placeholders for enterprise security post-MVP. Flagged for post-MVP hardening. |
| I-4 | §1.2.2 / §3.3.3 | SRS names `(:ControlsBaseline)` (HID prefix CBL) only in the ID table and Controls Tool section, not in §3.3.3 canonical labels. | Treated as a canonical label used by the Controls Tool (§6.5.17); included in schema. |
| I-5 | §3.3.8 | HID format shown as `{TYPE}*{INDEX}*{SEQUENCE}` in one place and `SYS_1.2.3_0` in the example. | Underscore form (`TYPE_INDEX_SEQUENCE`) is canonical; the asterisk form is a Markdown escaping artifact. |
| I-6 | §3.2 | GsnGoal HID prefix listed as "G" under "GsnGoa G" (typo). | Prefix `G` for GsnGoal. GsnAssumption listed as "Assumption ASM" → prefix `ASM`. |
| I-7 | §5.6.6.1 | "The API SHALL use HTTPS" while TLS terminates at Caddy (§5.4). | TLS terminates at Caddy; Caddy→backend is internal HTTP on the private Docker network, per §5's own layout diagram. |
| I-8 | §1.2 vs §3.3.10/§3.3.4.6.2/§3.3.4.6.3 | §1.2 prose lists "Integrity" among the Security Attributes, but the Asset Assurances property group, the criticality/assurance inheritance rules, and the protection-requirement labels all consistently omit Integrity. | Implemented per the consistent normative sections: assurance set is Confidentiality, Availability, Authenticity, NonRepudiation, Certifiable, Privacy, Trustworthy (no Integrity property on Asset). |
| I-9 | §3.3.3.1 / §3.3.4.2 | "One Default (:Purpose) node SHALL be created when a new (:System) is created"; a System SHALL have ≥1 Purpose/Environment/State. §3.3.7 spells this out only for creation-from-Component. | Backend auto-creates default (:Purpose), (:Environment), (:State) (and links) for every (:System) created through the commit pipeline as well. |

## Will-statement / feasibility notifications

| # | SRS ref | Notification |
|---|---|---|
| N-1 | §2.1 | Air-gapped Windows 11 Enterprise operation: development and CI run on Linux (§8); Windows installer produced but Windows-native validation requires a Windows host — cannot be exercised on this development system. |
| N-2 | §9.2 Stage 1 | Acquisition requires internet; performed on this development system and archived so all later stages run offline. |

## Deferred items requiring permission (none yet)

(Empty — any "Should" proposed for omission will be recorded here before deferral.)
