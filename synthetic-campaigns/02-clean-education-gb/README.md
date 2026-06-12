# Persona 02 — Clean Education (GB)

## Summary

A Pakistani international student at the University of Sheffield requesting £9,250 to cover Year 2 Biomedical Engineering tuition fees after her father suffered a cardiac event and lost his income. All trust signals are clean: name on ID is a faithful transliteration variant of the organiser name, story is specific and concrete, vouching names are checkable, and the category document directly corroborates the claimed amount and deadline.

| Field                     | Value         |
| ------------------------- | ------------- |
| Organiser name            | Aisha Rahman  |
| Category                  | education     |
| Geography                 | GB            |
| Claimed Zakat category    | fi_sabilillah |
| Expected reviewer outcome | **APPROVE**   |

## Trust Signal Analysis

| Signal                | Expected Result | Reason                                                                                                                                                                                                                                                                                                                               |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OCR name-match        | PASS            | ID prints "AYESHA RAHMAN" — transliteration variant of "Aisha Rahman"; same phonology, same family name                                                                                                                                                                                                                              |
| Story coherence       | HIGH            | Named university (Sheffield), named department (Biomedical Engineering), specific student ID (230847192), named tutor (Dr Nadia Hussain), fee amount (£9,250), due date (14 July 2025), named employer (Café Central Sheffield), named landlord (Broomhall Lettings), named mosque (Wolseley Road S9 3RB) — zero generic boilerplate |
| Vouching chain        | STRONG          | Named Dr Nadia Hussain (staff email resolvable), named Imam Khalid Farooqi (Sheffield Islamic Society / Wolseley Road Mosque with postcode), named community venue (Sheffield Pakistani Community Centre)                                                                                                                            |
| Category doc          | STRONG MATCH    | Enrollment letter names Aisha Rahman, Student ID 230847192, programme BEng Biomedical Engineering, Year 2, exact fee £9,250, due date 14 July 2025 — matches campaign narrative in every detail                                                                                                                                      |
| Bank statement holder | MATCH           | "Aisha Rahman", Sheffield address, shows family support transfers from Pakistan (TARIQ RAHMAN / RUKHSANA BEGUM) and part-time wages consistent with Tier 4 20hr/week limit                                                                                                                                                           |
| Zakat eligibility     | PLAUSIBLE       | fi_sabilillah (in the path of God) — education with documented hardship; reviewer may still want to confirm Islamic scholarly opinion on tuition funding, but flag is low-risk                                                                                                                                                       |

No signals flag for BLOCK or ESCALATE. The only reasonable reviewer action is to approve with standard due-diligence notes.

## How to Use

### Step 1 — Sign in to the client portal

Navigate to the Mizan client portal (e.g. `http://localhost:5173` in local dev or the staging URL). Sign in with a registered organiser account, or create one if prompted.

### Step 2 — Create a new campaign

Click "New Campaign" (or "Submit a Campaign"). Fill in the form fields **exactly** as follows, copying from `campaign.json`:

| Form field             | Value                                         |
| ---------------------- | --------------------------------------------- |
| Campaign story         | _(paste the full `story` value — 479 words)_  |
| Organiser name         | `Aisha Rahman`                                |
| Category               | `education`                                   |
| Geography              | `GB`                                          |
| Claimed Zakat category | `fi_sabilillah`                               |
| Vouching narrative     | _(paste the full `vouching_narrative` value)_ |

### Step 3 — Upload the evidence files

When prompted for evidence documents, upload:

| Portal slot                | File to upload       |
| -------------------------- | -------------------- |
| Creator ID / Government ID | `creator-id.pdf`     |
| Bank statement             | `bank-statement.pdf` |
| Category document          | `category-doc.pdf`   |

### Step 4 — Submit

Click Submit. The campaign will enter the Mastra workflow queue. The AI will extract fields, run OCR name-match, score story coherence, and produce a review brief for a human reviewer.

### Step 5 — Verify reviewer brief

Open the reviewer UI (e.g. `http://localhost:5173/review`). The brief for this campaign should show:

- Name match: PASS (Ayesha / Aisha transliteration)
- Story coherence: HIGH
- Recommended action: APPROVE
- No blocking flags

## Files

```
02-clean-education-gb/
  campaign.json          Portal POST payload (strict schema)
  creator-id.html        Source HTML for government ID (BRP)
  creator-id.pdf         PDF — upload to Creator ID slot
  bank-statement.html    Source HTML for Lloyds Bank statement
  bank-statement.pdf     PDF — upload to Bank statement slot
  category-doc.html      Source HTML for University of Sheffield enrollment letter
  category-doc.pdf       PDF — upload to Category document slot
  README.md              This file
```

## Fictional Notice

All names, student IDs, account numbers, document numbers, email addresses, and other details in these files are entirely fictional. The University of Sheffield and Lloyds Bank are real institutions; these documents are not affiliated with, endorsed by, or issued by them in any way. Do not use these documents for any real-world purpose.
