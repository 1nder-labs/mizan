# Persona 08 — Scam: Inflated Medical Amounts

## Persona Summary

**Organizer:** Hana Yusuf  
**Category:** Medical (GB)  
**Claimed Zakat Category:** Gharimin (those in debt)  
**Geography:** United Kingdom (GB)

Hana Yusuf presents a detailed, emotionally compelling campaign claiming a family medical debt of approximately £185,000 — arising from her mother's cancer immunotherapy (8 cycles × £8,400 = £67,200), private nursing, specialist imaging (£14,000), and her brother's road-accident physiotherapy. The story is well-written with specific names (Dr Priya Nandakumar, King's College Hospital, A23 near Croydon), amounts, and procedural details designed to appear credible.

**The signals that break the story:**

1. **Bank statement vs. claimed debt — wildly inconsistent.** The statement covers February–May 2026 (the period the medical crisis allegedly began). Opening balance: £312.47. Closing balance: £367.75. Monthly salary credits: £940/month (part-time care worker). No large transfers in or out. No hospital payments, no solicitor payments, no medical charges of any scale. The story claims the family has already spent £185,000 on treatment and "exhausted all personal savings" — yet the account shows a person who has never had savings to exhaust, and zero evidence of medical spending.

2. **Category document is thin and contradicts the story.** The hospital letter (provisional treatment summary) confirms only a £450 partial consultation charge as confirmed outstanding. All the big-ticket items — chemotherapy, immunotherapy, home nursing — are listed as "Not yet costed / TBC / Not approved." The letter explicitly states: "We are unable at this time to verify or confirm any specific total cost figure." No invoices. No treatment plan. No approved funding gap.

3. **Vouching chain is unverifiable and circular.** Three named vouchers (Sheikh Abdullah Farooqi, Dr Saira Malik, Sister Nadia Hussain) are provided but none are institutionally checkable — a community imam, a neighbour, a volunteer coordinator. Self-referential community vouching only.

4. **Story coherence vs. financial reality.** The story is _too_ specific — real specific details that cannot be verified and are contradicted by the only verifiable document (the bank statement). This pattern — high narrative specificity + no financial footprint — is a red flag for fabrication.

## Expected Reviewer Outcome

**BLOCK / REQUEST_DOCS**

Primary flag: inflated amounts claim unsupported by financial evidence. The bank statement shows a household income of ~£940/month with no capacity to have incurred or serviced £185,000 in medical debt. The category document does not confirm any substantial outstanding cost. The story's financial claims are unverifiable at best, fabricated at worst.

## Which Signals Flag

| Signal                | Status  | Notes                                                                 |
| --------------------- | ------- | --------------------------------------------------------------------- |
| OCR name match        | PASS    | ID prints "HANA YUSUF" — matches organizer_name                       |
| Story coherence       | PARTIAL | High named-entity density, but claims unverifiable                    |
| Financial consistency | FAIL    | £185k claimed debt; account never exceeds £1,400; no medical payments |
| Category doc quality  | FAIL    | Provisional letter; £450 confirmed; all major items TBC               |
| Vouching chain        | WEAK    | Community-only, unverifiable, no institutional confirmation           |
| Amount plausibility   | FAIL    | Monthly salary ~£940; claimed expenditure ~£185,000                   |

---

## How to Use — Step-by-Step

### Step 1: Sign in to the Client Portal

Navigate to the Mizan client portal and sign in with your account credentials.

### Step 2: Create Campaign — paste these fields

Open `campaign.json` and paste each field into the Create Campaign form:

| Field                      | Value                                                           |
| -------------------------- | --------------------------------------------------------------- |
| **Story**                  | _(full text from `campaign.json` → `story` key, 150–450 words)_ |
| **Organizer Name**         | `Hana Yusuf`                                                    |
| **Category**               | `medical`                                                       |
| **Geography**              | `GB`                                                            |
| **Claimed Zakat Category** | `gharimin`                                                      |
| **Vouching Narrative**     | _(text from `campaign.json` → `vouching_narrative` key)_        |

### Step 3: Upload the Evidence PDFs

When prompted for evidence documents, upload:

- `creator-id.pdf` → **Creator ID** slot
- `bank-statement.pdf` → **Bank Statement** slot
- `category-doc.pdf` → **Category Document** slot

### Step 4: Submit

Submit the campaign. The Mizan AI reviewer will process the campaign and generate a brief. The expected outcome is **BLOCK or REQUEST_DOCS**, flagged primarily on financial inconsistency between the claimed £185,000 debt and the bank statement showing sub-£400 balances with no evidence of medical spending.
