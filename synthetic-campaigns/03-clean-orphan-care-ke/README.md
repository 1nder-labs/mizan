# Persona 03 — Clean Orphan Care KE

## Summary

| Field                  | Value                     |
| ---------------------- | ------------------------- |
| Organizer              | Ibrahim Mwangi            |
| Category               | `orphan_care`             |
| Geography              | KE (Kenya)                |
| Claimed Zakat category | `fuqara`                  |
| Persona type           | CLEAN — all signals green |

A fully legitimate orphan-care campaign. Story is concrete and specific (named children's home, school, costs, NGO registration number, external auditor). ID name matches organizer name exactly. Bank statement shows consistent institutional income (CRS-Kenya MoU disbursements, USAID sub-grant, Masjid sadaqah relay) and plausible operational expenditure. Category doc is a government NGO registration certificate with a real-sounding registration number, board chair, and compliance status. Vouching chain names two independent, named, checkable parties (Sheikh Yusuf Abdalla Hassan + Beatrice Anyango / CRS-Kenya).

## Expected Reviewer Outcome

**APPROVE** (no flags; reviewer may request a confirmation call as good practice but no blocking signals).

## Which signals fire — and how

| Signal                                 | Expected result | Why                                                                                                                                                     |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OCR name-match                         | PASS            | "IBRAHIM MWANGI" on creator-id.pdf matches `organizer_name` exactly (same name order, same spelling)                                                    |
| Story coherence / named-entity density | HIGH            | Specific org name, NGO cert number, school names, Nairobi ward, KES amounts, staff count, partner references, external auditor                          |
| Template-match                         | LOW             | Narrative has concrete arc (staffing shortfall → dormitory damage → funding ask with itemised budget) rather than vague emotional boilerplate           |
| Vouching chain                         | STRONG          | Two independently named corroborators from different institutions (mosque + international NGO), with contact details and verifiable MoU reference       |
| Bank statement consistency             | CONSISTENT      | Income sources align with story (CRS, USAID, sadaqah relay); expenditure matches claimed costs (school fees, food suppliers, staff payroll, contractor) |
| Category doc                           | VALID           | NGO registration certificate with issuing authority, registration number, exec director name matching organizer, compliance status                      |

## How to use

1. Sign in to the Mizan client portal (e.g., `http://localhost:5173` in dev).
2. Navigate to **Create Campaign**.
3. Fill in the form fields using the values from `campaign.json`:
   - **Story**: paste the `story` value (the multi-paragraph campaign narrative).
   - **Organizer name**: `Ibrahim Mwangi`
   - **Category**: `orphan_care`
   - **Geography**: `KE`
   - **Claimed zakat category**: `fuqara`
   - **Vouching narrative**: paste the `vouching_narrative` value.
4. Upload the evidence PDFs into the corresponding slots:
   - `creator-id.pdf` → **Creator ID** slot
   - `bank-statement.pdf` → **Bank statement** slot
   - `category-doc.pdf` → **Category document** slot
5. Submit the campaign. The Mastra workflow will enqueue, process documents, and produce a review brief.
6. In the reviewer UI, expect the brief to surface all-green trust signals and recommend **APPROVE**.

## Files

```
03-clean-orphan-care-ke/
  campaign.json          Portal create-form payload (strict schema)
  creator-id.html        Source HTML for government ID card
  creator-id.pdf         ID card PDF (upload to Creator ID slot)
  bank-statement.html    Source HTML for Equity Bank statement
  bank-statement.pdf     Bank statement PDF (upload to Bank statement slot)
  category-doc.html      Source HTML for NGO registration certificate
  category-doc.pdf       Org registration cert PDF (upload to Category document slot)
  README.md              This file
```
