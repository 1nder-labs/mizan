# Persona 09 — Edge: Missing Category Document (Lebanon, Refugee Support)

## Persona Summary

**Organizer:** Khaled Nasser  
**Category:** `refugee_support`  
**Geography:** `LB` (Lebanon)  
**Claimed Zakat Category:** `ibn_sabil` (stranded traveller / displaced person)  
**Vouching:** Community/institutional vouching from Jam'iyyat Al-Tawasul Al-Souri (Syrian Community Solidarity Association), Bourj Hammoud branch

### Narrative

Khaled Nasser is a Syrian mechanical engineer displaced from Aleppo in 2019, now living in Beirut's Bourj Hammoud district. The story is coherent, specific, and evidentially rich — named organisations (UNHCR, Rafic Hariri University Hospital, Jam'iyyat Al-Tawasul Al-Souri), specific amounts ($750 rent arrears, $1,200 goal), named individuals (Elias Khoury), and a clear financial arc.

### Signal Profile

| Signal            | Value                                                                               | Expected Outcome |
| ----------------- | ----------------------------------------------------------------------------------- | ---------------- |
| OCR name-match    | MATCH — ID prints "NASSER, KHALED MAHMOUD" matching organizer_name "Khaled Nasser"  | PASS             |
| Story coherence   | HIGH — dense named-entity, no boilerplate, concrete arc                             | PASS             |
| Vouching chain    | NAMED + CHECKABLE — Elias Khoury, Bourj Hammoud branch referenced                   | PASS             |
| Category document | MISSING — placeholder page with no actual refugee registration or UNHCR certificate | FLAG             |

### Expected Reviewer Outcome

**REQUEST_DOCS**

Mizan should surface the missing category evidence as a blocker. The campaign is otherwise strong — ID matches, story is coherent, vouching is institutional — but `refugee_support` / `ibn_sabil` requires proof of displacement status (UNHCR certificate of registration, Lebanese General Security residency permit, or equivalent letter). The category-doc PDF is an explicit near-empty placeholder and contains no such document.

---

## How to Use

### Step 1 — Sign in to the client portal

Navigate to the LaunchGood / Mizan client portal and sign in (or register) with your account.

### Step 2 — Create a new campaign

Click **Create Campaign** (or equivalent portal entry point). Fill in the form fields using the values from `campaign.json`:

| Field                  | Value                                                             |
| ---------------------- | ----------------------------------------------------------------- |
| Story                  | _(paste the full `story` string from campaign.json — 453 words)_  |
| Organizer Name         | `Khaled Nasser`                                                   |
| Category               | `refugee_support`                                                 |
| Geography              | `LB`                                                              |
| Claimed Zakat Category | `ibn_sabil`                                                       |
| Vouching Narrative     | _(paste the full `vouching_narrative` string from campaign.json)_ |

### Step 3 — Upload evidence PDFs

Upload each PDF into the matching evidence slot:

| PDF File             | Portal Slot       |
| -------------------- | ----------------- |
| `creator-id.pdf`     | Creator ID        |
| `bank-statement.pdf` | Bank Statement    |
| `category-doc.pdf`   | Category Document |

Note: `category-doc.pdf` is intentionally a near-empty placeholder. This is the missing-evidence signal this persona tests.

### Step 4 — Submit

Submit the campaign. The Mizan review workflow should:

1. Process the three uploaded documents
2. Score OCR name-match (expect PASS)
3. Score story coherence (expect HIGH)
4. Score vouching chain (expect NAMED/CHECKABLE)
5. Flag the category document as insufficient evidence for `refugee_support`
6. Emit reviewer recommendation: **REQUEST_DOCS** with a specific note that UNHCR certificate of registration or Lebanese residency permit is required

---

## Files in this directory

```
09-edge-missing-docs-lb/
  campaign.json          Portal create-form payload (POST /api/portal/campaigns)
  creator-id.html        Source HTML for government travel document
  creator-id.pdf         ID document PDF — name MATCHES organizer_name
  bank-statement.html    Source HTML for bank statement
  bank-statement.pdf     Bank statement PDF — account holder matches
  category-doc.html      Source HTML for category document
  category-doc.pdf       Category document PDF — near-empty placeholder (missing evidence)
  README.md              This file
```
