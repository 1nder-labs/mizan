# Persona 11 — Scam: Fabricated Documents (Should BLOCK)

## Persona Summary

| Field                  | Value                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| Persona slug           | `11-scam-fabricated-block`                                       |
| Organizer              | Tariq Mansour                                                    |
| Category               | medical                                                          |
| Geography              | US (Houston, Texas)                                              |
| Claimed zakat category | gharimin (indebted)                                              |
| Trust signal profile   | ALL RED — multiple severe, mutually-reinforcing fraud indicators |

**Expected reviewer outcome: BLOCK (outright reject)**

---

## Planted Red Flags

### campaign.json — Story

| Red flag                               | Detail                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deceased patient still recovering**  | Patient Ahmad described as having "passed away peacefully on January 28, 2026" and in the same narrative as "recovering well in the ICU" and "may be discharged within the week" — logically impossible |
| **Surgery before admission**           | Surgery date February 3, 2026; hospital admission date February 17, 2026 — patient operated on two weeks before being admitted                                                                          |
| **Expired "urgent" deadline**          | Campaign claims a "48-hour fundraising deadline" that expired October 15, 2025 — over eight months in the past                                                                                          |
| **Wildly inflated amount**             | $2,400,000 for a routine laparoscopic appendectomy (real-world cost ~$8,000–$35,000 including one overnight stay)                                                                                       |
| **Crypto + Cash App disbursement**     | Explicitly instructs donors to send funds to a personal Bitcoin wallet (`bc1q…`) or personal Cash App (`$TariqMansour77`), explicitly telling them NOT to send money to the hospital                    |
| **Self-vouching narrative**            | Organizer vouches for himself; the mosque voucher has "never met Ahmad or our family"                                                                                                                   |
| **Deceased third party corroborating** | Vouching narrative references Ahmad's wife (stated as deceased two years ago) as still actively "supporting the family emotionally"                                                                     |

### creator-id.html — Fabricated Texas Driver License

| Red flag                                | Detail                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Name mismatch — ID vs. organizer**    | ID reads "MARCUS WEBB"; organizer name on campaign is "Tariq Mansour" — different first name, surname, and apparent ethnicity                                                              |
| **Tampered surname field**              | `WEBB` rendered in `Times New Roman` serif at 9pt/900 weight in `#e8e0c0` hue; all other fields use `Arial` at 7.5pt in `#ffffff` — visually pasted-over appearance                        |
| **DOB overlaps its label**              | `dob-value` is absolutely positioned at `top: 2px` inside a container whose label is at `top: 0` — value printed on top of label text, simulating layer misalignment from editing software |
| **Inconsistent document number format** | Texas DLs use 8 numeric digits; this shows `TX-A4B2-9910-004` — alphanumeric hybrid that matches no real state format                                                                      |
| **Photo is a plain gray box**           | No photo present; gray `div` placeholder only                                                                                                                                              |

### bank-statement.html — Non-individual Offshore Corporate Account

| Red flag                                                | Detail                                                                                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Non-individual account holder**                       | Account holder is "GLOBAL RELIEF HOLDINGS LLC" domiciled in the Cayman Islands — not the individual organizer (Tariq Mansour) or the patient                     |
| **Foreign offshore address**                            | George Town, Grand Cayman — not a US bank account                                                                                                                |
| **Institutional account-flagged alert**                 | Explicit banner: "ACCOUNT FLAGGED — unusual activity under review" with a compliance reference number                                                            |
| **Rapid large round-number in-out wires**               | Multiple $160,000–$200,000 same-week WIRE IN / WIRE OUT pairs to/from Panama City, Nassau, Belize City, Seychelles, Dubai — classic layering pattern             |
| **Running balance math does not add up**                | Opening $312,450 + Credits $540,000 − Debits $690,000 = $162,450 expected; stated closing balance is $89,210 — discrepancy of ~$73,240 with no reconciling entry |
| **Summary totals inconsistent with transaction detail** | Multiple individual balance column entries also fail to match the arithmetic of prior row plus/minus transaction amount                                          |

### category-doc.html — Fake Hospital Invoice

| Red flag                                 | Detail                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Invented hospital name**               | "St. Eternal Mercy Specialty Clinic" — not a real facility                                                                                                                            |
| **Arithmetic impossibility**             | Line items sum to ~$49,010 (surgical $19,250 + inpatient $7,760 + misc $22,000); stated grand total is $2,400,000 — a factor of ~49× inflation with no explanation                    |
| **Miscellaneous subtotal wrong**         | Misc line items ($15,000 + $6,000 = $21,000) stated in the subtotal row as $22,000                                                                                                    |
| **Service date after invoice date**      | Invoice dated January 20, 2026; appendectomy procedure date February 3, 2026 — service billed before it occurred                                                                      |
| **Procedure date before admission date** | Procedure Feb 3, 2026; admission Feb 17, 2026 — patient operated on two weeks before being admitted (mirrors story contradiction)                                                     |
| **Inconsistent fonts across sections**   | Header/patient info in `Georgia` serif; line-item tables in `Helvetica Neue` sans-serif; totals section reverts to `Georgia` — three font family switches in one document             |
| **Crypto wallet payment destination**    | Footer demands payment to Bitcoin address `bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh` with contact email `tariqmansour77@protonmail.com`, explicitly saying do not call the hospital |

---

## How to Use — Step-by-Step Portal Instructions

### Prerequisites

- A registered client account on the Mizan portal
- The HTML files in this directory (the portal/orchestrator renders them to PDF)

### Step 1: Sign in

Navigate to the Mizan client portal (e.g. `http://portal.localhost:1355`) and sign in or create a new account.

### Step 2: Create a new campaign

Click **"New Campaign"** or **"Submit Campaign"** in the portal navigation.

### Step 3: Fill in the campaign form

Copy each value from `campaign.json` into the corresponding form field:

| Form field                     | Value                          |
| ------------------------------ | ------------------------------ |
| **Story / Campaign Narrative** | _(paste full `story` value)_   |
| **Organizer Name**             | `Tariq Mansour`                |
| **Category**                   | `medical`                      |
| **Geography**                  | `US`                           |
| **Claimed Zakat Category**     | `gharimin`                     |
| **Vouching Narrative**         | _(paste `vouching_narrative`)_ |

### Step 4: Upload the evidence documents

Render each HTML file to PDF, then upload:

| Portal slot           | Source HTML           | PDF to upload        |
| --------------------- | --------------------- | -------------------- |
| **Creator ID**        | `creator-id.html`     | `creator-id.pdf`     |
| **Bank Statement**    | `bank-statement.html` | `bank-statement.pdf` |
| **Category Document** | `category-doc.html`   | `category-doc.pdf`   |

### Step 5: Submit

Click **Submit**. The Mastra workflow triggers asynchronously. Monitor progress via the reviewer dashboard SSE stream.

### Step 6: Expected reviewer outcome

The AI brief should surface all of the following and recommend **BLOCK**:

- Name mismatch: FAIL — ID holder "Marcus Webb" does not match organizer "Tariq Mansour"
- ID tampering: DETECTED — surname in different font family, DOB overlaps label, non-standard document number
- Bank holder mismatch: FAIL — offshore LLC, not individual organizer
- Story coherence: VERY LOW — patient simultaneously deceased and recovering, surgery predates admission, deadline in the past, crypto disbursement instructions
- Category doc validity: FAIL — line items (~$49K) do not approach grand total ($2.4M), service date after invoice date, crypto payment footer
- Recommended action: **BLOCK**

---

## File Manifest

```
11-scam-fabricated-block/
  campaign.json          Portal POST payload (CampaignCreateSchema-compliant)
  creator-id.html        Source HTML for fabricated Texas Driver License
  bank-statement.html    Source HTML for offshore corporate bank statement
  category-doc.html      Source HTML for fabricated hospital invoice
  README.md              This file
```
