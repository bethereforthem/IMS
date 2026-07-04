# Rwanda Criminal Intelligence Management System (IMS)
## Plain-Language Guide — Who Uses It, What They Do, and Why It Matters

---

## What Is This System?

Before IMS existed, Rwanda's security institutions — the police, the intelligence service, the army, the prisons — each kept their own separate records. If the Rwanda National Police arrested a suspect, the Rwanda Investigation Bureau might not know about it. If NISS flagged a dangerous individual, the border officer checking IDs at Gatuna might have no idea. Information sat in filing cabinets, spreadsheets, and siloed databases that did not talk to each other.

**IMS changes that.** It is a single, secure digital platform where all of Rwanda's key security institutions share criminal intelligence in real time. A record created by one institution is instantly visible to the others — within the boundaries of what each institution is allowed to see.

The result: faster decisions, fewer dangerous people slipping through the gaps, and a complete trail of who did what and when — so there is accountability at every level.

---

## The Six Institutions — What They Do and How IMS Helps Them

---

### 1. NISS — National Intelligence and Security Service

**Who they are:**
NISS is Rwanda's apex intelligence authority — the institution at the top of the security hierarchy. They do not patrol streets or run prisons. Their job is to see the full picture: who are the threats, where are they, what are they doing, and how do all the pieces connect across the country and across borders.

**What they do on the system:**

- **Directors** have the highest clearance and can see every suspect, every case, every alert, and every audit entry across all institutions simultaneously.
- They build and maintain the national suspect database. When a new dangerous individual is identified, NISS creates their profile, assigns a threat classification (scale 1–10), and makes it visible to all relevant institutions.
- They monitor the country's full CCTV and camera-node network — knowing which nodes are online, which are offline, and what intelligence each is capturing.
- They manage relationships with international partners (Interpol, foreign intelligence agencies) — approving partner access, tracking international queries, and flagging Interpol notices against suspects.
- The NISS Director can, in a declared national security emergency, lock down the entire system in a single command — immediately suspending access for all non-NISS users until the threat passes. This action requires confirmation from a second Director.
- **SIEM Analysts** within NISS monitor system-level security events: failed login attempts, abnormal API access patterns, privilege escalations, and audit anomalies. They review, annotate, and escalate technical security incidents without accessing full criminal case files.
- They maintain the audit log — a permanent, tamper-proof record of every action taken on the system by anyone, across all institutions.

**Why this matters:**
Before IMS, connecting the dots between a suspect spotted at the border, a case under investigation in Kigali, and an Interpol notice from Nairobi required phone calls, emails, and days of waiting. Now NISS sees all of it on one screen, in seconds.

> **Key point:** NISS is the brain of the system. They do not need to be everywhere physically because the system brings all the information to them.

---

### 2. RNP — Rwanda National Police

**Who they are:**
The Rwanda National Police are the frontline law enforcement institution. Officers are on the streets every day — responding to crime, conducting investigations, issuing warrants, and catching wanted individuals.

**What they do on the system:**

- **Commanders** have full operational visibility: they can search suspects, manage active cases, issue and revoke arrest warrants, and track where their patrol units are operating on a live map.
- **Detectives** open and manage criminal cases, build evidence files, link suspects to cases, and coordinate with RIB when investigations overlap.
- They maintain the national wanted persons list. When a warrant is issued, every other institution — including border posts and village-level checkpoints — sees it immediately.
- Detectives can query Interpol to check whether a suspect has an international criminal record or is subject to an Interpol notice.
- The **live patrol map** shows camera nodes, intelligence events, and — critically — village-level detections. When a village leader flags a wanted individual, an orange alert marker appears on this map in real time with full suspect details, so the nearest unit can respond.
- **CCTV alerts** feed into the RNP alerts dashboard as they are triggered. Every alert is categorised by severity (CRITICAL, HIGH, MEDIUM, LOW) and can be marked read or escalated.
- **System Administrators** within RNP manage camera node registration, infrastructure configuration, and technical maintenance of the national node network.

**Why this matters:**
An RNP detective working a case in Musanze used to have no easy way of knowing whether the same suspect was already being investigated by RIB in Kigali, or whether they were already flagged by NISS. Now the information is shared automatically, so investigations do not overlap and suspects cannot exploit the gaps between institutions.

> **Key point:** RNP gets instant answers in the field and coordinates investigations across the country without paperwork delays. Village-level alerts reach the RNP map the moment they are triggered.

---

### 3. RIB — Rwanda Investigation Bureau

**Who they are:**
The Rwanda Investigation Bureau handles serious and complex criminal investigations — corruption, financial crime, organised crime, and cases that require deep, long-running investigative work. RIB operates independently from the police to ensure impartiality in high-profile cases.

**What they do on the system:**

- **Investigators** open and manage cases with full detail: suspects, evidence, timelines, connections between individuals, and court-ready documentation. They can see whether a suspect they are investigating is already known to RNP or NISS, preventing duplicated effort and revealing connections the investigator might not have found independently.
- Investigators can create and update suspect profiles, attach case references to suspects, and coordinate custody handoffs with RCS when a subject is detained.
- They file field intelligence reports — documenting observed activity, locations, and associates — so the information is captured and shared in real time without waiting for a formal report to be typed up later.
- **Analysts** support investigators without accessing full case files. They monitor watchlists for new activity, track intelligence event feeds, identify patterns across multiple cases, and produce summaries for investigators and leadership. Analysts have a dedicated dashboard separate from investigators — focused on signals and trends rather than case management.

**Why this matters:**
Complex investigations often span months. Before IMS, an RIB investigator might spend weeks building a picture of a suspect's network, only to discover late in the process that RNP already had key information sitting in a different database. Now both institutions see the same data from day one.

> **Key point:** RIB can build stronger, faster cases because they work with the full national picture — not just what their own team has collected. The distinction between Investigator and Analyst dashboards ensures each role sees exactly what they need, without information overload.

---

### 4. RDF — Rwanda Defence Force

**Who they are:**
The Rwanda Defence Force protects national borders and handles threats to national security that go beyond normal policing. At border crossing points and sensitive national installations, RDF personnel are the first line of defence against infiltration and illegal entry.

**What they do on the system:**

- **Commanders** have full strategic visibility: they can view suspects flagged by NISS or RNP, monitor all border camera nodes, track intelligence events at crossings, and coordinate deployments across border posts.
- **Border Officers** at crossing points scan the National IDs of people entering or leaving Rwanda. The system instantly returns whether that person is wanted, flagged, or has a confirmed criminal record — without radio calls or dispatcher delays.
- The **Border Intelligence Map** shows Rwanda and all neighbouring countries (Uganda, DRC, Burundi, Tanzania) with English-language labels and live overlays: camera node status, recent CCTV detections, and border crossing intelligence events.
- Border posts — Gatuna (Uganda), Rubavu (DRC), Rusizi (Burundi), Nyagatare (Uganda) — each have their own camera node dashboard with per-post detection counts and online/offline status.
- Face recognition at border crossing cameras (InsightFace via Raspberry Pi 4 nodes) triggers automatic intelligence events when a match is detected, immediately alerting the duty officer.
- RDF feeds border crossing detections into the shared intelligence system, so that if a suspect identified at a border is already under RIB investigation or subject to an RNP warrant, both institutions are notified simultaneously.

**Why this matters:**
A wanted suspect who knows that RNP is looking for them in Kigali might try to cross at a small border post, assuming the information has not reached that officer yet. With IMS, the border officer scanning IDs has the same information as the RNP detective pursuing the case — the suspect cannot outrun the system.

> **Key point:** RDF closes the border gap. Wanted individuals can no longer escape by moving to a crossing point that "does not know" about them.

---

### 5. RCS — Rwanda Correctional Service

**Who they are:**
The Rwanda Correctional Service runs the country's prisons and correctional facilities. Their job is to hold convicted persons and remand prisoners securely, manage their rehabilitation, and process court-ordered changes to custody — transfers, sentence completions, and early release decisions.

**What they do on the system:**

- **Superintendents and Officers** maintain a live register of every inmate: which facility they are in, their cell block, custody status (Pre-Trial or Sentenced), sentence length, threat level, intake date, and next scheduled review date.
- Upcoming review dates are flagged automatically — highlighted in amber when a review is within 14 days and in urgent amber when within 7 days — so that no prisoner's review is missed due to administrative oversight.
- When a court issues a correction order — a transfer, a sentence adjustment, a release — RCS records it on the system immediately. Institutions like NISS and RNP see the updated custody status in real time.
- The **Corrections Records** view provides a full table of all detainees with sentence analytics: average sentence length, pre-trial vs. sentenced breakdown, and graphical reporting for facility management.
- RCS officers can look up whether a person being processed into their facility is already known to other institutions — their criminal history, active cases, and any special handling instructions from RNP or RIB.
- A dedicated **Custody Alerts** feed shows security notifications relevant to correctional facilities — escape detection events (RFID perimeter monitoring), threat escalations, and court-ordered status changes — filtered by severity.

**Why this matters:**
Before IMS, a prisoner could theoretically be released from a facility while an active arrest warrant from a different institution was sitting in someone else's inbox, unprocessed. Now the warrant is visible to the facility at the moment of processing — nothing falls through the cracks.

> **Key point:** RCS has a complete and live picture of every person in custody, and the rest of the security system knows the moment custody status changes.

---

### 6. Village Leader — Community Intelligence Reporting

**Who they are:**
Village Leaders are community security representatives operating at the cell and village level — the people who know their community and notice when something is wrong. They are not police officers and do not have access to criminal case files or suspect identities. They are the eyes and ears of the security system at the most local level.

**What they do on the system:**

- **NID Check:** Village leaders can scan a person's 16-digit National ID number on the spot — during a community check, at a local event, or when something seems suspicious. The system returns one of two results only:
  - **Criminal record found** — the system shows only the criminal classification: threat level (1–10), custody status (Wanted / Under Arrest / Convicted), and which institution owns the record. No name, no case details, no identity information is revealed to the village leader.
  - **No record found** — the check returns clean. No data about the person is stored. Their privacy is fully protected.
- **Automatic Location Capture:** When a criminal record is found, the system automatically captures the GPS coordinates of the device performing the check.
- **Automatic RNP Alert:** At the moment of a positive match, the system sends a CRITICAL alert to the RNP operations dashboard and places an orange marker on the RNP patrol map showing the exact location of the detection. RNP officers can click the marker to see the full suspect profile and respond accordingly.
- **Community Insecurity Reports:** Village leaders can formally report individuals who repeatedly cause insecurity in their community — theft, assault, drug dealing, suspicious activity, domestic violence, threats, or property damage. Each report includes: the type of insecurity, a description of the person (name if known), the location, a full incident description, and optional image or video exhibits as evidence.
- Reports submitted by village leaders are forwarded to RNP Command as HIGH-severity alerts tagged **VILLAGE INTEL**, ensuring they are reviewed by officers with the authority to investigate further.

**Why this matters:**
Village leaders cannot be expected to memorise tens of thousands of wanted individuals, and they cannot be given access to sensitive criminal databases. IMS gives them exactly what they need — a simple yes/no answer — while automatically doing the complex work behind the scenes: capturing location, alerting police, and logging the event.

> **Key point:** Village leaders turn every community checkpoint into an intelligent verification point, without ever seeing classified information. A wanted fugitive cannot blend into a neighbourhood because even the local community representative can trigger a police response in seconds.

---

## How These Institutions Work Together

The real power of IMS is not what any single institution can do — it is what happens when all six are connected.

A realistic example of how the system works across institutions:

1. A **Village Leader** scans an ID at a community gathering. The system quietly returns: criminal record found. The village leader sees only the threat level and status — not the name.
2. An automatic **CRITICAL alert** appears on the **RNP** operations dashboard and a pulsing orange marker appears on the RNP patrol map with the exact GPS coordinates.
3. The RNP officer dispatched to the location opens the map marker and sees the full suspect profile — name, IMS reference, status, threat level, and links to active cases.
4. RNP notifies **RIB** if the suspect is linked to an ongoing investigation. Both institutions coordinate the arrest in real time.
5. **NISS** sees the full chain of events in the audit log and can check whether the suspect has any international connections or Interpol notices.
6. **RDF** border alerts are updated simultaneously — if anyone connected to this individual attempts to cross a border in the next hour, the border officer scanning IDs will see the flag immediately.
7. Once in custody, **RCS** receives the suspect's record automatically and opens an inmate file with their threat level, case links, and handling instructions pre-filled.

This entire sequence — from a community checkpoint to a coordinated arrest to a custody record — happens in minutes, with every institution seeing exactly what they need to see.

Without IMS, the same sequence would require phone calls between institutions, manual record lookups, physical paperwork transfers, and could take days — during which the suspect may disappear.

---

## Summary — What IMS Solves

| Problem Before IMS | How IMS Solves It |
|---|---|
| Each institution kept its own separate records | One shared platform — all institutions see relevant information instantly |
| A wanted person could cross a border before the alert reached the border post | Border officers have live access to the same national watchlist as investigators |
| Community patrol had no reliable way to identify dangerous individuals | Village leader NID scanner gives an instant yes/no result without exposing sensitive data |
| A suspect could be investigated by two institutions without either knowing | Investigators see if a suspect already has a case with another institution |
| Prisoners could be released while active warrants existed in another institution's inbox | Custody changes are visible to all relevant institutions in real time |
| No single institution could see the full national security picture | NISS has a live command view of the entire country's security activity |
| No permanent record of who accessed what information and when | Every action is recorded in a tamper-proof audit log |
| Village-level detections were never formally reported or acted on quickly | Village Intel alerts reach the RNP map within seconds of an NID match |
| Analysts and investigators used the same tools despite different needs | RIB has separate Investigator and Analyst dashboards tailored to each role |

---

## Who Can See What — Simple Version

| Information | Who can access it |
|---|---|
| Full suspect profiles, case details, intelligence reports | NISS, RNP (Commanders & Detectives), RIB Investigators, RDF Commanders |
| Whether a person has a criminal record (yes/no only) + criminal classification | Village Leaders (classification only — no identity) |
| Criminal record check (full result) | RNP Patrol, RDF Border Officers, RIB |
| Live patrol map with camera nodes and intel events | NISS (all), RNP (their view + village intel layer), RDF (border map) |
| Village Intel alerts and detections | RNP (via alerts dashboard and patrol map) |
| Prison and custody records | NISS, RNP, RIB (read), RCS (manage) |
| International criminal records and Interpol queries | NISS, RNP, RIB, RDF Commanders |
| System security events (SIEM log) | NISS Directors and SIEM Analysts only |
| The full audit trail of all system activity | NISS only |
| Emergency system lockdown | NISS Director only (dual-Director confirmation required) |
