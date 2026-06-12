# Persona 05 — Scam: Name Mismatch (BLOCK)

## Persona Summary

A fraudulent medical fundraiser submitted under the name **Omar Farouk** (organizer). The
creator-ID document (an Illinois Driver's License) bears the entirely unrelated name
**David Michael Thompson** — a clear identity fraud signal. The bank statement and hospital
bill both reference "Omar Farouk" consistently, so only the ID-to-organizer name check
surfaces the mismatch. The campaign story is moderately specific (named physician, hospital
unit, CPT codes, insurance carrier, financial counselor) to avoid the template-story flag
and isolate the OCR-mismatch signal.

## Expected Reviewer Outcome

**BLOCK**

### Signals that flag

| Signal              | Status          | Detail                                                                                            |
| ------------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| OCR name-match      | FAIL            | ID prints "DAVID MICHAEL THOMPSON"; organizer is "Omar Farouk" — zero semantic overlap            |
| Story coherence     | PASS            | Named entities: physician, hospital, unit number, CPT codes, insurance group, financial counselor |
| Vouching chain      | N/A             | No vouching narrative submitted                                                                   |
| Bank-statement name | PASS (internal) | Account holder shows "Omar Farouk" — consistent with organizer, does not rescue the ID mismatch   |

## How to Use

1. **Sign in** to the Mizan client portal.

2. **Create Campaign** — paste the following fields from `campaign.json` into the portal
   create-campaign form:

   | Field                    | Value                                            |
   | ------------------------ | ------------------------------------------------ |
   | `organizer_name`         | Omar Farouk                                      |
   | `category`               | medical                                          |
   | `geography`              | US                                               |
   | `claimed_zakat_category` | gharimin                                         |
   | `story`                  | _(paste the full story text from campaign.json)_ |

3. **Upload evidence documents** into the corresponding portal slots:

   | Slot label in portal | File to upload       |
   | -------------------- | -------------------- |
   | Creator ID           | `creator-id.pdf`     |
   | Bank statement       | `bank-statement.pdf` |
   | Category document    | `category-doc.pdf`   |

4. **Submit** the campaign. The AI review pipeline will run.

5. **Verify** the reviewer brief flags: OCR name-match should show MISMATCH ("David Michael
   Thompson" vs "Omar Farouk"). Expected disposition in the brief: **BLOCK**.

## File Inventory

```
05-scam-name-mismatch/
  campaign.json          Portal POST payload (strict schema)
  creator-id.html        Illinois DL layout — name: DAVID MICHAEL THOMPSON
  creator-id.pdf         126.8 KB
  bank-statement.html    Midwest Community Bank — account holder: Omar Farouk
  bank-statement.pdf     288.2 KB
  category-doc.html      St. Luke's Medical Center patient financial summary
  category-doc.pdf       314.0 KB
  README.md              This file
```
