# TOUGHENING MACHINE — PROJECT SPECIFICATION BASELINE

| Field | Value |
|---|---|
| Document title | TOUGHENING MACHINE — Project Specification Baseline |
| Document version | 0.7.4 (Decision Round D — hardware architecture closure) |
| Revision status | **BASELINE — FOR REVIEW** |
| Created | 2026-10-04 |
| Workspace | `D:\PMC\Documents\PlatformIO\Projects\Toughening` |
| Document path | `docs/PROJECT_SPECIFICATION.md` |
| Source basis | Requirements, decisions and review findings recorded in the project conversation prior to this document |
| Implementation status | **No implementation exists. No implementation phase has been started.** Phase 2A-0 (documentation only) is COMPLETE. |
| Supersedes | **0.5.0 (decision round B approvals)** — archived byte-identical at `docs/archive/PROJECT_SPECIFICATION_v0.5.0.md` (SHA256 `06D71C124E647D5807E7381F617AAAB2A7FAC9A926BF8F27632E13C747DDB426`, 119 532 bytes). |
| Companion document | `docs/PROTOCOL_CONTRACT.md` — **APPROVED, final 2026-10-05** (v1.1.0) |

---

## 0. Document Control

### 0.1 Revision history

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-04 | **Initial written baseline.** First consolidated specification document, created from the requirements and decisions recorded in the project conversation. This is **not** a reconstruction of a missing original file: no prior specification file existed in the workspace at the time of creation. |
| 0.2.0 | 2026-10-04 | **P0 documentation repair.** Addresses audit findings **AUD-01 … AUD-06 only**: (§3.3) hardware-register ↔ decision-register mapping and subordination rule; (§4.2) raw-voltage retention contradiction recorded as `RAW-VOLTAGE-RETENTION — OPEN — DECISION REQUIRED`; (§9.4) separation of calendar validity from duration validity and `duration_basis` value set recorded as OPEN; (§11.6) canonical timestamp/duration field naming; (§9.5a/b) separation of interrupted-cycle representation from detection (D-D2); (§17.2/§17.3) unconditional vs conditional acceptance criteria with AC-04, AC-07 and AC-08 reclassified, and AC-13 added and blocked. **No OPEN decision was resolved; no new technical value was invented; no schema, protocol or hardware detail was added.** Revision status remains **BASELINE — FOR REVIEW**. |
| 0.3.0 | 2026-10-04 | **P1 documentation repair (AUD-07 … AUD-15).** (§2.2) ARC-04 declared canonical and ARC-10 recorded as a deprecated alias; (§19.2) D-A6 / D-A7 documented as reserved/undefined; (§7.1, §19) **D-D13** created as an OPEN decision for fault-counter semantics; (§6.2, §19) `TEMP-CONVERSION-CONFIG-GRAIN — OPEN — DECISION REQUIRED` created; (§13.1, §13.2, §17, §23) acceptance IDs **AC-14 … AC-20** added for JRN-*, PER-05 and the D-D9 labelling requirement; (§12.6, §13.4) D-D10 ↔ L1–L5 interaction documented and blocked criteria identified; (§21) Phase 2A gate now also requires explicit protocol/message-contract approval; (§3.1, §5.3) retailer-derived board/ADC data marked `UNVERIFIED — NOT AN APPROVED HARDWARE FACT`; (§13.3, §20) journal-capacity dependency marked `OPEN — TRACEABILITY DECISION REQUIRED`. **No OPEN decision resolved; no hardware, protocol, journal-capacity or grain decision made.** Revision status unchanged. |
| 0.4.0 | 2026-10-04 | **Approved-decision round.** Applies six user-approved decisions: **DR-01** report/export scope = historical / database-derived; **DR-02** canonical `cycle_start_ms` / `start_time_valid`; **DR-03** `duration_basis` value set = `'null'`, `'calendar'`, `'uptime_same_boot'`; **DR-03b** `duration_ms IS NULL ⇔ duration_basis = 'null'` (bidirectional); **DR-06** D-D13 fault vocabulary = `out_of_range` only; **DR-08** temperature-conversion configuration ownership Q1–Q3. **DR-04** and **DR-07** remain OPEN (prerequisites now satisfied, decisions not made). No OPEN decision was resolved beyond those six. Revision status remains **BASELINE — FOR REVIEW**. |
| 0.5.0 | 2026-10-04 | **Decision Round B approvals.** **DR-04A APPROVED** — raw voltage of an applicable `out_of_range` reading must exist in durable historical storage (category only). **DR-07-C1 APPROVED** — `invalid_channel_count_now` ratified as instantaneous / live-only / channel-counting / `out_of_range`-only. **DR-07-C2 APPROVED** — `faulted_channel_count` is the cumulative count of distinct channels with ≥1 `out_of_range` condition in the cycle, reset at cycle start. **CS-01 APPROVED (Policy B)** — backward clock step falls back to `uptime_same_boot` when a valid same-boot uptime pair exists, otherwise `'null'`. Deferred / not-ready: DR-04A2, DR-04C, DR-04D, DR-04E, DR-04F, DR-04G (rejected), DR-07-C3, DR-12. PER-03, D-D1, D-D9, D-D11, D-D12, DR-01, DR-02, DR-03, DR-03b, DR-06, DR-08 unchanged. Revision status remains **BASELINE — FOR REVIEW**. |
| 0.6.0 | 2026-10-04 | **Phase 2A-0 (documentation only) + decision round C.** v0.5.0 archived byte-identical at `docs/archive/PROJECT_SPECIFICATION_v0.5.0.md`. **DR-27 APPROVED** — temperature-calibration configuration ownership is **per-channel**, **SUPERSEDING DR-08 Q1–Q3**. **DR-25.1 … DR-25.5 APPROVED** — D-C1…D-C5 defaults (D-C4 = **defaults only**). **DR-25.6 / DR-25.7 / DR-25.8 / DR-25.9 — direction only** (DR-12; D-D2 marker direction; D-D3/D-D10 overwrite-oldest; DR-04A2). **DR-07-C3 reclassified** from `DEFERRED — BLOCKED by D-C4` to **`OPEN — DECISION REQUIRED`** (no longer blocked; **not decided**). **D-B4 MET** — Phase 2A nevertheless remains **NOT AUTHORIZED**. §3.1a added (pinout image — record only). **PCC-19 … PCC-21 recorded, NOT applied.** `docs/PROTOCOL_CONTRACT.md` created as **PROPOSED — NOT APPROVED**. **No implementation, package, SQL, test, configuration, network or hardware work was performed.** |
| 0.6.1 | 2026-10-05 | **Phase 2A-0 repair revision (no new decisions).** Repairs corruption introduced by the 0.6.0 pass: 8 literal `@@END@@` artifacts removed, 1 mojibake line repaired, 21 blank lines breaking markdown tables removed, and the lost DR-27 edits to §6.2 / §6.3 / §6.6 restored. **Adds DR-13 … DR-29** with normative text (approval date 2026-10-05) and replaces the DR-25.1 … DR-25.9 and DR-27 rows with their full normative text. **Adds PCC-01 … PCC-27** as PROPOSED consequential changes in §18.1, and relocates the open-questions register to §18.2. **Deletes the unauthorized top-level sections 27, 28 and 29**, relocating their content into §19 and §18. Derived status updates: D-A8/HW-01 (DR-13), D-B1/D-B3 (DR-15), D-D7 (DR-17), D-D4 (DR-18), D-D5 (DR-19), AMB-15/§15.5 (DR-22). **0.6.1 is a repair, NOT a new decision round — the decision content of 0.6.0 is unchanged.**
| 0.6.2 | 2026-10-05 | **Phase 2A-0 consistency patch (no new decisions, no new PCC semantics).** Internal-consistency alignment of 0.6.1 only: **(A)** §19 DR register reordered into numeric order — DR-25 + DR-25.1 … DR-25.9 placed after DR-24, DR-27 placed after DR-26; row text carried byte-for-byte, **no row text changed**. **(B)** §20 stale dependency rows updated — "Unknown-time record handling validation" → D-D7 APPROVED (DR-17); "Fault-counter semantics" → DR-07-C3 OPEN (no longer blocked by D-C4), stabilisation RESOLVED (DR-25.6); "Fault counting during activation stabilisation (DR-12)" → RESOLVED (DR-25.6). **(C)** §23 traceability statuses brought in line with the §19 register. **(D)** §17.1 "Blocked by" column updated for 5 rows (Duration rule, Out-of-range, Fault counters, Transition counting, Alarm policy) — **no test is marked as passed or executed**. **(E)** PCC-28 … PCC-35 recorded for §3.3, §4.2, §10.3, §11.5, §13.3, §14.3, §15.4 and §16.1, all `PROPOSED — NOT APPLIED`. **(F)** PCC-06, PCC-07, PCC-08, PCC-09, PCC-13 relabelled `APPLIED (0.6.1)`; PCC-05, PCC-10, PCC-11, PCC-12, PCC-14 remain `PROPOSED — NOT APPLIED`. **No decision was resolved, added or reversed; no new technical value invented; no hardware, protocol, schema, SQL, code, test or configuration work performed.** Sections §4.3, §4.5, §8.1, §9.2, §10.3, §11.5, §13.3, §14.3, §15.4, §16.1 and §17.3 are **byte-unchanged**. Phase 2A and Phase 2B remain **NOT AUTHORIZED**. |
| 0.7.0 | 2026-10-05 | **PCC application pass (no new decisions).** Applies the body-section PCCs recorded in 0.6.1/0.6.2 so the body no longer contradicts §19. **§4.5** non-escalation → D-C5 APPROVED (DR-25.5). **§8.1** unconfigured → applies to pressure and temperature (DR-27). **§8.2 / §8.3** → D-C5 APPROVED (DR-25.5). **§8.5** severity policy → APPROVED (DR-25.1…DR-25.5; D-C4 defaults only). **§9.2** stabilisation samples excluded from fault counters (DR-25.6). **§10.2** D-C2 APPROVED (DR-25.2), three-concept distinction retained. **§10.3** D-C1…D-C5 Status cells → APPROVED (DR-25.1–.5); the **"Alternatives (none chosen)" column is retained as rejected-option history and is NOT renamed.** **§11.5** D-D7 APPROVED (DR-17). **§13.3** board identity → APPROVED (DR-13). **§14.3** `fault_transition_count` NULL until DR-07-C3, not D-C4. **§15.4** localisation APPROVED (DR-19). **§16.1** backup APPROVED (DR-18); the specific WAL technique remains a proposal. **§22** glossary "Raw voltage" lifetime clarified. **§5.3** retailer "4-channel ADC" claim replaced with the pinout observation — **6 ADC1-capable GPIOs (32, 33, 34, 35, 36, 39), verified against `docs/hardware/esp32-pinout.jpg`, recorded as observation only, not a decision.** Cross-references: **§3.3** D-A8 APPROVED (DR-13); **§4.2** DR-04A2 APPROVED (DR-25.9); **§19** DR-25.9 split into DR-25.9 (granularity, APPROVED) and **DR-25.9-b** (count finalization / D-D2 persistence, OPEN); **§20** and **§23** updated for DR-04A2 and DR-12. Documentation defects: **§19 DR-13 / DR-29** imperative copy-paste converted to descriptive text. **PCC register:** 15 PCCs relabelled `APPLIED (0.7.0)`; the 5 previously `APPLIED (0.6.1)` were **not** regressed. **No new decision, no new section, no row removed. Phase 2A and Phase 2B remain NOT AUTHORIZED.** **Date discrepancy recorded, not changed:** the 0.6.0 row stays dated **2026-10-04** because not every decision it cites can be shown to have been approved on 2026-10-05, and the §19 DR-25 bundle row carries no approval date. |
| 0.7.1 | 2026-10-05 | **Follow-up: complete D-C5 / D-D10 body alignment (no new decisions).** Follows the 0.7.0 pass, which left residual references that still contradicted §19. **§7.5** non-escalation now cites D-C5 APPROVED (DR-25.5). **§8.4** `overflow` row now cites the D-D10 direction as APPROVED (DR-25.8); the `journal_pressure` row (D-D6 genuinely OPEN) is unchanged. **§7.1a** (PCC-36): the DR-06 scope-limits sentence split so it no longer claims D-C1…D-C5 are OPEN; open-question item 7 now RESOLVED (DR-25.5); DR-12 stabilisation participation now RESOLVED (DR-25.6). **§12.4 / §12.5** (PCC-37): the §12.5 heading no longer says "D-D10 OPEN — NOT APPROVED"; the L2 progression sentence now says D-D10 must be "fully decided" rather than "approved"; D-C5 is removed from the exhaustion-policy dependency list and recorded as APPROVED and orthogonal. **§17.1** PER-02 no longer lists D-C5 as a dependency. **§18** (PCC-38): AMB-08 now records the alarm/fault policy as CLOSED by DR-25.1…DR-25.5; AMB-14 now records direction APPROVED with sizes/thresholds undefined. **Deliberately NOT changed:** §17.3 **AC-08** and its companion sentence — PCC-22 forbids moving AC-08 before an explicit decision; §7.4 line 511 is a correct cross-reference. **New PCCs PCC-36, PCC-37, PCC-38 recorded as APPLIED (0.7.1).** No new decision, no new section, no row removed. Phase 2A / Phase 2B remain NOT AUTHORIZED. |
| 0.7.2 | 2026-10-05 | **AC-08 promotion (no new decisions).** **D-C5 was approved in 0.6.0 (DR-25.5)**, which removes the blocker that made PCC-22 "record only". **AC-08 is promoted from §17.3 (conditional) to §17.2 (unconditional)** with the approved D-C5 semantics stated inline: out-of-range readings raise zero alarm events; out-of-range data is a data-validity condition plus a system event, not an alarm, no escalation. **The §17.2 closing note was updated in the same pass** so it no longer lists AC-08 as non-unconditional (AC-07, AC-13 and AC-19 remain non-unconditional; AC-04 and AC-08 are the entries that have moved). The §17.3 note for AC-08 now records it as unconditional and points to §17.2. **PCC-22 → APPLIED (0.7.2)**. **§23** "Out-of-range handling" caveat "do not move AC-08 yet" removed. **Unchanged and reported:** §17.1 line "Out-of-range … see AC-08" still points at AC-08; that reference remains accurate (AC-08 exists and states zero alarm events) and was outside this patch's scope. No new decision, no new section, no row removed. Phase 2A / Phase 2B remain NOT AUTHORIZED. |
| 0.7.3 | 2026-10-05 | **Final approval of PROTOCOL_CONTRACT.md (v1.0.0).** No new decisions. The contract is now an approved companion document. `docs/PROTOCOL_CONTRACT.md` v0.2.4 → **v1.0.0**, status **APPROVED — final, 2026-10-05**; §9 non-inference rewritten; the three stale Phase 2B / implementation-status statements corrected. **§12.1** approval status, **§20** "Protocol / message contract approval" row and the **§21** Phase 2A gate text updated to the final approval. **§23** traceability row added. **§25** V118–V121 added. The contract remains revisable by an explicit decision round. **Phase 3 and all later phases remain NOT AUTHORIZED.** |
| 0.7.4 | 2026-10-05 | **Decision Round D — hardware architecture closure.** `docs/PROTOCOL_CONTRACT.md` v1.0.0 → **v1.1.0**: `reset_command`, `reset_result`, `live_state` `alarm_state` / `warning_state`, tests T-P16 / T-P17. Spec: **D-A2, D-A3, D-A4 APPROVED** (DR-31 / DR-32 / DR-33); **HW-02 … HW-09, HW-11, HW-12, HW-14 CLOSED**; **HW-10 = user responsibility (DR-38)**; **HW-13 stays OPEN**; voltage domain amended to 0–5 V (**DR-30**, amends DR-27). **DR-30 … DR-40** added. **§0.1, §3.1a, §3.2, §3.3, §5.3, §12.1, §19, §19.1, §20, §21, §23, §24, §25** updated; V122–V135 added. LED GPIO13 and WDT 5 s remain **PROPOSED — NOT DECIDED**. **Phase 3 remains NOT AUTHORIZED.** |

### 0.2 Status label definitions (used throughout this document)

| Label | Meaning |
|---|---|
| **DECIDED** | A decision made by the user; binding on the design. |
| **APPROVED** | A decision made and explicitly approved by the user for later implementation. |
| **PROPOSED — NOT APPROVED** | A suggestion recorded for review. Carries no authority; must not be implemented. |
| **OPEN — NOT APPROVED** | A question that has not been decided. No default is in force. |
| **BLOCKED** | Work that cannot proceed until a named decision or verification is resolved. |
| **DEFERRED** | Deliberately postponed; carried forward without action. |
| **Established requirement** | A requirement stated by the user and binding; not derived by this document. |
| **Verified fact** | A fact confirmed by direct inspection in this project. |

### 0.3 Scope and source limitations

**In scope:** the specification baseline for the Toughening Machine monitoring system — architecture, data semantics, decision register, dependencies, acceptance criteria and phase gates.

**Out of scope (not authorised by this document):** firmware implementation, Windows application implementation, database implementation, protocol implementation, tests, hardware configuration, network configuration change, package installation, and any release.

**Source limitations — read before relying on this document.**

1. **No prior document existed.** The workspace was verified empty immediately before this document was created. There was no earlier specification file to import, diff, or reconcile. This baseline was written from the conversation record only.
2. **Nothing here has been built, compiled, executed, or tested.** No test has been run at any point in this project. No performance figure has been measured. All timings, capacities and rates are **estimates pending verification**.
3. **No hardware has been selected, ordered, or validated.** The board reference in section 3.1 is a **preliminary selection** only.
4. **No sensor datasheet has been obtained.** Sensor identity rests on user statement. No transfer curve, calibration value, or manufacturer specification has been verified or invented.
5. **No network, IP, DHCP, firewall or Windows setting has been changed.**
6. **Where this document is silent, silence is not approval.** Missing information is recorded in section 18 rather than filled by assumption.

---

## 1. Purpose and System Overview

### 1.1 Purpose

The Toughening Machine system monitors **16 stations**, each fitted with an **upper nozzle** and a **lower nozzle**. Each nozzle carries a TMAP34 sensor providing a pressure signal and a temperature signal. The system measures these quantities, tracks station and cycle state, computes per-nozzle cycle statistics, raises and records alarms, and presents live and historical data to an operator through a Windows application.

### 1.2 System scale (established requirement)

| Quantity | Value |
|---|---|
| Stations | **16** |
| Nozzles per station | **2** (one upper, one lower) |
| Total nozzles | **32** |
| Total sensors | **32** |
| Analog measurement channels | **64** (32 pressure + 32 temperature) |
| PLC activation inputs | **16** (one per station) |
| Shared physical alarm output | **1** |
| Shared reset input | **1** |

**Constraint (established, non-negotiable):** it must **not** be assumed that the preliminary ESP32 selection can directly acquire all 64 analog channels. The acquisition architecture is **OPEN** (HW-02, HW-03).

### 1.3 Expected operating envelope

Each station cycle is expected to last **several minutes**. This drives buffer sizing, journal capacity analysis, and the decision **not** to store per-second measurements as historical records (section 13, PER-03).

### 1.4 Intended operating environment

* **Operating assumption:** each station cycle lasts several minutes.
* **Local operation only:** the system must operate without Internet access and without external CDN dependencies.
* **Location:** industrial bench / machine environment. Electrical details remain open (section 3 and section 5).

---

## 2. System Architecture

### 2.1 Responsibility split (established requirement)

| Element | Owns | Must never do |
|---|---|---|
| **ESP32** | Continuous local measurement, station tracking, cycle statistics, local alarm handling, local web dashboard, settings persistence, bounded record buffering and durable journal writing. | Depend on the PC to keep measuring or to raise a local alarm. |
| **Windows PC** | Historical database, operator GUI, reports, exports, backups, long-term storage, and acknowledgement of records. | Fabricate history for records it did not receive. |

### 2.2 ESP32 — required capabilities

| ID | Requirement |
|---|---|
| ARC-01 | Wi-Fi Access Point with proposed default IP **192.168.4.1**. |
| ARC-02 | Local HTTP server: live dashboard plus a **protected** settings page. |
| ARC-03 | WebSocket **client** connecting to the PC at **`ws://192.168.4.2:8000/ws/device`**. |
| ARC-04 | Configurable network settings. |
| ARC-05 | Reconnect behaviour with backoff. |
| ARC-06 | Fully autonomous measurement, station tracking, cycle statistics and alarm evaluation when the PC is unreachable. |
| ARC-07 | Settings persisted in ESP32 NVS / Preferences, surviving reboot. |
| ARC-08 | Bounded RAM buffer plus a durable journal (section 13) for unacknowledged records. |
| ARC-09 | Full live state for all 16 stations transmitted at approximately 1 Hz. |
| ARC-10 | *(duplicate of ARC-04 — deprecated alias; retained for traceability; no separate requirement)* |
| ARC-11 | Secrets (Wi-Fi credentials, settings PIN, tokens) must never appear in logs. |

**Requirement-ID deduplication (P1 / AUD-07).** `ARC-04` and `ARC-10` carried **identical** requirement text — *"Configurable network settings."* — inside the same ESP32 capability table (section 2.2). They are therefore treated as **one** requirement: **ARC-04 is canonical**; **ARC-10 is a deprecated alias, retained for traceability**. No requirement text was deleted or altered, no new requirement was created, and **no network decision is made here**.

**Residual — `OPEN — DOCUMENTATION DECISION REQUIRED`:** no distinct scope for `ARC-10` is recorded anywhere in this document. If a separate scope was ever intended (for example, a different configuration surface), it is **not documented**, and establishing any such distinction requires a documentation decision. Until that is decided, `ARC-04` and `ARC-10` must **not** be cited as two independent requirements.

### 2.3 PC application — required capabilities

| ID | Requirement |
|---|---|
| ARC-12 | HTTP and WebSocket server on TCP port **8000**. |
| ARC-13 | SQLite historical database. |
| ARC-14 | Operator GUI served as **local assets only**; no CDN; no Internet dependency. |
| ARC-15 | Automatic startup and recovery after Windows restart. |
| ARC-16 | Configurable database and backup locations. |
| ARC-17 | Operational without Internet access. |

### 2.4 Logical data flow

```
SENSORS (64 ch) ---.
PLC ACT (16 ch) ---'-> ESP32 -> acquisition -> validation -> station FSM
                                                     |
                                           cycle statistics
                                                     |
                                                alarm engine
                                                     |
                             +-----------------------+-----------------------+
                             |                                               |
                     HTTP (local UI)                            WebSocket client
                             |                                               |
                       settings store                     live_state (1 Hz, no ACK, not stored)
                       NVS + record store                  cycle_summary
                                                           alarm_event
                                                           system_event    -> validate -> SQLite
                                                           settings_change ->            COMMIT
                                                                                      |
                                                                             ACK <-----+
```

### 2.5 Proposed network architecture (PROPOSED — NOT APPROVED)

* The ESP32 runs an **Access Point** with a proposed default IP of `192.168.4.1`.
* The PC uses a **dedicated network adapter** (recommended) with a proposed static IP of `192.168.4.2`, subnet mask `255.255.255.0`.
* Proposed DHCP pool (subject to re-verification against the pinned Arduino-ESP32 version): `.100`–`.150`, excluding `.2`.
* **Nothing in this section has been applied.** See D-B1, D-B2, D-B3 and section 20.

---

## 3. Hardware Assumptions and Open Decisions

### 3.1 Preliminary board selection (DECIDED — preliminary only)

**Status: PRELIMINARY SELECTION — exact chip model, flash size, pinout and electrical specifications REQUIRE CONFIRMATION.**

> **`UNVERIFIED — NOT AN APPROVED HARDWARE FACT` (P1 / AUD-14).** Every value in the table below is **unverified retailer-page information**. It is a **working hypothesis only**. It is **not** an approved hardware fact, and it is **not** an approved architectural constraint. No feasibility claim anywhere in this document may be read as following from approved hardware.

The candidate prototype board is a **30-pin ESP32 development board** (ECA product 3011012035). The retailer page stated:

| Property | Value as stated on the retailer page (provisional) |
|---|---|
| Chip | ESP32-D0WDQ6 |
| Cores | Dual Xtensa 32-bit LX6 |
| Clock | 80–240 MHz |
| SRAM | 520 KB |
| ROM | 448 KB |
| Flash | 4 MB internal SPI flash |
| ADC | 4-channel ADC (as stated on the page) |
| USB-UART bridge | CH9102 / CP2102 |
| Pins | 30-pin board |

**Note:** this is **retailer-page evidence, not a manufacturer datasheet**, and is `UNVERIFIED — NOT AN APPROVED HARDWARE FACT`. The **stated** "4-channel ADC" figure is unverified. **If** it were accurate, four internal ADC channels could not serve the **64 analog channels** directly — but that is a **working hypothesis**, not an approved architectural constraint, and it is not an ADC or multiplexer decision. It informs, but does not resolve, HW-02 and HW-03 (both OPEN).

**Hardware facts that are approved: none.** The following remain **unresolved** and are carried as OPEN in sections 3.2 and 19: board identity; actual flash size; actual ADC resources; ADC architecture; multiplexer architecture; analog front-end architecture. `D-A1` remains a **preliminary selection only** and confirms none of them.

**Explicitly NOT decided by this selection:** GPIO assignment, ADC architecture, multiplexer topology, voltage divider/attenuation design, input protection, optocoupler input design, alarm output driver, and pinout map.

### 3.1a Board pinout image — visual record only (added 0.6.0)

**Scope of this subsection:** it records **only what the image shows**. It approves no hardware fact.

| Attribute | Observation |
|---|---|
| File | `docs/hardware/esp32-pinout.jpg` |
| Size on disk | 196 233 bytes |
| Status | **User-supplied image. Not a manufacturer datasheet.** |

* The image labels GPIOs **exposed on the board** and marks **6 GPIOs usable by ADC1** and **9 GPIOs usable by ADC2**.
* The image does **not** state a conversion-channel count, an ADC architecture, a multiplexer topology, a flash size, or any electrical rating. The **USB-UART bridge marking was not legible** and is therefore **not recorded here**.

**Conflict recorded, not resolved.** The ADC1/ADC2 **GPIO** counts do not correspond to the retailer's "4-channel ADC" wording in section 3.1. The two statements describe **different things** (board GPIO capability vs. ADC conversion-channel count). This document does **not** reconcile them and treats **neither** as approved.

**Explicit labelling requirement.** ADC2 / Wi-Fi coexistence limitations are **general knowledge, to be verified in Phase 2B**. They are **not** asserted as facts anywhere in this document and must not be cited as facts.

**No hardware fact is approved by this record.** **HW-01 and D-A8 are APPROVED (DR-13). HW-02 and HW-03 are CLOSED by DR-31.**

### 3.2 Hardware open-issues register

| ID | Issue | Status |
|---|---|---|
| HW-01 | Target ESP32 board/module confirmation (physical board, real flash size, bridge variant, usable ADC characteristics) | **APPROVED (DR-13)** — board confirmed; flash/chip/ADC characteristics pending explicit read-only verification (Phase 2B compiled but did not read the physical chip) |
| HW-02 | ADC acquisition architecture (internal ADC + multiplexer vs external precision ADC) | **CLOSED (DR-31)** — 4× CD74HC4067 MUX + 1× ADS1115 (VDD 5 V, PGA ±6.144 V) + 3× PCF8574T (5 V bus, level shifter); 16 MUX states × 4 ADS1115 channels = 64 |
| HW-03 | Multiplexer architecture and channel count | **CLOSED (DR-31)** — 4× CD74HC4067, 16 MUX states × 4 channels = 64 channels |
| HW-04 | Analog front end — attenuation/buffering for the 0.5–4.5 V sensor output | **CLOSED (DR-32)** — optocoupler + 5 V limit; PCB design is the user's responsibility (DR-38) |
| HW-05 | Input protection (over-voltage, reverse polarity, transients) | **CLOSED (DR-32)** — optocoupler + 5 V limit; PCB design is the user's responsibility (DR-38) |
| HW-06 | 16× PLC 24 V digital input conditioning | **CLOSED (DR-33)** — 1 alarm output + 1 reset input via PCF8574T |
| HW-07 | Optocoupler / input expansion topology | **CLOSED (DR-33)** — 3× PCF8574T pin map: 0–15 activation, 16–19 S0–S3, 20 alarm, 21 reset, 22–23 spare |
| HW-08 | Physical alarm output driver | **CLOSED (DR-33)** — PCF8574T pin 20 |
| HW-09 | GPIO pin map | **CLOSED (DR-37)** — I2C SDA = GPIO21, SCL = GPIO22, LED = GPIO13 (PROPOSED, verify Phase 3); remaining GPIOs reserved |
| HW-10 | Power supply and grounding design | **USER RESPONSIBILITY (DR-38)** — PCB design is left to the user; the specification approves no electrical value here |
| HW-11 | TMAP34 datasheet | **CLOSED (DR-39, per DR-26 sensor-agnostic)** — not required; measurement is voltage-based and no sensor datasheet is used |
| HW-12 | TMAP34 wiring, pin assignment and supply range | **CLOSED (DR-39, per DR-26 sensor-agnostic)** — not required; the voltage-based input accepts any analog-voltage sensor |
| HW-13 | Flash partition layout for the durable journal | OPEN — NOT APPROVED |
| HW-14 | Sampling model (simultaneous vs sequential per station) | **CLOSED (DR-40)** — sequential scanning confirmed |

### 3.3 Hardware register ↔ decision register mapping (P0 / AUD-01 repair)

The hardware open-issues register (section 3.2) and the decision register (section 19) overlap in subject. The mapping below makes that relationship explicit, so that a hardware issue can never be mistaken for an independently settled decision.

| Hardware register ID (section 3.2) | Decision register ID (section 19) | Relationship |
|---|---|---|
| HW-01 | D-A8 | Same decision subject — board / module confirmation. |
| HW-02 | D-A2 | Same decision subject — ADC acquisition architecture. HW-02 also appears as a row in section 19; it is the same subject, not a second decision. |
| HW-03 | D-A2 | Related hardware question under the same decision subject — multiplexer architecture. HW-03 also appears as a row in section 19. |
| HW-04, HW-05 | D-A3 | Related hardware questions under the same decision subject — analog front end / protection. |
| HW-06, HW-07, HW-08 | D-A4 | Related hardware questions under the same decision subject — input expansion and alarm output driver. |
| HW-09, HW-10, HW-11, HW-12, HW-13, HW-14 | *(no corresponding decision register entry)* | Open hardware questions not covered by any D-* decision. They remain OPEN and must not be treated as settled. |

**Binding rule (P0 / AUD-01):** The hardware issue register is **subordinate** to the decision register. A hardware issue does **not** independently close, approve, or override a decision. The authoritative approval state is the corresponding D-* decision state.

**Status preserved by this repair:** the mapping records relationships only and changes no status. **D-A2, D-A3 and D-A4 are APPROVED (DR-31/32/33). D-A8 is APPROVED (DR-13).** **HW-01 is closed with it**. HW-02 must not be interpreted as independently approved.

---

## 4. Measurement, Sensors and Conversion

### 4.1 Sensor identity (user statement, not independently verified)

The sensors are identified by the user as **TMAP34**. The provided marketplace link returned **only a JavaScript-required placeholder page**; no product title, specification, pinout, supply voltage or datasheet was obtained. **The TMAP34 datasheet has NOT been obtained** (HW-11).

### 4.2 Raw voltage retention — policy scope OPEN (P0 / AUD-02 repair)

**Established (unchanged):** the raw voltage of a measurement is never modified, rescaled, clamped or discarded at acquisition time. It is preserved in the **live state** and in the API and GUI representation of that measurement — whether the sample is in range or out of range, and whether or not conversion is configured. An invalid or out-of-range converted value never replaces, hides or removes the raw voltage it came from.

**Contradiction identified (AUD-02).** An earlier wording required the raw voltage of **every** measurement to be retained "in the stored record", while **PER-03** (section 13.2) establishes that per-second / per-interval ADC measurements are **not** stored as historical records, and the proposed schema (section 14.2) contains **no measurement table**. Those statements cannot all hold simultaneously: the document does not define where a per-sample raw voltage would durably live, and requiring it would contradict PER-03 as written.

**Resolution status: `RAW-VOLTAGE-RETENTION` / DR-04 — PARTIALLY RESOLVED (0.5.0).** The core durable scope is **APPROVED (DR-04A)**; the occurrence model and the remaining sub-decisions stay OPEN. The candidate scopes below are retained as the record of the decision space; **the DR-04A decision selects the out-of-range category only**.

#### DR-04A — core durable retention scope — **APPROVED (0.5.0)**

> *The raw voltage associated with an applicable **`out_of_range`** reading must exist in **durable historical storage**, so that section 4.5 step 7 can be satisfied for the historical / database-derived reports and exports covered by **DR-01**.*

**This approval determines the CATEGORY of measurement only.** It explicitly does **not** determine: the number of retained occurrences; occurrence granularity; debounce behaviour; hysteresis behaviour; cycle-boundary samples; cycle min/max anchors; interrupted-cycle anchors; persistence ordering; diagnostic RAM windows; journal capacity or sizing; reserved-area size; endurance; exhaustion policy; or alarm semantics.

**PER-03 is unaffected.** DR-04A does **not** create per-interval or full per-sample historical storage, and does **not** imply "store every out-of-range occurrence". Live availability of raw voltage for every sample continues to follow paragraph 1 above.

**Still OPEN within this area:** **DR-04A2** occurrence granularity — **APPROVED (DR-25.9, 0.6.0)**: one durable raw-voltage record per entry into `out_of_range`, plus a count. **Count finalization and D-D2 persistence remain OPEN.** **DR-04C** tie-breaking — **NOT READY** (no anchor decision exists). **DR-04D** cycle-boundary samples — **NOT READY**, dependent on **D-D2**. **DR-04E** interrupted-cycle anchors — **NOT READY**, dependent on **D-D2**. **DR-04F** persistence ordering — **NOT READY**, dependent on **D-D2**. **DR-04B** cycle min/max raw anchors — **REJECTED / OMITTED**; no anchor fields, tracking logic, schema columns or tie-breaking rules are introduced. **DR-04G** bounded diagnostic RAM window — **REJECTED / NOT ADOPTED**; no diagnostic retention buffer is introduced.

1. every sample durably stored (would conflict with PER-03 as currently written),
2. event records only,
3. cycle min / max samples only,
4. fault / out-of-range samples only,
5. live state only (no durable per-sample raw voltage).

**Constraint from DR-01 (APPROVED).** Because historical / database-derived reports and exports are in scope, and because the section 4.5 step-7 raw-voltage obligation applies to them, **candidate scope 5 (live state only) is no longer available** — the raw voltage associated with applicable out-of-range readings must exist durably. This **constrains** the choice but does **not** make it; **DR-04 remains OPEN**.

**Invariants preserved by this repair:**
* PER-03 remains in force, unchanged: no per-interval historical records.
* No statement in this document may simultaneously (i) require durable historical storage of every sample and (ii) prohibit per-interval historical storage. Until the retention scope is decided, no such requirement is asserted.
* Raw voltage continues to be preserved unconditionally in the live / non-durable representation (paragraph 1).

**Related unresolved item.** Section 14.4 refers to a "measurement / live record". No `measurement` table is proposed in section 14.2, so that table name is **unresolved** and is to be settled together with the retention scope. The reference is **not** an approval of a measurement table.

### 4.3 Pressure conversion (method DECIDED; points nominal and unverified)

Pressure uses a **configurable two-point linear conversion**. The currently proposed nominal points are:

| Parameter | Nominal value |
|---|---|
| `pressure_voltage_min` | 0.5 V |
| `pressure_value_min` | 0 bar |
| `pressure_voltage_max` | 4.5 V |
| `pressure_value_max` | 4 bar |

**Provenance:** `pressure_calibration_source = "nominal_unverified"`; `approved = 0`. These values are **nominal and unverified**; they are not a manufacturer transfer curve and must not be presented as one.

**General conversion formula (parameter-driven, not hard-coded):**

```
converted = y1 + (voltage - x1) * (y2 - y1) / (x2 - x1)
```

**Validation:** the configured calibration points must be finite, and `x1 != x2` must hold (zero denominator rejected).

**Algebraic note (verified arithmetic only):** with the nominal points above, the general form reduces to `(voltage − 0.5) × 1.0 = voltage − 0.5`. The **general two-point form must be what is implemented**, not the simplified expression, so that future parameter changes are honoured.

### 4.4 Temperature conversion (method DECIDED; parameters unset)

Temperature uses the same **configurable two-point linear form**, but with **independent** parameters:

| Parameter | Status |
|---|---|
| `temp_voltage_min` | **OPEN — no value assigned** |
| `temp_voltage_max` | **OPEN — no value assigned** |
| `temp_value_min_c` | **OPEN — no value assigned** |
| `temp_value_max_c` | **OPEN — no value assigned** |

**No temperature value may be fabricated.** No typical value, no manufacturer-attributed value and no default guess is permitted. The 0.5–4.5 V pressure range does **not**, by itself, establish the sensor temperature range.

**Behaviour while temperature parameters are unset or invalid:** `temp_c` remains `null`; `temp_conversion_configured = false`; the raw temperature voltage is still recorded and displayed (section 6.3).

### 4.5 Out-of-range handling (established requirement)

When a measurement is out of range:

1. **Preserve the raw voltage.**
2. **Mark the converted value invalid** — it is not a pressure or temperature reading.
3. **Exclude invalid converted values from valid statistics.**
4. **Store the relevant converted SQL value as `NULL`** — not 0, not the clamped boundary.
5. **Preserve explicit validity and out-of-range flags** (`out_of_range`, `pressure_valid` / `temperature_valid`).
6. **Never clamp an invalid reading into range**, in any layer.
7. **Display invalidity clearly** in the GUI, in live / operator views, and in **reports and exports — including historical / database-derived reports and exports** (scope approved as **DR-01**) — the raw voltage is shown with an explicit invalid indicator.

**Non-escalation:** an out-of-range reading is a **data-validity condition, not an alarm**. Severity is governed by **D-C5, which is APPROVED (DR-25.5, 0.6.0)**: out-of-range / invalid data is a data-validity condition plus a system event; the cycle completes and invalid samples are excluded from statistics; no physical alarm and no escalation.

**Retention pointer (P0 / AUD-02):** step 1 above preserves the raw voltage in the live / non-durable representation.

**Scope of the report obligation — DR-01 APPROVED.** Because section 16.3 requires reports and exports to reconcile against the database, the raw-voltage display obligation in step 7 applies to **historical / database-derived** reports and exports as well as to live views. This creates a **durable-data requirement for the raw voltage associated with applicable out-of-range readings**.

**What DR-01 does NOT decide.** The detailed retention policy — granularity, retention lifetime, storage medium, complete record scope, cycle-boundary anchors, min/max anchors, tie-breaking, persistence ordering and interrupted-cycle behaviour — remains **`RAW-VOLTAGE-RETENTION` / DR-04 — OPEN — DECISION REQUIRED** (section 4.2). Nothing in this note resolves DR-04.

---

## 5. Activation Inputs and Electrical Safety

### 5.1 Activation interface (intent established; implementation PROPOSED — NOT APPROVED)

The proposed activation interface uses **16 PLC 24 V inputs** through suitable **input protection and optocouplers**. ESP32-side logic is **active LOW**: LOW means **active**, HIGH means **inactive**.

**Never connect 24 V directly to an ESP32 GPIO.** The 24 V signal must be isolated and conditioned before reaching any ESP32 pin.

### 5.2 Electrical safety requirements (established)

| ID | Requirement |
|---|---|
| ELE-01 | 24 V must never be presented directly to an ESP32 GPIO. |
| ELE-02 | Each of the 16 activation channels requires isolation and input protection. |
| ELE-03 | Exact circuitry, component ratings and board pin assignments remain **unapproved** (HW-05, HW-06, HW-07, HW-09). |
| ELE-04 | The shared physical alarm output and shared reset input require an approved driver design before connection (HW-08). |

**Status of this section:** the *intent* (16 isolated 24 V inputs, active-LOW ESP32-side logic) is recorded as a requirement; the *implementation* (components, ratings, pins) is **OPEN — NOT APPROVED**.

### 5.3 Acquisition feasibility warning (established)

There are **64 analog channels** and — **according to unverified retailer-page information only** (`UNVERIFIED — NOT AN APPROVED HARDWARE FACT`, section 3.1) — a "4-channel ADC" figure is *claimed* on the candidate board. That figure is a **retailer-page claim (marked UNVERIFIED)**, not an approved hardware fact.

**What the pinout image actually shows (section 3.1a, observation only):** the board's pinout image shows **6 exposed ADC1-capable GPIOs — GPIO32, GPIO33, GPIO34, GPIO35, GPIO36, GPIO39** (labelled ADC1 CH4, CH5, CH6, CH7, CH0, CH3 respectively) and 9 ADC2-capable GPIOs. The ADC1 and ADC2 **GPIO** counts do **not** correspond to the retailer's "4-channel ADC" wording: the two describe different things (board GPIO capability vs. ADC conversion channels), and the image states **no** conversion-channel count.

**Acquisition architecture is APPROVED (DR-31).**

It must **not** be assumed that the preliminary ESP32 selection can acquire all channels directly. The acquisition and multiplexing architecture is **APPROVED (DR-31)** — 4× CD74HC4067 MUX + 1× ADS1115 + 3× PCF8574T — and building it is a prerequisite for Phase 3. The **64-channel requirement is an approved requirement** (section 1.2); the claimed 4-channel ADC resource is **not** an approved fact, and the mismatch between them is a working hypothesis, not a settled constraint.

---

## 6. Acquisition Validity and Sample Counters

### 6.1 Validity independence (established invariant)

Pressure validity and temperature validity are evaluated and stored **independently**. A sample is **never** marked invalid merely because the *other* quantity is invalid. Pressure valid with temperature invalid (the expected interim state until section 4.4 closes) is a fully supported condition and must not be collapsed into a single verdict.

### 6.2 Mandatory per-nozzle counters — D-D11 APPROVED

The following counters are **mandatory** and belong to the **per-cycle, per-nozzle** statistics grain:

| Field | Grain | Definition |
|---|---|---|
| `valid_samples_pressure` | nozzle | Count of acquisition passes in which that nozzle's **pressure** was valid |
| `valid_samples_temperature` | nozzle | Count of acquisition passes in which that nozzle's **temperature** was valid |
| `temp_conversion_configured` | **derived status**, evaluated per nozzle; derived from that nozzle's **per-channel** calibration (**DR-27 APPROVED — supersedes DR-08**) | Whether that channel's calibration parameters are set and valid at the time the value was evaluated |

**Rationale for grain:** the validity conditions are **per nozzle**; storing them at nozzle grain removes the grain mismatch that made an earlier single station-level `valid_sample_count` ambiguous. The legacy name `valid_sample_count` is **deprecated** and must not be retained with an ambiguous meaning.

### 6.3 Three-state temperature counters (APPROVED — D-D12)

| State | `valid_samples_temperature` | `temp_conversion_configured` | Meaning |
|---|---|---|---|
| Unconfigured conversion | **`NULL`** | **`false`** | Parameters unset/invalid; conversion deliberately not attempted. No quality claim is made. |
| Configured, zero valid | **`0`** | `true` | Conversion active and configured; **zero** samples were valid. A real negative measurement result. |
| Configured, one or more valid | **`n ≥ 1`** | `true` | Normal case. |

Collapsing `NULL` and `0` is prohibited: "not measured" and "measured as zero" are different facts, and conflating them fabricates a quality metric.

**Grain note (P1 / AUD-10; resolved by DR-08, superseded by DR-27):** the table above shows `temp_conversion_configured` beside the per-nozzle counters because the flag is **evaluated at the per-nozzle grain** — but it is **derived from the per-channel calibration** (**DR-27 APPROVED**, section 6.6). **DR-08's device-global ownership is SUPERSEDED by DR-27.** **D-D12** continues to fix the **value representation only** (`NULL` + `false`); DR-27 fixes **ownership and grain** and does **not** change D-D12.

### 6.4 Optional station-level simultaneous counters (BLOCKED)

Two optional counters may exist at station grain:

| Field | Grain | Definition | Blocker |
|---|---|---|---|
| `valid_samples_pressure_both_nozzles` | station | Count of acquisition passes in which **both** nozzles' pressure was valid **in the same pass** | HW-02, HW-03 |
| `valid_samples_temperature_both_nozzles` | station | Same, for temperature | HW-02, HW-03 |

**Rule:** if supported, these are counted **directly from same-pass validity**, never derived as `min()` of the independent per-nozzle totals. A `min()` is a proxy, not a measurement, and destroys simultaneity information. These counters are **BLOCKED** because the sampling model (simultaneous vs sequential, HW-14) depends on the open ADC/multiplexer architecture.

### 6.5 No-substitution rules (established invariants)

* No invalid converted value contributes to any statistic.
* No missing or invalid value is **ever** replaced with zero; an absent or invalid value is stored as `NULL`.
* Raw voltage remains available for every sample regardless of validity.
* `valid_samples_* = 0` is reachable **only** when the conversion is configured and no sample was valid.

### 6.6 `TEMP-CONVERSION-CONFIG-GRAIN` — Q1–Q3 SUPERSEDED (DR-27); Q4–Q8 `OPEN — DECISION REQUIRED` (P1 / AUD-10)

**Partially resolved.** The entity that **owns** the `temp_conversion_configured` flag is established for **Q1–Q3** by **DR-27**. **DR-08 Q1–Q3 is SUPERSEDED by DR-27**, which re-decides ownership as **per-channel** (each of the 64 channels is configured and calibrated separately) instead of device-global. Q1–Q3 are therefore **re-decided**, not re-opened. Questions **Q4–Q8 remain OPEN** — and are **more important now** that ownership is per-channel — and are listed below unchanged.

**D-D12 is preserved exactly as approved:** *unconfigured temperature conversion = `NULL` + `temp_conversion_configured = false`.* D-D12 decides the **value representation** only. It does **not** decide ownership, grain, or mid-cycle behaviour, and must not be read as doing so.

**RESOLVED by DR-08 (Q1–Q3):**

1. **Owner (Q1)** — the **configuration setting**, and that setting is **device-global**.
2. **Nozzle specificity (Q2)** — **not** nozzle-specific. One temperature configuration state covers all 32 nozzles; the flag is not maintained independently per upper/lower nozzle.
3. **Quantity specificity (Q3)** — **quantity-specific**: the temperature configuration is **independent** from the pressure configuration (section 4.4). `temp_conversion_configured` is **evaluated per nozzle** (because `valid_samples_temperature` is per nozzle, section 6.2) and is **derived** from the **per-channel** temperature configuration state (**DR-27, 0.6.0**).

**STILL OPEN — none is answered here (Q4–Q8):**

4. **Effective time** — does a configuration change apply **immediately** to in-flight processing?
5. **Forward effect** — does a configuration change affect **only future samples**?
6. **Active cycle** — does a configuration change affect an **already-active cycle**?
7. **Configuration versioning (Q7)** — which configuration is associated with a cycle summary written **after** a change?
8. **Historical configuration identity (Q8)** — how is a settings change represented in **historical data** for the affected records?

**Status: PARTIALLY RESOLVED.** **Q1–Q3 are APPROVED (DR-27, 0.6.0 — superseding DR-08)** and the grain is now fixed; section 6.2 reflects it. **Q4–Q8 remain `OPEN — DECISION REQUIRED`**, and any requirement depending on them is **BLOCKED — DECISION REQUIRED**.

**What DR-08 / DR-27 do NOT decide.** When a configuration change takes effect, active-cycle behaviour, configuration versioning, historical configuration identity, mid-cycle behaviour (**DR-10**) and **D-D2** all remain OPEN.

---

## 7. Fault Counters

Three distinct meanings are kept separate and must not be merged.

### 7.1 Counters (PROPOSED — NOT APPROVED; semantics governed by D-D13)

| Counter | Grain | Definition | Status |
|---|---|---|---|
| `faulted_channel_count` | cycle | Number of **distinct channels** (of 64) in the `out_of_range` state **at least once** during the cycle | **APPROVED (DR-07-C2)** — cumulative distinct-channel counter; fault vocabulary **APPROVED (DR-06)**; interrupted/reboot persistence still **OPEN (D-D2)** |
| `fault_transition_count` | cycle | Number of **entries** into the `out_of_range` state during the cycle | PROPOSED — NOT APPROVED; **OPEN — DECISION REQUIRED (DR-07-C3, 0.6.0)**; **no longer blocked by D-C4** (D-C4 defaults APPROVED, DR-25.4); stored as `NULL` (section 7.4) |
| `invalid_channel_count_now` | live state (transient) | **Current** number of channels in the `out_of_range` state at this instant | **APPROVED (DR-07-C1)** — instantaneous, live-only, non-durable, counts **channels** not samples; **not** a cycle-history counter |

### 7.1a Fault-counter semantics — `D-D13 — OPEN — DECISION REQUIRED` (P1 / AUD-09)

These three counters previously appeared in the schema, tests, dependencies and traceability with **no governing decision**, which created an approval gap. **`D-D13` is an explicit unresolved decision entry; it decides nothing.**

#### Fault vocabulary — **DR-06 APPROVED**

For the purposes of D-D13 counting, a channel is **faulted only** when its state is `out_of_range`:

| Nozzle / channel state | Faulted for D-D13 counting? |
|---|---|
| `out_of_range` | **Yes — faulted** |
| `unconfigured` | **No — not faulted** |
| `valid` | **No — not faulted** |

**`unconfigured` is a configuration / data-readiness state and must not be turned into a fault.** While temperature conversion parameters remain unset (section 4.4), temperature channels are `unconfigured` and are therefore **not** counted as faulted.

**Scope limits of DR-06 — vocabulary and counting semantics only.** DR-06 does **NOT** create an alarm, define alarm severity, define Warning behaviour, define reset behaviour, define hysteresis or debounce, define transition detection, or define cycle impact. At the time DR-06 was written, D-C1…D-C5 were **OPEN**. They were subsequently **APPROVED (DR-25.1…DR-25.5, 0.6.0)** — D-C4 as defaults only.

**The approved D-D12 semantics are preserved unchanged:** *unconfigured temperature conversion = `NULL` + `temp_conversion_configured = false`; numeric `0` only when configured and truly zero valid samples.*

#### Fault-counter models — **DR-07-C1 and DR-07-C2 APPROVED (0.5.0)**

**`invalid_channel_count_now` — APPROVED (DR-07-C1).**
Instantaneous **live-state** value; **non-durable**; counts **channels**, not samples; counts channels **currently** in `out_of_range`; `valid` channels are excluded; `unconfigured` channels are excluded (DR-06 defines the faulted state as `out_of_range` only). It is a live-state / transient value and is **NOT a cycle-history counter**.

**`faulted_channel_count` — APPROVED (DR-07-C2).**
> *The cumulative number of distinct channels that experienced at least one `out_of_range` condition during the cycle.*

Counted per channel; a channel is counted **at most once** within a cycle; the counter belongs to the **cycle summary**; the conceptual reset occurs **at cycle start**. It is a **distinct-channel cumulative counter, not a transition counter** and **not an alarm counter**.

**What these two approvals explicitly do NOT decide.**
* **D-D2 dependency:** interrupted-cycle persistence, reboot behaviour, recovery of the counter after reboot, and persistence ordering all remain **OPEN (D-D2)**.
* **DR-12 dependency:** whether activation-stabilisation samples participate is **OPEN (DR-12)**. The section 9.2 rule (stabilisation samples excluded from cycle statistics; threshold evaluation suppressed) is **preserved but not extended** into fault-counter semantics.
* **No transition semantics** are introduced into `faulted_channel_count`.

**`fault_transition_count` — OPEN — DECISION REQUIRED (DR-07-C3, 0.6.0).** PROPOSED, **NOT APPROVED**, stored as `NULL` (section 7.4). **DR-07-C3 has NOT been decided by the user.** Its earlier status (`DEFERRED — BLOCKED by D-C4`) is **withdrawn**: because **D-C4 defaults are now APPROVED (DR-25.4)**, DR-07-C3 is **no longer blocked by D-C4** and is now an **open question awaiting an explicit decision**. Entering/leaving semantics, hysteresis, debounce, repeated excursions, transition entity scope, transition persistence and stabilisation behaviour all remain **undefined**. `fault_transition_count` stays `NULL` in every draft until the user decides DR-07-C3.

**Already established, and preserved as such:**
* the three meanings must be kept distinct and must not be merged (section 7 preamble);
* counters are **aggregate fields**, never one record per sampling interval (section 7.3);
* `fault_transition_count` is **not implemented** before D-C4, and is stored as `NULL` rather than `0` (section 7.4);
* an invalid measurement is **not** an alarm and carries **no** severity; D-C5 governs that (section 7.5).

**Remaining OPEN under D-D13 — none of these is selected:**
1. ~~What constitutes a **faulted channel**~~ — **RESOLVED by DR-06**: `out_of_range` only (see the approved vocabulary block above).
2. ~~Whether a count is **instantaneous** or **cumulative**~~ — **RESOLVED by DR-07-C1** (`invalid_channel_count_now` = instantaneous) and **DR-07-C2** (`faulted_channel_count` = cumulative within the cycle).
3. Whether **transitions** are counted **per channel**, **per station**, or both. — **OPEN — DECISION REQUIRED (DR-07-C3)**; **no longer blocked by D-C4**

4. **Reset** behaviour — cycle-start reset **APPROVED for `faulted_channel_count` (DR-07-C2)**; reset at **device restart** remains **OPEN (D-D2)**; reset for `fault_transition_count` remains **OPEN**.
5. **Reboot** behaviour across a restart — **OPEN (D-D2)**.
6. **Persistence** behaviour — cycle-summary placement **APPROVED for `faulted_channel_count` (DR-07-C2)**; interrupted-cycle persistence remains **OPEN (D-D2)**; `fault_transition_count` persistence **OPEN**.
7. Relationship to **D-C5** (what an invalid sensor means for the cycle and for alarms) — **RESOLVED (DR-25.5)**: out-of-range / invalid data is a data-validity condition plus a system event; the cycle completes and invalid samples are excluded from statistics; no physical alarm and no escalation.
8. Relationship to **D-C4** (hysteresis / debounce, and what constitutes one transition) — **OPEN**. D-C4 defaults are **APPROVED (DR-25.4)**; whether DR-07-C3 adopts them is a **separate, undecided** question.
9. **DR-12 — whether samples during activation stabilisation participate in fault counting** (all three counters) — **OPEN**.

**Status: PARTIALLY RESOLVED.** `invalid_channel_count_now` and `faulted_channel_count` models are **APPROVED** (DR-07-C1, DR-07-C2) and are independent of D-C4 and D-C5. `fault_transition_count` remains **OPEN — DECISION REQUIRED (DR-07-C3, 0.6.0)** — **no longer blocked by D-C4** — and stored as `NULL` (section 7.4). Stabilisation participation — **RESOLVED (DR-25.6)**: samples during activation stabilisation are **NOT** counted in fault counters. Interrupted-cycle and reboot persistence remain **OPEN (D-D2)**.

### 7.2 Legacy names (must not be silently reused)

The earlier ambiguous names `faulted_channels` and `valid_sample_count` are **deprecated**. They must not be retained as though their meanings were settled. `faulted_channels` previously suggested an observation count while the intended meaning is a distinct-channel count.

### 7.3 Storage without per-interval records (established invariant)

A cycle of several minutes at approximately 1 Hz produces hundreds of samples per channel. Counters are therefore stored as **aggregate fields** on the existing cycle summary row and the live state — **not** as one record per sampling interval. The established rule is the **aggregation principle only**: one counter value per cycle, never one record per sample. The illustrative figure `faulted_channel_count = 1` for a channel in the `out_of_range` state (fault vocabulary APPROVED, DR-06) for a whole cycle presupposes the **counting** semantics that are **OPEN under D-D13 / DR-07** (section 7.1a), and is therefore **pending DR-07**, not established behaviour.

Bounded **state-transition** records may be used to retain diagnostic detail: one record when a channel **enters** the invalid state and one when it **leaves**. This preserves the event-based logging requirement without event spam.

### 7.4 Transition counting — OPEN — DECISION REQUIRED (DR-07-C3)

`fault_transition_count` and the transition-event records require a definition of when a channel is deemed to have *entered* and *left* the invalid state — that is a **hysteresis / debounce** question.

**Status change in 0.6.0.** D-C4 is **no longer OPEN**: its defaults are **APPROVED (DR-25.4)**. **DR-07-C3 is therefore no longer blocked by D-C4** and is now an **open question awaiting an explicit user decision**. Adopting the D-C4 defaults is *one* possible answer, not an automatic one — DR-07-C3 is **not** thereby decided.

Until **DR-07-C3** is decided:

* `fault_transition_count` **must not be implemented**;
* it is stored as `NULL` (not `0`), because `0` would assert a measurement claim that was never made.

### 7.5 Non-escalation (established — do not pre-empt policy)

An out-of-range or invalid measurement is **not** an alarm and is **not** assigned any Warning or Alarm severity. **D-C5 is APPROVED (DR-25.5, 0.6.0):** out-of-range / invalid data is a data-validity condition plus a system event; the cycle completes and invalid samples are excluded from statistics; no physical alarm and no escalation. D-C1…D-C4 (DR-25.1…DR-25.4) govern any alarm policy for other conditions.

---

## 8. States

States are described as the intended logical model. Exact enumerations for alarm-related states depend on policies that remain **OPEN** (section 10).

### 8.1 Nozzle states (per nozzle, per quantity)

| State | Meaning |
|---|---|
| `unconfigured` | Conversion parameters not set; no converted value produced (applies to pressure and temperature; DR-27 per-channel calibration, both start unconfigured). |
| `valid` | Value in range, conversion valid, contributes to statistics. |
| `out_of_range` | Voltage outside the configured range; converted value invalid; raw voltage preserved; excluded from statistics. |

Pressure and temperature are evaluated **independently** (section 6.1).

### 8.2 Station states (per station)

| State | Meaning |
|---|---|
| `idle` | Activation input inactive; no cycle running. |
| `stabilising` | Activation active; within the stabilisation window; measurements displayed, excluded from cycle statistics, thresholds suppressed. |
| `running` | Activation active; beyond stabilisation; samples contribute to statistics; thresholds evaluated. |
| `post_cycle` | Cycle ended; summary finalised. |
| `fault` | Station-level fault condition. Severity and trigger conditions are governed by **D-C5, APPROVED (DR-25.5)**. |

The **station overall status reflects the worst nozzle status** (established requirement).

### 8.3 Cycle states (per station cycle)

| State | Meaning |
|---|---|
| `not_started` | No active cycle. |
| `active` | Cycle underway (after the stabilisation delay). |
| `completed` | Cycle reached a normal end; summary finalised with valid start and end. |
| `interrupted` | Cycle did **not** reach a normal end (activation lost abnormally, or a reboot occurred). End time and duration must **not** be fabricated. **Detection** of an interruption depends on **D-D2 (OPEN)**; this row defines the **representation** only (section 9.5). |
| `invalid` | Cycle was completed but is not usable for statistics (for example, no valid samples). Conditions depend on **D-C5, APPROVED (DR-25.5)**. |

### 8.4 Machine states (system-wide)

| State | Meaning |
|---|---|
| `measuring` | Measurement ongoing; PC reachability does not affect this. |
| `pc_connected` / `pc_disconnected` | Transport-level reachability of the PC; does not stop local measurement. |
| `journal_pressure` | The record store is nearing capacity (threshold is **OPEN**, D-D6). |
| `overflow` | The reserved area is saturated. D-D10 direction is **APPROVED (DR-25.8, 0.6.0)** — overwrite-oldest. Priority classes, counters and thresholds remain OPEN. |
| `data_loss_pending` | A record loss is known to the device but not yet durably recorded on the PC (section 12.6). |

### 8.5 Alarm severity vocabulary (structure only)

The severity vocabulary is **Alarm**, **Warning**, **Information / event**. The **policy** that assigns these, and the transitions between them, is **APPROVED (DR-25.1…DR-25.5)**; **D-C4 is defaults only**. This document records the vocabulary and the resolved decisions; it does **not** re-decide the policy.

---

## 9. Cycle Behaviour and Recovery

### 9.1 Cycle start

A cycle is considered **active** when the station activation input is active, **subject to the configurable default stabilisation delay of 5 seconds**.

### 9.2 Stabilisation

During stabilisation, measurements are **still displayed**, but:

* samples are **excluded** from cycle statistics;
* threshold evaluation is **suppressed** (no alarm events are raised on stabilisation samples).
* samples are also excluded from fault-counter accounting (DR-25.6, 0.6.0 — APPROVED).

The 5-second default is configurable.

### 9.3 Cycle end and completion ordering

A cycle ends on normal de-activation or on a defined end condition. The **completion ordering** — active-cycle marker write, statistics accumulation, completion decision, summary storage, marker clear, and post-boot recovery — is a **PROPOSED — NOT APPROVED** design. **D-D2 remains OPEN — NOT APPROVED.** No marker logic is to be implemented until D-D2 is decided.

**What DR-25.7 (0.6.0) decides — direction only.** An **active-cycle marker** is **written at cycle start and updated / retained at cycle end**, so that an in-progress cycle is always recoverable from durable storage. This marker **direction** is **APPROVED**.

**What DR-25.7 does NOT decide — OPEN — DECISION REQUIRED:**

* **When the end-of-cycle marker is cleared** — the rule for clearing it after a normal completion is **OPEN** and is **not** decided by the direction above;
* the **detailed step ordering** among marker write, statistics accumulation, completion decision, summary storage and post-boot recovery;
* interrupted-cycle **detection** and **recovery** semantics;
* interrupted-cycle persistence of `faulted_channel_count`;
* persistence ordering for raw-voltage records (**DR-04F**).

**Consequence:** D-D2 remains **OPEN**; only its marker direction is approved. T5 and T6 remain **SUSPENDED**, and AC-13 remains **BLOCKED by D-D2**.

### 9.4 Duration rule (established invariant; P0 / AUD-03 clarification)

Two **independent** notions must not be conflated:

| Notion | Meaning |
|---|---|
| **Calendar validity** | Whether the UTC / calendar timestamp of the event is valid. |
| **Duration validity** | Whether a reliable duration can be derived. A duration is derivable from **either** (a) a valid, comparable pair of calendar timestamps, **or** (b) a comparable pair of uptime values **within the same `boot_id`**. |

Rules:

* `duration_ms` is derived from a **comparable pair of time points** — valid calendar timestamps, or uptimes within one `boot_id`. The two sources are **not interchangeable**, and one is never silently substituted for the other.
* Uptime differences are comparable **only within a single `boot_id`**.
* A cycle that spans a reboot **must not** be given an estimated or fabricated duration; `duration_ms = NULL` and `duration_basis = 'null'`.
* Calendar validity and duration validity are **independent**: a cycle may have invalid calendar timestamps yet still yield a duration from same-boot uptimes, and a cycle may have valid calendar timestamps yet yield no duration if it spans a reboot.
* A backward clock step must never yield a negative `duration_ms`.

**`duration_basis` value set — APPROVED (DR-03).** The complete permitted value set is:

| Value | Meaning |
|---|---|
| `'null'` | No valid comparable duration is available. |
| `'calendar'` | Duration derived from a valid comparable pair of calendar timestamps. |
| `'uptime_same_boot'` | Duration derived from comparable uptime values within the same `boot_id`. |

**No other value exists.** In particular `'monotonic'`, `'rtc'`, `'clock_step'`, `'estimated'` and `'unknown'` are **not** part of the set and must not be used.

**Scope limits of DR-03.** The value set is vocabulary only. It does **not** change the duration calculation rules above, does **not** change time authority (**D-D7 remains OPEN**), and does **not** resolve interrupted-cycle detection (**D-D2 remains OPEN**; T5 and T6 remain SUSPENDED; AC-13 remains BLOCKED).

**Clock-step duration policy — APPROVED (CS-01, Policy B).**

> *When calendar timestamps become **incomparable** because a backward clock step causes the calendar end timestamp to precede the calendar start timestamp, the system uses **`uptime_same_boot`** as the duration basis, provided a valid same-boot uptime pair exists.*

| Case | Condition | `duration_basis` | `duration_ms` |
|---|---|---|---|
| 1 | A valid **same-boot uptime pair exists** | `'uptime_same_boot'` | computed from that uptime pair |
| 2 | **No valid same-boot uptime pair** (for example the cycle spans a reboot) | `'null'` | `NULL` |

The approved DR-03b invariant applies unchanged in both cases: **`duration_ms IS NULL ⇔ duration_basis = 'null'`**.

**No new `duration_basis` value is introduced.** The approved value set remains exactly `'null'`, `'calendar'`, `'uptime_same_boot'` (DR-03).

**What CS-01 does NOT decide.** It does **not** resolve **D-D7** (time authority — PC clock vs hardware RTC), synchronisation interval or mechanism, clock-step **detection** (section 11.4 unchanged), rewriting of stored event timestamps, interrupted-cycle policy, reboot persistence, or **D-D2**. **D-D7 remains OPEN.**

### 9.5 Interrupted cycles — representation vs detection (P0 / AUD-05 repair)

Two separate concepts, which earlier wording mixed:

**(a) Representation rule — established.** *If and when* an interruption has been **established**, the interrupted cycle is represented as `status = 'interrupted'`, `cycle_end_ms = NULL`, `end_time_valid = 0`, `duration_ms = NULL` and `duration_basis = 'null'`. **No fabricated end time or duration. No completed record is ever synthesised from an interrupted cycle.**
This representation rule does **not** imply that any interruption can currently be detected, and does **not** approve a detection mechanism.

**(b) Detection rule — blocked.** The mechanism that determines **that** a cycle was interrupted (for example a power loss or restart during an active cycle, and the persistence of that fact across a reboot) is **not decided**. It depends on the active-cycle marker policy and the completion ordering, which are **D-D2 — OPEN — NOT APPROVED**. Until D-D2 is decided, no detection mechanism may be implemented, and the representation rule cannot be exercised.

### 9.6 Reboot recovery — D-D2 OPEN

Recovery behaviour after a restart (re-runnable, idempotent, with a `record_id` derived deterministically from `cycle_id`) is a **PROPOSED — NOT APPROVED** design. Because it depends on the marker policy, **tests T5 and T6 and all marker-dependent acceptance criteria remain SUSPENDED** until D-D2 is decided. The interrupted-cycle acceptance criterion **AC-13** (section 17.3) is **BLOCKED — D-D2**.

### 9.7 Cycle summary contents (established)

Each cycle summary contains: station number; cycle start/end timestamps (or `NULL` with validity flags); duration and valid-sample counts (per section 6); average, minimum and maximum **pressure** for each nozzle; average, minimum and maximum **temperature** for each nozzle; completion status.

**Per-second measurements are not stored as historical records** (section 13, PER-03).

---

## 10. Alarm Behaviour and Open Policies

### 10.1 Event-based alarm logging (established requirement)

Alarms and significant transitions are recorded as **events**, not as a continuous per-second stream. Each alarm event carries a unique record identifier, the originating station / nozzle / channel, the severity, the cause, and the time (with validity metadata per section 11).

### 10.2 Shared physical alarm output and reset (interface established; behaviour resolved by DR-25.2)

The system has **one shared physical alarm output** and **one shared reset input** for the whole machine. The interface exists. Three concepts must be kept distinct and must **not** be conflated:

1. **Clearance of the hazard condition** — the physical condition that caused the alarm has gone.
2. **Operator acknowledgement** — a person has seen and accepted the alarm.
3. **Silencing / de-energising the physical alarm output** — the physical output is turned off (or muted) for some period, which is **not** the same as acknowledging or clearing it.

**D-C2 is APPROVED (DR-25.2):** the physical alarm output stays energised until the shared reset input is used; software states follow the measured values independently of the output.

### 10.3 Alarm and cycle policies (resolved 0.6.0 — see §19 DR-25.1…DR-25.5)

| ID | Policy | Status | Alternatives (none chosen) |
|---|---|---|---|
| D-C1 | Alarm-to-Warning transition | **APPROVED (DR-25.1, 0.6.0)** — Alarm-to-Warning transitions return the software state and are logged as events | auto-downgrade after N s; never downgrade; downgrade only when all contributing channels recover |
| D-C2 | Latching and reset | **APPROVED (DR-25.2, 0.6.0)** — the physical alarm output stays energised until the shared reset input is used | auto-clear; latch until operator reset; latch cleared from the PC only; latch with a separate silence action |
| D-C3 | Effect of alarms on the cycle (including stall / activation-stuck behaviour) | **APPROVED (DR-25.3, 0.6.0)** — alarms are recorded only and never stop or abort a cycle | record only; abort at ALARM; WARNING records only and ALARM aborts |
| D-C4 | Warning-to-Alarm escalation timing, hysteresis and debounce | **APPROVED — DEFAULTS ONLY (DR-25.4, 0.6.0)** — hysteresis and debounce configurable on the ESP32 settings page; default is no delay and no hysteresis (immediate evaluation) | — |
| D-C5 | Faulty / invalid sensor behaviour | **APPROVED (DR-25.5, 0.6.0)** — out-of-range / invalid data is a data-validity condition plus a system event; the cycle completes; invalid samples are excluded from statistics; no physical alarm and no escalation | exclude from statistics; raise an alarm and still complete; refuse to complete the cycle; escalate to machine-level fault |

**The alternatives column records options that were considered and rejected; it is retained as history and is not a statement of current policy.**

**D-C4 is approved as defaults only.** Adopting the defaults is *one* possible answer, **not** an automatic resolution of the undecided **DR-07-C3** (`fault_transition_count`), which remains **OPEN — DECISION REQUIRED**.

---

## 11. Time Synchronisation and Timestamp Integrity

### 11.1 Time semantics (established)

| Element | Definition |
|---|---|
| **Event time** | The UTC instant at which the device detected the event. |
| **Event time validity** | Whether the device's clock was valid at the moment of the event. |
| **Time source** | Whether the time came from synchronisation with the PC or from an alternative source. |
| **Device uptime** | Monotonic milliseconds since the current boot; meaningful **only within the same `boot_id`**. |
| **PC receive time** | The UTC instant at which the PC received the record. **Kept separate from event time and never substituted for it.** |

### 11.2 Established invariants

* Timestamps are stored consistently in **UTC**. Local time is a presentation concern only and is never stored.
* `*_ms` fields are integer milliseconds from a documented origin; `boot_id` scopes uptime comparisons.
* The system must **never fabricate a timestamp**. If device time is invalid, the event time is `NULL` and its validity flag is false.
* **PC receive time must never replace event time.**
* Event time, event-time validity, time source, device uptime, and PC receive time are **independent** fields.

### 11.3 Invalid device time (established requirement)

Records must be **accepted** even when device time is invalid. Such records carry:

* `event_time = NULL`, `event_time_valid = 0`;
* a recorded `time_source`;
* a `pc_received_ms` timestamp.

Aggregation and filtering must handle invalid-time records explicitly and visibly rather than excluding them silently.

### 11.4 Clock synchronisation and clock steps (established behaviour)

* When the device synchronises with the PC clock, the offset (`clock_offset_ms`) is **diagnostic only** and is **never applied retroactively** to already-recorded times.
* A detected clock jump raises a `clock_step_detected` system event carrying pre-step values plus monotonic uptime.
* Stored event times are **not rewritten** on a clock step.
* A backward step must **never** produce a negative duration (section 9.4).

### 11.5 Time authority — D-D7 APPROVED (DR-17)

**APPROVED (DR-17, 0.6.0):** the PC is the sole time reference. No hardware RTC. Stored timestamps are UTC.

### 11.6 Canonical timestamp and duration field naming (P0 / AUD-04 repair)

The document previously used several names for the same concepts. The canonical names below are taken from the **strongest, most explicit existing definitions** in this document; the other spellings are declared **deprecated aliases**.

| Concept | Canonical name | Evidence in this document | Deprecated alias(es) |
|---|---|---|---|
| Event timestamp | `event_time` | Section 11.3 (explicit definition of the pair) | `time` (used in section 14.5 and AC-02) |
| Event timestamp validity | `event_time_valid` | Section 11.3 | `time_valid` (used in section 14.5 and AC-02) |
| Cycle start timestamp | `cycle_start_ms` | **DR-02 APPROVED** — canonical start-side name, symmetric with `cycle_end_ms` | — |
| Cycle start validity | `start_time_valid` | **DR-02 APPROVED** — canonical start-side validity name, symmetric with `end_time_valid` | — |
| Cycle end timestamp | `cycle_end_ms` | Section 14.3, section 9.5, AC-03 | — |
| Cycle end validity | `end_time_valid` | Section 14.3, section 9.5, AC-03 | — |
| Duration | `duration_ms` | Section 9.4, section 14.3 | — |
| Duration basis / validity | `duration_basis` — permitted values **APPROVED (DR-03)**: `'null'`, `'calendar'`, `'uptime_same_boot'`; NULL pairing **APPROVED (DR-03b)** (section 9.4) | Section 9.4, section 14.3 | — |
| Boot scoping for uptime | `boot_id` | Section 9.4, section 11.1, section 11.2 | — |

**Binding rules (P0 / AUD-04):**
* The generic pair `time` / `time_valid` is **deprecated**; wherever it appears it denotes `event_time` / `event_time_valid`.
* AC-02, AC-03 and the affected schema descriptions are restated using the canonical names above.
* The **cycle-start canonical names are `cycle_start_ms` and `start_time_valid`** (DR-02 APPROVED), symmetric with `cycle_end_ms` / `end_time_valid`.
* **No cycle-start validity invariant has been introduced by DR-02.** In particular, no rule equivalent to `cycle_end_ms IS NULL ⇔ end_time_valid = 0` is defined for the start side. That question remains **OPEN — DOCUMENTATION DECISION REQUIRED** and is explicitly **not** resolved here.
* DR-02 does **not** alter `event_time`, `event_time_valid`, `cycle_end_ms`, `end_time_valid`, `boot_id`, timestamp authority (**D-D7 remains OPEN**), clock correction or clock-step behaviour.

---

## 12. Data Flow, Protocol and Reliability

### 12.1 Message types (versioned JSON; established shape, not an approved schema)

| Message | Direction | Requires durability / ACK? |
|---|---|---|
| `live_state` | ESP32 → PC | **No** — not stored, not acknowledged (1 Hz) |
| `cycle_summary` | ESP32 → PC | Yes |
| `alarm_event` | ESP32 → PC | Yes |
| `system_event` | ESP32 → PC | Yes |
| `settings_change` | either → other | Yes (history) |
| `ack` | PC → ESP32 | Acknowledges a record id |
| `nack` | PC → ESP32 | Rejects a record id, with reason |
| `reset_command` | PC → ESP32 | **No** — non-durable, no `ack`; `reset_command` targets `"alarm"`, `"warning"` or `"all"` |
| `reset_result` | ESP32 → PC | **No** — non-durable; carries `accepted` and the post-reset state |

Messages carry a protocol version, a message type and (for durable records) a unique `record_id`.

**Approval status (P1 / AUD-13).** The message contract is **APPROVED (final, 2026-10-05)** as `docs/PROTOCOL_CONTRACT.md` **v1.1.0** (revised from v1.0.0 in Decision Round D, **DR-34**). The two reset messages and the `live_state` `alarm_state` / `warning_state` fields are defined in the contract, not in this table; this specification lists them here for traceability only. It remains revisable by an explicit decision round. It was exercised from both sides in Phase 2A (commit `b30e74f`): the PC server implements it, the firmware skeleton defers its contract-driven parts by name, and 21 tests exercise it.

### 12.2 Acknowledgement and deduplication (established requirement)

* The PC **commits the record in a SQLite transaction, then sends the ACK**. It never acknowledges before commit.
* The ESP32 **deletes a record only after a valid matching ACK**.
* Retransmission must be prevented from creating duplicate rows by **unique identity plus deduplication** — a replay of a record id must **not** create a second row.
* `live_state` messages require **no** historical record and **no** individual acknowledgement.

### 12.3 Durability strategy — D-D1 DECIDED (hybrid + durable journal)

* **RAM** for live sampling, cycle computation and temporary buffering. **RAM alone is not a durability guarantee.**
* **Durable flash journal** for alarm events, cycle summaries, interrupted cycles and essential system events.
* **No per-second historical ADC records.**
* Unique identifiers, torn-write detection, post-reboot recovery, durable-write-before-transmit, and idempotent PC processing.
* A **failed durable write must not be represented as successfully accepted**; errors, remaining capacity and recovery status must be visible.
* The ESP32 considers a record eligible for acknowledged transmission **only after durable write**.

### 12.4 Loss visibility — D-D9 APPROVED (Option C)

* Attempt durable journal recording when possible.
* **Additionally** expose RAM-only loss counters through `live_state` when durable recording fails.
* Volatile loss information must be **clearly labelled as temporary and not recorded in historical storage**.
* **`live_state` is not** a durable, acknowledged, queryable history record.
* Power loss before transmission **may permanently erase** volatile loss information.

**No guaranteed loss recovery is claimed.**

**PCC-19 — PROPOSED consequential change — NOT APPLIED (added 0.6.0).** DR-25.8 introduces an **overwrite-oldest** exhaustion policy, which implies **overwrite counters**. If those counters ever become **durable**, the wording above — that volatile loss information is the only visibility and *may be permanently erased* by power loss — would need consequential revision, because overwrite counts would then constitute a durable loss trace. **This change is recorded, not applied.** **D-D9 (Option C) remains APPROVED and unchanged**, and no overwrite counter is approved.

### 12.5 Reserved-area exhaustion — D-D10 DIRECTION APPROVED (DR-25.8) — SIZES AND THRESHOLDS OPEN

No exhaustion policy is selected. Candidate policies:

| Option | Behaviour | Assessment |
|---|---|---|
| P1 — Protect critical records | Never evict critical records; evict lower priority | Requires an approved priority classification |
| P2 — Defer / reject lower priority | Reject new lower-priority records when only critical remain | Requires a "rejected" concept in the record model |
| P3 — Explicit overflow state | Refuse new records; the machine keeps measuring but history production stops | Operational consequences must be approved |
| P4 — Best-effort degradation | Write what fits; drop the rest | **Rejected on principle** — creates silent loss with no counter, flag or indication |

**Silent dropping without a counter, flag, or visible indication is unacceptable.** The final policy depends on **D-D6, D-D8**, capacity analysis and operational consequences (**D-C5 is APPROVED, DR-25.5**). See also section 12.6 — the saturated state can structurally prevent stage **L2** of the loss-reporting chain.

**DR-25.8 (0.6.0) — exhaustion direction APPROVED: overwrite-oldest.** On reserved-area saturation the device **overwrites the oldest stored record**. This fixes the **direction** of the policy and is **traceable and supersedable on its own**.

**What DR-25.8 does NOT decide — OPEN:** record **priority classes**; which record kinds are ever eligible for overwrite; the **counters** and their exposure (see **PCC-19**); the **thresholds** (still **D-D6**); capacity and wear budget (**D-D8**); the **reserved-area size**; and **D-C5 (DR-25.5) treats out-of-range data as a system event, not an alarm, so exhaustion is orthogonal to it**. **No exhaustion behaviour is implemented.** Option **P4** remains **rejected on principle**; the approved direction is a *tracked, counted* overwrite, not silent best-effort dropping.

### 12.6 Loss-reporting chain L1–L5 (PROPOSED — NOT APPROVED)

A lost record becomes visible in PC history only if **all** stages succeed:

| Stage | Requirement | Failure consequence |
|---|---|---|
| L1 | Detect the loss | Loss entirely invisible |
| L2 | Persist a durable loss record (journal) | Falls back to volatile counters only |
| L3 | Retain volatile count until transmission | Lost on power loss |
| L4 | Transmit to the PC | Remains pending; retried after reboot |
| L5 | PC records durably | Transmitted but not in history; retransmission can still fix it |

**Honest limitation:** if L2 fails and power is lost before transmission, the loss may become **permanently unreportable**. A total failure of L2 is **silent by nature**. No absolute durability guarantee is claimed.

#### D-D10 interaction with the L1–L5 chain — `OPEN` (P1 / AUD-12)

Stage **L2** requires that a durable loss record *can be written* to the journal. If the journal **and** its reserved area are saturated, **L2 cannot be performed at all** — not because of a defect, but because the storage L2 needs is unavailable. The behaviour in that condition is governed by **D-D10 — OPEN — NOT APPROVED**, together with the sizing decisions **D-D6** and **D-D8**.

Consequences recorded as fact — none is decided here:

* Progression **beyond L2 cannot be considered fully specified** until D-D10 is fully decided, because the availability of L2 under saturation is undetermined.
* **PER-02** (record priorities for eviction) and **PER-04** (which records may be discarded, and how loss is counted and warned) are both explicitly dependent on D-D10.
* **AC-19** (no silent discard) is **BLOCKED** by this interaction.
* Test **T4**'s loss-reporting expectation is conditioned not only on L1–L5 but additionally on **D-D6**, **D-D8** and **D-D10**, because L2 may be structurally impossible in the saturated state.
* The **D-D9** requirement to expose volatile loss counters through `live_state` is **not** weakened by this interaction — it is the fallback that remains available precisely when L2 is impossible.

**No policy is chosen here.** Silent drop, overwrite, blocking, terminal overflow and every other candidate remain unselected in section 12.5. No zero-loss guarantee is claimed.

---

## 13. Persistent Journal, Buffering and Recovery

### 13.1 Journal requirements (established, from D-D1)

| ID | Requirement |
|---|---|
| JRN-01 | The journal must support unique identity per record. |
| JRN-02 | The journal must detect incomplete / torn writes. |
| JRN-03 | The journal must support recovery after restart. |
| JRN-04 | The journal must support safe deletion of acknowledged records (only after a valid matching ACK). |
| JRN-05 | A record is eligible for acknowledged transmission only after a durable write. |
| JRN-06 | Storage failures, capacity pressure and recovery status must be observable. |

**Acceptance mapping (P1 / AUD-11).** These requirements are traced by explicit acceptance identifiers: JRN-01 → **AC-14**; JRN-02 → **AC-15**; JRN-03 → **AC-16**; JRN-04 and JRN-05 → **AC-17**; JRN-06 → **AC-18**. The criteria are listed in section 17.2 (unconditional) or section 17.3 (conditional / blocked). This mapping introduces **no new journal behaviour** — it records traceability for requirements that are already stated.

### 13.2 Buffering and overflow policy (OPEN — NOT APPROVED)

| ID | Requirement | Status |
|---|---|---|
| PER-01 | A bounded buffer (RAM + journal) precedes transmission. | Established |
| PER-02 | Record priorities for eviction. | OPEN — depends on D-D6, D-D10 (D-C5 is APPROVED, DR-25.5) |
| PER-03 | Per-second / per-interval ADC measurements are **not** stored as historical records. | Established |
| PER-04 | Which records may be discarded, and how loss is counted and warned. | OPEN — depends on D-D6, D-D10 |
| PER-05 | No silent discard. | Established requirement; acceptance **AC-19** is **BLOCKED — DECISION REQUIRED** by D-D10 (section 12.6) |

**Distinction that must be preserved (established):** *recording the fact that loss occurred* is different from *recovering the lost records themselves*. A loss indicator never recovers data.

### 13.3 Parameters not finalised (OPEN)

| Parameter | Status | Depends on |
|---|---|---|
| Journal capacity / partition size | OPEN — NOT APPROVED | HW-13 (partition layout), D-D8 (endurance / volume analysis), D-D3 (buffer capacity target), and board identity via **D-A8** (confirmed) **or** **D-A1** (preliminary) — see dependency note below |
| Reserved-area size R | OPEN — NOT APPROVED | D-D6 |
| Near-full / journal-full thresholds | OPEN — NOT APPROVED | D-D6 |
| Flash file system choice | OPEN — NOT APPROVED | D-D8 |
| Write frequency and wear budget | OPEN — NOT APPROVED | D-D8 |

**PCC-20 — PROPOSED consequential change — NOT APPLIED (added 0.6.0).** The **direction** of **D-D3** is now approved (buffer/journal capacity target direction, via **DR-25.8** overwrite-oldest). **Every actual size remains OPEN.** No partition size, reserved-area size, threshold, endurance figure or wear budget is approved or implied by this entry. The table above is unchanged; this entry records only that the decision-space has narrowed, not that any capacity has been fixed.

**Journal-capacity dependency (P1 / AUD-15).** Four distinct concerns were previously conflated. They are separated here; **none is resolved**:

| Concern | Owner | State |
|---|---|---|
| **Preliminary board selection** | **D-A1** | DECIDED — preliminary selection only; confirms **no** hardware fact |
| **Confirmed board identity** (actual flash size, actual resources) | **D-A8** (mapped to HW-01) | **APPROVED (DR-13, 0.6.0)** — board confirmed; flash / chip / ADC still to verify in Phase 2B |
| **Journal endurance / volume analysis** (write rate, wear budget, file system) | **D-D8** | **OPEN — NOT APPROVED** |
| **Journal capacity calculation** (partition sizing, buffer target) | **HW-13** (partition layout) and **D-D3** (buffer capacity target) | **OPEN — NOT APPROVED** |

**Dependency conflict — `OPEN — TRACEABILITY DECISION REQUIRED`.** Section 13.3 previously named **D-A1**, while section 20 named **D-A8**, for the same journal-capacity dependency. The specification does not state which is authoritative, and **this document does not choose between them**; both are recorded until a traceability decision is made. Neither `D-A1` nor `D-A8` status was altered.

**No sizing was performed. No flash capacity, partition size, endurance figure or wear budget has been estimated or invented anywhere in this document.**

### 13.4 Power-loss scenarios (established test definitions; expectations conditional)

| Test | Scenario | Status |
|---|---|---|
| T1 | Power loss before the PC commits | Testable (subject to D-D8) |
| T2 | Power loss after commit, before ACK | Testable (subject to D-D8) |
| T3 | Power loss after ACK, before device-side deletion | Testable (subject to D-D8) |
| T4 | Power loss during the journal write | Testable; loss **reporting** is conditional on L1–L5 (section 12.6) **and** on D-D6, D-D8, D-D10, because stage L2 may be structurally unavailable when the reserved area is saturated (section 12.6) |
| T5 | Power loss during post-boot recovery | **SUSPENDED — BLOCKED by D-D2** |
| T6 | Power loss between summary write and marker clear | **SUSPENDED — BLOCKED by D-D2** |

**Every durability test states its expectation for the selected strategy and names what is permitted to be lost. No test asserts absolute loss-freedom.**

---

## 14. Proposed Database Schema (PROPOSED — NOT APPROVED; NOT IMPLEMENTED)

**No database implementation exists. No SQL has been written. No migration has been created.** The following is a written proposal only. SQLite is the intended engine (ARC-13).

### 14.1 Key-class taxonomy

| Class | Tables | Key |
|---|---|---|
| K1 — event / retransmittable records | `cycles`, `alarm_events`, `system_events`, `settings_history` | `record_id` (unique; stable across retransmission) |
| K2 — reference | `stations`, `devices` | natural key (`station_no`, `device_id`) |
| K3 — settings | `settings` | `key` |
| K4 — sync state | `sync_state` | `device_id` (no `record_id`) |
| K5 — calibration | `calibration` | `channel` |
| K0 — bookkeeping | `schema_version` | `version` |

**Correction of an earlier claim:** `record_id` is the primary key only of the **K1 event / retransmittable tables**. It is **not** the key of reference, settings, sync-state or calibration tables, whose keys are defined separately above.

### 14.2 Proposed tables (shape only)

| Table | Purpose |
|---|---|
| `schema_version` | Schema versioning / migrations |
| `devices` | Device identity, firmware version, boot records |
| `stations` | Station reference data (16 rows) |
| `cycles` | Completed cycle summaries (one row per station cycle) |
| `nozzle_stats` | Per-nozzle per-cycle statistics (one row per cycle × nozzle) |
| `alarm_events` | Alarm / warning / information events (`record_id` unique) |
| `system_events` | System events, including overflow and clock steps (`record_id` unique) |
| `settings_history` | Settings-change history (`record_id` unique) |
| `sync_state` | Time-sync and journal-health metadata (keyed by `device_id`) |

### 14.3 `cycles` — time-integrity and duration constraints (established rules)

* `cycle_end_ms IS NULL ⇔ end_time_valid = 0` (bidirectional).
* `duration_ms IS NULL ⇔ duration_basis = 'null'` (bidirectional) — **APPROVED (DR-03b)**. A duration is absent exactly when its basis is `'null'`, and the basis is `'null'` exactly when the duration is absent.
* `duration_ms` is non-negative where present.
* `duration_ms` is present **only** when the start and end time points form a **comparable pair** — i.e. either both are valid calendar timestamps, or both are uptimes within the **same `boot_id`** (section 9.4). "Valid" here is **not** calendar validity alone: calendar validity and duration validity are independent (section 9.4). The permitted `duration_basis` values are **APPROVED (DR-03)** and are listed in section 9.4.
* A cycle spanning a reboot has `duration_basis = 'null'` and `duration_ms = NULL`.
* Interrupted cycles have `status = 'interrupted'`, `cycle_end_ms = NULL`, `end_time_valid = 0`, `duration_ms = NULL`.
* No fabricated timestamps.

**Proposed added columns:** `faulted_channel_count` (default 0) and `fault_transition_count` (**`NULL` until DR-07-C3 is decided**) — the fault **vocabulary** is APPROVED (DR-06, section 7.1a) and `faulted_channel_count` is APPROVED (DR-07-C2); `fault_transition_count` remains OPEN because its former blocker **D-C4 is APPROVED (DR-25.4, defaults only)** but **DR-07-C3 itself remains OPEN — DECISION REQUIRED**; and the two optional `valid_samples_*_both_nozzles` (**`NULL` until HW-02/HW-03**).

### 14.4 `nozzle_stats` — proposed columns

`valid_samples_pressure`, `valid_samples_temperature`, `temp_conversion_configured`, plus pressure avg / min / max and temperature avg / min / max per nozzle.

**Validity rule:** invalid converted values are stored as **`NULL`** and are excluded from the aggregates.

**Raw-voltage note (P0 / AUD-02):** the earlier wording "raw voltage is retained in the corresponding measurement / live record" is **withdrawn**, because no `measurement` table is proposed in section 14.2 and the durable retention scope is unsettled. The durable storage location of a per-sample raw voltage is **`RAW-VOLTAGE-RETENTION — OPEN — DECISION REQUIRED`** (section 4.2). The live (non-durable) representation always carries the raw voltage.

### 14.5 Timestamp validity rule (established)

For every event-bearing table, `event_time IS NULL ⇔ event_time_valid = 0` must hold (canonical names per section 11.6; `time` / `time_valid` are deprecated aliases). Invalid-time records are still counted in history totals; reports filter them explicitly and visibly.

### 14.6 Migration strategy (PROPOSED — NOT APPROVED)

Versioned, forward-only migrations recorded in `schema_version`, with a pre-migration backup. No migration has been created and the strategy is not approved.

### 14.7 Interrupted cycles

Interrupted cycles are represented explicitly with `status = 'interrupted'` and `NULL` end time / duration. They are **never** recorded as completed cycles. This is the **representation** rule only (section 9.5a); **detection** of an interruption depends on **D-D2, which is OPEN** (section 9.6).

---

## 15. Windows Application, GUI, Settings, Localisation and Access Control

### 15.1 Application architecture (PROPOSED — NOT APPROVED)

The Windows application is intended as a local **FastAPI** HTTP / WebSocket server on TCP port **8000** with a browser-based operator GUI served from local assets. **FastAPI is not installed.** Installation is not authorised (D-B4).

### 15.2 Intended module responsibilities (PROPOSED — NOT APPROVED)

* API / WebSocket ingestion and validation.
* Domain logic (station, cycle, alarm, reporting services).
* SQLite repositories and migrations.
* Backups, retention and verification.
* Health monitoring / watchdog.
* Operator GUI (offline, no CDN).
* Localisation and report / export generation.

### 15.3 Settings (established requirements; values open)

* Settings are persisted on the ESP32 in NVS and survive reboot.
* Settings changes are recorded in settings history.
* Validation requirements: rejection of empty, non-numeric, `NaN`, `Infinity`, and a range whose two points are equal; invalid settings must not cause a divide-by-zero or invalid output.
* The GUI shows **raw voltage and converted value separately**, plus settings-validity and out-of-range status.

### 15.4 Localisation and RTL / LTR (APPROVED — DR-19)

**APPROVED (DR-19, 0.6.0):** GUI languages are Persian and English with correct RTL/LTR; selectable Persian (Jalali) and Gregorian calendars as presentation only. Jalali date presentation and RTL layout are **presentation concerns only**; stored timestamps remain UTC (section 11).

### 15.5 Access control (requirement established; mechanism open)

* A **protected** settings page is required (ARC-02); operator settings changes must be authenticated.
* A **username + password** mechanism with a **mandatory change of the default password** on first login is **APPROVED (DR-22)**. The earlier **PIN-based** proposal is **superseded**. **Credential storage mechanism remains OPEN.**
* Secrets must never appear in logs (ARC-11).

---

## 16. Backups, Reports, Exports and PDF

### 16.1 SQLite backup (PROPOSED — NOT APPROVED)

With SQLite in WAL mode, a **plain copy of the main database file is not guaranteed to be a complete or consistent backup** — committed transactions may still be in the write-ahead log.

**Proposed method:** a WAL-aware snapshot (for example the SQLite online backup API, or `VACUUM INTO`, or a file-set copy under an exclusive lock) to a temporary file, then **integrity verification**, then an **atomic rename** into the backup location. A failed backup must raise a **warning**, never pass silently.

**APPROVED (DR-18, 0.6.0):** daily SQLite backup to a different drive; configurable destination path; latest 30 backups retained; a clear warning when the destination is unavailable; a WAL-safe method. The specific WAL-aware technique in the paragraph above remains a proposal. Run-time default (hour of day) remains OPEN.

### 16.2 Restore (PROPOSED — NOT APPROVED)

Stop the application, preserve the damaged original, place the verified backup, ensure no stale `-wal` / `-shm` sidecars remain, restart, and re-run integrity checks plus a functional smoke test.

**Acceptance:** a restore from a backup taken at time T must pass the integrity check, match the expected `schema_version`, and contain every record the device had been ACKed for **before** T, with **zero duplicates**. This drill is a repeatable test and is an acceptance item for later phases.

### 16.3 Reports and exports (need established; format open)

* Reports reconcile against the database.
* **Scope (DR-01 APPROVED):** *"reports and exports"* include **historical / database-derived** reports and exports, not only live views. Any obligation to show a value in a report or export therefore requires that value to exist durably.
* Exports include at least CSV; Excel and PDF are intended.
* Invalid or uncalibrated values are **labelled** as such in every report and export (not silently shown as valid).
* Temperature remains uncalibrated and pressure is source-unapproved (section 4) — this must be visible in reports.
* PDF / report layout, columns and templates are **PROPOSED — NOT APPROVED**.

**PCC-21 — PROPOSED consequential change — NOT APPLIED (added 0.6.0).** Intended behaviour: **reports are produced on demand only** (never scheduled or automatic), and the **output format is user-selected per report** from **PDF / Excel / CSV**. **No format is approved**, no layout or column set is approved, and the existing bullets above (at least CSV; Excel and PDF *intended*) are **not** thereby changed. Recording this is not approving it.

### 16.4 Health monitoring (need established)

The PC must monitor device connectivity, journal health and its own database integrity, and surface failures visibly.

---

## 17. Testing Strategy and Acceptance Criteria

### 17.1 Test strategy by area

| Area | Representative tests | Blocked by |
|---|---|---|
| Protocol / schema | Message validation; unknown protocol major ⇒ logged `nack`, no state change | D-B4 (for PC harness) |
| Idempotency | Replay a batch 100× ⇒ exactly one row per `record_id` | — |
| Commit-before-ACK | Terminate the PC between commit and ACK ⇒ zero loss, zero duplicates | — |
| Time integrity | Per-table audit `event_time IS NULL ⇔ event_time_valid = 0` (canonical names, section 11.6) | — |
| Duration rule | Same-boot uptime ⇒ duration; cross-boot ⇒ `NULL`; backward step ⇒ no negative duration, using the **APPROVED (CS-01 Policy B)** fallback basis | value set **APPROVED (DR-03)**; invariant **APPROVED (DR-03b)**; **D-D7 APPROVED (DR-17)** — PC is the sole time reference; see AC-04 |
| Conversion | Parameter change alters output without code change; defaults match `voltage − 0.5` | — |
| Out-of-range | Raw preserved in the live representation (section 4.2); converted `NULL`; `out_of_range` set; **no silent clamp**; excluded from stats. | **DR-04A APPROVED** — durable raw voltage required for applicable out-of-range readings (section 4.2); granularity **APPROVED (DR-25.9)**; **D-C5 APPROVED (DR-25.5)** — see AC-08 (now unconditional) |
| Unconfigured temperature | `temp_c = NULL`, `temp_conversion_configured = false`, raw retained; `NULL` excluded from `AVG` | — |
| Fault counters | Aggregation principle only: one counter value per cycle, never one record per sample (section 7.3). Fault = **`out_of_range` only** (**DR-06**). `invalid_channel_count_now` = instantaneous / live-only / non-durable (**DR-07-C1**). `faulted_channel_count` = cumulative distinct-channel, cycle-summary, reset at cycle start (**DR-07-C2**) | **`fault_transition_count` OPEN — DECISION REQUIRED (DR-07-C3, no longer blocked by D-C4)**; stabilisation **RESOLVED (DR-25.6)**; interrupted-cycle / reboot persistence **OPEN (D-D2)** |
| Transition counting | — | **D-C4 APPROVED (defaults only, DR-25.4)**; DR-07-C3 still **OPEN — DECISION REQUIRED** (no longer blocked) |
| Alarm policy | Severity, latching, escalation, abort, sensor-fault behaviour | **D-C1…D-C5 APPROVED (DR-25.1–DR-25.5)** |
| Station simultaneity | Direct same-pass counts | **HW-02, HW-03** |
| Power loss T1–T4 | Per section 13.4 | D-D8 (sizing) |
| Power loss T5–T6 | — | **D-D2** |
| Backup / restore | Integrity check + zero-duplicate restore | — |

### 17.2 Unconditional / currently defined acceptance criteria (P0 / AUD-06)

These criteria are sufficiently specified and are independent of unresolved decisions.

| ID | Criterion |
|---|---|
| AC-01 | No duplicate row for any `record_id` under any replay. |
| AC-02 | `event_time IS NULL ⇔ event_time_valid = 0` for 100% of rows in every event-bearing table (canonical names, section 11.6). |
| AC-03 | `cycle_end_ms IS NULL ⇔ end_time_valid = 0` (both directions). |
| AC-05 | `pc_received_ms` never appears in an event-time column. |
| AC-06 | Invalid converted values never contribute to statistics; stored as `NULL`, never `0`. |
| AC-09 | Unconfigured temperature ⇒ counters `NULL`, not `0`. |
| AC-10 | A failed durable write is never reported as accepted. |
| AC-11 | No test asserts absolute loss-freedom. |
| AC-12 | Restore drill passes with zero duplicates. |
| AC-04 | `duration_basis` is populated from the approved permitted value set wherever a duration is present; duration is derived from a comparable pair of time points (section 9.4). **Value set APPROVED (DR-03); `duration_ms IS NULL ⇔ duration_basis = 'null'` established (DR-03b).** |
| AC-14 | Every durable journal record carries a unique identity that is stable across retransmission. |
| AC-15 | A torn or incomplete journal write is detected and is never presented as a valid record. |
| AC-16 | An ESP32 restart neither loses nor duplicates a durably written, unacknowledged record. |
| AC-17 | A record is deleted on the device only after a valid matching ACK, and only after it was durably written. |
| AC-18 | Storage failures, capacity pressure and recovery status are observable, not silent. |
| AC-20 | Any volatile loss information surfaced anywhere is labelled as temporary and not part of historical storage. |
| AC-08 | Out-of-range readings raise **zero** alarm events → D-C5 is APPROVED (DR-25.5): out-of-range data is a data-validity condition plus a system event — not an alarm, no escalation. |

**Requirement mapping for the criteria added in P1 (AUD-11):** AC-14 → JRN-01; AC-15 → JRN-02; AC-16 → JRN-03; AC-17 → JRN-04 and JRN-05; AC-18 → JRN-06; AC-19 (section 17.3) → PER-05; AC-20 → D-D9 Option C (section 12.4). These are **traceability representations of requirements that are already stated**; **no new behaviour is introduced**.

> **Note:** AC-07, AC-13 and AC-19 are **not** unconditional; they are listed in section 17.3 with their dependencies. **AC-04 and AC-08 have moved here** — AC-04's former blocker was resolved by DR-03 and DR-03b; **AC-08's was resolved by DR-25.5 (0.6.0), which approved D-C5.**

### 17.3 Conditional / blocked acceptance criteria (P0 / AUD-03, AUD-05, AUD-06)

These criteria depend on OPEN decisions or on unresolved specification questions. They are **not** currently executable and must not be reported as passing or failing.

| ID | Criterion | Dependency | Status |
|---|---|---|---|
| AC-07 | Raw voltage available for every sample (**live representation**, section 4.2 paragraph 1), **including** the durable retention scope. | **DR-04A APPROVED** — durable raw voltage required for applicable out-of-range readings (section 4.2). Occurrence granularity **OPEN (DR-04A2, D-C4)**. | **BLOCKED — OCCURRENCE GRANULARITY UNRESOLVED (DR-04A2)** |
| AC-13 | An interrupted cycle is stored with `status = 'interrupted'`, `cycle_end_ms = NULL`, `end_time_valid = 0`, `duration_ms = NULL` and `duration_basis = 'null'`, and is never recorded as a completed cycle. | **D-D2** (OPEN — NOT APPROVED) — interruption **detection** is undecided (section 9.5b) | **BLOCKED — D-D2** |
| AC-19 | No record is discarded silently: every discard is counted and surfaced. | PER-05 (section 13.2); exhaustion behaviour governed by **D-D10**, sized by **D-D6** and **D-D8** (section 12.6) | **BLOCKED — DECISION REQUIRED** |

**Notes.**
* **AC-04 has moved to section 17.2 (unconditional).** Its former blocker — the undefined `duration_basis` value set — was resolved by **DR-03**, and the NULL-pairing rule was established by **DR-03b**. The established rules of section 9.4 (no fabricated duration; a cross-boot cycle has `duration_ms = NULL`) continue to apply unchanged. **Basis selection after a clock step remains OPEN** and is not asserted here.
* **AC-08 is now unconditional.** D-C5 was approved in 0.6.0 (**DR-25.5**): out-of-range / invalid data is a data-validity condition plus a system event; the cycle completes and invalid samples are excluded from statistics; no physical alarm and no escalation. AC-08 therefore states a fact, not a policy choice. It was promoted from this section to **section 17.2** in 0.7.2.
* **AC-13** covers representation only. It remains blocked while interruption **detection** is undecided.

### 17.4 Claims that are NOT made

No test has been executed. No build has been performed. No performance figure has been measured. No hardware has been validated. No datasheet has been verified.

---

## 18. Ambiguities and Missing Source Detail

| ID | Ambiguity / missing detail | Impact | Depends on |
|---|---|---|---|
| AMB-01 | TMAP34 datasheet not obtained; sensor identity rests on user statement | Blocks wiring, supply range, pin assignment and temperature points | HW-11, HW-12 |
| AMB-02 | Temperature conversion points unspecified | Temperature counters remain `NULL`; no temperature values produced | D-A5 remainder |
| AMB-03 | Sampling model (simultaneous vs sequential) undetermined | Station simultaneous counters undefined | HW-02, HW-03, HW-14 |
| AMB-04 | ADC / multiplexer architecture undetermined | The 64-channel acquisition path is undefined | HW-02, HW-03 |
| AMB-05 | Internal ADC channel count (4, per retailer page) versus the 64-channel need | Feasibility of internal-ADC-only acquisition is in doubt | HW-02 |
| AMB-06 | Board specifications unconfirmed | Pin map and electrical design blocked | HW-01 |
| AMB-07 | Journal capacity, reserved area, filesystem, wear budget unspecified | Buffering and overflow policy cannot be fixed | D-D6, D-D8, HW-13 |
| AMB-08 | Alarm and fault policy | **CLOSED by DR-25.1…DR-25.5 (0.6.0)** — alarm logic may be implemented | — |
| AMB-09 | Cycle marker policy unresolved | Recovery, T5 and T6 suspended | D-D2 |
| AMB-10 | DHCP allocation range not re-verified against the pinned Arduino-ESP32 version | Network plan provisional | D-B2 |
| AMB-11 | Time authority (PC-only vs RTC) undecided | Behaviour after long PC downtime undefined | D-D7 |
| AMB-12 | GUI language and RTL / LTR scope undecided | Localisation work undefined | D-D5 |
| AMB-13 | Backup destination, schedule and retention undecided | Backup automation undefined | D-D4 |
| AMB-14 | Reserved-area exhaustion policy (sizes/thresholds) | Direction APPROVED (DR-25.8); sizes/thresholds undefined | D-D6, D-D8 (D-C5 is APPROVED) |
| AMB-15 | Settings-PIN mechanism not specified | Protected settings page implementation undefined | **CLOSED by DR-22** — username + password, mandatory default-password change; credential storage remains OPEN |

### 18.1 PROPOSED Consequential Changes (PCC) — recorded, NOT applied

Each entry records a consequential change that this revision deliberately **does not** make. The source sections are left untouched. **Recording is not applying.**

| ID | Section | Proposed consequential change | Status |
|---|---|---|---|
| PCC-01 | §3.1 | The blanket "UNVERIFIED" framing no longer fits: the board is confirmed (DR-13), but flash/chip/ADC still await Phase 2B read-only verification. | **PROPOSED — NOT APPLIED** |
| PCC-02 | §5.3 | **REFINEMENT (not contradiction):** §3.1 and §5.3 record "4-channel ADC" as a retailer-page claim already marked UNVERIFIED. The confirmed board's pinout image shows 6 exposed ADC1 GPIOs and 9 ADC2 GPIOs. The retailer claim is not an approved fact. §5.3's "4-channel" wording should be amended to reflect the OBSERVATION while keeping the acquisition architecture OPEN. | **PROPOSED — NOT APPLIED** |
| PCC-03 | §4.3 | Pressure nominal points 0.5–4.5 V / 0–4 bar are no longer defaults; pressure starts unconfigured; keep only as sensor-level reference. | **PROPOSED — NOT APPLIED** |
| PCC-04 | §4.4 | Temperature "independent parameters" superseded by per-channel calibration (DR-27). | **PROPOSED — NOT APPLIED** |
| PCC-05 | §4.5 | Its "Non-escalation" paragraph says D-C5 remains OPEN; D-C5 is now resolved (DR-25.5). | **APPLIED (0.7.0)** |
| PCC-06 | §6.2 / §6.3 | `temp_conversion_configured` grain: device-global → per-channel (DR-27). | **APPLIED (0.6.1)** |
| PCC-07 | §6.6 | Q1–Q3 superseded by DR-27; Q4–Q8 remain OPEN and are more important now. | **APPLIED (0.6.1)** |
| PCC-08 | §7.4 | D-C4 now has approved defaults (DR-25.4); DR-07-C3 nevertheless stays OPEN — DECISION REQUIRED (no longer blocked by D-C4). | **APPLIED (0.6.1)** |
| PCC-09 | §7.1a item 9 | DR-12 resolved (stabilisation samples not counted) — DR-25.6. | **APPLIED (0.6.1)** |
| PCC-10 | §8.1 | `unconfigured` currently says "(temperature only)" — now applies to pressure too (DR-27). | **APPLIED (0.7.0)** |
| PCC-11 | §8.2 / §8.3 / §8.5 | Station/cycle/machine states referenced D-C1…D-C5 as OPEN; now DR-25.1…DR-25.5. | **APPLIED (0.7.0)** |
| PCC-12 | §9.2 | Stabilisation rule needs the fault-counter exclusion (DR-25.6). | **APPLIED (0.7.0)** |
| PCC-13 | §9.3 / §9.5 / §9.6 | D-D2 gets a direction only (DR-25.7); AC-13, T5, T6 stay blocked. | **APPLIED (0.6.1)** |
| PCC-14 | §10.2 | Physical-output wording referenced unresolved policy; now DR-25.2. | **APPLIED (0.7.0)** |
| PCC-15 | §14.2 | New record types (raw-voltage record, `data_loss`, `interrupted_cycle`) need tables — schema is not mine to add. | **PROPOSED — NOT APPLIED** |
| PCC-16 | §18 AMB-01 / AMB-02 | Still open: datasheet, temperature points. | **PROPOSED — NOT APPLIED** |
| PCC-17 | §22 | Glossary "Raw voltage — always retained" is lifetime-ambiguous. | **APPLIED (0.7.0)** |
| PCC-18 | §19 / §23 | DR-08 Q1–Q3 must be shown as SUPERSEDED by DR-27, not left contradicting. | **APPLIED (0.7.0)** |
| PCC-19 | §12.4 | D-D9 volatile-loss wording vs. the new overwrite counters. | **PROPOSED — NOT APPLIED** |
| PCC-20 | §13.3 | Journal capacity: D-D3 direction approved; **all sizes still OPEN**. | **PROPOSED — NOT APPLIED** |
| PCC-21 | §16.3 | Reports on demand; user-selected PDF / Excel / CSV. | **PROPOSED — NOT APPLIED** |
| PCC-22 | §17.2 / §17.3 **AC-08** | "Out-of-range readings raise zero alarm events" becomes unconditional now that D-C5 is resolved (DR-25.5). **Applied in 0.7.2 — AC-08 promoted to unconditional and moved to §17.2.** | **APPLIED (0.7.2)** |
| PCC-23 | §17.3 **AC-07** | Durable raw-voltage granularity is now approved (DR-25.9). **AC-07 is STILL PARTIALLY BLOCKED**, because DR-25.9 leaves "count finalized / D-D2 persistence" OPEN. **Record only.** | **PROPOSED — NOT APPLIED** |
| PCC-24 | §4.3 | **Cross-reference to PCC-03** (pressure nominal points superseded by DR-27). No duplicate content. | **PROPOSED — NOT APPLIED** |
| PCC-25 | §14.2 | **Cross-reference to PCC-15** (new record types need tables). No duplicate content. | **PROPOSED — NOT APPLIED** |
| PCC-26 | §12.1 | JSON message encoding approved (DR-23); the protocol / message contract itself remains **NOT APPROVED** and is not edited in this revision. | **PROPOSED — NOT APPLIED** |
| PCC-27 | §2.2 **ARC-09** | "approximately 1 Hz" is fixed to exactly 1 sample per second per channel by DR-24. | **PROPOSED — NOT APPLIED** |
| PCC-28 | §3.3 | The "D-A8 remains `OPEN — DECISION REQUIRED`" text is stale: **DR-13 closed D-A8** (board confirmed ESP32-D0WDQ6, 30-pin, 4 MB, retailer-stated). HW-01 closed with it. | **APPLIED (0.7.0)** |
| PCC-29 | §4.2 | The "DR-04A2 — `OPEN — DECISION REQUIRED`, direction only" text is stale: **DR-25.9 approved the granularity** (one durable raw-voltage record per entry into `out_of_range`, plus a count). Count finalization and D-D2 persistence stay OPEN. | **APPLIED (0.7.0)** |
| PCC-30 | §10.3 | The D-C1 … D-C5 table in the §10.3 body still reads `OPEN — DECISION REQUIRED`; **DR-25.1 … DR-25.5 approved** them (D-C4 = defaults only). The §10.3 body wording is not updated by this revision. | **APPLIED (0.7.0)** |
| PCC-31 | §11.5 | The "D-D7 remains `OPEN — DECISION REQUIRED`" text is stale: **DR-17 approved D-D7** (PC is the sole time reference; no hardware RTC; PC time zone Tehran; no fabricated timestamps). | **APPLIED (0.7.0)** |
| PCC-32 | §13.3 | The journal-capacity dependency table still marks board identity as `OPEN — TRACEABILITY DECISION REQUIRED` via **D-A8 or D-A1**; **DR-13 resolved D-A8**. **D-D8, D-D3 and HW-13 remain OPEN** — capacity is still undetermined. | **APPLIED (0.7.0)** |
| PCC-33 | §14.3 | "fault_transition_count is `NULL` until D-C4 is resolved" is stale as a *blocker* statement: **D-C4 is approved (defaults only, DR-25.4)**. DR-07-C3 nevertheless remains `OPEN — DECISION REQUIRED` and the field stays `NULL`. | **APPLIED (0.7.0)** |
| PCC-34 | §15.4 | The "D-D5 remains `OPEN — DECISION REQUIRED`" text is stale: **DR-19 approved D-D5** (GUI languages Persian and English, correct RTL/LTR, selectable Jalali and Gregorian calendars as presentation only). | **APPLIED (0.7.0)** |
| PCC-35 | §16.1 | "Backup path **not finalised (D-D4)**" is stale: **DR-18 approved D-D4** (daily SQLite backup to a different drive, configurable destination path, latest 30 backups). Restore-side details remain as written. | **APPLIED (0.7.0)** |
| PCC-36 | §7.1a | Residual stale D-C5 references in §7.1a: the DR-06 scope-limits sentence, open-question item 7, and DR-12 stabilisation participation. **DR-25.1…DR-25.5 and DR-25.6 approved.** | **APPLIED (0.7.1)** |
| PCC-37 | §12.4 / §12.5 | Residual stale D-D10 references: the §12.5 heading and the L2 progression sentence said D-D10 "OPEN"; it is **direction approved (DR-25.8)**. §12.4 listed D-C5 as a dependency of the exhaustion policy; D-C5 is **APPROVED (DR-25.5)** and is orthogonal to exhaustion. | **APPLIED (0.7.1)** |
| PCC-38 | §17.1 / §18 AMB rows | Residual stale references: §17.1 PER-02 listed D-C5 as a dependency (now APPROVED); §18 AMB-08 "Alarm and fault policy unresolved" is **closed by DR-25.1…DR-25.5**; §18 AMB-14 now records direction APPROVED with sizes/thresholds still undefined. | **APPLIED (0.7.1)** |

**PCC application summary.** PCC-05, PCC-10, PCC-11, PCC-12, PCC-14, PCC-17, PCC-18 and PCC-28…PCC-35 became **APPLIED (0.7.0)**. Residual stale references in §7.1a, §12.4, §12.5, §17.1 and §18 were applied in **0.7.1** as a follow-up — **PCC-36, PCC-37 and PCC-38, recorded as APPLIED (0.7.1)**. **PCC-22 became APPLIED (0.7.2)** when AC-08 was promoted from §17.3 to §17.2 as an unconditional criterion — its original blocker (D-C5 being OPEN) was resolved by DR-25.5 in 0.6.0.

### 18.2 Open Questions Register

**Distinct from AMB-01 … AMB-15 above.** Those are ambiguities and missing source detail; these are **open questions requiring a decision**.

| # | Question | Identifier |
|---|---|---|
| Q1 | **`fault_transition_count` counting model** — per channel, per station, or both? Does it adopt the D-C4 defaults? | **DR-07-C3 — OPEN — DECISION REQUIRED** |
| Q2 | **When is the end-of-cycle marker cleared** after a normal completion? | **D-D2 — OPEN** |
| Q3 | Detailed completion ordering (marker / statistics / summary / recovery) | **D-D2 — OPEN** |
| Q4 | Occurrence granularity for durable out-of-range raw voltage | **DR-04A2 — APPROVED (granularity, DR-25.9); count-finalization / D-D2 persistence OPEN** |
| Q5 | Do stabilisation samples participate in fault counting? | **DR-12 — RESOLVED (DR-25.6: not counted)** |
| Q6 | Effective time, forward effect, active cycle, config versioning, historical config identity | **DR-08 Q4–Q8 — OPEN** (more important now that ownership is per-channel) |
| Q7 | Address plan + DHCP pool; re-verify against the pinned Arduino-ESP32 version | **D-B2 — OPEN** |
| Q8 | Reserved-area size, near-full thresholds, backoff | **D-D6 — OPEN** |
| Q9 | Journal capacity, endurance and volume analysis | **D-D8 / HW-13 — OPEN** |
| Q10 | Windows configuration and scoped firewall approval | **D-B3 — APPROVED (DR-15): user applies settings manually; assistant documents only** |
| Q11 | Time authority (PC clock vs hardware RTC) | **D-D7 — RESOLVED (DR-17: PC is sole time reference)** |
| Q12 | Backup destination, schedule, retention | **D-D4 — RESOLVED (DR-18); run-time default still OPEN** |
| Q13 | GUI language (English / English + Persian) | **D-D5 — RESOLVED (DR-19)** |
| Q14 | Board / module confirmation | **D-A8 — RESOLVED (DR-13)**; flash/chip/ADC still to verify in Phase 2B |
| Q15 | **Explicit approval of `docs/PROTOCOL_CONTRACT.md`** — required before Phase 2A | §12.1, §21 |
| Q16 | **Explicit statement that Phase 2A is authorized** | §21 |

**None of these questions is answered by this revision.**

---

## 19. Decision Register (consolidated)

| ID | Decision | Status |
|---|---|---|
| D-A1 | ESP32 board — 30-pin ESP32-D0WDQ6 (retailer-page evidence) | **DECIDED — preliminary selection only**; exact model, flash, pinout and electricals require confirmation |
| D-A2 | ADC acquisition architecture | **APPROVED (DR-31, 2026-10-05)** — 4× CD74HC4067 MUX + 1× ADS1115 (VDD 5 V, PGA ±6.144 V) + 3× PCF8574T (5 V bus, level shifter); 16 MUX states × 4 ADS1115 channels = 64 |
| D-A3 | Analog front end / protection | **APPROVED (DR-32, 2026-10-05)** — optocoupler + 5 V limit; PCB layout is the user's responsibility (DR-38) |
| D-A4 | Digital input expansion + alarm output driver | **APPROVED (DR-33, 2026-10-05)** — 1 alarm output + 1 reset input; PCF8574T pin map: 0–15 activation, 16–19 S0–S3, 20 alarm, 21 reset, 22–23 spare |
| D-A5 | TMAP34 sensor, conversion, wiring | **Method DECIDED** (linear, configurable); **remainder OPEN** (datasheet, pinout, wiring, supply range, `temp_*` values) |
| D-A8 | Board confirmation gate | **APPROVED (DR-13, 2026-10-05)** — board confirmed; Flash/chip/ADC characteristics pending explicit read-only verification (Phase 2B compiled but did not read the physical chip) |
| D-B1 | Dedicated network adapter for the control link | **APPROVED (DR-15, 2026-10-05)** — dedicated USB Wi-Fi adapter |
| D-B2 | Address plan + DHCP pool; re-verify against pinned Arduino-ESP32 version | **OPEN — NOT APPROVED** |
| D-B3 | Approval to apply Windows config + scoped TCP 8000 firewall rule | **APPROVED (DR-15, 2026-10-05)** — the **user applies** these manually; the assistant documents only |
| D-B4 | Permission to install missing Python packages | **MET (0.6.0)** — gate condition satisfied per user ruling 7. **A satisfied gate condition does NOT authorize Phase 2A** |
| D-C1 | Alarm-to-Warning transition | **APPROVED (0.6.0) — defaults**, via **DR-25.1** |
| D-C2 | Latching and reset | **APPROVED (0.6.0) — defaults**, via **DR-25.2** |
| D-C3 | Effect of alarms on the cycle | **APPROVED (0.6.0) — defaults**, via **DR-25.3** |
| D-C4 | Warning-to-Alarm escalation, hysteresis, debounce | **APPROVED (0.6.0) — defaults ONLY**, via **DR-25.4** |
| D-C5 | Faulty / invalid sensor behaviour | **APPROVED (0.6.0) — defaults**, via **DR-25.5** |
| D-D1 | Storage / durability strategy | **DECIDED** — Hybrid + persistent flash journal |
| D-D2 | Active-cycle marker policy and completion ordering | **PARTIALLY RESOLVED (0.6.0)** — marker **direction only** APPROVED via **DR-25.7**; **marker-clear timing and detailed step ordering remain OPEN**; still **blocks T5, T6** |
| D-D3 | Buffer capacity target | **DIRECTION APPROVED (0.6.0)** — overwrite-oldest via **DR-25.8**; **all sizes remain OPEN** |
| D-D4 | Backup destination, schedule, retention | **APPROVED (DR-18, 2026-10-05)** — daily, different drive, configurable path, 30 retained; **run-time default still OPEN** |
| D-D5 | GUI language (English / English + Persian) | **APPROVED (DR-19, 2026-10-05)** — Persian + English, RTL/LTR, Jalali/Gregorian presentation only |
| D-D6 | Reserved-area size, thresholds, backoff | **OPEN — NOT APPROVED** |
| D-D7 | Time authority (PC clock only vs RTC) | **APPROVED (DR-17, 2026-10-05)** — PC is the sole time reference; no hardware RTC; stored timestamps stay UTC |
| D-D8 | Journal endurance and volume analysis | **OPEN — NOT APPROVED** |
| D-D9 | RAM-only loss visibility | **APPROVED** — Option C (durable attempt + labelled volatile visibility) |
| D-D10 | Reserved-area exhaustion policy | **DIRECTION APPROVED (0.6.0)** — overwrite-oldest via **DR-25.8**; priority classes, counters and thresholds remain **OPEN** |
| D-D11 | Valid-sample aggregation policy | **APPROVED** — mandatory per-nozzle counters; optional direct station counters (hardware-dependent) |
| D-D12 | Unconfigured vs zero | **APPROVED** — `NULL` + explicit configuration flag |
| HW-02 | ADC acquisition architecture | **CLOSED (DR-31)** |
| HW-03 | Multiplexer architecture | **CLOSED (DR-31)** |
| DR-01 | Report / export scope (historical / database-derived included) | **APPROVED** — Option A (section 4.5, section 16.3) |
| DR-02 | Canonical cycle-start names `cycle_start_ms` / `start_time_valid` | **APPROVED** — no cycle-start invariant introduced (section 11.6) |
| DR-03 | `duration_basis` value set: `'null'`, `'calendar'`, `'uptime_same_boot'` | **APPROVED** (section 9.4) |
| DR-03b | `duration_ms IS NULL ⇔ duration_basis = 'null'` (bidirectional) | **APPROVED** (section 14.3) |
| DR-04 | RAW-VOLTAGE-RETENTION policy | **PARTIALLY RESOLVED** — **DR-04A APPROVED** (core category, section 4.2); occurrence model and sub-decisions remain OPEN |
| DR-04A | Core durable retention scope (`out_of_range` category) | **APPROVED** (section 4.2) — category only |
| DR-04A2 | Out-of-range occurrence granularity | **APPROVED (granularity) — DR-25.9, 2026-10-05** — one durable raw-voltage record (first sample) + count per entry into `out_of_range`; **count finalization / D-D2 persistence remain OPEN** |
| DR-04B | Cycle min/max raw anchors | **REJECTED / OMITTED** — no anchor fields, tracking logic, schema columns or tie-breaking introduced |
| DR-04C | Tie-breaking | **NOT READY** — no tie-breaking policy introduced (DR-04B rejected) |
| DR-04D | Cycle-boundary raw samples | **NOT READY** — dependent on **D-D2** |
| DR-04E | Interrupted-cycle raw anchors | **NOT READY** — dependent on **D-D2** |
| DR-04F | Persistence ordering | **NOT READY** — dependent on **D-D2** |
| DR-04G | Bounded diagnostic RAM window | **REJECTED / NOT ADOPTED** |
| DR-06 | D-D13 fault vocabulary = `out_of_range` only | **APPROVED** (section 7.1a) |
| DR-07 | D-D13 fault-counter model | **PARTIALLY RESOLVED** — DR-07-C1 and DR-07-C2 APPROVED |
| DR-07-C1 | `invalid_channel_count_now` semantics | **APPROVED** (section 7.1a) — instantaneous, live-only, non-durable, counts channels |
| DR-07-C2 | `faulted_channel_count` counting model | **APPROVED** (section 7.1a) — cumulative distinct-channel; interrupted/reboot persistence **OPEN (D-D2)** |
| DR-07-C3 | `fault_transition_count` | **OPEN — DECISION REQUIRED (0.6.0)**; **no longer blocked by D-C4**; stored as `NULL` (section 7.4); **not decided by the user** |
| DR-08 | Temperature-conversion configuration ownership / grain (Q1–Q3) | **SUPERSEDED (0.6.0) by DR-27** — Q1–Q3 re-decided as per-channel (section 6.6) |
| DR-12 | Fault counting during activation stabilisation | **RESOLVED (DR-25.6, 2026-10-05)** — samples during activation stabilisation are **not** counted in fault counters; §9.2 rule preserved and not extended |
| CS-01 | Clock-step duration policy | **APPROVED (Policy B)** (section 9.4) — same-boot uptime fallback; **D-D7 remains OPEN** |
| D-D13 | Fault-counter semantics (`faulted_channel_count`, `fault_transition_count`, `invalid_channel_count_now`) | **OPEN — DECISION REQUIRED** — fault **vocabulary** APPROVED (DR-06); counting model, reset, reboot and persistence remain open (section 7.1a) |
| TEMP-CONVERSION-CONFIG-GRAIN | Temperature-conversion configuration ownership and grain (symbolic identifier; no D-D number assigned) | **PARTIALLY RESOLVED** — **Q1–Q3 SUPERSEDED by DR-27 (per-channel)**; **Q4–Q8 remain OPEN — DECISION REQUIRED** (section 6.6) |
| DR-13 | Board confirmed: ESP32-D0WDQ6, 30-pin development board, 4 MB flash (retailer-stated), PlatformIO target esp32dev. Physical board confirmed to match the supplied pinout image. **Flash/chip/ADC characteristics pending explicit read-only verification (Phase 2B compiled but did not read the physical chip).** Closes D-A8 / HW-01 per section 3.3. It approved no GPIO map, ADC architecture, multiplexer, divider, protection or alarm circuit at the time; those were settled later in Decision Round D by **DR-31/DR-32/DR-33/DR-37**. **Observation (not a decision):** the pinout image shows 6 exposed ADC1-capable GPIOs — GPIO 32, 33, 34, 35, 36, 39. ADC2/Wi-Fi interaction and USB-UART chip identity are "general knowledge, to be verified in Phase 2B". | **APPROVED** (2026-10-05) |
| DR-14 | Environment: the development PC is Windows 10 64-bit with Python 3.13.0 and internet (development only). The final installation target is a different Windows 10 64-bit PC without internet. | **APPROVED** (2026-10-05) |
| DR-15 | Network (D-B1, D-B3): PC uses a dedicated USB Wi-Fi adapter for the ESP32 access-point link; no internet is required in operation; the user applies Windows IP / firewall settings manually following documentation written by the assistant in a later phase; the assistant never applies them. Closes D-B1 and D-B3. D-B2 (address plan and DHCP pool) stays OPEN. | **APPROVED** (2026-10-05) |
| DR-16 | D-B4: Python packages may be installed in a virtual environment inside `pc/` in Phase 2A, with pinned versions. Does NOT authorize installation in Phase 2A-0. | **APPROVED** (2026-10-05) |
| DR-17 | D-D7: the PC is the sole time reference; no hardware RTC; PC time zone is Tehran; PC clock accuracy without internet is sufficient. Stored timestamps stay UTC. | **APPROVED** (2026-10-05) |
| DR-18 | D-D4: daily SQLite backup to a different drive; configurable destination path; the latest 30 backups retained; a clear warning when the destination is unavailable; a WAL-safe method (section 16.1). Run time stays configurable (default value OPEN). | **APPROVED** (2026-10-05) |
| DR-19 | D-D5: GUI languages Persian and English with correct RTL/LTR; selectable Persian (Jalali) and Gregorian calendars; presentation only. | **APPROVED** (2026-10-05) |
| DR-20 | Reports are generated by the user on demand and exported in a format the user selects (PDF, Excel or CSV). Scheduled automatic reports are not required. Report layout/template details stay OPEN. DR-01 is unchanged. | **APPROVED** (2026-10-05) |
| DR-21 | Delivery: an installable application (offline installer bundling all prerequisites) for the target PC. Installer technology and packaging method stay OPEN (later phase). | **APPROVED** (2026-10-05) |
| DR-22 | ESP32 settings page authentication: username + password with mandatory change of the default password on first login. Replaces the PIN proposal of section 15.5 (AMB-15). Credential storage mechanism stays OPEN. | **APPROVED** (2026-10-05) |
| DR-23 | Message encoding: text JSON. The protocol / message contract itself remains NOT APPROVED. | **APPROVED** (2026-10-05) |
| DR-24 | Single device: one ESP32 and one firmware; stations numbered 1-16; no multi-device support (`device_id` stays a fixed identifier field). Sampling: 1 sample per second per channel is sufficient. | **APPROVED** (2026-10-05) |
| **DR-25** | **Bundle of independent sub-decisions (0.6.0)** | **PARTIALLY RESOLVED** — each sub-decision traceable and supersedable alone (see the DR-25.1 … DR-25.9 rows below) |
| DR-25.1 | D-C1: Alarm-to-Warning transitions return the software state and are logged as events. | **APPROVED** (2026-10-05) |
| DR-25.2 | D-C2: the physical alarm output stays energized until the shared reset input is used; software states follow the measured values independently of the output. | **APPROVED** (2026-10-05) |
| DR-25.3 | D-C3: alarms are recorded only and never stop or abort a cycle. | **APPROVED** (2026-10-05) |
| DR-25.4 | D-C4 (**DEFAULTS ONLY**): hysteresis and debounce are configurable on the ESP32 settings page; the default is no delay and no hysteresis (immediate evaluation). | **APPROVED (defaults only)** (2026-10-05) |
| DR-25.5 | D-C5: out-of-range / invalid sensor data is a data-validity condition plus a system event; the cycle completes and invalid samples are excluded from statistics; no physical alarm and no escalation. | **APPROVED** (2026-10-05) |
| DR-25.6 | DR-12: samples during activation stabilization are not counted in fault counters. | **APPROVED** (2026-10-05) |
| DR-25.7 | D-D2 (**DIRECTION ONLY**): the active-cycle marker is written **only at cycle start and at cycle end**. Timing of the end-marker clear, completion ordering, and all interrupted-cycle detection details stay OPEN. | **APPROVED (direction only)** (2026-10-05) |
| DR-25.8 | D-D3 / D-D10 (**DIRECTION ONLY**): durable journal capacity = whatever internal flash allows (no time target); when full, new records overwrite the oldest. Loss must never be silent (PER-05 stays in force): every overwrite is counted and surfaced (`live_state` counter, visible dashboard flag, and a `data_loss` record where possible). Priority: **system events overwritten first; cycle summaries and alarm events last**. This is a new option beyond P1–P4 of section 12.5 and does **NOT** approve P4. D-D6, D-D8, HW-13 and all sizes/thresholds stay OPEN. | **APPROVED (direction only)** (2026-10-05) |
| DR-25.9 | DR-04A2: for each entry of a channel into `out_of_range`, **ONE** durable raw-voltage record (the first sample) plus the sample count is kept, never one record per sample. | **APPROVED (granularity)** (2026-10-05) |
| DR-25.9-b | The **count finalization** and its relation to **D-D2 persistence** for the DR-25.9 occurrence record are **not** decided. | **OPEN — DECISION REQUIRED** (2026-10-05) |
| DR-26 | Sensor-agnostic measurement: any sensor with an analog voltage output must be connectable; measurement is voltage-based; no sensor datasheet or sensor type required. NOT assumed: sensor supply voltage, ratiometric behavior, gauge vs absolute pressure. | **APPROVED** (2026-10-05) |
| **DR-27** | Per-channel calibration. **AMENDS and SUPERSEDES DR-08 Q1–Q3** (device-global temperature configuration ownership). Every one of the 64 channels is configured and calibrated separately in software (32 pressure, 32 temperature). `temp_conversion_configured` is derived from each channel's own calibration. DR-08 Q4–Q8 stay OPEN and are more important now. First version has exactly two conversion modes: **LINEAR** (two points, Arduino `map()` semantics) and **NON-LINEAR** (five points, piecewise-linear interpolation). Polynomial, scale/offset and equation-based (NTC) conversions are **DEFERRED**. Output units fixed to bar and degrees Celsius; user chooses output range of points. Validation: calibration points must be finite and have distinct, ascending voltages. Voltage domain: calibration points and valid-voltage window are **ADC-input volts (0–3.3 V, after any divider; divider ratio absorbed in calibration)**. Inside 0–3.3 V but outside calibrated span: linear extrapolation along the end segment, stays valid. Outside 0–3.3 V: `out_of_range`. Each channel has an **OPTIONAL** valid-voltage window whose default is 0–3.3 V. Nominal pressure points of section 4.3 (0.5–4.5 V = 0–4 bar) are **NOT applicable as defaults**; keep only as "sensor-level reference, applicability under review". Pressure starts unconfigured, like temperature. NOT decided here (**OPEN**): whether the D-D12 NULL-vs-0 rule extends to pressure counters; a "copy calibration to other channels" convenience. | **APPROVED** (2026-10-05) — supersedes DR-08 Q1–Q3 |
| DR-28 | Polarity: the active level of the station inputs (per input or global: OPEN), the alarm output and the reset input must be configurable on the ESP32 settings web page and persisted in NVS. Default stays LOW = active per section 5.1 until changed. | **APPROVED** (2026-10-05) |
| DR-29 | Hardware design is left open to the designer. User-procurable CANDIDATE parts (candidates only, NOT approved; **D-A2, D-A3, D-A4 were CLOSED in Decision Round D (DR-31/32/33)**): CD74HC4067 16-channel analog multiplexer module, ADS1115 16-bit 4-channel I2C ADC module, PCF8574 8-bit I2C I/O expander module. **Observation (not a decision):** these candidates imply sequential scanning; HW-14 is CLOSED by DR-40. The PC-to-ESP32 distance is reported as suitable. | **APPROVED (observation only)** (2026-10-05) |
| **DR-30** | **Voltage domain — AMENDS and SUPERSEDES the 0–3.3 V window of DR-27.** With DR-31's 5 V analog input domain, the calibration-voltage domain, the valid-voltage window and the `out_of_range` boundary are **ADC-input volts, 0–5 V**. Inside 0–5 V but outside the calibrated span: linear extrapolation along the end segment, stays valid. Outside 0–5 V: `out_of_range`. The default valid-voltage window becomes **0–5 V**. Raw voltage is still never modified and values are still `NULL`, never `0` and never clamped. All other DR-27 rules (per-channel configuration, LINEAR / NON-LINEAR modes, bar and °C output, ascending distinct validation) are unchanged. | **APPROVED** (2026-10-05) — amends DR-27 |
| **DR-31** | **D-A2 CLOSED — ADC acquisition architecture.** 4× CD74HC4067 16-channel analog multiplexer + 1× ADS1115 16-bit 4-channel I2C ADC (VDD **5 V**, PGA **±6.144 V**) + 3× PCF8574T I2C I/O expanders (5 V bus, ESP32-side level shifting). Addressing: **16 MUX states × 4 ADS1115 channels = 64 channels**, matching the approved 64-channel requirement (section 1.2). Scanning is sequential (DR-40). Closes **HW-02** and **HW-03**. | **APPROVED** (2026-10-05) |
| **DR-32** | **D-A3 CLOSED — analog front end / protection.** Optocoupler isolation and a **5 V input limit**; no 24 V reaches the ESP32. Component ratings, divider ratio, PCB layout and grounding are the **user's** responsibility (DR-38); this specification approves no electrical value. Closes **HW-04** and **HW-05**. | **APPROVED** (2026-10-05) |
| **DR-33** | **D-A4 CLOSED — digital input expansion + alarm output driver.** One alarm output and one reset input, both through PCF8574T. Pin map: **pins 0–15** station/valve activation, **pins 16–19** MUX select S0–S3, **pin 20** alarm output, **pin 21** reset input, **pins 22–23** reserved spare (DR-36). Physical reset and alarm are shared hardware, so the GUI supplies software alarm/warning indicators and drives them with contract `reset_command` (DR-34). Closes **HW-06**, **HW-07**, **HW-08**. | **APPROVED** (2026-10-05) |
| **DR-34** | **Contract v1.1.0.** `docs/PROTOCOL_CONTRACT.md` v1.0.0 → **v1.1.0**: adds `reset_command` (PC → ESP32, non-durable, no `ack`) and `reset_result` (ESP32 → PC, non-durable, carries `accepted` and the post-reset state); adds `alarm_state` (one of `inactive` / `active`) and `warning_state` (one of `inactive` / `active` / `acknowledged`) to `live_state`; adds tests **T-P16** and **T-P17**. Message index becomes **18**. | **APPROVED** (2026-10-05) |
| **DR-35** | **Board-level GPIO and watchdog.** LED on **GPIO13** and watchdog timer **5 s**. Both remain **PROPOSED — NOT DECIDED**: GPIO13 must be verified against the physical board and the pinout image in **Phase 3** before any code drives it, and the 5 s watchdog period is not fixed by this decision. Nothing in this row authorizes Phase 3. | **PROPOSED — NOT APPROVED** (2026-10-05) |
| **DR-36** | **Two spare PCF8574T pins (22–23) are reserved** and must not be consumed by a later feature without an explicit decision round. | **APPROVED** (2026-10-05) |
| **DR-37** | **HW-09 CLOSED — GPIO pin map.** I2C **SDA = GPIO21**, **SCL = GPIO22**; **LED = GPIO13** (PROPOSED — DR-35, verify Phase 3); all other GPIOs **reserved**, not assignable without a decision round. No ADC GPIO is claimed as used by this map. | **APPROVED** (2026-10-05) |
| **DR-38** | **HW-10 = user responsibility.** Power supply, grounding and PCB layout are designed and verified by the **user**. The specification records no voltage, current, trace width or ground scheme. | **APPROVED** (2026-10-05) |
| **DR-39** | **HW-11 and HW-12 CLOSED (per DR-26 sensor-agnostic).** The TMAP34 datasheet and TMAP34 wiring/pin/supply details are **not required**: measurement is voltage-based and any sensor with an analog voltage output is connectable. Closes **HW-11** and **HW-12**; it closes **no** other issue and approves no datasheet value. | **APPROVED** (2026-10-05) |
| **DR-40** | **HW-14 CLOSED — sampling model is sequential scanning.** The 16 MUX states are visited in turn across the 4 ADS1115 channels; simultaneous acquisition of all 64 channels is not used. Sampling rate stays **1 sample per second per channel** (section 1.2); DR-29's observation about sequential scanning is now a decision. | **APPROVED** (2026-10-05) |

**DR-25 binding rule (relocated from the removed section 27.1):** revising or superseding any one **DR-25.x** sub-decision has **no effect** on any other. The bundle is an indexing convenience, **not** a single atomic decision.

**DR-27 supersession note (relocated from the removed section 27.2):** **DR-08 Q1–Q3 are SUPERSEDED** by DR-27 and are recorded as **re-decided**, not re-opened. **DR-08 Q4–Q8 remain `OPEN — DECISION REQUIRED`** — superseding Q1–Q3 did not answer them. **D-D12 is unchanged** (`NULL` + `false` for unconfigured conversion).

### 19.1 Non-inference notes (binding)

* D-D11 approval does **not** approve HW-02, HW-03, SQL implementation, or station simultaneity.
* D-D9 approval does **not** close the power-loss window.
* D-D10 is **not** approved merely because P4 is unacceptable.
* D-D1 being DECIDED does **not** approve journal capacity, priorities, or exhaustion behaviour.
* D-A1 being DECIDED does **not** approve any GPIO, ADC, multiplexer, divider or protection decision.
* **Hardware register subordination (P0 / AUD-01):** the hardware open-issues register (section 3.2) is **subordinate** to this decision register. A hardware ID (HW-*) does **not** independently close, approve, or override a D-* decision; the authoritative approval state is the D-* state. See the mapping table in section 3.3.
* Approval of a decision does **not** close a mapped hardware issue, and a hardware issue does **not** close a mapped decision. **HW-13 remains OPEN. D-A2, D-A3, D-A4 are APPROVED (DR-31/32/33); HW-02 and HW-03 are CLOSED by DR-31.** (`D-A8` and `HW-01` are closed by **DR-13**.)

### 19.2 Identifier gaps (P1 / AUD-08)

| Identifier | State | Notes |
|---|---|---|
| **D-A6** | **Reserved / not currently defined** | No definition, description, dependency or status exists anywhere in this document. |
| **D-A7** | **Reserved / not currently defined** | No definition, description, dependency or status exists anywhere in this document. |

**Whole-document search result (P1 / AUD-08):** a search for `D-A6` and `D-A7` across the complete document returns **zero** references. Neither identifier is used by any section, table, requirement, decision or acceptance criterion.

**Rules applied:**
* **No decision was invented** for `D-A6` or `D-A7` — no description, owner, dependency or status was created.
* **No existing decision was renumbered**, and **no D-* identifier was shifted**. The register still runs D-A1, D-A2, D-A3, D-A4, D-A5, **D-A8**.
* The gap is recorded so that the identifiers are unambiguously **reserved but undefined**, and so that no later section can silently assign them a meaning.
* If those IDs were ever intended for a specific subject, that subject is **not recorded** in this specification and would require a decision. It is **not** reconstructed here.

---

## 20. Dependencies and Blockers

| Work | Blocked by |
|---|---|
| Phase 2A (protocol simulator, PC skeleton, hardware-independent tests) | **D-B4 MET (0.6.0)**; still requires **approved protocol / message contract** (§12.1) **and explicit user authorization** (§21) |
| Phase 2B (firmware skeleton, compile test) | **D-A8 — MET (DR-13)**; still requires **explicit user authorization**. A met gate condition does **not** authorize a phase |
| Phase 3 (single-channel bench bring-up) | **D-A2, D-A3 — APPROVED (DR-31 / DR-32)**; **hardware still to be built**. Gate condition **partially** satisfied. A met gate condition does **not** authorize a phase — **Phase 3 requires an explicit user statement** (§21) |
| Journal capacity planning | **D-D8**, **D-D3**, **HW-13**, and board identity via **D-A8** or **D-A1** — `OPEN — TRACEABILITY DECISION REQUIRED` (section 13.3) |
| Fault-counter semantics (`faulted_channel_count`, `invalid_channel_count_now`, `fault_transition_count`) | **DR-07-C1 / DR-07-C2 APPROVED**; **DR-07-C3 OPEN — DECISION REQUIRED (no longer blocked by D-C4)**; stabilisation **RESOLVED (DR-25.6)** |
| Alarm engine implementation | **D-C1…D-C5 APPROVED (0.6.0, defaults)** via DR-25.1…DR-25.5 |
| Fault transition counting | **DR-07-C3 OPEN — DECISION REQUIRED** (D-C4 defaults now **APPROVED**, DR-25.4) |
| Station simultaneous counters | **HW-02, HW-03, HW-14** |
| Cycle marker, recovery, T5, T6 | **D-D2 PARTIALLY RESOLVED (0.6.0)** — direction only (DR-25.7); **recovery, T5 and T6 remain BLOCKED** |
| Reserved-area / overflow policy | **direction APPROVED (0.6.0)** — overwrite-oldest (DR-25.8); **D-D6, D-D8, priority classes and counters remain OPEN** |
| Unknown-time record handling validation | **— (RESOLVED)** — **D-D7 APPROVED (DR-17)** — PC is the sole time reference |
| Temperature-conversion configuration grain (`TEMP-CONVERSION-CONFIG-GRAIN`) | **Q1–Q3 SUPERSEDED by DR-27 (per-channel)**; **Q4–Q8 `OPEN — DECISION REQUIRED`** (section 6.6) |
| RAW-VOLTAGE-RETENTION occurrence model (DR-04A2) | **APPROVED (granularity, DR-25.9, 0.6.0)** — one durable raw-voltage record per entry into `out_of_range`, plus a count (section 4.2). **Count finalization and D-D2 persistence remain OPEN.** DR-04A APPROVED |
| `fault_transition_count` (DR-07-C3) | **OPEN — DECISION REQUIRED (0.6.0)**; **no longer blocked by D-C4** (section 7.1a) |
| Fault counting during activation stabilisation (DR-12) | **RESOLVED (DR-25.6)** — samples during activation stabilisation are **not** counted in fault counters |
| `faulted_channel_count` interrupted-cycle / reboot persistence | **D-D2** |
| Protocol / message contract approval | **APPROVED (final, 2026-10-05)** — `docs/PROTOCOL_CONTRACT.md` v1.1.0 (revised from v1.0.0 in Decision Round D, **DR-34**) (section 12.1, section 21) |
| Protocol / message contract — **final approval** | §12.1 | **APPROVED (final, 2026-10-05)** — `docs/PROTOCOL_CONTRACT.md` v1.0.0. Implemented from both sides in Phase 2A (commit `b30e74f`); this final-approval change is recorded in spec v0.7.3 |
| Any network or Windows change | **D-B1, D-B2, D-B3** |

## 21. Implementation Phases and Approval Gates

| Phase | Content | Gate to enter |
|---|---|---|
| **1 (this document)** | Specification baseline | **Approval of this document** |
| **2A** | Protocol simulator, message contract, PC skeleton, hardware-independent tests | Approval of this document **+ D-B4 (MET, 0.6.0)** **+ `PROTOCOL_CONTRACT.md` v1.1.0 APPROVED (final, 2026-10-05)** **+ explicit user statement that Phase 2A is authorized** |
| **2B** | Firmware skeleton and compile test | **D-A8 — MET (DR-13)** **+ explicit user statement that Phase 2B is authorized** |
| 3 | Single-channel bench bring-up; voltage and calibration validation | **D-A2, D-A3 — APPROVED (DR-31 / DR-32)** **+ hardware built** **+ explicit user statement that Phase 3 is authorized** |
| 4 | Full 64-channel acquisition and timing budget | Phase 3 complete |
| 5 | Cycle statistics, alarm engine, journal / ACK / overflow end-to-end | **D-C1…D-C5, D-D10** |
| 6 | Calibration — adopt an approved curve / constants | **D-A5** closed |
| 7 | Reports, exports, backup / retention, localisation, GUI refinement | **D-D4, D-D5** |
| 8 | Autostart, firewall, packaging, acceptance run | **D-B1, D-B2, D-B3** |

**None of these phases has been started.**

**Phase 2A: NOT AUTHORIZED.**
**Phase 2B: NOT AUTHORIZED.**

**Phase 2A gate status as of 0.6.0.** The **D-B4 condition is now MET** (permission to install missing Python packages was granted for the Phase 2A gate). **A satisfied gate condition is not an authorization.** Phase 2A **still requires BOTH**: (a) the user's **explicit approval of `docs/PROTOCOL_CONTRACT.md`**, which is currently **PROPOSED — NOT APPROVED**; and (b) the user's **explicit statement that Phase 2A is authorized**. Until both exist, Phase 2A remains **NOT AUTHORIZED**.

**Phase 2B** remains **NOT AUTHORIZED**. Its gate condition (**D-A8**, board confirmation) is now **MET** by **DR-13** — but **a met gate condition is not an authorization**. Phase 2B still requires the user's **explicit statement that it is authorized**.

The P0 and P1 documentation repairs (versions 0.2.0 and 0.3.0) do **not** authorise any phase and do **not** approve this specification. Revision 0.6.0 likewise does **not** authorise any phase. The document remains **BASELINE — FOR REVIEW**. The Phase 2A gate — approval of this document, **plus D-B4 (MET, DR-16)**, **plus explicit approval of the protocol / message contract (§12.1)** — remains unmet, and the Phase 2B gate **condition D-A8 is MET (DR-13)** but Phase 2B still lacks the **explicit user authorization** that a met condition cannot supply. Repairing documentation is not implementation approval.

---

## 22. Glossary

| Term | Meaning |
|---|---|
| **Station** | One of 16 machine positions, each with an upper and a lower nozzle. |
| **Nozzle** | One of two sensing points per station, carrying one TMAP34 sensor with pressure and temperature signals. |
| **Channel** | A single analog measurement path. 64 total: 32 pressure + 32 temperature. |
| **Acquisition pass** | One sampling instant in which the station's channels are read. |
| **Cycle** | One station activation from stabilised start to end. |
| **Stabilisation** | The configurable initial interval (default 5 s) after activation during which samples are displayed but excluded from statistics and thresholds are suppressed. |
| **Record** | A durable unit of history (cycle summary, alarm event, system event, settings change). |
| **Durable write** | A write that has survived to persistent storage (flash journal). |
| **Journal** | The durable flash record store on the ESP32. |
| **ACK** | Acknowledgement from the PC after the record has been committed to SQLite. |
| **Deduplication** | Rejecting a replayed record id so it does not create a second row. |
| **live_state** | The 1 Hz, non-persisted, non-acknowledged status message. |
| **Raw voltage** | The unconverted measured voltage, always retained in the live representation; durable retention for out-of-range readings approved via DR-04A; occurrence granularity DR-25.9. |
| **Out of range** | A voltage outside the configured conversion range; the converted value is invalid; the raw voltage is preserved. |
| **Valid sample** | A sample whose converted value is valid for the quantity concerned. |
| **Loss indicator** | A flag recording that loss occurred. It never recovers the lost data. |
| **Volatile** | Exists only in RAM; lost on power loss. |
| **Baseline** | A tagged, fixed specification from which change is measured. |

---

## 23. Traceability Matrix (requirement → decision → acceptance)

| Requirement | Decision / invariant | Acceptance |
|---|---|---|
| 16 stations / 32 nozzles / 64 channels | Established scale (§1.2) | Structural verification at Phase 4 |
| No assumed direct 64-channel acquisition | §1.2, §5.3; HW-02/HW-03 OPEN | Blocked until HW-02/HW-03 |
| Pressure linear conversion | §4.3; D-A5 method DECIDED | §17.1 conversion tests |
| Pressure points nominal / unverified | §4.3; `approved = 0` | Labels present in reports / exports |
| Temperature uncalibrated | §4.4; D-A5 remainder OPEN | §17.1 unconfigured-temperature test |
| Out-of-range handling | §4.5, §6.5; **D-C5 APPROVED (DR-25.5)** | §17.1 out-of-range tests; **AC-08 — unconditional since 0.7.2 (DR-25.5)** |
| Raw voltage retention | §4.2 — **DR-04A APPROVED** (out-of-range category); report scope **APPROVED (DR-01)** | **AC-07 BLOCKED — DR-04A2** |
| Validity independence | §6.1; D-D11 APPROVED | §17.1; AC-09 |
| Per-nozzle counters | §6.2; D-D11 APPROVED | §17.1 |
| `NULL` vs `0` | §6.3; D-D12 APPROVED | AC-09 |
| Station simultaneous counters | §6.4; HW-02/HW-03 OPEN | Blocked |
| Fault counters | §7, §7.1a; **DR-06, DR-07-C1, DR-07-C2 APPROVED**; **DR-07-C3 OPEN**, **D-C4 APPROVED (DR-25.4, defaults only)** | **PARTIALLY APPROVED**; transitions **OPEN — DECISION REQUIRED (no longer blocked by D-C4)**; stabilisation **RESOLVED (DR-25.6)** |
| Interrupted cycle representation | §9.5a (representation) | **AC-13 — BLOCKED by D-D2** |
| Interrupted cycle detection | §9.5b, §9.6; **D-D2 OPEN** | **AC-13 BLOCKED — D-D2**; T5, T6 suspended |
| Duration rule | §9.4; **DR-03 APPROVED**, **DR-03b APPROVED**, **CS-01 APPROVED (Policy B)** | **AC-04 — unconditional** (§17.2); **D-D7 APPROVED (DR-17)** — PC is the sole time reference |
| Marker / recovery ordering | §9.6; **D-D2 PARTIALLY RESOLVED (direction only, DR-25.7)** — *at cycle start and end*; all timing, ordering and detection details remain OPEN | **T5, T6 still suspended** (PCC-13) |
| Alarm event logging | §10.1; **D-C1 APPROVED (DR-25.1)**, D-C2–D-C5 APPROVED via DR-25.2–.5 | §17.1 alarm-policy tests — **now unblocked** (§10.3 body still OPEN — PCC-30) |
| Shared alarm output / reset | §10.2; **D-C2 / D-C3 APPROVED (DR-25.2, DR-25.3)** | Blocker lifted; §10.2 body wording still OPEN (§10.3 — PCC-14, PCC-30) |
| UTC timestamps, no fabrication | §11 | AC-02, AC-05 |
| Accept records with invalid time | §11.3 | AC-02 |
| Clock-step handling | §11.4 | §17.1 |
| Commit-before-ACK | §12.2 | §17.1 commit-before-ACK test |
| Deduplication | §12.2 | AC-01 |
| Hybrid durability | §12.3; D-D1 DECIDED | §17.1 durability tests |
| Loss visibility | §12.4; D-D9 APPROVED (Option C) | **AC-20** |
| Reserved-area exhaustion | §12.5; **D-D10 DIRECTION APPROVED (DR-25.8)** — overwrite-oldest; **sizes, thresholds, D-D6, D-D8, HW-13 remain OPEN** | Direction fixed; also conditions stage **L2** of the loss-reporting chain (§12.6) |
| Loss-reporting chain | §12.6 | Conditional assertions only; progression beyond **L2** is **BLOCKED by D-D10** |
| Journal durability | §13.1 (JRN-01 … JRN-06) | **AC-14, AC-15, AC-16, AC-17, AC-18**; section 13.4 |
| No silent discard | §13.2 PER-05 | **AC-19 — BLOCKED (D-D10, D-D6, D-D8)** |
| Backup / restore | §16.1, §16.2 | AC-12 |
| Report labelling | §16.3 | Labels verified |
| Hardware ↔ decision ID mapping (P0 / AUD-01) | §3.3, §19.1 | Mapping table present; no decision status changed |
| Canonical timestamp / duration naming (P0 / AUD-04) | §11.6 | AC-02, AC-03 restated; `time` / `time_valid` deprecated |
| Cycle start timestamp naming | §11.6 — **APPROVED (DR-02)**: `cycle_start_ms`, `start_time_valid` | Named; **no cycle-start invariant defined** |
| `ARC-04` / `ARC-10` (P1 / AUD-07) | §2.2 | `ARC-04` canonical; `ARC-10` deprecated alias; distinct scope `OPEN — DOCUMENTATION DECISION REQUIRED` |
| `D-A6` / `D-A7` (P1 / AUD-08) | §19.2 | Reserved / not currently defined; zero references document-wide |
| Fault-counter semantics (P1 / AUD-09) | §7.1a; **D-D13 OPEN** | **BLOCKED — D-D13** |
| Temperature-conversion configuration grain (P1 / AUD-10) | §6.6 — **Q1–Q3 APPROVED (DR-08)** | **Q4–Q8 OPEN — DECISION REQUIRED** |
| Journal requirements JRN-01 … JRN-06 (P1 / AUD-11) | §13.1 | AC-14, AC-15, AC-16, AC-17, AC-18 |
| PER-05 no silent discard (P1 / AUD-11) | §13.2 | **AC-19 — BLOCKED by D-D10** |
| D-D9 volatile-loss labelling (P1 / AUD-11) | §12.4 | **AC-20** |
| D-D10 ↔ L1–L5 interaction (P1 / AUD-12) | §12.6 | Progression beyond **L2** blocked; T4 conditioned additionally on D-D6, D-D8, D-D10 |
| Phase 2A gate (P1 / AUD-13) | §21, §12.1 | Requires document approval **+ D-B4** **+ approved protocol / message contract** |
| Board / ADC claims (P1 / AUD-14) | §3.1, §5.3 | `UNVERIFIED — NOT AN APPROVED HARDWARE FACT` (retailer 4-channel ADC figure); **D-A8, HW-01 APPROVED (DR-13)**; **D-A2, D-A3, D-A4 APPROVED and HW-02, HW-03, HW-04 … HW-09, HW-14 CLOSED by DR-31 … DR-40**; **DR-30 amends DR-27 to the 0–5 V domain** | Architecture decided; the retailer ADC claim is still not an approved fact, and flash/chip/ADC remain pending read-only verification |
| Journal-capacity dependency (P1 / AUD-15) | §13.3, §20 | `OPEN — TRACEABILITY DECISION REQUIRED` (D-A1 vs D-A8); **no sizing performed** |
| DR-01 report/export scope (0.4.0) | §4.5(7), §16.3 | **APPROVED** — historical / database-derived in scope |
| DR-02 cycle-start naming (0.4.0) | §11.6 | **APPROVED** — `cycle_start_ms`, `start_time_valid`; **no invariant introduced** |
| DR-03 `duration_basis` value set (0.4.0) | §9.4 | **APPROVED** — `'null'`, `'calendar'`, `'uptime_same_boot'` |
| DR-03b duration NULL invariant (0.4.0) | §14.3 | **APPROVED** — `duration_ms IS NULL ⇔ duration_basis = 'null'` |
| DR-06 fault vocabulary (0.4.0) | §7.1a | **APPROVED** — `out_of_range` = faulted; `unconfigured` **not** faulted |
| DR-08 temperature config ownership (0.4.0) | §6.2, §6.6 | **SUPERSEDED by DR-27** (Q1–Q3 re-decided as per-channel); **Q4–Q8 `OPEN — DECISION REQUIRED`** — see §6.6 |
| DR-04 RAW-VOLTAGE-RETENTION (0.4.0) | §4.2 | **OPEN — DECISION REQUIRED** (DR-01 prerequisite satisfied) |
| DR-07 D-D13 counting model (0.4.0) | §7.1a | **PARTIALLY RESOLVED (0.5.0)** — DR-07-C1 / DR-07-C2 APPROVED; DR-07-C3 OPEN |
| DR-04A core durable raw-voltage scope (0.5.0) | §4.2 | **APPROVED** — out-of-range category only |
| DR-04A2 out-of-range occurrence granularity (0.5.0) | §4.2, §20 | **APPROVED (granularity) — DR-25.9**; count finalization / D-D2 persistence **OPEN** |
| DR-04B / DR-04C cycle anchors and tie-breaking (0.5.0) | §4.2 | **REJECTED / NOT READY** — not adopted |
| DR-04D / DR-04E / DR-04F boundary, interrupted, ordering (0.5.0) | §4.2, §20 | **NOT READY** (D-D2) |
| DR-04G diagnostic RAM window (0.5.0) | §4.2 | **REJECTED / NOT ADOPTED** |
| DR-07-C1 `invalid_channel_count_now` (0.5.0) | §7.1, §7.1a | **APPROVED** — instantaneous, live-only, non-durable |
| DR-07-C2 `faulted_channel_count` (0.5.0) | §7.1, §7.1a | **APPROVED** — cumulative distinct-channel; D-D2 aspects OPEN |
| DR-07-C3 `fault_transition_count` (0.5.0) | §7.1, §7.1a | **OPEN — DECISION REQUIRED**; **no longer blocked by D-C4** (DR-25.4 defaults approved); stored as `NULL` |
| DR-12 fault counting during stabilisation (0.5.0) | §7.1a, §9.2 | **RESOLVED (DR-25.6)** — stabilisation samples are not counted in fault counters; §9.2 preserved, not extended |
| CS-01 clock-step duration policy (0.5.0) | §9.4 | **APPROVED (Policy B)**; D-D7 remains OPEN |

---

## 24. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-04 | **Initial written baseline.** Created from conversation context. Records decisions D-D1 (**DECIDED**), D-D9 / D-D11 / D-D12 (**APPROVED**), and preserves D-A2, D-A3, D-A4, D-A5 (remainder), D-A8, D-B1…D-B4, D-C1…D-C5, D-D2…D-D8, D-D10 and HW-02 / HW-03 as **OPEN — NOT APPROVED**. The document was rebuilt deterministically (ordered end-of-file appends) after an earlier draft became corrupted by interleaved line-drift edits. |
| 0.2.0 | 2026-10-04 | **P0 documentation repair (AUD-01 … AUD-06 only).** Added §3.3 hardware↔decision mapping and subordination rule; §4.2 raw-voltage-retention contradiction recorded as `OPEN — DECISION REQUIRED`; §9.4 calendar-vs-duration validity clarified and `duration_basis` value set recorded OPEN; §11.6 canonical timestamp/duration naming; §9.5 split into representation (established) and detection (blocked by D-D2); §17.2 reclassified as unconditional with §17.3 added for conditional/blocked criteria (AC-04, AC-07, AC-08, AC-13). No OPEN decision resolved; no new technical value invented; revision status unchanged. |
| 0.3.0 | 2026-10-04 | **P1 documentation repair (AUD-07 … AUD-15).** `ARC-04` made canonical with `ARC-10` recorded as a deprecated alias; `D-A6` / `D-A7` documented as reserved and undefined; **`D-D13`** created as an OPEN decision for fault-counter semantics; `TEMP-CONVERSION-CONFIG-GRAIN` created as OPEN; acceptance IDs **AC-14 … AC-20** added for `JRN-*`, `PER-05` and the D-D9 labelling requirement; `D-D10` ↔ L1–L5 interaction documented with blocked criteria identified; Phase 2A gate now additionally requires approved protocol/message contract; retailer-derived board/ADC data marked `UNVERIFIED — NOT AN APPROVED HARDWARE FACT`; journal-capacity dependency marked `OPEN — TRACEABILITY DECISION REQUIRED`. No OPEN decision resolved; no hardware, protocol, journal-sizing or grain decision made. |
| 0.4.0 | 2026-10-04 | **Approved-decision round.** DR-01 report/export scope = historical / database-derived; DR-02 canonical `cycle_start_ms` / `start_time_valid`; DR-03 `duration_basis` value set = `'null'`, `'calendar'`, `'uptime_same_boot'`; DR-03b `duration_ms IS NULL ⇔ duration_basis = 'null'`; DR-06 fault vocabulary = `out_of_range` only; DR-08 temperature-config ownership Q1–Q3. AC-04 moved from §17.3 to §17.2 (blocker resolved). **DR-04 and DR-07 remain OPEN** — prerequisites satisfied, decisions not made. D-D1 / D-D9 / D-D11 / D-D12 preserved unchanged. |
| 0.5.0 | 2026-10-04 | **Decision Round B approvals.** **DR-04A APPROVED** — raw voltage of an applicable `out_of_range` reading must exist in durable historical storage (category only; PER-03 unaffected; no per-sample storage). **DR-07-C1 APPROVED** — `invalid_channel_count_now` instantaneous, live-only, non-durable, counts channels. **DR-07-C2 APPROVED** — `faulted_channel_count` cumulative distinct-channel, cycle-summary, reset at cycle start. **CS-01 APPROVED (Policy B)** — backward clock step uses `uptime_same_boot` when a valid same-boot uptime pair exists, otherwise `'null'`; no new `duration_basis` value; DR-03b invariant retained. Deferred / not adopted: DR-04A2 (D-C4), DR-04B (rejected), DR-04C, DR-04D, DR-04E, DR-04F (D-D2), DR-04G (rejected), DR-07-C3 (D-C4), DR-12. D-D7 remains OPEN. |
| 0.6.0 | 2026-10-04 | **Phase 2A-0 documentation-only round.** Archived v0.5.0 byte-identical; created `docs/PROTOCOL_CONTRACT.md` (**PROPOSED — NOT APPROVED**). **DR-27** supersedes **DR-08 Q1–Q3** (per-channel temperature-calibration ownership). **DR-25** split into **DR-25.1 … DR-25.9** so each sub-decision is independently traceable and supersedable; **DR-25.4 = defaults only**, **DR-25.6/7/8/9 = direction only**. **DR-07-C3** moved from `DEFERRED — BLOCKED by D-C4` to **`OPEN — DECISION REQUIRED`** (`fault_transition_count` stays `NULL`). **D-C1…D-C5, D-D2 (direction), D-D3, D-D10 (direction) and DR-04A2 (direction)** updated in §19, §20 and §21. **D-B4 MET**; Phase 2A still **NOT AUTHORIZED** (needs contract approval + explicit authorization); Phase 2B **NOT AUTHORIZED**. §3.1a added. **PCC-19…PCC-21 recorded and NOT applied.** **No OPEN decision was silently resolved.** |
| 0.6.1 | 2026-10-05 | **Phase 2A-0 repair revision (no new decisions).** Corruption repair D1–D5; DR-13 … DR-29 added; DR-25.1 … DR-25.9 and DR-27 replaced with full normative text; PCC-01 … PCC-27 recorded in §18.1; open-questions register moved to §18.2; unauthorized sections 27/28/29 deleted with content relocated; derived status updates for D-A8, HW-01, D-B1, D-B3, D-D7, D-D4, D-D5, AMB-15, §15.5. **Not a new decision round.**
| 0.6.2 | 2026-10-05 | **Phase 2A-0 consistency patch (no new decisions, no new PCC semantics).** (A) §19 DR register reordered into numeric order (DR-25 + DR-25.1 … .9 after DR-24; DR-27 after DR-26) with row text byte-for-byte unchanged. (B) §20: 3 stale dependency rows updated (D-D7 via DR-17; DR-07-C3 unblocked; DR-12 RESOLVED via DR-25.6). (C) §23: 9 traceability rows aligned with §19 (DR-08 SUPERSEDED; DR-07-C3 unblocked; D-C1…D-C5, D-C2/D-C3, D-C5, D-D7, D-D10-direction and DR-12 statuses; AC-08 noted as now unconditional but **not moved**). (D) §17.1: 5 "Blocked by" cells updated — **no test executed or marked passed**. (E) PCC-28 … PCC-35 recorded as `PROPOSED — NOT APPLIED`. (F) PCC-06/07/08/09/13 relabelled `APPLIED (0.6.1)`. §4.3, §4.5, §8.1, §9.2, §10.3, §11.5, §13.3, §14.3, §15.4, §16.1, §17.3 byte-unchanged. Phase 2A / Phase 2B still **NOT AUTHORIZED**. **Line endings normalized to CRLF file-wide during the §19 reorder; §16.1 wording unchanged.** |
| 0.7.0 | 2026-10-05 | **PCC application pass (no new decisions).** Body sections updated to match §19: §4.5, §8.1, §8.2, §8.3, §8.5, §9.2, §10.2, §10.3, §11.5, §13.3, §14.3, §15.4, §16.1, §5.3, §22. Cross-references: §3.3, §4.2, §19 (DR-25.9 split into DR-25.9 / DR-25.9-b), §20, §23. Imperative copy-paste in §19 DR-13 / DR-29 converted to descriptive text. 15 PCCs relabelled `APPLIED (0.7.0)`; the 5 `APPLIED (0.6.1)` not regressed; 15 remain `PROPOSED — NOT APPLIED`. §10.3 "Alternatives (none chosen)" column retained as rejected-option history (not renamed). The 0.6.0 revision-history date is left at 2026-10-04 — discrepancy recorded in V104, not corrected. No new decision, no new section, no row removed. Phase 2A / 2B still **NOT AUTHORIZED**. |
| 0.7.2 | 2026-10-05 | **AC-08 promotion (no new decisions).** AC-08 moved from §17.3 to §17.2 as unconditional, with the approved D-C5 (DR-25.5) semantics inline. §17.2 closing note updated so AC-08 is no longer listed as non-unconditional. §17.3 AC-08 note rewritten as "now unconditional". PCC-22 → APPLIED (0.7.2). §23 "Out-of-range handling" caveat removed. §17.1 "see AC-08" reference left unchanged and reported. No new decision, no new section, no row removed. Phase 2A / 2B still **NOT AUTHORIZED**. |
| 0.7.4 | 2026-10-05 | **Decision Round D — hardware architecture closure.** **D-A2, D-A3, D-A4 APPROVED** via DR-31 / DR-32 / DR-33; **HW-02 … HW-09, HW-11, HW-12, HW-14 CLOSED**; **HW-10 = user responsibility (DR-38)**; **HW-13 stays OPEN**. **DR-30** (0–5 V domain, amends DR-27) … **DR-40** (sequential scanning) added. **Contract v1.0.0 → v1.1.0**: `reset_command`, `reset_result`, `live_state` `alarm_state` / `warning_state`, tests T-P16 / T-P17 (DR-34). LED GPIO13 and WDT 5 s remain **PROPOSED — NOT DECIDED** (DR-35). §0.1, §3.1a, §3.2, §3.3, §5.3, §12.1, §19, §19.1, §20, §21, §23, §24, §25 updated; V122–V135 added. **Phase 3 and all later phases still NOT AUTHORIZED.** |
| 0.7.3 | 2026-10-05 | **Final approval of PROTOCOL_CONTRACT.md (v1.0.0) — no new decisions.** Contract v0.2.4 → v1.0.0, status **APPROVED — final, 2026-10-05**. §12.1, §20 and §21 gate text updated; §23 traceability row added; V118–V121 added. The contract remains revisable by an explicit decision round. Phase 3 and all later phases still **NOT AUTHORIZED**. |
| 0.7.1 | 2026-10-05 | **Follow-up: complete D-C5 / D-D10 body alignment (no new decisions).** §7.5 and §8.4 `overflow` corrected; §7.1a (PCC-36), §12.4 / §12.5 (PCC-37), §17.1 PER-02 and §18 AMB-08 / AMB-14 (PCC-38) corrected. §17.3 AC-08 and its companion sentence deliberately left unchanged per PCC-22. §8.4 `journal_pressure` (D-D6 genuinely OPEN) unchanged. PCC-36, PCC-37, PCC-38 added as APPLIED (0.7.1). No new decision, no new section, no row removed. Phase 2A / 2B still **NOT AUTHORIZED**. |

## 25. Verification Record

| # | Check | Outcome |
|---|---|---|
| V1 | Workspace inspected before writing | Performed (read-only) |
| V2 | Document re-opened and read after writing | Performed |
| V3 | All required sections present | Checked (see §26) |
| V4 | Approved decisions match the approved set (D-D1, D-D9, D-D11, D-D12) | Checked |
| V5 | D-D10 remains OPEN | Checked |
| V6 | D-D2 and T5 / T6 remain blocked / suspended | Checked |
| V7 | No unapproved hardware / alarm / network / package / implementation choice introduced | Checked |
| V8 | No executable file or project configuration created | Checked |
| V9 | Files created reported exactly | Checked |
| V10 | P0 / AUD-01 — hardware↔decision mapping added (§3.3); all mapped statuses unchanged | Checked |
| V11 | P0 / AUD-02 — raw-voltage retention recorded OPEN; AC-07 blocked | Checked |
| V12 | P0 / AUD-03 — duration validity clarified; `duration_basis` value set OPEN; AC-04 blocked | Checked |
| V13 | P0 / AUD-04 — canonical naming (§11.6); AC-02 / AC-03 restated; aliases deprecated | Checked |
| V14 | P0 / AUD-05 — representation vs detection split; AC-13 added, blocked by D-D2; T5 / T6 still suspended | Checked |
| V15 | P0 / AUD-06 — conditional acceptance section (§17.3); AC-04, AC-07, AC-08 reclassified | Checked |
| V16 | P0 repair — no OPEN decision resolved; no new technical value invented; status remains BASELINE — FOR REVIEW; Phase 2A / 2B NOT AUTHORIZED | Checked |
| V17 | P1 / AUD-07 — ARC-04 canonical, ARC-10 deprecated alias; no requirement text altered | Checked |
| V18 | P1 / AUD-08 — D-A6 / D-A7 searched document-wide (0 references); recorded reserved / undefined; no renumbering | Checked |
| V19 | P1 / AUD-09 — D-D13 created OPEN; fault-counter semantics left undecided | Checked |
| V20 | P1 / AUD-10 — TEMP-CONVERSION-CONFIG-GRAIN created OPEN; D-D12 preserved | Checked |
| V21 | P1 / AUD-11 — AC-14 … AC-20 created (next unused IDs); no existing AC renumbered or duplicated | Checked |
| V22 | P1 / AUD-12 — D-D10 ↔ L2 interaction documented; AC-19 and T4 marked blocked/conditioned; no policy chosen | Checked |
| V23 | P1 / AUD-13 — Phase 2A gate now requires approved protocol/message contract; contract itself NOT approved | Checked |
| V24 | P1 / AUD-14 — retailer-derived board/ADC data marked UNVERIFIED; no hardware fact approved; no external research performed | Checked |
| V25 | P1 / AUD-15 — journal-capacity dependency marked OPEN — TRACEABILITY DECISION REQUIRED; no sizing performed | Checked |
| V26 | P1 repair — all previously approved/decided decision states unchanged; Phase 2A / 2B remain NOT AUTHORIZED | Checked |
| V27 | 0.4.0 — baseline verified before edit (SHA256 `B9A84BAF…21A5`, 1292 lines, 97 347 bytes, v0.3.0) | Checked |
| V28 | DR-01 applied — §4.5(7) and §16.3 scope clarified; DR-04 **not** auto-resolved | Checked |
| V29 | DR-02 applied — `cycle_start_ms` / `start_time_valid` canonical; **no cycle-start invariant introduced** | Checked |
| V30 | DR-03 applied — value set `'null'` / `'calendar'` / `'uptime_same_boot'`; no extra values added | Checked |
| V31 | DR-03b applied — bidirectional `duration_ms IS NULL ⇔ duration_basis = 'null'`; clock-step basis left OPEN | Checked |
| V32 | DR-06 applied — `out_of_range` = faulted only; `unconfigured` not faulted; D-C1…D-C5 untouched | Checked |
| V33 | DR-08 applied — Q1–Q3 resolved; Q4–Q8 still OPEN; D-D12 text unchanged | Checked |
| V34 | AC-04 moved to §17.2; AC-07 remains BLOCKED by DR-04; AC-13 BLOCKED by D-D2; AC-19 BLOCKED by D-D10 | Checked |
| V35 | 0.4.0 — no code, SQL, schema, migration, protocol, firmware, network or hardware content introduced | Checked |
| V36 | 0.5.0 — baseline verified before edit (SHA256 `45F8D072…4296`, 1367 lines, 108 289 bytes, v0.4.0) | Checked |
| V37 | DR-04A applied — durable raw voltage for applicable out-of-range readings (category only); **PER-03 unaffected**; no per-sample storage created | Checked |
| V38 | DR-04A2 deferred (D-C4); DR-04B rejected; DR-04C/D/E/F not ready; DR-04G rejected — none introduced | Checked |
| V39 | DR-07-C1 applied — `invalid_channel_count_now` instantaneous / live-only / non-durable / channel-counting | Checked |
| V40 | DR-07-C2 applied — `faulted_channel_count` cumulative distinct-channel, cycle-summary, reset at cycle start; D-D2 aspects deferred | Checked |
| V41 | DR-07-C3 deferred — `fault_transition_count` remains NOT APPROVED, BLOCKED by D-C4, stored as `NULL` (§7.4 preserved) | Checked |
| V42 | DR-12 deferred — §9.2 rule preserved and **not** extended into fault-counter semantics | Checked |
| V43 | CS-01 Policy B applied — same-boot uptime fallback else `'null'`; **no new `duration_basis` value**; D-D7 remains OPEN | Checked |
| V44 | 0.5.0 — DR-01/02/03/03b/06/08, D-D1/D-D9/D-D11/D-D12 and PER-03 unchanged; no capacity, endurance, reserved-area or D-D10 policy introduced | Checked |
| V45 | 0.6.0 — baseline re-read in full before archiving: SHA256 `06D71C124E647D5807E7381F617AAAB2A7FAC9A926BF8F27632E13C747DDB426`, 119 532 bytes, 1 443 lines | Checked |
| V46 | `docs/archive/PROJECT_SPECIFICATION_v0.5.0.md` created **byte-identical** to v0.5.0; hash equality verified both ways | Checked |
| V47 | DR-27 applied — per-channel ownership; **DR-08 Q1–Q3 marked SUPERSEDED**, not deleted | Checked |
| V48 | DR-08 **Q4–Q8 left OPEN** — superseding Q1–Q3 did not answer them | Checked |
| V49 | DR-07-C3 recorded as **OPEN — DECISION REQUIRED**; **no wording was written claiming it was deferred by the user's instruction**, and it is **not** stated to be decided | Checked |
| V50 | `fault_transition_count` remains `NULL` in all drafts (§7.4) | Checked |
| V51 | DR-25 decomposed into **DR-25.1 … DR-25.9**, each independently traceable and supersedable | Checked |
| V52 | DR-25.4 recorded as **defaults only**; DR-25.6 / .7 / .8 / .9 as **direction only** | Checked |
| V53 | D-D2 — **direction only** recorded; **marker-clear timing left as an OPEN question** (§29 Q2) | Checked |
| V54 | Pinout image (§3.1a) — **only what the image shows** recorded; ADC2/Wi-Fi labelled "general knowledge, to be verified in Phase 2B"; USB-UART bridge **not** asserted | Checked |
| V55 | §21 — **D-B4 recorded as MET**; Phase 2A still **NOT AUTHORIZED** (needs contract approval + explicit authorization); Phase 2B **NOT AUTHORIZED** | Checked |
| V56 | PCC-19 / PCC-20 / PCC-21 **recorded, not applied** | Checked |
| V57 | PCC-01 … PCC-18 **not entered** — their exact text was not carried into this revision | **Flagged** |
| V58 | `docs/PROTOCOL_CONTRACT.md` created as **PROPOSED — NOT APPROVED** | Checked |
| V59 | 0.6.0 — no code, SQL, schema, migration, protocol implementation, firmware, network or hardware change introduced | Checked |
| V60 | 0.6.0 — scope respected: only `docs/` and `.clinerules/` touched | Checked |
| V61 | `.clinerules/00-toughening-machine.md` reviewed against the 0.6.0 rulings and found **already consistent** (Phase 2A-0-only authorization; a met gate does **not** authorize a phase; hard prohibitions; Plan-Mode-first; STOP-and-report) — **left UNCHANGED** (`0A50B18E…5BC2`, 39 lines) pending the exact replacement text | **Flagged** |
| V62 | No package, network, service, registry or OS change performed; scratch scripts removed from `%TEMP%` | Checked |
| V63 | Verification re-run after the V49 rewording: the forbidden DR-07-C3 phrasing (claiming the user deferred it) count = **0** | Checked |
| V64 | **0.6.1 repair — D1:** all 8 literal `@@END@@` artifacts removed (former lines 216, 453, 524, 528, 640, 1090, 1267, 1354); split sentences rejoined | Checked |
| V65 | **0.6.1 repair — D2:** mojibake on the `fault_transition_count` status line repaired; 3 occurrences before, 0 after | Checked |
| V66 | **0.6.1 repair — D3:** lost DR-27 batch restored — §6.2 row, §6.3 grain note, §6.6 heading, §6.6 "Partially resolved" all now per-channel / SUPERSEDED (DR-27) | Checked |
| V67 | **0.6.1 repair — D4:** 21 blank lines that broke markdown tables removed (header, §7.1, §19 ×3, §20, §21 and others); 0 broken tables remain | Checked |
| V68 | **0.6.1 repair — D5:** §27/§28/§29 internal structure moot — their content was relocated with correct blank lines into §18.1, §18.2, §19 and §19.1 before deletion | Checked |
| V69 | **0.6.1 repair:** DR-13 … DR-29 added to §19 with normative text, approval date 2026-10-05 | Checked |
| V70 | **0.6.1 repair:** DR-25.1 … DR-25.9 and DR-27 replaced with full BLOCK-2 normative text | Checked |
| V71 | **0.6.1 repair:** PCC-01 … PCC-27 recorded in §18.1, all labelled PROPOSED — NOT APPLIED; **PCC-19/20/21 verified PRESENT before repair** and carried over, not recreated | Checked |
| V72 | **0.6.1 repair:** §27/§28/§29 deleted; §26 index rows removed; §27.1 binding rule → §19; §27.2 supersession note → §19.1; Q1–Q16 → §18.2 | Checked |
| V73 | **0.6.1 repair:** §19.1 non-inference sentence no longer lists D-A8, D-B1, D-B3, D-B4, D-C1…D-C5, D-D4, D-D5 or D-D7; only D-A2, D-A3, D-A4, HW-02, HW-03 remain | Checked |
| V74 | **0.6.1 repair:** derived status updates applied — D-A8/HW-01 (DR-13), D-B1/D-B3 (DR-15), D-D7 (DR-17), D-D4 (DR-18), D-D5 (DR-19), AMB-15 + §15.5 (DR-22) | Checked |
| V75 | **0.6.1 repair:** Phase 2B gate condition D-A8 recorded MET while Phase 2B stays NOT AUTHORIZED ("a met gate condition does not authorize a phase") | Checked |
| V76 | **0.6.1 repair:** `docs/PROTOCOL_CONTRACT.md` NOT edited; remains PROPOSED — NOT APPROVED | Checked |
| V77 | **0.6.1:** version bumped to 0.6.1 in header and footer; §0.1 and §24 rows labelled "Phase 2A-0 repair revision (no new decisions)" | Checked |
| V78 | **0.6.1:** `.clinerules/00-toughening-machine.md` replaced verbatim with the user-supplied text | Checked |
| V79 | **0.6.1:** scope respected — only `docs/` and `.clinerules/` written; `esp32-pinout.jpg`, `docs/archive/` and `docs/PROTOCOL_CONTRACT.md` untouched; no temp script created | Checked |
| V80 | **0.6.2 (A)** §19 DR register is in numeric order — DR-24, DR-25, DR-25.1 … DR-25.9, DR-26, DR-27, DR-28, DR-29; DR row text carried byte-for-byte (reorder only, **no row text edited**) | Checked |
| V81 | **0.6.2 (B)** §20 stale dependency rows removed/updated — "Unknown-time record handling validation" = D-D7 APPROVED (DR-17); "Fault-counter semantics" = DR-07-C3 OPEN (no longer blocked by D-C4) + stabilisation RESOLVED (DR-25.6); "Fault counting during activation stabilisation (DR-12)" = RESOLVED (DR-25.6) | Checked |
| V82 | **0.6.2 (C)** §23 no longer contains a "DR-08 … APPROVED — device-global" row; it reads SUPERSEDED by DR-27 with Q4–Q8 OPEN | Checked |
| V83 | **0.6.2 (C)** §23 DR-07-C3 row reads OPEN — DECISION REQUIRED and no longer blocked by D-C4 (was "DEFERRED — OPEN; BLOCKED by D-C4") | Checked |
| V84 | **0.6.2 (C)** §23 nine rows aligned with §19 — Fault counters, Alarm event logging, Shared alarm output / reset, Reserved-area exhaustion, Duration rule, Marker / recovery ordering, Out-of-range handling; **AC-08 noted as now unconditional but NOT moved** | Checked |
| V85 | **0.6.2 (D)** §17.1 "Blocked by" column updated for 5 rows — Duration rule (D-D7 APPROVED, DR-17), Out-of-range (D-C5 APPROVED), Fault counters (DR-12 RESOLVED, DR-07-C3 unblocked), Transition counting (D-C4 APPROVED, DR-25.4), Alarm policy (D-C1…D-C5 APPROVED). **No test was executed and no test is marked as passed** | Checked |
| V86 | **0.6.2 (E)** PCC-28 … PCC-35 recorded in §18.1 for §3.3, §4.2, §10.3, §11.5, §13.3, §14.3, §15.4, §16.1 — all labelled **PROPOSED — NOT APPLIED** | Checked |
| V87 | **0.6.2 (F)** PCC-06, PCC-07, PCC-08, PCC-09, PCC-13 relabelled **APPLIED (0.6.1)**; PCC-05, PCC-10, PCC-11, PCC-12, PCC-14 verified still **PROPOSED — NOT APPLIED** | Checked |
| V88 | **0.6.2 (G)** version bumped to 0.6.2 in header, footer, §0.1 revision history and §24 change log, labelled "consistency patch (no new decisions, no new PCC semantics)" | Checked |
| V89 | **0.6.2:** protected sections byte-unchanged (SHA256 compared before/after) — §4.3, §4.5, §8.1, §9.2, §10.3, §11.5, §13.3, §14.3, §15.4, §16.1, §17.3 | Checked |
| V90 | **0.6.2:** scope respected — only `docs/PROJECT_SPECIFICATION.md` written; `docs/PROTOCOL_CONTRACT.md`, `docs/archive/`, `docs/hardware/` and `.clinerules/` untouched; no code, SQL, package, test, installer or configuration work performed; Phase 2A and Phase 2B remain NOT AUTHORIZED | Checked |
| V91 | **0.7.0 (A1) §4.5** non-escalation paragraph now cites D-C5 APPROVED (DR-25.5); the stale "D-C5, which remains OPEN" text is gone | Checked |
| V92 | **0.7.0 (A2) §8.1** `unconfigured` now reads "applies to pressure and temperature; DR-27 per-channel calibration, both start unconfigured" | Checked |
| V93 | **0.7.0 (A3/A4) §8.2 / §8.3** fault and invalid rows now cite D-C5 APPROVED (DR-25.5); no "D-C5 (OPEN)" remains | Checked |
| V94 | **0.7.0 (A5) §8.5** severity policy now cites APPROVED (DR-25.1…DR-25.5) with D-C4 defaults only | Checked |
| V95 | **0.7.0 (A6) §9.2** stabilisation bullet added: samples excluded from fault-counter accounting (DR-25.6) | Checked |
| V96 | **0.7.0 (A7) §10.2** D-C2 APPROVED (DR-25.2) added; the three-concept distinction is retained verbatim | Checked |
| V97 | **0.7.0 (A8) §10.3** all five Status cells updated to APPROVED (DR-25.1–.5); D-C4 marked DEFAULTS ONLY; **the "Alternatives (none chosen)" column was NOT renamed** and now carries a note that it records rejected options, not policy | Checked |
| V98 | **0.7.0 (A9) §11.5** time authority now APPROVED (DR-17) — PC is sole time reference, no hardware RTC | Checked |
| V99 | **0.7.0 (A10) §13.3** board-identity row now APPROVED (DR-13) with flash/chip/ADC still to verify in Phase 2B | Checked |
| V100 | **0.7.0 (A11) §14.3** `fault_transition_count` NULL until **DR-07-C3** (not D-C4); D-C4 recorded as APPROVED defaults only | Checked |
| V101 | **0.7.0 (A12) §15.4** localisation now APPROVED (DR-19); presentation-only caveat retained | Checked |
| V102 | **0.7.0 (A13) §16.1** backup now APPROVED (DR-18) including the destination-unavailable warning and WAL-safe method; the specific WAL technique remains a proposal; run-time default stays OPEN | Checked |
| V103 | **0.7.0 (A14) §22** glossary "Raw voltage" now states live-representation retention, DR-04A durable scope and DR-25.9 granularity | Checked |
| V104 | **0.7.0 (A15) §5.3** retailer "4-channel ADC" claim replaced with the pinout observation — 6 ADC1-capable GPIOs (32, 33, 34, 35, 36, 39) **verified against `docs/hardware/esp32-pinout.jpg`** (ADC1 CH0/3/4/5/6/7), recorded as observation only; HW-02/HW-03 remain OPEN | Checked |
| V105 | **0.7.0 (B) cross-references** §3.3 D-A8 APPROVED (DR-13); §4.2 DR-04A2 APPROVED (DR-25.9); §19 DR-25.9 split into DR-25.9 (APPROVED, granularity) + **DR-25.9-b** (OPEN — count finalization / D-D2 persistence); §20 and §23 rows updated for DR-04A2 and DR-12 (RESOLVED DR-25.6) | Checked |
| V106 | **0.7.0 (C1)** §19 DR-13 and DR-29 imperative copy-paste ("Add the OBSERVATION…") converted to descriptive text | Checked |
| V107 | **0.7.0 (D)** 15 PCCs relabelled `APPLIED (0.7.0)` (PCC-05, 10, 11, 12, 14, 17, 18, 28–35); the 5 previously `APPLIED (0.6.1)` (PCC-06, 07, 08, 09, 13) were **not** regressed; 15 remain `PROPOSED — NOT APPLIED` | Checked |
| V108 | **0.7.0 (B6) date discrepancy recorded, not corrected:** the 0.6.0 revision-history row remains **2026-10-04**. DR-13/17/18/19/27 carry (2026-10-05), but the §19 DR-25 bundle row carries **no approval date**, so it cannot be shown that every decision the 0.6.0 row cites was approved on 2026-10-05. Left unchanged per instruction and logged here | Checked |
| V109 | **0.7.0** no new decision, no new section, no row removed; sections outside the approved edit list are byte-unchanged; `docs/PROTOCOL_CONTRACT.md`, `docs/archive/`, `.clinerules/`, `docs/hardware/`, `.gitignore`, `.gitattributes` and `README.md` untouched; Phase 2A and Phase 2B remain NOT AUTHORIZED | Checked |
| V110 | **0.7.1 (FIX 1) §7.5** non-escalation now states D-C5 is APPROVED (DR-25.5) with the full approved semantics; the stale "D-C5, which remains OPEN" sentence is gone. This was the defect flagged at the end of the 0.7.0 pass | Checked |
| V111 | **0.7.1 (FIX 2) §8.4** `overflow` row now records the D-D10 direction as APPROVED (DR-25.8, overwrite-oldest) with priority classes, counters and thresholds still OPEN. **FIX 3 verified and deliberately unchanged:** the `journal_pressure` row still says the threshold is OPEN under D-D6 — D-D6 is genuinely undecided | Checked |
| V112 | **0.7.1 (PCC-36) §7.1a** three corrections — the DR-06 scope-limits sentence split so it no longer claims D-C1…D-C5 remain OPEN; open-question item 7 now RESOLVED (DR-25.5); DR-12 stabilisation participation now RESOLVED (DR-25.6), samples not counted in fault counters | Checked |
| V113 | **0.7.1 (PCC-37) §12.4 / §12.5** four corrections — the §12.5 heading no longer reads "D-D10 OPEN — NOT APPROVED" (now DIRECTION APPROVED (DR-25.8), sizes and thresholds OPEN); the L2 progression sentence now requires D-D10 to be "fully decided" rather than "approved"; §12.4 no longer lists D-C5 as a dependency of the exhaustion policy and records it as APPROVED (DR-25.5) and orthogonal to exhaustion | Checked |
| V114 | **0.7.1 (PCC-38) §17.1 / §18** three corrections — §17.1 PER-02 no longer lists D-C5 as a dependency; §18 AMB-08 now records the alarm and fault policy as CLOSED by DR-25.1…DR-25.5; §18 AMB-14 now records direction APPROVED with sizes/thresholds undefined | Checked |
| V115 | **0.7.1** scan-driven completeness: every `D-C5` and `D-D10` occurrence was inspected sentence-by-sentence. **Deliberately unchanged:** §17.3 **AC-08** and its companion sentence (PCC-22 forbids moving AC-08 before an explicit decision) and §7.4's D-C5 cross-reference (correct as written). AC-08's remaining "D-C5 (OPEN)" wording is therefore a **known, recorded residual** to be resolved only when AC-08 is moved by explicit decision. No new decision, no new section, no row removed; only `docs/PROJECT_SPECIFICATION.md` written; Phase 2A and Phase 2B remain NOT AUTHORIZED | Checked |
| V116 | **0.7.2 (AC-08 promotion)** AC-08 moved from **§17.3 (conditional)** to **§17.2 (unconditional)**, appearing exactly once and only in the §17.2 criterion table. The blocker recorded by PCC-22 — D-C5 being OPEN — was resolved by **DR-25.5 in 0.6.0**; no new decision was taken. The **§17.2 closing note was updated in the same pass**: it now lists only AC-07, AC-13 and AC-19 as non-unconditional and records AC-04 and AC-08 as "have moved here", so §17.2 does not contradict itself. The §17.3 AC-08 note now reads "AC-08 is now unconditional" and points to §17.2. `CONDITIONAL — DEPENDS ON D-C5` = 0 occurrences | Checked |
| V117 | **0.7.2 (PCC-22 + traceability)** PCC-22 relabelled **APPLIED (0.7.2)** with the promotion recorded in its description; the §18.1 application summary notes the promotion and its cause. §23 "Out-of-range handling" now reads "AC-08 — unconditional since 0.7.2 (DR-25.5)" with the "do not move AC-08 yet" caveat removed. **Reported unchanged, as instructed:** the §17.1 "Out-of-range" test row still cites "see AC-08" — that reference remains accurate and was outside this patch's scope. PCC register totals reconcile to 38 (15 APPLIED 0.7.0 + 5 APPLIED 0.6.1 + 4 APPLIED 0.7.1/0.7.2 + 14 PROPOSED). No new decision, no new section, no row removed; only `docs/PROJECT_SPECIFICATION.md` written; Phase 2A and Phase 2B remain NOT AUTHORIZED | Checked |
| V118 | **0.7.3 (contract final approval)** `docs/PROTOCOL_CONTRACT.md` v0.2.4 → **v1.0.0**, status **APPROVED — final, 2026-10-05**; draft label removed. §9 non-inference rewritten to state final approval and revisability. Three stale statements corrected: the header Phase 2B line ("Phase 2B is NOT AUTHORIZED"), the Implementation status row ("no simulator, no firmware, no server exists") and the §9 closing line — all now reflect that Phase 2A and Phase 2B are complete. Footer and Supersedes updated | Checked |
| V119 | **0.7.3 (spec gate alignment)** §12.1 approval status changed from "not an approved schema" to **APPROVED (final, 2026-10-05)** as v1.0.0; §20 "Protocol / message contract approval" row changed from "required before Phase 2A" to **APPROVED (final, 2026-10-05)**; §21 Phase 2A gate text changed to "`PROTOCOL_CONTRACT.md` v1.0.0 APPROVED (final, 2026-10-05)". Header Companion line updated to the final approval. §0.1 and §24 gained 0.7.3 rows | Checked |
| V120 | **0.7.3 (§23 traceability)** A "Protocol / message contract — final approval" row was added to §23, citing §12.1, the Phase 2A implementation commit `b30e74f`, and spec v0.7.3. **No commit SHA is written for the current (final-approval) commit** — it does not exist yet, and inventing one would be fabrication | Checked |
| V121 | **0.7.3 (scope)** Only three files were modified: `docs/PROTOCOL_CONTRACT.md`, `docs/PROJECT_SPECIFICATION.md` (§0.1, §12.1, §20, §21, §23, §24, §25, header, footer only) and `.clinerules/00-toughening-machine.md` (one clause in §1 only, removing "is a draft until I approve it"). `docs/archive/`, `docs/hardware/`, `pc/`, `firmware/`, `.gitignore`, `.gitattributes` and `README.md` untouched. **No new decision was made. Phase 3 and all later phases remain NOT AUTHORIZED** | Checked |
| V122 | **0.7.4 (version bump)** Spec **v0.7.3 → v0.7.4**; header `Document version` and footer updated; Companion line now reads `docs/PROTOCOL_CONTRACT.md` **v1.1.0**. §0.1 and §24 each gained a 0.7.4 row. | Checked |
| V123 | **0.7.4 (D-A2 / D-A3 / D-A4)** §19 rows now **APPROVED (DR-31 / DR-32 / DR-33)**; the duplicate **HW-02 / HW-03** rows in §19 now read **CLOSED (DR-31)**. | Checked |
| V124 | **0.7.4 (§3.2 register)** **HW-02 … HW-09, HW-11, HW-12, HW-14 CLOSED** with their DR citation; **HW-10 = USER RESPONSIBILITY (DR-38)**; **HW-13 left OPEN — NOT APPROVED** (flash partition → Phase 5/6). | Checked |
| V125 | **0.7.4 (DR-30 … DR-40)** Eleven new rows inserted **immediately after DR-29**, none renumbered, no existing DR row altered except the two stale clauses inside DR-13 and DR-29. | Checked |
| V126 | **0.7.4 (DR-30 amends DR-27)** Voltage domain **0–3.3 V → 0–5 V**; DR-27 text left in place and explicitly **AMENDED and SUPERSEDED**, per the document's established DR-27-amends-DR-08 pattern. Sections still stating 0–3.3 V are listed in the round report as a follow-up. | Checked |
| V127 | **0.7.4 (DR-35 not over-promoted)** LED **GPIO13** and WDT **5 s** are recorded as **PROPOSED — NOT APPROVED** in §19 and described as *"verify in Phase 3"* in §3.2 / DR-37. They are **not** labelled DECIDED or APPROVED anywhere. | Checked |
| V128 | **0.7.4 (stale-statement repairs)** §3.3, §3.1a, §5.3, §19.1, DR-13, DR-29, D-A8, HW-01 and the §23 traceability row rewritten to the new statuses; the exact wording was supplied or authorized by the user in this round. | Checked |
| V129 | **0.7.4 (contract v1.1.0 header)** `PROTOCOL_CONTRACT.md` Version **1.0.0 → 1.1.0**, Companion → spec **v0.7.4**, Supersedes → v1.0.0 with the revision named, footer → v1.1.0. | Checked |
| V130 | **0.7.4 (18 messages)** §3.2 index gained rows **17 `reset_command`** and **18 `reset_result`**; the summary sentence now reads **Eleven** proposed additions. Sections **§3.19** and **§3.20** added before §4. | Checked |
| V131 | **0.7.4 (live_state)** `alarm_state` (`inactive` / `active`) and `warning_state` (`inactive` / `active` / `acknowledged`) added to the §3.4 field table **and** to its JSON example. | Checked |
| V132 | **0.7.4 (T-P16 / T-P17)** Two tests added to §10, marked *added v1.1.0, DR-34*. T-P16 covers `target` validation and the absence of `ack`; T-P17 covers `request_id` echo and the post-reset state fields. | Checked |
| V133 | **0.7.4 (protocol_version consistency)** Per the added §3.1 note, `protocol_version` mirrors the document version: all **17 pre-existing examples** were updated from `"1.0.0"` to `"1.1.0"` so the new note does not contradict them. | Checked |
| V134 | **0.7.4 (scope)** Only two files were modified: `docs/PROJECT_SPECIFICATION.md` and `docs/PROTOCOL_CONTRACT.md`. `docs/archive/`, `docs/hardware/`, `pc/`, `firmware/`, `.clinerules/`, `.gitignore`, `.gitattributes` and `README.md` untouched. | Checked |
| V135 | **0.7.4 (phase status)** §21 Phase 3 gate rows now read **D-A2 / D-A3 APPROVED**, **hardware still to be built**, gate **partially** satisfied, and state that a satisfied gate **does not** authorize a phase. **Phase 3 and all later phases remain NOT AUTHORIZED.** | Checked |

## 26. Section Index

| Section | Title |
|---|---|
| 0 | Document Control |
| 1 | Purpose and System Overview |
| 2 | System Architecture |
| 3 | Hardware Assumptions and Open Decisions |
| 4 | Measurement, Sensors and Conversion |
| 5 | Activation Inputs and Electrical Safety |
| 6 | Acquisition Validity and Sample Counters |
| 7 | Fault Counters |
| 8 | States |
| 9 | Cycle Behaviour and Recovery |
| 10 | Alarm Behaviour and Open Policies |
| 11 | Time Synchronisation and Timestamp Integrity |
| 12 | Data Flow, Protocol and Reliability |
| 13 | Persistent Journal, Buffering and Recovery |
| 14 | Proposed Database Schema |
| 15 | Windows Application, GUI, Settings, Localisation and Access Control |
| 16 | Backups, Reports, Exports and PDF |
| 17 | Testing Strategy and Acceptance Criteria |
| 18 | Ambiguities and Missing Source Detail |
| 19 | Decision Register |
| 20 | Dependencies and Blockers |
| 21 | Implementation Phases and Approval Gates |
| 22 | Glossary |
| 23 | Traceability Matrix |
| 24 | Change Log |
| 25 | Verification Record |
| 26 | Section Index |

*End of document — TOUGHENING MACHINE Project Specification Baseline v0.7.4.*