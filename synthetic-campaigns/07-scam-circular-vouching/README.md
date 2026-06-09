# Persona 07 — Scam: Circular / Self-Referential Vouching

## Persona Summary

**Organizer:** Bilal Ahmed  
**Category:** food_security  
**Geography:** PK (Pakistan, Karachi)  
**Claimed Zakat Category:** masakin (the poor)  
**ID Name Match:** MATCHES — "BILAL AHMED" printed on creator-id.pdf

**Profile:** This persona represents a low-trust, suspicious campaign. The story is
generic emotional boilerplate with near-zero named-entity density: no specific
organisation, no dated distributions, no named beneficiaries, no supplier receipts,
no verifiable partner. The vouching_narrative is entirely circular and
self-referential — it names no checkable party, no institution, no mosque, no
registered NGO, no community elder with a contact — only assertions that "everyone
knows me" and "my community trusts me." The category document is a self-prepared
report from an unregistered informal group with no third-party attestation, no
supplier invoices, and missing witness/seal blocks.

## Signal Map

| Signal          | Source                                                                                                                      | Outcome                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| OCR name match  | creator-id.pdf prints "BILAL AHMED"                                                                                         | PASS — name matches organizer_name |
| Story coherence | Boilerplate emotional narrative, zero specifics (no org names, no dates, no amounts, no named beneficiaries)                | WEAK / TEMPLATE                    |
| Vouching chain  | vouching_narrative: purely circular ("everyone knows me", "my family vouches for me") — no named, checkable corroborator    | BLOCK — self-referential           |
| Category doc    | Self-prepared by organizer; unregistered group; no supplier receipts; missing witness signature and official seal           | WEAK / MISSING EVIDENCE            |
| Bank statement  | Regular salary-earner pattern, low balance (PKR 13,600 closing) — inconsistent with operating a food distribution programme | WEAK                               |

## Expected Reviewer Outcome

**ESCALATE / BLOCK**

Primary flags:

- Vouching chain is entirely circular — fails checkable-corroborator test
- Story is high template-match, low named-entity density — likely AI/boilerplate generated
- Category doc has no third-party attestation, no receipts, no official seal
- No registered organisation, no partner NGO, no masjid administration co-signature

---

## How to Use (step-by-step portal walkthrough)

### Step 1 — Sign in

Open the Mizan client portal in your browser and sign in with your reviewer credentials.

### Step 2 — Create Campaign

Navigate to **Campaigns** and click **New Campaign** (or the equivalent create button).
Paste the following fields from `campaign.json` into the form:

| Field                  | Value                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Story                  | _(paste the full story text from campaign.json)_              |
| Organizer Name         | Bilal Ahmed                                                   |
| Category               | food_security                                                 |
| Geography              | PK                                                            |
| Claimed Zakat Category | masakin                                                       |
| Vouching Narrative     | _(paste the full vouching_narrative text from campaign.json)_ |

### Step 3 — Upload Evidence PDFs

When the form reaches the evidence upload section, upload each PDF to its designated slot:

| PDF File             | Portal Upload Slot     |
| -------------------- | ---------------------- |
| `creator-id.pdf`     | Creator ID slot        |
| `bank-statement.pdf` | Bank statement slot    |
| `category-doc.pdf`   | Category document slot |

### Step 4 — Submit

Click **Submit** to send the campaign through the Mizan intake pipeline.
The system will run OCR name-match, story-coherence scoring, vouching-chain analysis,
and category-doc extraction. Review the generated brief in the reviewer queue.

### Expected Brief Findings

- ID name match: PASS (Bilal Ahmed matches)
- Story coherence: LOW — template boilerplate, no named entities
- Vouching: FAIL — circular, zero checkable corroborators
- Category doc: WEAK — self-prepared, missing official attestation
- Recommended action: ESCALATE or BLOCK pending independent verification
