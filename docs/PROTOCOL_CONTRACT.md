# TOUGHENING MACHINE — PROTOCOL / MESSAGE CONTRACT

> ## STATUS: **PROPOSED — NOT APPROVED**
>
> This document is a **draft for review**. It is **not** an approved schema.
> Nothing in it is authorised for implementation.
> Per `docs/PROJECT_SPECIFICATION.md` §12.1 and §21, **explicit user approval of this document is required before Phase 2A may begin**, and Phase 2A additionally requires the user's **explicit statement that Phase 2A is authorized**.
> **Phase 2A is NOT AUTHORIZED. Phase 2B is NOT AUTHORIZED.**

| Field | Value |
|---|---|
| Document | `docs/PROTOCOL_CONTRACT.md` |
| Status | **PROPOSED — NOT APPROVED** |
| Version | 0.1.0 (draft) |
| Date | 2026-10-04 |
| Companion | `docs/PROJECT_SPECIFICATION.md` v0.6.0 |
| Supersedes | Nothing. No earlier contract exists. |
| Implementation status | **None. No simulator, no firmware, no server exists.** |

---

## 1. Scope

This draft describes the message contract between the **ESP32** and the **Windows PC** described in specification sections 2, 12 and 15.

**This document deliberately does NOT decide:**

* any field name beyond the minimum envelope required to route a message;
* any database schema or column;
* any journal layout, partition size or endurance figure;
* any numeric protocol version value beyond a placeholder;
* authentication or credential handling for the PC→ESP32 configuration channel.

Where the specification leaves a value open, this contract marks it **OPEN** rather than choosing one.

---

## 2. Transport (PROPOSED — NOT APPROVED)

| Property | Value | Source / status |
|---|---|---|
| ESP32 → PC direction | WebSocket **client** | ARC-03 (**established requirement**) |
| PC → ESP32 direction | same WebSocket connection | **PROPOSED** |
| URL | `ws://192.168.4.2:8000/ws/device` | §12.1 — address plan **D-B2 OPEN** |
| ESP32 AP address | `192.168.4.1` | ARC-01 — **proposed default** |
| Port | TCP 8000 | ARC-12 (**established requirement**) |
| Internet dependency | **none** | ARC-17 (**established requirement**) |
| Reconnect | with backoff | ARC-05 (**established requirement**); backoff parameters **OPEN** |

**No transport is implemented. D-B2 (address plan / DHCP) and D-B3 (Windows configuration and firewall) remain OPEN — NOT APPROVED.**

---

## 3. Message types

Established by specification §12.1 (**shape only, not an approved schema**):

| Message | Direction | Durable? | ACK? | Status |
|---|---|---|---|---|
| `live_state` | ESP32 → PC | No | No | 1 Hz, non-stored, non-acknowledged (**established**) |
| `cycle_summary` | ESP32 → PC | Yes | Yes | message type **established**; payload **OPEN** |
| `alarm_event` | ESP32 → PC | Yes | Yes | payload **OPEN**; alarm **policy** now D-C1…D-C5 **APPROVED (defaults)** |
| `system_event` | ESP32 → PC | Yes | Yes | payload **OPEN** |
| `settings_change` | either → other | Yes (history) | Yes | payload **OPEN** |
| `ack` | PC → ESP32 | — | — | acknowledges a `record_id` |
| `nack` | PC → ESP32 | — | — | rejects a `record_id`, with reason |

**No field, format, or version value is selected by this draft.**

---

## 4. Envelope — MINIMUM ONLY (PROPOSED)

Every message carries, at minimum, the concepts already recorded in §12.1:

| Concept | Required | Notes |
|---|---|---|
| Protocol version | Yes | **Concrete value OPEN** — a placeholder, not `1`. |
| Message type | Yes | from the table in §3 |
| `record_id` | For durable records only | unique; the deduplication key (§12.2) |
| Correlation id | **OPEN** | needed to match `ack`/`nack`; **not yet decided** |
| Payload | Yes | **payload schemas are OPEN** |

> **Explicitly not decided here:** timestamp fields (`event_time`, `event_time_valid`), `boot_id`, `duration_ms` / `duration_basis` placement, counter fields (`faulted_channel_count`, `invalid_channel_count_now`, `fault_transition_count`), and per-nozzle statistic fields. These are **approved in the specification** but their **wire placement is a contract decision that has not been made**.

---

## 5. Durability and acknowledgement rules (established — restated, not changed)

From §12.2 and §12.3, unchanged by this draft:

1. The PC **commits to SQLite in a transaction, then sends `ack`**. It never acknowledges before commit.
2. The ESP32 **deletes a record only after a valid matching `ack`**.
3. Retransmission must not create duplicates — **unique identity plus deduplication**; a replayed `record_id` must not create a second row.
4. A record becomes eligible for acknowledged transmission **only after a durable write**.
5. A **failed durable write must never be reported as successfully accepted**.
6. `live_state` requires **no** historical record and **no** individual acknowledgement.

---

## 6. Error handling (OPEN)

| Topic | Status |
|---|---|
| `nack` reason vocabulary | **OPEN — DECISION REQUIRED** |
| Retry policy / retry count / backoff | **OPEN — DECISION REQUIRED** |
| PC unreachable behaviour | Established at the requirement level (ARC-06: keep measuring); **parameters OPEN** |
| Corrupt / unparseable message | **OPEN — DECISION REQUIRED** |
| Protocol version mismatch handling | **OPEN — DECISION REQUIRED** |

**Nothing in this section is decided. A default must not be invented.**

---

## 7. Security and authentication (OPEN)

| Topic | Status |
|---|---|
| Transport encryption | **OPEN** — not specified; local network only (§2.5) |
| PC → ESP32 configuration authentication | **OPEN — DECISION REQUIRED** |
| Credential storage | **OPEN — DECISION REQUIRED** (ARC-11: secrets never in logs) |
| Settings-page protection | Mechanism **OPEN** (§15.5) |

---

## 8. What must be decided before this contract can be approved

1. Concrete **protocol version** value and compatibility policy.
2. **Correlation id** and `ack`/`nack` matching rule.
3. **Payload schemas** per message type.
4. **Wire placement** of the canonical timestamp/duration fields (§11.6) and counters.
5. `nack` reason vocabulary and **retry/backoff** policy.
6. **Version-mismatch** behaviour.
7. Whether **authentication** is required on the configuration channel.

---

## 9. Non-inference

* This draft **approves nothing**. It is a review artefact.
* It **does not** satisfy the Phase 2A gate. The gate (§21) requires this document to be **approved** *and* Phase 2A to be **explicitly authorized**; **D-B4 is MET (0.6.0)**, but a met gate condition is **not** an authorization.
* It creates **no** schema, **no** migration and **no** hardware dependency.
* Phase 2B remains **NOT AUTHORIZED** and is gated on **D-A8** (board confirmation), which is **OPEN**.

---

*End of document — TOUGHENING MACHINE Protocol / Message Contract v0.1.0 — PROPOSED — NOT APPROVED.*