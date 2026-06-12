# Persona 04 — Clean Disaster Relief (Turkey)

## Persona Summary

| Field                     | Value                                |
| ------------------------- | ------------------------------------ |
| Slug                      | `04-clean-disaster-relief-tr`        |
| Organizer                 | Mehmet Demir                         |
| Category                  | `disaster_relief`                    |
| Geography                 | `TR` (Turkey)                        |
| Zakat category            | `masakin` (the poor / those in need) |
| Expected reviewer outcome | **APPROVE**                          |

### Story synopsis

Mehmet Demir is a civil engineer from Islahiye district, Gaziantep, Turkey.
His family home was destroyed in the 6 February 2023 Kahramanmaraş earthquake (M 7.8).
Working with the Islahiye Dayanışma Derneği (reg. no. 27-140-098) he coordinated four
relief procurement runs from Yılmaz Gıda (invoices YG-2023-0214 through YG-2023-0228),
distributing 180 thermal blankets, 320 kg flour, 150 L cooking oil, 200 kg dried lentils,
and 90 hygiene kits to ~310 displaced households at Islahiye Sports Hall.
All distributions were witnessed by AFAD coordinator Ahmet Arslan (#TR-AFAD-0441).

### Trust signals — all CLEAN

| Signal               | Status | Detail                                                                                                                                       |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR name-match       | PASS   | ID card prints "MEHMET DEMİR" — exact match to `organizer_name` "Mehmet Demir"                                                               |
| Story coherence      | PASS   | Named district (Islahiye), specific dates (6 Feb, 12–28 Feb), named org + reg no, specific quantities, invoice references, AFAD badge number |
| Named-entity density | HIGH   | 9+ named entities in story body                                                                                                              |
| Template-match       | LOW    | Concrete arc, no boilerplate                                                                                                                 |
| Bank statement name  | PASS   | Account holder "Mehmet Demir" — matches organizer                                                                                            |
| Category doc         | PASS   | Four signed purchase receipts + AFAD-witnessed distribution log                                                                              |
| Vouching narrative   | N/A    | Not included (no institutional vouching persona)                                                                                             |

### Flagged signals (none for APPROVE)

None expected. All three evidence documents are internally consistent and corroborate the campaign story.

---

## How to Use

### Step 1 — Sign in to the client portal

Navigate to the LaunchGood Mizan client portal (e.g. `http://localhost:5173` in dev)
and sign in with a valid organizer account.

### Step 2 — Create campaign

Click **New Campaign** (or **Submit a Campaign**) to open the intake form.
Fill in each field exactly as shown in `campaign.json`:

| Form field             | Value                                              |
| ---------------------- | -------------------------------------------------- |
| Campaign story         | _(paste the full `story` text from campaign.json)_ |
| Organizer name         | `Mehmet Demir`                                     |
| Category               | `disaster_relief`                                  |
| Geography              | `TR`                                               |
| Claimed zakat category | `masakin`                                          |
| Vouching narrative     | _(leave blank — not applicable)_                   |

### Step 3 — Upload evidence PDFs

The portal presents three file-upload slots. Upload each PDF to its matching slot:

| Portal slot label          | File to upload       |
| -------------------------- | -------------------- |
| Creator ID / Government ID | `creator-id.pdf`     |
| Bank Statement             | `bank-statement.pdf` |
| Category Document          | `category-doc.pdf`   |

### Step 4 — Submit

Click **Submit Campaign**. The portal enqueues the Mastra workflow.
The AI review brief will appear in the reviewer dashboard within a few seconds (local dev)
or upon queue processing (production).

### Expected reviewer brief outcome

The reviewer brief should recommend **APPROVE** with high confidence:

- OCR name-match: PASS (card name = organizer name)
- Story coherence score: HIGH (specific named entities, dates, quantities, invoice refs)
- Bank statement: consistent with story expenditures (EFT payments to Yılmaz Gıda visible)
- Category doc: receipts cross-reference invoice numbers cited in the story; AFAD sign-off present
- Zakat eligibility (masakin): supported — earthquake-displaced households with no shelter

---

_Synthetic specimen. All persons, account numbers, document numbers, and transaction references are entirely fictitious._
