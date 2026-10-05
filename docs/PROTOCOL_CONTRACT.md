# TOUGHENING MACHINE — PROTOCOL / MESSAGE CONTRACT

> ## STATUS: **APPROVED AS PHASE 2A INPUT — final approval after Phase 2A completes**
>
> This document is approved **as the Phase 2A working input** (user decision, 2026-10-05). It is **not** a finally approved schema.
> Per `docs/PROJECT_SPECIFICATION.md` §12.1 and §21, **explicit user approval of this document is required before Phase 2A may begin**, and Phase 2A additionally requires the user's **explicit statement that Phase 2A is authorized**.
> Gaps 3–8 (section 11) are **resolved during Phase 2A**. **Final approval of this contract is a separate task after Phase 2A completes.**
> **Phase 2A is AUTHORIZED (as working input). Phase 2B is NOT AUTHORIZED.**

| Field | Value |
|---|---|
| Document | `docs/PROTOCOL_CONTRACT.md` |
| Status | **APPROVED AS PHASE 2A INPUT — final approval after Phase 2A completes** |
| Version | 0.2.4 (draft) |
| Date | 2026-10-05 |
| Companion | `docs/PROJECT_SPECIFICATION.md` v0.7.2 |
| Supersedes | v0.2.3 (2026-10-05, draft — Phase 2A working input). Earlier drafts v0.2.2, v0.2.1, v0.2.0 (withdrawn — structurally corrupt) and v0.1.0 (2026-10-04). No earlier **fully approved** contract exists. |
| Implementation status | **None. No simulator, no firmware, no server exists.** |

---

## 0. How to read this document

Every field in every table carries **exactly one** status label, shown at the end of its Notes cell:

| Label | Meaning |
|---|---|
| *(spec-derived)* | The field exists in `PROJECT_SPECIFICATION.md` v0.6.2 with an approved name and meaning. Its **wire placement** is proposed here, not approved. |
| *(PROPOSED: …)* | Not in the specification. This draft proposes a concrete value or format for review. |
| *(OPEN)* | Not derivable from the specification and **not** decided here. **A default must not be invented.** |

Message rows in §3.2 carry a **Status** column: `[spec §12.1]` (the message type is named in specification §12.1) or `[proposed addition]` (it is **not** in §12.1; this draft proposes it).

**No numeric protocol constant, calibration point, sensor value or hardware value appears anywhere in this document.** All examples use obvious placeholders.

---

## 1. Scope

This draft describes the message contract between the **ESP32** and the **Windows PC** described in specification sections 2, 12 and 15.

**This document deliberately does NOT decide:**

* any database schema or column;
* any journal layout, partition size or endurance figure;
* any numeric retry, timeout or backoff value;
* authentication or credential handling for the PC→ESP32 configuration channel;
* any hardware detail.

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
## 3. Message catalogue

### 3.1 Common envelope

Every ESP32-originated message carries the following envelope. Envelope fields are **orthogonal** to the payload described in each message section.

| Field | Type | Required | Notes |
|---|---|---|---|
| `protocol_version` | string | Yes | Semantic version of this contract, string form `"MAJOR.MINOR.PATCH"`. *(PROPOSED: `"1.0.0"`)* |
| `type` | string | Yes | One of the 16 values in §3.2. *(spec-derived)* |
| `message_id` | string | Yes | Unique per **message transmission**, for logging and transport-level duplicate detection. *(PROPOSED: `"{device_id}:{boot_id}:{seq}"`)* |
| `device_id` | string | Yes | Fixed identifier of the single ESP32; not a network address, never changes. *(PROPOSED: `"esp32-01"`)* |
| `boot_id` | string | Yes | Identifies one boot session; scopes all uptime reasoning. *(spec-derived)* |
| `seq` | integer | Yes | Monotonic per boot, incremented **per message sent**. Reset to zero on reboot; `boot_id` disambiguates. *(PROPOSED: non-negative integer)* |
| `record_seq` | integer | Durable records only | Monotonic per boot, incremented **once per durable record created**, and **not** incremented when that record is retransmitted. This is the stable identity component of `record_id`. Absent from `live_state`, `hello`, `time_sync`, `time_sync_reply`, `config_set`, `config_result`, `ack`, `nack`. *(PROPOSED: non-negative integer)* |
| `record_id` | string | Durable records only | Stable identity of a durable record; the deduplication key. Formatted **`{device_id}:{boot_id}:{record_seq}`** — deliberately **not** `{seq}`, so a retransmission gets a fresh `message_id` while keeping the same `record_id`. Absent from `live_state`, `hello`, `time_sync`, `time_sync_reply`, `config_set`, `config_result`, `batch`, `ack`, `nack`. *(PROPOSED: `"{device_id}:{boot_id}:{record_seq}"`)* |
| `ts_sent_ms` | integer | Yes | UTC milliseconds at which the ESP32 emitted the message. *(PROPOSED: UTC epoch ms, same domain as `event_time`)* |
| `ts_sent_valid` | integer | Yes | `0` or `1`; `0` when the ESP32 clock is not trustworthy. *(PROPOSED: `0` or `1`)* |
| `payload` | object | Yes | Message-type specific; see §3.2. *(spec-derived)* |

**Deprecated aliases are not used.** The canonical names of specification §11.6 — `event_time`, `event_time_valid`, `cycle_start_ms`, `start_time_valid`, `cycle_end_ms`, `end_time_valid`, `duration_ms`, `duration_basis`, `boot_id` — are the **only** timestamp and duration names permitted on the wire. The deprecated spellings `time` and `time_valid` must never appear as a field name. *(spec-derived, §11.6)*

**`ts_sent_ms` is an envelope field, not `event_time`.** Payload-level event times use `event_time` / `event_time_valid`. The two are distinct and must not be conflated. *(spec-derived, §11.6)*

**PC-originated messages** (`time_sync`, `config_set`, `ack`, `nack`) are sent by the PC, which has no `boot_id` and no device-local monotonic sequence. The envelope fields applicable to a PC-originated message are recorded as **OPEN** in §8; this draft does not invent them.

---

### 3.2 Message index

| # | Message | Direction | Durable? | ACK? | Status |
|---|---|---|---|---|---|
| 1 | `hello` | ESP32 → PC | No | No | `[proposed addition]` |
| 2 | `live_state` | ESP32 → PC | No | No | `[spec §12.1]` |
| 3 | `cycle_summary` | ESP32 → PC | Yes | Yes | `[spec §12.1]` |
| 4 | `alarm_event` | ESP32 → PC | Yes | Yes | `[spec §12.1]` |
| 5 | `system_event` | ESP32 → PC | Yes | Yes | `[spec §12.1]` |
| 6 | `settings_change` | either → other | Yes (history) | Yes | `[spec §12.1]` |
| 7 | `interrupted_cycle` | ESP32 → PC | Yes | Yes | `[proposed addition]` |
| 8 | `data_loss` | ESP32 → PC | Yes | Yes | `[proposed addition]` |
| 9 | `raw_voltage_record` | ESP32 → PC | Yes | Yes | `[proposed addition]` |
| 10 | `time_sync` | PC → ESP32 | No | No | `[proposed addition]` |
| 11 | `time_sync_reply` | ESP32 → PC | No | No | `[proposed addition]` |
| 12 | `config_set` | PC → ESP32 | No | Yes (`config_result`) | `[proposed addition]` |
| 13 | `config_result` | ESP32 → PC | No | No | `[proposed addition]` |
| 14 | `batch` | ESP32 → PC | wrapper | Yes | `[proposed addition]` |
| 15 | `ack` | PC → ESP32 | — | — | `[spec §12.1]` |
| 16 | `nack` | PC → ESP32 | — | — | `[spec §12.1]` |

Seven of these are named in specification §12.1. Nine are **proposed additions** and are not in §12.1.

---

### 3.3 `hello` — ESP32 → PC, capability handshake

Sent once after the connection opens, before any other message.

| Field | Type | Required | Notes |
|---|---|---|---|
| `firmware_version` | string | Yes | Identifies the running firmware build. *(PROPOSED: dotted string)* |
| `protocol_versions_supported` | array of string | Yes | Versions the firmware can speak. *(PROPOSED: list of `"MAJOR.MINOR.PATCH"`)* |
| `boot_id` | string | Yes | Duplicated in the payload for convenience; the envelope value is authoritative. *(spec-derived)* |
| `station_count` | integer | Yes | Always 16 in this design. *(PROPOSED: `16`)* |
| `channel_count` | integer | Yes | Always 64 in this design. *(PROPOSED: `64`)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "hello",
  "message_id": "esp32-01:<boot_id>:1",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 1,
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "firmware_version": "<string>",
    "protocol_versions_supported": ["..."],
    "boot_id": "<boot_id>",
    "station_count": 16,
    "channel_count": 64
  }
}
```

---



### 3.4 `live_state` — ESP32 → PC, 1 Hz, non-durable

**Not stored. Not acknowledged.** No `record_id`. No historical row is created (§12.3: no per-second historical records).

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_time` | integer | Yes | UTC epoch ms; the canonical name (§11.6). *(spec-derived)* |
| `event_time_valid` | integer | Yes | `0` or `1`; invariant `event_time IS NULL ⇔ event_time_valid = 0` (§11.3). *(spec-derived)* |
| `stations` | array | Yes | One entry per station; each carries `station_id` and a `nozzles` array. *(PROPOSED: one entry per station, stations 1–16)* |
| `stations[].station_id` | integer | Yes | Station number 1–16. *(PROPOSED)* |
| `stations[].nozzles` | array | Yes | One entry per nozzle (2 per station). *(PROPOSED)* |
| `stations[].nozzles[].nozzle_id` | integer | Yes | Nozzle index within the station. *(PROPOSED: `1` or `2`)* |
| `stations[].nozzles[].raw_pressure_voltage` | number | Yes | **Raw, never modified.** *(spec-derived, §4.2)* |
| `stations[].nozzles[].raw_temperature_voltage` | number | Yes | **Raw, never modified.** *(spec-derived, §4.2)* |
| `stations[].nozzles[].converted_pressure` | number or null | Yes | Converted pressure in bar; `null` when unconfigured, out-of-range or invalid. **Never `0`** as a substitute for null. *(spec-derived, §6.3, D-D12)* |
| `stations[].nozzles[].converted_temperature` | number or null | Yes | Converted temperature in °C; `null` under the same conditions. **Never `0`** as a substitute for null. *(spec-derived, §6.3, D-D12)* |
| `stations[].nozzles[].channel_state` | string | Yes | Exactly one of `unconfigured`, `valid`, `out_of_range`. *(spec-derived, §8.1)* |
| `invalid_channel_count_now` | integer | Yes | Instantaneous, live-only, **non-durable**, channel-counting — not a per-sample record. **DR-07-C1.** *(spec-derived)* |
| `volatile_loss_counter` | integer | Yes | Temporary overwrite counter per **DR-25.8**; **volatile** under **D-D9 Option C**. *(PROPOSED: non-negative integer, resets on reboot)* |
| `data_loss_pending` | boolean | Yes | Flag that unsurfaced loss exists and has not yet been reported as `data_loss`. *(PROPOSED: `true` or `false`)* |
| `journal_pressure_indicator` | boolean | Yes | Whether the record store is nearing capacity. The **threshold is OPEN (D-D6)**; this message must not assert a threshold value. *(PROPOSED: `true` or `false`; threshold OPEN — D-D6)* |

**The field set above is required-in-schema. The packing structure — array layout, nesting, flattening, encoding — remains OPEN** and is **not** decided by this contract. *(OPEN — packing)*

**`volatile_loss_counter`** is **temporary** in this draft; whether it becomes durable is **OPEN** (D-D9 Option C). `data_loss_pending` is a flag only and carries no count.

**Station simultaneity is unresolved.** Whether all 16 stations appear in one message or are split is listed in §8. *(OPEN — HW-02, HW-03)*

```json
{
  "protocol_version": "1.0.0",
  "type": "live_state",
  "message_id": "esp32-01:<boot_id>:2",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 2,
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "event_time": 0,
    "event_time_valid": 1,
    "stations": [
      {
        "station_id": 1,
        "nozzles": [
          {
            "nozzle_id": 1,
            "raw_pressure_voltage": 0,
            "raw_temperature_voltage": 0,
            "converted_pressure": null,
            "converted_temperature": null,
            "channel_state": "unconfigured"
          }
        ]
      }
    ],
    "invalid_channel_count_now": 0,
    "volatile_loss_counter": 0,
    "data_loss_pending": false,
    "journal_pressure_indicator": false
  }
}
```

---

### 3.5 `cycle_summary` — ESP32 → PC, durable

One record per completed cycle. Aggregation principle: **one counter value per cycle, never one record per sample** (§7.3).

**Per-nozzle fields** (each nozzle reports independently; 2 nozzles per station):

`valid_samples_temperature` and `temp_conversion_configured` are **different kinds of value and must not be conflated.** `valid_samples_temperature` is a **three-state counter** — `NULL` (conversion unconfigured, not measured), `0` (measured, none valid), or `n ≥ 1`. `temp_conversion_configured` is a **two-state boolean** — `false` (unconfigured) or `true` (configured). Per §6.3, collapsing `NULL` and `0` is prohibited: *"not measured"* and *"measured as zero"* are different facts.

| Field | Type | Required | Notes |
|---|---|---|---|
| `nozzle_id` | integer | Yes | Nozzle index within the station. *(PROPOSED: `1` or `2`)* |
| `valid_samples_pressure` | integer or null | Yes | Count of acquisition passes in which that nozzle's pressure was valid. The general "NULL, not 0" rule is stated at spec §6.5. Whether NULL applies specifically when pressure conversion is unconfigured is **OPEN** — DR-27 explicitly leaves this undecided. *(spec-derived, §6.1, §6.5; NULL-when-unconfigured is OPEN — DR-27)* |
| `valid_samples_temperature` | integer or null | Yes | **Three-state:** `null` = conversion unconfigured; `0` = measured, none valid; `n≥1` = one or more valid. Collapsing `null` and `0` is **prohibited**. *(spec-derived, §6.3, D-D12)* For pressure, the equivalent NULL-when-unconfigured question is **OPEN** — see the `valid_samples_pressure` row. |
| `temp_conversion_configured` | boolean | Yes | True when this channel's calibration is configured and valid. Per D-D12: `false` when unconfigured; `true` when configured (whether or not any sample was valid). *(spec-derived, D-D12)* |
| `pressure_avg`, `pressure_min`, `pressure_max` | number or null | Yes | Over **valid** samples only; `null` when none exist; never `0`. *(spec-derived, §6.3)* |
| `temperature_avg`, `temperature_min`, `temperature_max` | number or null | Yes | Over **valid** samples only; `null` when none exist; never `0`. *(spec-derived, §6.3)* |

**Cycle-level fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `station_id` | integer | Yes | Station 1–16 that owns this cycle. *(spec-derived, §9.7)* |
| `cycle_start_ms` | integer or null | Yes | Canonical cycle-start name (**DR-02**). *(spec-derived)* |
| `start_time_valid` | integer | Yes | Validity flag for `cycle_start_ms`. **No start-side NULL invariant exists** — that question is **OPEN** (§11.6). *(spec-derived)* |
| `cycle_end_ms` | integer or null | Yes | `null` when the cycle did not end normally. *(spec-derived, §9.5)* |
| `end_time_valid` | integer | Yes | Symmetric end-side invariant: **`end_time_valid = 0` ⇔ `cycle_end_ms IS NULL`**. *(spec-derived, §11.6)* |
| `duration_ms` | integer or null | Yes | `null` when not derivable. *(spec-derived, §9.4)* |
| `duration_basis` | string or null | Yes | Only `'null'`, `'calendar'`, `'uptime_same_boot'` (**DR-03**). Bidirectional invariant **DR-03b**: `duration_ms IS NULL ⇔ duration_basis = 'null'`. No other value may appear. *(spec-derived)* |
| `faulted_channel_count` | integer | Yes | Cumulative count of distinct channels with ≥1 `out_of_range` condition in the cycle; reset at cycle start. **DR-07-C2.** *(spec-derived)* |
| `fault_transition_count` | null | Yes | **`null` in this draft, always.** **DR-07-C3 is OPEN**; §7.4 forbids implementing it and requires `null`, because `0` would assert a measurement claim never made. *(spec-derived, DR-07-C3)* |
| `valid_samples_pressure_both_nozzles` | integer or null | Yes | Count of acquisition passes in which **both** nozzles' pressure was valid **in the same pass**. Counted **directly from same-pass validity**, never derived as `min()` of the per-nozzle totals — a `min()` is a proxy, not a measurement. `null` in this draft. *(spec-derived, §6.4; OPEN — HW-02, HW-03)* |
| `valid_samples_temperature_both_nozzles` | integer or null | Yes | Same, for temperature. `null` in this draft. *(spec-derived, §6.4; OPEN — HW-02, HW-03)* |

**`record_id` is the cycle's stable identifier.** It is assigned once when the cycle record is created and is the deduplication key on replay (§12.2).

**Station simultaneity is unresolved.** HW-02 and HW-03 remain **OPEN**, so the two `*_both_nozzles` counters stay `null` and no simultaneity claim may be made.

```json
{
  "protocol_version": "1.0.0",
  "type": "cycle_summary",
  "message_id": "esp32-01:<boot_id>:3",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 3,
  "record_seq": 1,
  "record_id": "esp32-01:<boot_id>:1",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "station_id": 1,
    "nozzles": [
      {
        "nozzle_id": 1,
        "valid_samples_pressure": 0,
        "valid_samples_temperature": null,
        "temp_conversion_configured": false,
        "pressure_avg": null,
        "pressure_min": null,
        "pressure_max": null,
        "temperature_avg": null,
        "temperature_min": null,
        "temperature_max": null
      },
      {
        "nozzle_id": 2,
        "valid_samples_pressure": 0,
        "valid_samples_temperature": null,
        "temp_conversion_configured": false,
        "pressure_avg": null,
        "pressure_min": null,
        "pressure_max": null,
        "temperature_avg": null,
        "temperature_min": null,
        "temperature_max": null
      }
    ],
    "cycle_start_ms": 0,
    "start_time_valid": 1,
    "cycle_end_ms": 0,
    "end_time_valid": 1,
    "duration_ms": 0,
    "duration_basis": "calendar",
    "faulted_channel_count": 0,
    "fault_transition_count": null,
    "valid_samples_pressure_both_nozzles": null,
    "valid_samples_temperature_both_nozzles": null
  }
}
```

**Note:** the example above shows `valid_samples_pressure: 0` alongside `temp_conversion_configured: false` for illustration only. Whether `valid_samples_pressure` becomes `null` when pressure conversion is unconfigured is **OPEN — DR-27**. The `0` shown is **not** an assertion of that answer.

---


### 3.6 `alarm_event` — ESP32 → PC, durable

**Alarms are recorded only and never stop or abort a cycle (DR-25.3, D-C3).**

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_time` | integer | Yes | UTC epoch ms. *(spec-derived)* |
| `event_time_valid` | integer | Yes | `0` or `1`. *(spec-derived)* |
| `channel_id` | integer | Yes | Channel that raised the condition. *(spec-derived, §5)* |
| `station_id` | integer | Yes | Station 1–16. *(spec-derived, §5)* |
| `nozzle_id` | integer | Yes | Nozzle 1–2. *(PROPOSED: `1` or `2`)* |
| `alarm_state` | string | Yes | Alarm transition vocabulary resolved by **D-C1** — Alarm-to-Warning transitions return the software state and are logged as events. *(spec-derived, DR-25.1)* |
| `physical_output_state` | string | Yes | Stays energized until the shared reset input is used; software states follow measured values independently (**D-C2 / DR-25.2**). *(spec-derived)* |
| `raw_voltage` | number | Yes | Raw voltage of the reading. **Never modified.** *(spec-derived, §4.2)* |

Out-of-range / invalid sensor data is a **data-validity condition plus a system event** — no physical alarm, no escalation (**D-C5 / DR-25.5**).

```json
{
  "protocol_version": "1.0.0",
  "type": "alarm_event",
  "message_id": "esp32-01:<boot_id>:4",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 4,
  "record_seq": 2,
  "record_id": "esp32-01:<boot_id>:2",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "event_time": 0,
    "event_time_valid": 1,
    "channel_id": 1,
    "station_id": 1,
    "nozzle_id": 1,
    "alarm_state": "<string>",
    "physical_output_state": "<string>",
    "raw_voltage": 0
  }
}
```

---

### 3.7 `system_event` — ESP32 → PC, durable

Device-level events. The **event vocabulary is OPEN** and is not invented here.

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_time` | integer | Yes | UTC epoch ms. *(spec-derived)* |
| `event_time_valid` | integer | Yes | `0` or `1`. *(spec-derived)* |
| `event_code` | string | Yes | Identifies the event. **The complete code list is not defined in the specification and is not invented here.** *(OPEN)* |
| `detail` | object | No | Event-specific context. *(OPEN)* |

`clock_step_detected` is one such event: it carries pre-step values plus monotonic uptime (§11.4).

```json
{
  "protocol_version": "1.0.0",
  "type": "system_event",
  "message_id": "esp32-01:<boot_id>:5",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 5,
  "record_seq": 3,
  "record_id": "esp32-01:<boot_id>:3",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "event_time": 0,
    "event_time_valid": 1,
    "event_code": "<string>",
    "detail": "..."
  }
}
```

---


### 3.8 `settings_change` — either → other, durable (history)

Settings are persisted in NVS and survive reboot; changes are recorded in settings history (§15.3).

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_time` | integer | Yes | UTC epoch ms of the change. *(spec-derived)* |
| `event_time_valid` | integer | Yes | `0` or `1`. *(spec-derived)* |
| `change_source` | string | Yes | Whether the change arrived over the config channel or from the ESP32 settings page. *(PROPOSED: `"pc"` or `"device"`)* |
| `settings_affected` | array of string | Yes | Which settings changed. *(OPEN)* |
| `old_value`, `new_value` | object | No | Before/after values. Passwords and credentials are **never** transmitted or logged. *(OPEN)* |

Validation happens **on the ESP32 before saving**: rejection of empty, non-numeric, `NaN`, `Infinity`, and a range whose two points are equal (§15.3).

```json
{
  "protocol_version": "1.0.0",
  "type": "settings_change",
  "message_id": "esp32-01:<boot_id>:6",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 6,
  "record_seq": 4,
  "record_id": "esp32-01:<boot_id>:4",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "event_time": 0,
    "event_time_valid": 1,
    "change_source": "pc",
    "settings_affected": ["..."],
    "old_value": "...",
    "new_value": "..."
  }
}
```

---

### 3.9 `interrupted_cycle` — ESP32 → PC, durable

**The representation rule is established; the detection rule is blocked.** Per §9.5(a), if and when an interruption has been established: `status = 'interrupted'`, `cycle_end_ms = NULL`, `end_time_valid = 0`, `duration_ms = NULL`, `duration_basis = 'null'`. **No fabricated end time or duration. No completed record is ever synthesised from an interrupted cycle.**

Per §9.5(b), **D-D2 is OPEN — NOT APPROVED**: no detection mechanism may be implemented and this representation cannot yet be exercised. D-D2 has a *direction only* (marker at cycle start and cycle end) per **DR-25.7**; marker-clear timing, completion ordering and all detection details remain **OPEN**.

| Field | Type | Required | Notes |
|---|---|---|---|
| `station_id` | integer | Yes | Station 1–16 that owns the interrupted cycle. *(spec-derived, §9.7)* |
| `status` | string | Yes | Always `"interrupted"` for this message (§9.5a). *(spec-derived)* |
| `cycle_start_ms` | integer or null | Yes | Canonical start name (**DR-02**). *(spec-derived)* |
| `start_time_valid` | integer | Yes | **No start-side NULL invariant exists** — **OPEN** (§11.6). *(spec-derived)* |
| `cycle_end_ms` | null | Yes | **Always `NULL`** for an interrupted cycle. *(spec-derived, §9.5a)* |
| `end_time_valid` | integer | Yes | **Always `0`**, matching `cycle_end_ms IS NULL` (§11.6). *(spec-derived)* |
| `duration_ms` | null | Yes | **Always `NULL`**. *(spec-derived, §9.5a)* |
| `duration_basis` | string | Yes | **Always `'null'`**, satisfying the DR-03b pairing. *(spec-derived, DR-03b)* |
| `detection_basis` | string | No | **Not decided.** Detection is blocked by D-D2; no value may be asserted. *(OPEN — D-D2)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "interrupted_cycle",
  "message_id": "esp32-01:<boot_id>:7",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 7,
  "record_seq": 5,
  "record_id": "esp32-01:<boot_id>:5",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "station_id": 1,
    "status": "interrupted",
    "cycle_start_ms": 0,
    "start_time_valid": 1,
    "cycle_end_ms": null,
    "end_time_valid": 0,
    "duration_ms": null,
    "duration_basis": "null",
    "detection_basis": "<string>"
  }
}
```

---


### 3.10 `data_loss` — ESP32 → PC, durable

Emitted so that **loss is never silent** (§13.2 PER-05).

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_time` | integer | Yes | UTC epoch ms. *(spec-derived)* |
| `event_time_valid` | integer | Yes | `0` or `1`. *(spec-derived)* |
| `overwrite_priority` | string | Yes | **DR-25.8 priority order: `system_event` records are overwritten FIRST; `cycle_summary` and `alarm_event` records are overwritten LAST.** *(spec-derived, DR-25.8)* |
| `records_overwritten` | integer | Yes | How many durable records were evicted. *(PROPOSED: non-negative integer)* |
| `overwrite_counters_durable` | boolean | Yes | **In this draft the overwrite counters are VOLATILE (D-D9 Option C).** Whether they become durable is **OPEN**. *(OPEN — D-D9 Option C)* |
| `evicted_record_ids` | null | Yes | **No evicted `record_id`s are included in this draft.** Whether to include them is **OPEN**. *(OPEN)* |

Durable journal capacity is "whatever internal flash allows (no time target)"; when full, new records overwrite the oldest (**DR-25.8**). This is a direction only and does **not** approve any size, threshold, or D-D6 / D-D8 / HW-13 figure.

```json
{
  "protocol_version": "1.0.0",
  "type": "data_loss",
  "message_id": "esp32-01:<boot_id>:8",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 8,
  "record_seq": 6,
  "record_id": "esp32-01:<boot_id>:6",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "event_time": 0,
    "event_time_valid": 1,
    "overwrite_priority": "<string>",
    "records_overwritten": 0,
    "overwrite_counters_durable": false,
    "evicted_record_ids": null
  }
}
```

---

### 3.11 `raw_voltage_record` — ESP32 → PC, durable

**DR-25.9:** for each entry of a channel into `out_of_range`, **ONE** durable raw-voltage record (the first sample) plus the sample count is kept — **never one record per sample.**

| Field | Type | Required | Notes |
|---|---|---|---|
| `event_time` | integer | Yes | UTC epoch ms of the **first** sample of the occurrence. *(spec-derived)* |
| `event_time_valid` | integer | Yes | `0` or `1`. *(spec-derived)* |
| `channel_id` | integer | Yes | Channel that entered `out_of_range`. *(spec-derived, §5)* |
| `raw_voltage` | number | Yes | **Never modified.** *(spec-derived, §4.2, DR-04A)* |
| `sample_count` | integer | Yes | Number of samples in the occurrence. **Count finalization is OPEN** — DR-25.9 leaves it unresolved. *(OPEN — DR-25.9)* |
| `conversion_result` | null | Yes | **`NULL`**, never `0`, for an out-of-range reading. *(spec-derived, §6.3, D-D12)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "raw_voltage_record",
  "message_id": "esp32-01:<boot_id>:9",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 9,
  "record_seq": 7,
  "record_id": "esp32-01:<boot_id>:7",
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "event_time": 0,
    "event_time_valid": 1,
    "channel_id": 1,
    "raw_voltage": 0,
    "sample_count": 0,
    "conversion_result": null
  }
}
```

---


### 3.12 `time_sync` — PC → ESP32

The **PC is the sole time reference** (**DR-17**, D-D7 approved). There is no hardware RTC.

PC-originated: this message carries no `boot_id`, `seq` or `ts_sent_*`, because those describe an ESP32 boot session. The applicable envelope fields for a PC-originated message are **OPEN** (see §8); the example below shows only `protocol_version`, `type` and `payload`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `pc_time_ms` | integer | Yes | The PC's current UTC epoch ms, offered as the time reference. *(spec-derived, DR-17)* |
| `pc_time_valid` | integer | Yes | `0` or `1`. *(PROPOSED: `0` or `1`)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "time_sync",
  "payload": {
    "pc_time_ms": 0,
    "pc_time_valid": 1
  }
}
```

---

### 3.13 `time_sync_reply` — ESP32 → PC

| Field | Type | Required | Notes |
|---|---|---|---|
| `clock_offset_ms` | integer | Yes | Offset against the PC clock. **DIAGNOSTIC ONLY — never applied retroactively to already-recorded times** (§11.4). *(spec-derived)* |
| `uptime_ms` | integer | Yes | Monotonic uptime, used as the durable basis for same-boot duration. *(spec-derived, §9.4)* |

**The clock offset is diagnostic only and is never used to rewrite stored event times.** Stored event times are **not** rewritten on a clock step (§11.4).

```json
{
  "protocol_version": "1.0.0",
  "type": "time_sync_reply",
  "message_id": "esp32-01:<boot_id>:10",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 10,
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "clock_offset_ms": 0,
    "uptime_ms": 0
  }
}
```

---

### 3.14 `config_set` — PC → ESP32

Carries calibration, polarity and hysteresis/debounce settings. **Authentication is not decided** and is listed in §8.

| Field | Type | Required | Notes |
|---|---|---|---|
| `config_kind` | string | Yes | Which configuration group is being set. *(PROPOSED: `"calibration"`, `"polarity"`, `"debounce"`)* |
| `request_id` | string | No | Correlates this request with its `config_result`. **Optional on read** so existing contract examples remain valid; when present it is **echoed unchanged** by `config_result`. *(PROPOSED: `"{device_id}:{boot_id}:{seq}"` of the request)* |
| `channel_id` | integer | No | Target channel for per-channel settings. **Every one of the 64 channels is configured separately** (DR-27). *(spec-derived, DR-27)* |
| `conversion_mode` | string | No | **LINEAR** (two points) or **NON-LINEAR** (five points, piecewise-linear). Polynomial, scale/offset and equation-based (NTC) conversions are **DEFERRED**. *(spec-derived, DR-27)* |
| `points` | array | No | Calibration points in **ADC-input volts (0–3.3 V, after any divider)**. Must be finite with distinct, ascending voltages. **No default or example values are given here.** *(spec-derived, DR-27; values OPEN)* |
| `valid_window` | object | No | Optional per-channel valid-voltage window; default 0–3.3 V. *(spec-derived, DR-27)* |
| `polarity` | string | No | Active level of station inputs, alarm output and reset input; configurable per input or globally — **which granularity is OPEN**. *(OPEN — DR-28)* |
| `hysteresis`, `debounce` | number | No | **D-C4 is APPROVED (DR-25.4):** hysteresis and debounce are **configurable** on the ESP32 settings page, and the approved **default is no delay and no hysteresis (immediate evaluation)**. **This contract states no numeric default value and no numeric range** — those remain an implementation choice to be recorded in the firmware, not here. Interaction with the undecided **DR-07-C3** remains **OPEN**. *(spec-derived, DR-25.4; interaction with DR-07-C3 OPEN)* |

**Validation on the ESP32 before saving:** reject empty, non-numeric, `NaN`, `Infinity`, wrong type, out-of-range, and any ordering violation. Invalid settings must never cause a divide-by-zero or an invalid output (§15.3).

```json
{
  "protocol_version": "1.0.0",
  "type": "config_set",
  "payload": {
    "config_kind": "<string>",
    "channel_id": 1,
    "conversion_mode": "<string>",
    "points": ["..."],
    "valid_window": "...",
    "polarity": "<string>",
    "hysteresis": 0,
    "debounce": 0
  }
}
```

---


### 3.15 `config_result` — ESP32 → PC

| Field | Type | Required | Notes |
|---|---|---|---|
| `request_id` | string | No | **Echoes the `request_id` of the originating `config_set`, unchanged.** Absent when the request carried none. *(PROPOSED)* |
| `config_id` | string | Yes | Correlates the result with its `config_set`. *(PROPOSED: `"{device_id}:{boot_id}:{seq}"` of the originating request)* |
| `accepted` | boolean | Yes | Whether the settings were accepted. *(PROPOSED: `true` or `false`)* |
| `rejected_fields` | array of string | Yes | Which fields failed validation. *(PROPOSED: list of field names)* |
| `rejection_reason` | string | No | **The rejection vocabulary is not defined in the specification and is not invented here.** *(OPEN)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "config_result",
  "message_id": "esp32-01:<boot_id>:11",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 11,
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "config_id": "esp32-01:<boot_id>:11",
    "accepted": false,
    "rejected_fields": ["..."],
    "rejection_reason": "<string>"
  }
}
```

---

### 3.16 `batch` — ESP32 → PC, transport wrapper

**A `batch` carries multiple durable records, each with its own `record_id`. The batch itself is a transport wrapper and has no `record_id` of its own.**

Each contained record is one of `cycle_summary`, `alarm_event`, `system_event`, `settings_change`, `interrupted_cycle`, `data_loss` or `raw_voltage_record`, complete with its own envelope fields — including its own `record_id`, `boot_id` and `seq`.

Each element of `records` is a full message object with its own envelope (`protocol_version`, `type`, `message_id`, `device_id`, `boot_id`, `seq`, `record_id`, `ts_sent_ms`, `ts_sent_valid`, `payload`) — **never a bare payload.** In particular, each nested record carries its **own `message_id`**, distinct from the batch's outer `message_id`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `records` | array of object | Yes | The durable records. **Each element carries its own `record_id`.** *(spec-derived, §12.2)* |
| `record_count` | integer | Yes | Number of contained records. *(PROPOSED: non-negative integer)* |
| `has_more` | boolean | Yes | Whether further records are queued for later batches. *(PROPOSED: `true` or `false`)* |
| `record_id` | — | **No** | **The batch has no `record_id` of its own.** Deduplication operates on the contained records, never on the wrapper. *(spec-derived, §12.2)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "batch",
  "message_id": "esp32-01:<boot_id>:12",
  "device_id": "esp32-01",
  "boot_id": "<boot_id>",
  "seq": 12,
  "ts_sent_ms": 0,
  "ts_sent_valid": 1,
  "payload": {
    "records": [
      {
        "protocol_version": "1.0.0",
        "type": "cycle_summary",
        "message_id": "esp32-01:<boot_id>:13",
        "device_id": "esp32-01",
        "boot_id": "<boot_id>",
        "seq": 13,
        "record_seq": 8,
        "record_id": "esp32-01:<boot_id>:8",
        "ts_sent_ms": 0,
        "ts_sent_valid": 1,
        "payload": {
          "station_id": 1,
          "nozzles": ["..."],
          "cycle_start_ms": 0,
          "start_time_valid": 1,
          "cycle_end_ms": 0,
          "end_time_valid": 1,
          "duration_ms": 0,
          "duration_basis": "calendar",
          "faulted_channel_count": 0,
          "fault_transition_count": null,
          "valid_samples_pressure_both_nozzles": null,
          "valid_samples_temperature_both_nozzles": null
        }
      }
    ],
    "record_count": 1,
    "has_more": false
  }
}
```

---

### 3.17 `ack` — PC → ESP32

Sent by the PC **only after** the record is committed to SQLite (§12.2). PC-originated: no `boot_id`, `seq` or `ts_sent_*`; those describe an ESP32 boot session and the applicable PC-side envelope is **OPEN** (§8).

| Field | Type | Required | Notes |
|---|---|---|---|
| `acked_record_id` | string | One of the two | Acknowledges a **single** `record_id`. Used when a `batch` carried exactly one record, or when only one record is being acknowledged. **Never present together with `acked_record_ids`.** *(spec-derived, §12.2)* |
| `acked_record_ids` | array of string | One of the two | Acknowledges **every** `record_id` contained in a `batch`, by array. Used for batch replies. **Never present together with `acked_record_id`.** Exactly one of the two fields is present on any `ack`. *(PROPOSED)* |
| `acked_message_id` | string | No | Transport-level correlation of the specific message. *(PROPOSED: `"{device_id}:{boot_id}:{seq}"` of the acknowledged message)* |
| `committed` | boolean | Yes | Whether the commit succeeded; a failed write is **never** acknowledged as accepted (§12.3). *(spec-derived, §12.3)* |

**Exactly one of `acked_record_id` / `acked_record_ids` is present on every `ack`.** A `batch` carrying N records is answered by a single `ack` with `acked_record_ids` of length N — **not** by N separate `ack` messages.

```json
{
  "protocol_version": "1.0.0",
  "type": "ack",
  "payload": {
    "acked_record_id": "<record_id>",
    "acked_message_id": "<string>",
    "committed": true
  }
}
```

---

### 3.18 `nack` — PC → ESP32

PC-originated: no `boot_id`, `seq` or `ts_sent_*`; the applicable PC-side envelope is **OPEN** (§8).

| Field | Type | Required | Notes |
|---|---|---|---|
| `nacked_record_id` | string | Yes | The `record_id` being rejected. *(spec-derived, §12.1)* |
| `nacked_message_id` | string | No | Transport-level correlation. *(PROPOSED: `"{device_id}:{boot_id}:{seq}"` of the rejected message)* |
| `reason` | string | Yes | Rejection reason. **The reason vocabulary is not defined in the specification and is not invented here.** *(OPEN)* |
| `retryable` | boolean | Yes | Whether the ESP32 may retry. *(PROPOSED: `true` or `false`)* |

```json
{
  "protocol_version": "1.0.0",
  "type": "nack",
  "payload": {
    "nacked_record_id": "<record_id>",
    "nacked_message_id": "<string>",
    "reason": "<string>",
    "retryable": false
  }
}
```

---


## 4. Reliability rules (structure only — values OPEN)

The **structure** of each rule is established by the specification. **No numeric value is chosen here.**

| Rule | Structure | Values | Source / status |
|---|---|---|---|
| In-flight batches | **One unacknowledged batch in flight** at a time | *(PROPOSED)* | Proposed here; **not** a specification requirement |
| Retransmit on reconnect | Unacknowledged durable records are retransmitted after reconnect | **established** | §12.2, ARC-05 |
| Retry limit | Maximum retransmission attempts per record | **OPEN** | Not decided |
| Timeout | Wait before a retransmission is considered due | **OPEN** | Not decided |
| Backoff | Wait strategy between retries | **OPEN** | ARC-05 establishes backoff exists; parameters **OPEN** |
| Duplicate handling | **Idempotent by `record_id`** — a replay must not create a second row | **established** | §12.2 |
| Commit-before-ACK | The PC **commits to SQLite in a transaction, then sends `ack`**; it never acknowledges before commit | **established** | §12.2 |
| Delete-after-ACK | The ESP32 **deletes a record only after a valid matching `ack`** | **established** | §12.2, §12.3 |

**Additional established constraints, restated unchanged:**

1. A record is eligible for acknowledged transmission **only after a durable write** (§12.3).
2. **A failed durable write must never be represented as successfully accepted** (§12.3).
3. `live_state` requires **no** historical record and **no** individual acknowledgement (§12.2).
4. **No per-second historical ADC records** (§12.3).
5. Measurement and alarm logic must keep working **without the PC** (§2.5, ARC-06); buffering parameters are **OPEN**.
6. **Every journal loss is counted and visibly surfaced; no silent discard** (§13.2 PER-05, DR-25.8).

---

## 5. Time rules

These rules restate the specification. They are **not** changed by this draft.

| Rule | Statement | Source / status |
|---|---|---|
| Timezone | All timestamps are **UTC milliseconds**. | established |
| No fabrication | A timestamp is **never invented**. When the ESP32 cannot vouch for a moment, `event_time` is `NULL` and `event_time_valid` is `0`. | §11.3 |
| Validity invariant | `event_time IS NULL ⇔ event_time_valid = 0`. | §11.3 |
| PC receive time | **`pc_received_ms` never replaces `event_time`.** It never appears in an event-time column. | AC-05, §11.5 |
| Time authority | **The PC is the sole time reference. There is no hardware RTC.** | **DR-17** (D-D7 approved) |
| Offset handling | `clock_offset_ms` is **diagnostic only** and is **never applied retroactively** to already-recorded times. | §11.4 |
| Clock steps | A backward step must **never** produce a negative duration; stored event times are **not** rewritten. | §11.4, CS-01 Policy B |
| Boot scoping | Uptime reasoning is scoped by `boot_id`; `uptime_same_boot` is only valid within one boot. | §9.4 |
| Duration basis | `duration_basis` accepts **only** `'null'`, `'calendar'`, `'uptime_same_boot'`, with the bidirectional invariant `duration_ms IS NULL ⇔ duration_basis = 'null'`. | **DR-03**, **DR-03b** |

**The deprecated spellings `time` and `time_valid` must never appear as a field name.** They denote `event_time` and `event_time_valid` respectively (§11.6).

---

## 6. Versioning and validation

| Topic | Rule | Source / status |
|---|---|---|
| Unknown **major** version | A message with an unknown major `protocol_version` is rejected with a logged `nack` and **causes no state change**. | §12.1 — **established** |
| Unknown **minor** version | Exact handling is not decided. | **OPEN** |
| Version value | The concrete `protocol_version` string to adopt is not decided. | **OPEN** |
| Type and value validation | Reject **empty**, **non-numeric**, `NaN`, **`Infinity`**, wrong type, out-of-range values and invalid ordering. | §15.3 — **established** |
| Calibration points | Points must be finite with distinct, ascending voltages in **ADC-input volts (0–3.3 V)**. | DR-27 — **established** |
| Division safety | Invalid settings must never cause a divide-by-zero or an invalid output. | §15.3 — **established** |
| Invalid settings | Invalid settings must never be saved. | §15.3 — **established** |

**Corrupt or unparseable message handling is OPEN** and is listed in §8.

---


## 7. Traceability

| Item | Spec section | Decision ID |
|---|---|---|
| `hello` | — (not in §12.1) | `[proposed addition]` |
| `live_state` | §12.1 | `[spec §12.1]` |
| `cycle_summary` | §12.1 | `[spec §12.1]` |
| `alarm_event` | §12.1 | `[spec §12.1]`; D-C1/2/3/5 = DR-25.1–.3, DR-25.5 |
| `system_event` | §12.1 | `[spec §12.1]` |
| `settings_change` | §12.1, §15.3 | `[spec §12.1]`; D-D12, DR-22 |
| `interrupted_cycle` | §9.5 | `[proposed addition]`; D-D2 direction only = DR-25.7 |
| `data_loss` | §13.2 PER-05, §12.5 | `[proposed addition]`; DR-25.8, D-D9 Option C |
| `raw_voltage_record` | §4.2, §6.3 | `[proposed addition]`; DR-04A, DR-25.9 |
| `time_sync` | §11.4 | `[proposed addition]`; D-D7 = DR-17 |
| `time_sync_reply` | §11.4, §9.4 | `[proposed addition]`; D-D7 = DR-17 |
| `config_set` | §15.3, §6.2 | `[proposed addition]`; DR-27, DR-28, DR-25.4 |
| `config_result` | §15.3 | `[proposed addition]` |
| `batch` | §12.2 | `[proposed addition]` |
| `ack` | §12.1, §12.2 | `[spec §12.1]` |
| `nack` | §12.1 | `[spec §12.1]` |
| Envelope — `boot_id` | §11.6 | canonical name (spec-derived) |
| Envelope — `record_id` | §12.2 | deduplication key (spec-derived) |
| Envelope — `protocol_version`, `message_id`, `device_id`, `seq`, `ts_sent_ms`, `ts_sent_valid` | — | PROPOSED / OPEN |
| Envelope — PC-originated message fields | — | **OPEN** |
| Envelope — deprecated aliases forbidden | §11.6 | canonical naming (spec-derived) |
| One batch in flight | — | PROPOSED |
| Retransmit on reconnect | §12.2, ARC-05 | established |
| Retry limit / timeout / backoff | ARC-05 | **OPEN** |
| Duplicate handling — idempotent by `record_id` | §12.2 | established |
| Commit-before-ACK | §12.2 | established |
| Delete-after-ACK | §12.2, §12.3 | established |
| Durable-write-before-transmit | §12.3 | established |
| UTC milliseconds | §11.3 | established |
| No fabricated timestamps | §11.3 | established |
| `event_time` / `event_time_valid` invariant | §11.3 | established |
| `pc_received_ms` never replaces `event_time` | §11.5, AC-05 | established |
| PC is sole time reference | §11.4 | **DR-17** |
| `clock_offset_ms` diagnostic only | §11.4 | established |
| No negative duration on backward step | §11.4, §9.4 | CS-01 Policy B |
| `duration_basis` value set | §9.4 | **DR-03**, **DR-03b** |
| Unknown major version → `nack`, no state change | §12.1 | established |
| `NaN` / `Infinity` / empty / wrong type rejected | §15.3 | established |
| Unknown minor version | — | **OPEN** |
| Per-channel calibration ownership | §6.2, §6.6 | **DR-27** (supersedes DR-08 Q1–Q3) |
| `faulted_channel_count` semantics | §7.1a | **DR-07-C2** |
| `invalid_channel_count_now` semantics | §7.1a | **DR-07-C1** |
| `fault_transition_count` = `NULL` | §7.4 | **DR-07-C3 OPEN** |
| Out-of-range is a validity condition + system event | §4.5, §6.5 | **DR-25.5** (D-C5) |
| Overwrite-oldest with counted loss | §12.5, §13.2 | **DR-25.8** |
| One raw-voltage record per `out_of_range` entry | §4.2 | **DR-25.9** |
| Polarity configuration | §5.1, §15.5 | **DR-28** |
| Settings authentication | §15.5 | **DR-22** |
| Whether NULL-vs-0 extends to pressure counters | §6.3, §6.5 | **OPEN — DR-27** |

---


## 8. Open questions

**None of these is decided by this draft. A default must not be invented.**

| # | Question | Status |
|---|---|---|
| 1 | Concrete `protocol_version` value to adopt. | **OPEN** |
| 2 | Handling of an unknown **minor** version. | **OPEN** |
| 3 | `nack` reason vocabulary. | **OPEN — DECISION REQUIRED** |
| 4 | Retry limit, timeout and backoff values. | **OPEN — DECISION REQUIRED** |
| 5 | PC → ESP32 configuration-channel authentication mechanism. | **OPEN — DECISION REQUIRED** |
| 6 | Credential storage mechanism (settings page uses username + password; storage is undecided). | **OPEN — DECISION REQUIRED** |
| 7 | Transport encryption. | **OPEN** |
| 8 | `clock_offset_ms` reporting cadence. | **OPEN** |
| 9 | Whether `interrupted_cycle` is a separate message or a `cycle_summary` with `status='interrupted'`. This draft proposes a **separate** message. | **OPEN** |
| 10 | Whether `data_loss` includes the `record_id`s of evicted records. This draft includes **none**. | **OPEN** |
| 11 | Whether `live_state` carries all 16 stations in one message or is split. | **OPEN — HW-02, HW-03** |
| 12 | Whether `batch` carries a `record_id` of its own. **This draft resolves it: it does not — it is a pure transport wrapper.** | **resolved — PROPOSED** |
| 13 | Whether `settings_change` is genuinely bidirectional or PC → ESP32 only. | **OPEN** |
| 14 | Content of the `hello` capability list, and whether the firmware version is trusted or must be signed. | **OPEN** |
| 15 | Corrupt or unparseable message handling. | **OPEN — DECISION REQUIRED** |
| 16 | Whether the overwrite counters become durable (D-D9 Option C) rather than volatile. | **OPEN** |
| 17 | `system_event` `event_code` vocabulary. | **OPEN** |
| 18 | Polarity configuration granularity: per input or global. | **OPEN — DR-28** |
| 19 | Whether hysteresis / debounce become configurable (D-C4 is defaults only) and how they interact with the undecided DR-07-C3. | **OPEN** |
| 20 | `raw_voltage_record` `sample_count` finalization (left open by DR-25.9). | **OPEN** |
| 21 | Transport address plan and DHCP behaviour. | **OPEN — D-B2** |
| 22 | Windows network, firewall and adapter configuration. | **OPEN — D-B3** |
| 23 | `config_result` rejection-reason vocabulary. | **OPEN** |
| 24 | **Envelope fields applicable to a PC-originated message** (`time_sync`, `config_set`, `ack`, `nack`). The PC has no `boot_id` and no device-local sequence, so those envelope fields do not apply; what replaces them for correlation is not decided here. | **OPEN** |
| 25 | Whether the D-D12 NULL-vs-0 rule extends to `valid_samples_pressure` when pressure conversion is unconfigured. DR-27 leaves this **OPEN**. | **OPEN — DR-27** |

---

## 9. Non-inference

* This draft **approves nothing beyond its stated Phase 2A-input status**. It is a review artefact.
* This contract is approved as the Phase 2A working input (user decision, 2026-10-05). Gaps 3–8 are resolved during Phase 2A; final approval is a separate task after Phase 2A.
* The gate (§21) also requires the user's **explicit statement that Phase 2A is authorized**; that statement was given with this status change. **D-B4 is MET (0.6.0)**, but a met gate condition is **not** an authorization.
* It creates **no** SQL schema, **no** migration and **no** hardware dependency.
* **Phase 2B and all later phases remain NOT AUTHORIZED.**

---
## 10. Protocol test cases (names and intent only — no code)

**No test is written, executed or claimed to pass.** No implementation exists. These are names and intent, to be implemented only if and when Phase 2A is authorized.

| # | Test case | Intent | Expected result |
|---|---|---|---|
| T-P01 | Round-trip of each message type | Send each of the 16 message types and confirm it parses and is accepted according to its field table. | Every type parses; no field violates its declared type or label. |
| T-P02 | Idempotent replay of a `batch` 100× | Replay the same batch containing the same `record_id`s one hundred times. | **Exactly one row per `record_id`** in SQLite; no duplicates. |
| T-P03 | Unknown protocol major version | Send a message with an unrecognised major `protocol_version`. | A logged `nack` is returned and **no state change occurs**. |
| T-P04 | `NaN` / `Infinity` rejection | Submit settings and payload values containing `NaN`, `Infinity`, empty strings and wrong types. | All are rejected; nothing is saved; no divide-by-zero and no invalid output. |
| T-P05 | Commit-before-ACK ordering | Terminate the PC between the SQLite commit and sending `ack`. | The record is **not** lost and **not** duplicated; it is retransmitted and acknowledged later. |
| T-P06 | Reconnect and retransmit | Drop the connection with unacknowledged durable records outstanding, then reconnect. | Unacknowledged records are retransmitted; no record is lost. |
| T-P07 | `time_sync` offset is diagnostic only | Deliver a `time_sync_reply` carrying a non-zero `clock_offset_ms`. | Already-recorded event times are **not** rewritten; no retroactive adjustment occurs. |
| T-P08 | `config_set` validation | Submit calibration points that are non-finite, duplicated, or not in ascending order. | Rejected by `config_result`; the stored settings are unchanged. |
| T-P09 | One raw-voltage record per `out_of_range` entry | Hold a channel in `out_of_range` across many samples, then leave the state. | **ONE** `raw_voltage_record` per entry into `out_of_range` — **never one per sample** (DR-25.9). |
| T-P10 | Delete-after-ACK | Send a valid `ack` for a durable record. | The ESP32 deletes the record only after the matching `ack`; an unmatched or invalid `ack` deletes nothing. |
| T-P11 | Deprecated aliases rejected | Send a payload using the deprecated spellings instead of the canonical §11.6 names. | Rejected; canonical names only are accepted. |
| T-P12 | `duration_basis` value set | Send a `duration_basis` outside `'null'`, `'calendar'`, `'uptime_same_boot'`. | Rejected; no fourth value is accepted. |
| T-P13 | `duration_ms` / `duration_basis` invariant | Send `duration_ms = null` with `duration_basis != 'null'`, and the reverse. | Both rejected — the **DR-03b** bidirectional invariant holds. |
| T-P14 | Invalid values are `NULL`, never `0` | Produce an out-of-range or unconfigured reading. | The value is `NULL`, **not** `0` and **not** clamped. |
| T-P15 | `fault_transition_count` remains `NULL` | Exercise a fault transition. | The field stays `NULL`; it is never implemented while **DR-07-C3** is open, and never reported as `0`. |

---

---

## 11. Phase 2A gap resolutions (PROPOSED — NOT APPROVED until implemented)

These six gaps were identified in v0.2.3 and are resolved **during Phase 2A**. Each resolution below is **PROPOSED — NOT APPROVED** until the corresponding code exists and is verified. Nothing here creates a SQL schema, a firmware behaviour, or a hardware dependency.

### 11.1 Gap 3 — `config_set` / `config_result` correlation — **PROPOSED**

`config_set` carries an **optional** `request_id`; `config_result` **echoes it unchanged**. Optional-on-read means the v0.2.3 examples remain valid and no existing consumer breaks.

| Field | Message | Required | Note |
|---|---|---|---|
| `request_id` | `config_set` | No | *(PROPOSED: `"{device_id}:{boot_id}:{seq}"` of the request)* |
| `request_id` | `config_result` | No | Echoed unchanged; absent when the request carried none. *(PROPOSED)* |

Rejected alternative: making `request_id` **mandatory**, which would invalidate the existing contract examples.

### 11.2 Gap 4 — hysteresis / debounce wording — **PROPOSED**

**DR-25.4 is APPROVED**: hysteresis and debounce are **configurable**; the default is **no delay, no hysteresis (immediate evaluation)**. The §3.14 wording was corrected accordingly.

**This contract states no numeric default value and no numeric range.** Interaction with the undecided **DR-07-C3** remains **OPEN**. No number was chosen.

### 11.3 Gap 5 — `live_state` mandatory field content — **PROPOSED**

The required-in-schema field set is now fixed in §3.4: `event_time`, `event_time_valid`, `stations[].station_id`, `stations[].nozzles[].nozzle_id`, `raw_pressure_voltage`, `raw_temperature_voltage`, `converted_pressure` (or `null`), `converted_temperature` (or `null`), `channel_state` (`unconfigured` | `valid` | `out_of_range`), `invalid_channel_count_now`, `volatile_loss_counter`, `data_loss_pending`, `journal_pressure_indicator`.

**The packing structure remains OPEN** and is not decided here. The `journal_pressure_indicator` threshold remains **OPEN — D-D6**.

### 11.4 Gap 6 — `record_seq` separate from `seq` — **PROPOSED**

`seq` increments **per message sent**. A new envelope field `record_seq` increments **once per durable record created** and is **not** incremented on retransmission.

* `message_id` = `{device_id}:{boot_id}:{seq}`
* `record_id` = `{device_id}:{boot_id}:{record_seq}`

**Consequence (intended):** on retransmission a record gets a **new `message_id`** but **the same `record_id`**. In every contract example carrying both, the two strings differ.

### 11.5 Gap 7 — `ack` batch semantics — **PROPOSED**

`ack` carries **exactly one** of:

| Field | Type | Use |
|---|---|---|
| `acked_record_id` | string | Single-record acknowledgement. |
| `acked_record_ids` | array of string | Batch acknowledgement — every `record_id` in the `batch`. |

**The two fields never appear together.** A `batch` carrying N records is answered by **one** `ack` with `acked_record_ids` of length N — not by N separate `ack` messages. Rejected alternative: replacing the singular field, which would break T-P05 and T-P10.

### 11.6 Gap 8 — `pressure_conversion_configured` — **NOT RESOLVED, DELIBERATELY**

Whether the D-D12 NULL-vs-0 rule extends to `valid_samples_pressure` when pressure conversion is unconfigured is **OPEN — DR-27** (spec §6.3, §6.5; PCC-29, §8 item 25).

**This contract does not resolve it and the server skeleton must not decide it.** The read point is marked in `pc/server.py` with a comment pointing here. `valid_samples_pressure` therefore accepts either `integer` or `null` and **no branch on its value is permitted** until DR-27 is decided.

### 11.7 Open at the end of Phase 2A

Gap 8 remains **OPEN**. The `journal_pressure_indicator` threshold (D-D6), `live_state` packing, transport encryption, credential storage, PC→ESP32 config authentication, `nack` reason vocabulary, and retry/timeout/backoff values all remain **OPEN** and are listed in §8.

---

*End of document — TOUGHENING MACHINE Protocol / Message Contract v0.2.4 — APPROVED AS PHASE 2A INPUT.*



