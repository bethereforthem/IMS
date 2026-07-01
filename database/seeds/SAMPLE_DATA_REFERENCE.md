# IMS v3.0 — Sample Database Reference

> All names, ID numbers, case references, and biographical data are **entirely fictional**.
> Created for development and testing purposes only.

---

## Login Credentials

All sample accounts share:
- **Password**: `IMS@Sample2026!`
- **TOTP secret** (base32): `JBSWY3DPEHPK3PXP`
- Add to any authenticator app (Google / Microsoft Authenticator) to generate valid TOTP codes.

---

## Sample Users

### NISS (TOP SECRET clearance)
| Badge | Name | Role |
|---|---|---|
| NISS-DIR-001 | Jean-Pierre Habimana | NISS_DIRECTOR (emergency lockdown authority) |
| NISS-DIR-002 | Aimable Nzeyimana | NISS_DIRECTOR (second auth for lockdown) |
| NISS-OFF-003 | Claudine Mukasine | NISS_OFFICER |
| NISS-OFF-004 | Patrick Rwigamba | NISS_OFFICER |
| NISS-SIEM-005 | Diane Ingabire | SIEM_ANALYST |

### RNP (Rwanda National Police)
| Badge | Name | Role |
|---|---|---|
| RNP-CMD-001 | Commissaire Bernard Nkurunziza | RNP_COMMANDER |
| RNP-CMD-002 | Commissaire Alice Mukamana | RNP_COMMANDER |
| RNP-DET-003 | Inspecteur Théogène Bizimana | RNP_DETECTIVE |
| RNP-DET-004 | Inspecteur Grace Uwimana | RNP_DETECTIVE |
| RNP-DET-005 | Inspecteur Emmanuel Nshimiyimana | RNP_DETECTIVE |
| RNP-PAT-006 | Agent Jacqueline Mukamurenzi | RNP_PATROL |
| RNP-PAT-007 | Agent François Nzabonimpa | RNP_PATROL |
| RNP-PAT-008 | Agent Solange Uwera | RNP_PATROL |
| RNP-ADM-009 | Ingénieur Oscar Karangwa | SYSTEM_ADMIN |

### RIB (Rwanda Investigation Bureau)
| Badge | Name | Role |
|---|---|---|
| RIB-INV-001 | Pascal Habimana | RIB_INVESTIGATOR |
| RIB-INV-002 | Rose Kayitesi | RIB_INVESTIGATOR |
| RIB-INV-003 | Sylvain Ndayisaba | RIB_INVESTIGATOR |
| RIB-ANA-004 | Martine Uwiringiyimana | RIB_ANALYST |
| RIB-ANA-005 | Christian Niyonsenga | RIB_ANALYST |

### RDF (Rwanda Defence Force)
| Badge | Name | Role |
|---|---|---|
| RDF-CMD-001 | Colonel Théophile Buregeya | RDF_COMMANDER |
| RDF-CMD-002 | Lt-Col Vénuste Hakizimana | RDF_COMMANDER |
| RDF-BRD-003 | Sergent Janvier Nkurikiyimana | RDF_BORDER_OFFICER |
| RDF-BRD-004 | Sergent Espérance Murorunkwere | RDF_BORDER_OFFICER |
| RDF-BRD-005 | Caporal John Rugamba | RDF_BORDER_OFFICER |

### RCS (Rwanda Correctional Service)
| Badge | Name | Role |
|---|---|---|
| RCS-SUP-001 | Surintendant Joseph Muvunyi | RCS_SUPERINTENDENT |
| RCS-SUP-002 | Surintendante Chantal Nyiransabimana | RCS_SUPERINTENDENT |
| RCS-OFF-003 | Didier Rutagengwa | RCS_OFFICER |
| RCS-OFF-004 | Immaculée Mukandori | RCS_OFFICER |

### Irondo & Dasso (limited access)
| Badge | Name | Role |
|---|---|---|
| IRO-PAT-001 | Augustin Harerimana | IRONDO_PATROL |
| IRO-PAT-002 | Félicité Mukabagwiza | IRONDO_PATROL |
| DAS-OFF-001 | Révérien Nsengimana | DASSO_OFFICER |
| DAS-OFF-002 | Vestine Umulisa | DASSO_OFFICER |

---

## Sample Suspects

| IMS Reference | Name | Status | Threat | NID (fictional) |
|---|---|---|---|---|
| RWA-IMS-2024-00001 | Alexis Mugisha | **WANTED** | ⭐⭐⭐⭐⭐ | 1199780012345001 |
| RWA-IMS-2024-00002 | Christine Uwimana | IN_CUSTODY | ⭐⭐⭐ | 1198560023456002 |
| RWA-IMS-2023-00001 | Pierre Nsengiyumva | CONVICTED | ⭐⭐⭐⭐ | 1197040034567003 |
| RWA-IMS-2025-00001 | Dieudonne Kabera | ACTIVE | ⭐⭐⭐ | 1199920045678004 |
| RWA-IMS-2024-00003 | Goreth Mukamana | **WANTED** | ⭐⭐⭐⭐ | 1198800056789005 |
| RWA-IMS-2025-00002 | Jean Niyongabo | INTERPOL_FLAGGED | ⭐⭐⭐⭐⭐ | 1196560067890006 |
| RWA-IMS-2026-00001 | Fidele Hakizimana | ARRESTED | ⭐⭐ | 1197660078901007 |
| RWA-IMS-2022-00001 | Solange Uwera | RELEASED | ⭐ | 1199100089012008 |
| RWA-IMS-2025-00003 | Vital Bizimungu | ACTIVE | ⭐⭐⭐ | 1198340090123009 |
| RWA-IMS-2025-00004 | Eric Ndayambaje | **WANTED** | ⭐⭐⭐⭐ | 1199560001234010 |
| RWA-IMS-2023-00002 | Théodore Karangwa | CONVICTED | ⭐⭐⭐ | 1196820012345011 |
| RWA-IMS-2026-00002 | Cécile Iradukunda | ACTIVE | ⭐⭐⭐⭐⭐ | 1199240023456012 |

> To test NID scan: Use any NID above in the DIV app — the system will find the criminal record and transmit location.
> `1200150034567999` is a clean citizen NID (no record — tests the data-not-retained path).

---

## Sample Cases

| Reference | Title | Status | Lead |
|---|---|---|---|
| RWA-RNP-2024-00034 | Armed Robbery — Kigali CBD | UNDER_INVESTIGATION | RNP-DET-003 |
| RWA-RIB-2024-00012 | SACCO Fraud — Musanze | PROSECUTION | RIB-INV-001 |
| RWA-RNP-2022-00089 | Homicide — Nyamirambo | CLOSED | RNP-DET-004 |
| RWA-RIB-2025-00007 | Cybercrime Banking Fraud | UNDER_INVESTIGATION | RIB-INV-002 |
| RWA-RIB-2024-00019 | Human Trafficking Corridor | UNDER_INVESTIGATION | RIB-INV-001 |
| RWA-NISS-2026-00003 | Cross-Border Organized Crime | OPEN (TOP SECRET) | NISS-OFF-003 |
| RWA-RIB-2026-00001 | Corruption — Civil Service | UNDER_INVESTIGATION | RIB-INV-002 |
| RWA-RNP-2025-00056 | Drug Trafficking — Kigali | OPEN | RNP-DET-003 |
| RWA-RDF-2025-00003 | Border Smuggling — Gatuna | UNDER_INVESTIGATION | RDF-CMD-001 |

---

## Camera Nodes

| Node ID | Location | Institution | Status |
|---|---|---|---|
| GTN-BORDER-01..04 | Gatuna Border Post (RW-UG) | RDF | Online |
| KGL-AIRPORT-01..03 | Kigali International Airport | RNP / NISS | Online |
| KGL-BUSPARK-01..02 | Nyabugogo Bus Terminal | RNP | Online |
| KGL-CBD-01 | KG Ave Checkpoint | RNP | Online |
| MSZ-JUNCTION-01..02 | Musanze Northern Entry | RNP | Online |
| RBV-BORDER-01..02 | Rubavu/Gisenyi (DRC border) | RDF | Online |
| RSZ-BORDER-01 | Rusizi (DRC/Burundi border) | RDF | Online |
| NYG-BORDER-01 | Nyagatare Eastern Border | RDF | **OFFLINE** (triggers SIEM rule) |

---

## Interpol Notices

| File Number | Color | Subject | Issuing Country |
|---|---|---|---|
| A-5674/2-2025 | 🔴 RED | Jean Niyongabo | COD (DRC) |
| A-3311/4-2026 | 🔴 RED | Mohammed Al-Rashidi | SAU |
| B-2250/1-2026 | 🔵 BLUE | Akello Grace | UGA |

---

## Intelligence Events — Source Tag Examples

| Event | Source Tag | Description |
|---|---|---|
| Bizimungu at Gatuna border | `CCTV_NODE` | Camera GTN-BORDER-04, confidence 0.962 |
| Mugisha NID scan at checkpoint | `NID_SCAN` | Officer RNP-PAT-006, warrant active |
| Mukamana face scan at airport | `FACE_SCAN` | Officer RIB-INV-002, confidence 0.971 |
| Kabera NID manual entry | `NID_MANUAL` | Officer RIB-INV-001, criminal record found |
| Ndayambaje at Bus Park | `CCTV_NODE` | Camera KGL-BUSPARK-01, confidence 0.943 |
| Hakizimana observation | `OFFICER_REPORT` | Manual report, RIB-INV-002 |
| Niyongabo Red Notice | `INTERPOL_FEED` | I-24/7 ingestion, auto-linked to NISS profile |
| Iradukunda hotel meeting | `FACE_SCAN` | PROBABLE match (0.887), pending review |
| Clean citizen at checkpoint | `NID_SCAN` | No criminal record — data discarded ✓ |
| Uganda CID face query | `PARTNER_QUERY` | No match — 0.712 confidence, NISS reviewed |

---

## Corrections Records

| Suspect | Facility | Status | Sentence |
|---|---|---|---|
| Christine Uwimana | Mageragere Prison | PRE_TRIAL | Pending verdict |
| Pierre Nsengiyumva | Mpanga Central Prison | SENTENCED | 25 years (2023–2048) |
| Fidele Hakizimana | Kigali Central Prison | PRE_TRIAL | Pending arraignment |

---

## International Partners

| Code | Country | MOU Identity Exchange |
|---|---|---|
| UGA | Uganda | YES |
| KEN | Kenya | NO |
| COD | DR Congo | NO |

---

## SIEM Events (pre-loaded historical)

| Rule | Severity | Status |
|---|---|---|
| BULK_ENUMERATION | HIGH | Reviewed (drill scenario) |
| OFF_HOURS_ACCESS | MEDIUM | Reviewed (no action) |
| CAMERA_NODE_OFFLINE (NYG-BORDER-01) | MEDIUM | **Unreviewed** |
| LOCATION_OVERACCESS | HIGH | Reviewed (system audit) |
