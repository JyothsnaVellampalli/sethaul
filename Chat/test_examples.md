# SetuHaul Driver Chat — Test Examples

Use these examples to test the extraction agent. Each scenario is based on
real data from `setuhaul_schema_and_seed.sql`.

---

## 1. HAPPY PATH — All data provided in one message

**Driver message:**
```
Hi, this is DRV014, vehicle VEH014. Shipment SHP1014 heading to Jaipur DC. Origin released me late. My ETA is 11:25 AM. This load is urgent hospital consumables. Can I get the first possible dock?
```

**Expected extraction (no follow-ups needed):**
- shipment_id: SHP1014
- driver_id: DRV014
- vehicle_id: VEH014
- issue_type: DELAY
- estimated_arrival: 2026-08-04T11:25:00+05:30
- delay_minutes: ~70 (original ETA was 10:15)
- destination_facility: FAC-JAI-01, Jaipur DC
- severity: CRITICAL (priority=CRITICAL, delay > 60 min)
- constraints: Hospital consumables, standard dock needed, 21 tonnes

---

## 2. TRAFFIC DELAY — Missing vehicle_id

**Driver message:**
```
Traffic after Shahpura. Reaching around 11:20. Any slot after 12?
Shipment SHP1006. I am DRV006.
```

**Expected behaviour:**
- Agent extracts: shipment_id=SHP1006, driver_id=DRV006, ETA=11:20, issue=TRAFFIC
- Agent asks: "What is your vehicle ID or registration number?"

**Driver follow-up:**
```
Vehicle is DL01GT4115
```

**Expected:** Agent maps registration DL01GT4115 → VEH015, completes extraction.
- severity: HIGH (priority=HIGH, delay ~60 min)
- destination: FAC-JAI-01

---

## 3. BREAKDOWN — Driver gives ETA + downstream constraint

**Driver message:**
```
DRV012 here. Tyre repaired. Shipment SHP1012, vehicle VEH012.
I can reach Jaipur DC by 11:10. I need to leave the warehouse before
1:30 PM for another pickup.
```

**Expected extraction (complete — no follow-ups):**
- shipment_id: SHP1012
- driver_id: DRV012
- vehicle_id: VEH012
- issue_type: BREAKDOWN
- estimated_arrival: 2026-08-04T11:10:00+05:30
- delay_minutes: ~85 (original ETA was 09:45)
- destination_facility: FAC-JAI-01
- severity: HIGH (delay > 45 min)
- constraints: Must gate-out by 13:30 for next pickup

---

## 4. AMBIGUOUS DELAY — No absolute ETA given

**Driver message:**
```
I am late by one hour. SHP1013, DRV013.
```

**Expected behaviour:**
- Agent extracts: shipment_id=SHP1013, driver_id=DRV013, delay ~60 min
- Agent asks:
  1. "What is your current expected arrival time at the facility?"
  2. "What is your vehicle ID or registration number?"

**Driver follow-up:**
```
Around 11 AM. Vehicle VEH013. Going to Jaipur DC.
```

**Expected:** Completes extraction.
- estimated_arrival: 2026-08-04T11:00:00+05:30
- severity: MEDIUM (normal priority, delay 60 min but viable slots exist)

---

## 5. MULTIPLE SHIPMENTS — Driver doesn't specify which one

**Driver message:**
```
DRV004 here. I will be late by 45 minutes.
```

**Expected behaviour:**
- Agent knows DRV004 has two shipments today: SHP1004 and SHP1020.
- Agent asks:
  1. "You have two assignments today. Are you referring to shipment SHP1004
     (Kota Engineering, 08:45 slot) or SHP1020 (Kota Engineering, 18:00 ETA)?"
  2. "What is your expected arrival time at the facility?"

**Driver follow-up:**
```
The first one, SHP1004. ETA is around 9:20. Vehicle VEH004.
```

**Expected:**
- shipment_id: SHP1004
- delay_minutes: ~35
- severity: MEDIUM

---

## 6. REEFER DOCK CONFLICT — Evening maintenance blocks the only reefer dock

**Driver message:**
```
DRV015, SHP1015, VEH005. Evening traffic. ETA 6:30 PM.
Can the reefer unload tonight at Jaipur?
```

**Expected extraction (complete):**
- shipment_id: SHP1015
- driver_id: DRV015
- vehicle_id: VEH005
- issue_type: TRAFFIC
- estimated_arrival: 2026-08-04T18:30:00+05:30
- delay_minutes: ~60 (original ETA 17:30)
- destination_facility: FAC-JAI-01
- severity: CRITICAL (reefer dock D5 under maintenance from 18:00–22:00, no alternative)
- constraints: Temperature-controlled dairy products, MUST use reefer dock
- recommended_action: "Escalate — D5 unavailable after 18:00 due to planned
  refrigeration maintenance. No feasible same-day reefer slot. Requires
  operations manual override or next-day scheduling."

---

## 7. HEAVY VEHICLE — Missed heavy-dock slot

**Driver message:**
```
Heavy trailer ETA 12:00. Original heavy-bay slot will be missed.
What is next? SHP1016, DRV007.
```

**Expected behaviour:**
- Agent extracts most fields. Asks: "What is your vehicle ID?"

**Driver follow-up:**
```
VEH007, registration MH04HV4107
```

**Expected:**
- shipment_id: SHP1016
- vehicle_id: VEH007
- issue_type: DELAY
- estimated_arrival: 2026-08-04T12:00:00+05:30
- delay_minutes: ~90 (original ETA 10:30)
- destination_facility: FAC-JAI-01
- severity: HIGH (heavy load 31 tonnes, requires D6 only)
- constraints: Must use HEAVY dock D6 (>25 tonnes), 90-min unload
- recommended_action: "Check next available D6 heavy-dock slot after 12:00.
  D6 uses 90-min slots."

---

## 8. EARLY ARRIVAL — Driver wants an earlier dock

**Driver message:**
```
DRV003, SHP1003, VEH003. I am already at the gate. Can I get a dock now
instead of waiting until 9?
```

**Expected extraction (complete):**
- shipment_id: SHP1003
- driver_id: DRV003
- vehicle_id: VEH003
- issue_type: EARLY_ARRIVAL
- estimated_arrival: already at facility (~08:20)
- delay_minutes: 0 (early, not late)
- destination_facility: FAC-JAI-01
- severity: LOW
- constraints: None (standard dock, light 7-tonne load)
- recommended_action: "Check if any standard dock (D1–D4) has unused capacity
  before 09:00. Early arrival does not guarantee priority over scheduled trucks."

---

## 9. CANCELLED SHIPMENT — Driver unaware

**Driver message:**
```
DRV008 here. Is my 4 PM slot still active? Shipment SHP1019. Vehicle VEH008.
Heading to Jaipur DC.
```

**Expected extraction (complete):**
- shipment_id: SHP1019
- driver_id: DRV008
- vehicle_id: VEH008
- issue_type: UNKNOWN (status check, not a delay)
- destination_facility: FAC-JAI-01
- severity: LOW (informational)
- recommended_action: "Shipment SHP1019 is CANCELLED. Inform driver not to
  travel. Appointment APT1019 was cancelled at 10:10 AM (reason: Shipment
  cancelled). Direct driver to contact dispatch."

---

## 10. DUPLICATE MESSAGE — Same content sent twice

**First driver message:**
```
Traffic after Shahpura. Reaching around 11:20. Any slot after 12?
SHP1006, DRV006, VEH015.
```

**Second driver message (1–2 minutes later, identical):**
```
Traffic after Shahpura. Reaching around 11:20. Any slot after 12?
SHP1006, DRV006, VEH015.
```

**Expected behaviour on second message:**
- Agent acknowledges briefly: "I received your earlier message and it's being
  processed. This appears to be a duplicate — no additional action needed."
- Marks as possible duplicate in extraction.

---

## 11. MINIMAL INFORMATION — Almost nothing provided

**Driver message:**
```
I'm stuck. Will be very late.
```

**Expected behaviour — Agent asks multiple questions:**
1. "Can you confirm your Driver ID (e.g. DRV001)?"
2. "Which shipment are you referring to? Please share the shipment ID (e.g. SHP1001)."
3. "What is your estimated arrival time at the facility?"

**Driver follow-up:**
```
DRV009. Shipment SHP1009. Vehicle VEH009. Going to Jaipur. Maybe 11 AM.
The truck got stuck in a flood zone near Udaipur.
```

**Expected:**
- shipment_id: SHP1009
- driver_id: DRV009
- vehicle_id: VEH009
- issue_type: WEATHER
- estimated_arrival: 2026-08-04T11:00:00+05:30
- delay_minutes: ~15 (original ETA 10:45)
- destination_facility: FAC-JAI-01
- severity: MEDIUM (CRITICAL priority shipment but delay only ~15 min)
- constraints: Solar equipment, 20 tonnes, standard dock

---

## 12. WRONG FACILITY — Driver heading to Gurugram, not Jaipur

**Driver message:**
```
DRV006, SHP1021, VEH015. Running 30 minutes late due to Noida traffic.
Should reach Gurugram around 2:30 PM.
```

**Expected extraction (complete):**
- shipment_id: SHP1021
- driver_id: DRV006
- vehicle_id: VEH015
- issue_type: TRAFFIC
- estimated_arrival: 2026-08-04T14:30:00+05:30
- delay_minutes: 30 (original ETA 14:00)
- destination_facility: FAC-GGN-01 (Gurugram Cross-Dock, NOT Jaipur)
- severity: MEDIUM (normal priority, 30-min delay)
- constraints: Standard dock, 7.2 tonnes, office supplies

---

## 13. REGISTRATION NUMBER INSTEAD OF VEHICLE_ID

**Driver message:**
```
This is driver DRV005, shipment SHP1005. My truck is UP14GT4106.
Dock D3 was supposed to be mine but they say it's broken.
I'm already in the yard at Jaipur. What do I do?
```

**Expected behaviour:**
- Agent maps UP14GT4106 → VEH006
- issue_type: DOCK_UNAVAILABLE
- estimated_arrival: already at facility
- destination_facility: FAC-JAI-01
- severity: HIGH (priority=HIGH, 20.5 tonnes, dock D3 is under breakdown)
- constraints: Needs standard dock reassignment (D1, D2, or D4)
- recommended_action: "Dock D3 is offline (hydraulic leveller breakdown,
  estimated repair by 13:00). Reassign to D1, D2, or D4. Truck is already
  in yard queue position 2."

---

## 14. DRIVER GIVES ORDER REFERENCE INSTEAD OF SHIPMENT ID

**Driver message:**
```
DRV001, order ORD-260804-017. I'm in VEH001. Traffic on the highway.
Will reach Jaipur around 12:45.
```

**Expected behaviour:**
- Agent maps ORD-260804-017 → SHP1017
- Extracts all data without further questions.
- shipment_id: SHP1017
- issue_type: TRAFFIC
- estimated_arrival: 2026-08-04T12:45:00+05:30
- delay_minutes: 30 (original ETA 12:15)
- severity: MEDIUM (LOW priority, 30-min delay)

---

## Summary of Edge Cases Covered

| # | Scenario | Tests |
|---|----------|-------|
| 1 | Happy path | Full extraction, no follow-ups |
| 2 | Missing vehicle_id | Follow-up question, registration mapping |
| 3 | Breakdown + constraint | Downstream time constraint extraction |
| 4 | Ambiguous ETA | "Late by X" without absolute time |
| 5 | Multiple shipments | Disambiguation when driver has 2+ loads |
| 6 | Reefer dock conflict | Maintenance blocks only compatible dock |
| 7 | Heavy vehicle | Special dock requirement (D6 only) |
| 8 | Early arrival | Not a delay — different issue_type |
| 9 | Cancelled shipment | Status check for already-cancelled load |
| 10 | Duplicate message | Dedup detection |
| 11 | Minimal info | Multiple follow-up questions needed |
| 12 | Different facility | Gurugram vs Jaipur distinction |
| 13 | Registration number | Vehicle reg → vehicle_id mapping |
| 14 | Order reference | Order ref → shipment_id mapping |
