# Persona 01 — Clean Medical (US)

## Persona Summary

| Field                  | Value                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Persona slug           | `01-clean-medical-us`                                                             |
| Organizer              | Yusuf Abdullah                                                                    |
| Category               | medical                                                                           |
| Geography              | US (Columbus, Ohio)                                                               |
| Claimed zakat category | masakin (the destitute)                                                           |
| Trust signal profile   | ALL GREEN — name match, coherent story, matching bank holder, valid hospital bill |

**Expected reviewer outcome: APPROVE**

### Signals evaluated

| Signal                 | Expected result | Why                                                                                                                                                                                                 |
| ---------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR name match         | PASS            | creator-id.pdf prints "YUSUF ABDULLAH" — matches `organizer_name` exactly                                                                                                                           |
| Story coherence        | HIGH            | Named hospital (Mercy General), named physician (Dr. Sarah Nguyen), specific diagnosis ICD code (I42.2 HCM), procedure CPT (33249 ICD implant), itemized amounts, specific dates, household context |
| Named-entity density   | HIGH            | Hospital, doctor, diagnosis, CPT codes, employer (Amazon DHL3 Groveport), insurance (BCBS OH), dollar amounts                                                                                       |
| Template-match penalty | LOW             | Personal arc, specific financial details, no generic boilerplate phrases                                                                                                                            |
| Bank holder match      | PASS            | bank-statement.pdf account holder = "Yusuf Abdullah"                                                                                                                                                |
| Category doc validity  | PASS            | Itemized hospital bill with ED, inpatient, and procedure line items, insurance adjudication, balance due $14,640                                                                                    |
| Zakat category fit     | PASS            | masakin (destitute) — breadwinner unable to work post-surgery, savings depleted, family of 5                                                                                                        |

---

## How to Use — Step-by-Step Portal Instructions

### Prerequisites

- A registered reviewer or admin account on the Mizan client portal
- The three PDF files in this directory

### Step 1: Sign in

Navigate to the Mizan client portal (e.g. `http://portal.localhost:1355`) and sign in with your account credentials.

### Step 2: Create a new campaign

Click **"New Campaign"** or **"Submit Campaign"** in the portal navigation.

### Step 3: Fill in the campaign form

Copy each value from `campaign.json` into the corresponding form field:

| Form field                     | Value to paste                                |
| ------------------------------ | --------------------------------------------- |
| **Story / Campaign Narrative** | _(paste the full `story` value — ~380 words)_ |
| **Organizer Name**             | `Yusuf Abdullah`                              |
| **Category**                   | `medical`                                     |
| **Geography**                  | `US`                                          |
| **Claimed Zakat Category**     | `masakin`                                     |
| **Vouching Narrative**         | _(leave blank — not present in this persona)_ |

### Step 4: Upload the evidence documents

In the file upload slots, attach the PDFs as follows:

| Portal slot           | File to upload       |
| --------------------- | -------------------- |
| **Creator ID**        | `creator-id.pdf`     |
| **Bank Statement**    | `bank-statement.pdf` |
| **Category Document** | `category-doc.pdf`   |

### Step 5: Submit

Click **Submit** (or equivalent). The Mastra workflow will trigger asynchronously. You can monitor progress via the reviewer dashboard SSE stream.

### Step 6: Reviewer action

The AI brief should surface:

- Name match: PASS (Yusuf Abdullah on ID matches organizer)
- Story coherence: HIGH confidence
- Supporting docs: hospital bill corroborates claimed amount ($14,640 outstanding)
- Recommended action: **APPROVE** (or proceed to standard due-diligence approval)

---

## File Manifest

```
01-clean-medical-us/
  campaign.json          Portal POST payload (CampaignCreateSchema-compliant)
  creator-id.html        Source HTML for government ID card
  creator-id.pdf         Ohio Driver License — Yusuf Abdullah (12,500 bytes)
  bank-statement.html    Source HTML for bank statement
  bank-statement.pdf     MidWest Trust Bank — March 2026 (33,200 bytes)
  category-doc.html      Source HTML for hospital bill
  category-doc.pdf       Mercy General Hospital itemized bill (39,100 bytes)
  README.md              This file
```

All documents are **fictitious** and carry a visible "FICTITIOUS DOCUMENT — FOR TEST PURPOSES ONLY" disclaimer. No real PII is present.
