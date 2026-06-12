# Persona 10 — Edge / Escalate: High-Risk Geography (Syria)

## Persona Summary

| Field          | Value                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Organizer      | Layla Hassan                                                                                                   |
| Category       | `disaster_relief`                                                                                              |
| Geography      | `SY` (Syrian Arab Republic — OFAC-adjacent, high-risk)                                                         |
| Claimed Zakat  | `masakin` (the poor / those in need)                                                                           |
| ID Name Match  | **CLEAN** — ID prints "LAYLA HASSAN", matching organizer_name exactly                                          |
| Story Quality  | **COHERENT** — concrete names, locations, dates, amounts, reference numbers                                    |
| Vouching Chain | **THIN** — named corroborators exist but are uncheckable from outside Syria; no international NGO registration |

## Expected Reviewer Outcome

**ESCALATE**

### Signals that trigger ESCALATE (not APPROVE)

1. **High-risk geography (SY)** — Syria is an OFAC-designated country. Any fund transfer to SY triggers mandatory compliance review regardless of story quality or ID match. This is the primary escalation driver.
2. **Thin verification chain** — The vouching narrative names two local contacts (KHNRC chairperson Bilal Nasser Al-Kurdi; Dr. Hana Idris at Al-Salam Clinic) and a local government reference number (ACC-2025-0847), but none are verifiable through public international registries. The local relief committee (KH-RC-2019-114) is not registered with any internationally searchable humanitarian coordination body (e.g., UN OCHA ReliefWeb, ICRC partner registry).
3. **No active NGO coverage** — Campaign explicitly states no international NGO has registered this case, which removes a corroborating verification layer.
4. **Mixed funding destination signals** — Bank account is at a Syrian domestic bank (Bank of Syria and Aleppo). Transfers to Syrian domestic accounts require additional AML/CFT checks under FATF guidance on SY.

### Signals that do NOT flag (to verify the model scores correctly)

- **ID name match: PASS** — "LAYLA HASSAN" on ID matches `organizer_name`.
- **Story coherence: HIGH** — named entities: district (Kafr Halab), street (Al-Nour Street), specific dates (18–22 February 2025 tremors, 14 March 2025 inspection), reference number (ACC-2025-0847), committee ID (KH-RC-2019-114), cost breakdown (USD 4,200 / 650 / 1,800), named individuals (Abu Walid Qasem, Bilal Nasser Al-Kurdi, Dr. Hana Idris). No generic boilerplate.
- **Category doc: PRESENT** — ACC-2025-0847 structural damage assessment letter matches disaster_relief category.
- **Bank statement: CONSISTENT** — Account holder name matches organizer; transaction history shows seamstress income and relevant expenditures (relief committee contribution, emergency materials Feb 2025).

## How to Use

### Step 1 — Sign in to the client portal

Navigate to the Mizan client portal (e.g. `http://mizan-portal.localhost:1355` or your configured dev URL). Sign in or create an organizer account.

### Step 2 — Create Campaign (paste from campaign.json)

Click **Create Campaign** and fill in the form fields from `campaign.json`:

| Form Field                     | Value                                         |
| ------------------------------ | --------------------------------------------- |
| **Story / Campaign Narrative** | _(paste the full `story` value)_              |
| **Organizer Name**             | `Layla Hassan`                                |
| **Category**                   | `disaster_relief`                             |
| **Geography**                  | `SY`                                          |
| **Claimed Zakat Category**     | `masakin`                                     |
| **Vouching Narrative**         | _(paste the full `vouching_narrative` value)_ |

### Step 3 — Upload Evidence Documents

After submitting the campaign form, upload the three PDFs into the evidence slots:

| Evidence Slot         | File to Upload       |
| --------------------- | -------------------- |
| **Creator ID**        | `creator-id.pdf`     |
| **Bank Statement**    | `bank-statement.pdf` |
| **Category Document** | `category-doc.pdf`   |

### Step 4 — Submit

Click **Submit** to send the campaign through the Mastra AI review workflow. The brief generated should flag SY geography for compliance escalation, score the story as high-coherence, pass the OCR name-match, and produce an ESCALATE recommendation for human reviewer action.

### Step 5 — Verify reviewer brief

In the reviewer UI, confirm:

- `geography_risk: HIGH` flag present
- `name_match: PASS`
- `story_coherence_score: HIGH` (> 0.7 or equivalent)
- `vouching_chain: THIN` or `UNVERIFIABLE`
- Recommendation: `ESCALATE` (not APPROVE, BLOCK, or REQUEST_DOCS)
