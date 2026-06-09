# Persona 06 — Scam Template Story

## Summary

| Field                  | Value                                                                        |
| ---------------------- | ---------------------------------------------------------------------------- |
| Organizer              | Sara Khan                                                                    |
| Category               | food_security                                                                |
| Geography              | PK (Pakistan)                                                                |
| Claimed Zakat Category | fuqara                                                                       |
| ID Name Match          | MATCH (Sara Khan on ID = organizer_name)                                     |
| Story Quality          | TEMPLATE — generic emotionally-manipulative boilerplate, zero specifics      |
| Category Doc           | INCOMPLETE — Edhi Foundation referral with missing income/household evidence |

## Expected Reviewer Outcome

**BLOCK / REQUEST_DOCS**

### Signals that flag

| Signal                     | Verdict         | Detail                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR name match             | PASS            | "Sara Khan" on CNIC matches organizer_name — not a red flag                                                                                                                                                                                                                                     |
| Story coherence            | FAIL — TEMPLATE | Story contains zero named entities: no specific location, no named beneficiaries, no dates, no amounts, no org names. Pure emotionally-manipulative boilerplate ("God will bless you", "time is running out", "every dollar helps"). Named-entity density near zero; high template-match score. |
| Category doc completeness  | FAIL — MISSING  | Referral letter explicitly states household size, income, ration card, and utility bills were not provided. Food-security classification is "unverified — self-declared."                                                                                                                       |
| Zakat eligibility (fuqara) | UNVERIFIABLE    | No income evidence, no BISP/NSER registration, no household data to confirm fuqara status.                                                                                                                                                                                                      |
| Vouching                   | ABSENT          | No vouching_narrative present.                                                                                                                                                                                                                                                                  |

## How to Use (Portal Walkthrough)

1. **Sign in** to the Mizan client portal (e.g. `http://localhost:5173` or the staging URL).

2. **Create a new campaign.** Navigate to "Submit a Campaign" or the campaign intake form.

3. **Paste the fields from `campaign.json`:**
   - **Story:** paste the full story text (generic boilerplate — no specifics)
   - **Organizer name:** `Sara Khan`
   - **Category:** `food_security`
   - **Geography:** `PK`
   - **Claimed Zakat Category:** `fuqara`
   - Leave **Vouching narrative** blank (not present in this persona)

4. **Upload the three PDFs into the evidence slots:**
   - **Creator ID slot** → upload `creator-id.pdf` (Pakistani CNIC for Sara Khan — name MATCHES)
   - **Bank statement slot** → upload `bank-statement.pdf` (Meezan Bank statement, account holder Sara Khan)
   - **Category document slot** → upload `category-doc.pdf` (Edhi Foundation referral — incomplete, missing income/household proof)

5. **Submit** the campaign.

6. **Observe the review brief.** The AI should surface:
   - Story TEMPLATE flag (boilerplate, zero named-entity density)
   - Category doc INCOMPLETE flag (missing BISP/NSER registration, income verification)
   - Zakat eligibility UNVERIFIABLE flag (no household income data to confirm fuqara)
   - OCR name match should PASS (same name on ID)
   - Recommended action: REQUEST_DOCS or BLOCK pending documentation

## Files

| File                  | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `campaign.json`       | Portal create-form payload (POST /api/portal/campaigns) |
| `creator-id.html`     | Source for Pakistani CNIC (Sara Khan — name matches)    |
| `creator-id.pdf`      | Upload to Creator ID slot                               |
| `bank-statement.html` | Source for Meezan Bank statement                        |
| `bank-statement.pdf`  | Upload to Bank Statement slot                           |
| `category-doc.html`   | Source for Edhi Foundation food referral (incomplete)   |
| `category-doc.pdf`    | Upload to Category Document slot                        |
