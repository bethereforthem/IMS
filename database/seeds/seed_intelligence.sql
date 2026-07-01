-- ============================================================
-- IMS v3.0 — Sample Intelligence Events, NID Verifications,
--            Location Records & Alerts
-- Demonstrates all 8 source tags and all confidence tiers
-- ============================================================

DO $$
DECLARE
  -- Officers
  off_rnp_det1  UUID; off_rnp_det2 UUID; off_rnp_pat1 UUID;
  off_rib_inv1  UUID; off_rib_inv2 UUID;
  off_rdf_brd1  UUID; off_rdf_brd2 UUID;
  off_rcs_sup   UUID;
  off_niss_off  UUID;

  -- Suspects
  s_mugisha     UUID; s_uwimana    UUID; s_nsengiyumva UUID;
  s_kabera      UUID; s_mukamana   UUID; s_niyongabo   UUID;
  s_hakizimana  UUID; s_bizimungu  UUID; s_ndayambaje  UUID;
  s_iradukunda  UUID;

  -- Camera nodes (will be created in seed_infrastructure)
  -- We reference node IDs by string

  -- Intelligence event IDs
  ev1  UUID := gen_random_uuid();  -- CCTV_NODE — Gatuna border, Bizimungu
  ev2  UUID := gen_random_uuid();  -- NID_SCAN — Mugisha at checkpoint
  ev3  UUID := gen_random_uuid();  -- FACE_SCAN — Mukamana at Kigali Airport
  ev4  UUID := gen_random_uuid();  -- NID_MANUAL — Kabera, no criminal record shown
  ev5  UUID := gen_random_uuid();  -- CCTV_NODE — Kigali Bus Park, Ndayambaje
  ev6  UUID := gen_random_uuid();  -- OFFICER_REPORT — Suspicious activity, Hakizimana
  ev7  UUID := gen_random_uuid();  -- INTERPOL_FEED — Niyongabo Red Notice ingestion
  ev8  UUID := gen_random_uuid();  -- FACE_SCAN — Iradukunda probable match
  ev9  UUID := gen_random_uuid();  -- NID_SCAN — clean citizen (no record, data discarded)
  ev10 UUID := gen_random_uuid();  -- FACE_SCAN + INTERPOL — Niyongabo airport
  ev11 UUID := gen_random_uuid();  -- SYSTEM_ALERT — escape attempt flag
  ev12 UUID := gen_random_uuid();  -- NID_SCAN — Uwimana RCS intake
  ev13 UUID := gen_random_uuid();  -- PARTNER_QUERY — Uganda police face query
  ev14 UUID := gen_random_uuid();  -- CCTV_NODE — Musanze junction, Mugisha possible

  -- NID verification IDs
  nv1 UUID := gen_random_uuid();
  nv2 UUID := gen_random_uuid();
  nv3 UUID := gen_random_uuid();
  nv4 UUID := gen_random_uuid();

  -- Alert IDs
  al1 UUID := gen_random_uuid();
  al2 UUID := gen_random_uuid();
  al3 UUID := gen_random_uuid();
  al4 UUID := gen_random_uuid();
  al5 UUID := gen_random_uuid();
  al6 UUID := gen_random_uuid();

BEGIN
  -- Load officer IDs
  SELECT id INTO off_rnp_det1 FROM users WHERE badge_number = 'RNP-DET-003';
  SELECT id INTO off_rnp_det2 FROM users WHERE badge_number = 'RNP-DET-004';
  SELECT id INTO off_rnp_pat1 FROM users WHERE badge_number = 'RNP-PAT-006';
  SELECT id INTO off_rib_inv1 FROM users WHERE badge_number = 'RIB-INV-001';
  SELECT id INTO off_rib_inv2 FROM users WHERE badge_number = 'RIB-INV-002';
  SELECT id INTO off_rdf_brd1 FROM users WHERE badge_number = 'RDF-BRD-003';
  SELECT id INTO off_rdf_brd2 FROM users WHERE badge_number = 'RDF-BRD-004';
  SELECT id INTO off_rcs_sup  FROM users WHERE badge_number = 'RCS-SUP-001';
  SELECT id INTO off_niss_off FROM users WHERE badge_number = 'NISS-OFF-003';

  -- Load suspect IDs
  SELECT id INTO s_mugisha     FROM suspects WHERE ims_reference = 'RWA-IMS-2024-00001';
  SELECT id INTO s_uwimana     FROM suspects WHERE ims_reference = 'RWA-IMS-2024-00002';
  SELECT id INTO s_nsengiyumva FROM suspects WHERE ims_reference = 'RWA-IMS-2023-00001';
  SELECT id INTO s_kabera      FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00001';
  SELECT id INTO s_mukamana    FROM suspects WHERE ims_reference = 'RWA-IMS-2024-00003';
  SELECT id INTO s_niyongabo   FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00002';
  SELECT id INTO s_hakizimana  FROM suspects WHERE ims_reference = 'RWA-IMS-2026-00001';
  SELECT id INTO s_bizimungu   FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00003';
  SELECT id INTO s_ndayambaje  FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00004';
  SELECT id INTO s_iradukunda  FROM suspects WHERE ims_reference = 'RWA-IMS-2026-00002';

  -- ============================================================
  -- INTELLIGENCE EVENTS
  -- ============================================================
  INSERT INTO intelligence_events
    (id, source_tag, source_device_id, officer_id, institution,
     suspect_id, location_lat, location_lng, location_accuracy_m,
     classification, criminal_record_found, confidence, face_frame_hash,
     notes, event_timestamp)
  VALUES

  -- EV1: CCTV_NODE — Gatuna Border, Bizimungu — HIGH CONFIDENCE
  (ev1, 'CCTV_NODE', 'GTN-BORDER-04', NULL, 'RDF',
   s_bizimungu, -1.3773, 29.7551, NULL,
   'TOP_SECRET', TRUE, 0.962,
   'a7f3c91b2e8d4f6a1c3b5e7d9f2a4c6b8e1d3f5a7c9b1e3d5f7a2c4b6e8d1f3',
   'Suspect attempting to cross into Uganda on foot via unofficial track 200m east of main gate. Vehicle check ongoing.',
   '2026-06-26 07:14:32+02'),

  -- EV2: NID_SCAN — Patrol checkpoint, Mugisha Alexis — criminal record found
  (ev2, 'NID_SCAN', NULL, off_rnp_pat1, 'RNP',
   s_mugisha, -1.9441, 30.0619, 8,
   'TOP_SECRET', TRUE, NULL,
   NULL,
   'Mugisha Alexis NID scan at KG Ave vehicle checkpoint. Warrant active. Officer alerted. Suspect fled on foot before arrest.',
   '2026-06-26 10:45:11+02'),

  -- EV3: FACE_SCAN — Kigali Airport, Mukamana — HIGH confidence
  (ev3, 'FACE_SCAN', NULL, off_rib_inv2, 'RIB',
   s_mukamana, -1.9685, 30.1395, 12,
   'TOP_SECRET', TRUE, 0.971,
   'b2c4d6e8f1a3b5c7d9e2f4a6b8c1d3e5f7a9b2c4d6e8f1a3b5c7d9e2f4a6b8c1',
   'Mukamana Goreth identified at Kigali International Airport departure terminal. Attempted travel to Dubai. Passport seized. NISS notified.',
   '2026-06-24 14:22:05+02'),

  -- EV4: NID_MANUAL — Kabera Dieudonne — criminal record found
  (ev4, 'NID_MANUAL', NULL, off_rib_inv1, 'RIB',
   s_kabera, -1.9503, 30.0614, 15,
   'TOP_SECRET', TRUE, NULL,
   NULL,
   'RIB officer entered Kabera NID number following tip-off. Criminal record confirmed. Location transmitted.',
   '2026-06-20 16:05:30+02'),

  -- EV5: CCTV_NODE — Kigali Bus Park, Ndayambaje — HIGH confidence
  (ev5, 'CCTV_NODE', 'KGL-BUSPARK-01', NULL, 'RNP',
   s_ndayambaje, -1.9472, 30.0602, NULL,
   'TOP_SECRET', TRUE, 0.943,
   'c3d5e7f9a1b3c5d7e9f2a4b6c8d1e3f5a7b9c2d4e6f8a1b3c5d7e9f2a4b6c8d1',
   'CCTV node detected Ndayambaje at Nyabugogo Bus Terminal. Active WANTED status. RNP dispatch notified.',
   '2026-06-25 09:33:17+02'),

  -- EV6: OFFICER_REPORT — Hakizimana suspicious activity prior to arrest
  (ev6, 'OFFICER_REPORT', NULL, off_rib_inv2, 'RIB',
   s_hakizimana, -1.9734, 30.1021, 20,
   'CONFIDENTIAL', TRUE, NULL,
   NULL,
   'Manual report by RIB investigator. Hakizimana observed accepting cash envelope from contractor at sector office entrance. Corroborates corruption allegation.',
   '2026-05-28 11:15:00+02'),

  -- EV7: INTERPOL_FEED — Niyongabo Red Notice ingestion from I-24/7
  (ev7, 'INTERPOL_FEED', NULL, NULL, 'NISS',
   s_niyongabo, NULL, NULL, NULL,
   'TOP_SECRET', TRUE, NULL,
   NULL,
   'Red Notice A-5674/2-2025 received via Interpol I-24/7 channel. DRC issuing authority. Linked to existing NISS profile.',
   '2025-12-02 03:00:00+02'),

  -- EV8: FACE_SCAN — Iradukunda, PROBABLE match (pending human review)
  (ev8, 'FACE_SCAN', NULL, off_niss_off, 'NISS',
   s_iradukunda, -1.9403, 30.0618, 10,
   'TOP_SECRET', TRUE, 0.887,
   'd4e6f8a1b3c5d7e9f2a4b6c8d1e3f5a7b9c2d4e6f8a1b3c5d7e9f2a4b6c8d1e3',
   'NISS surveillance operation. Iradukunda Cécile probable facial match at Kigali Serena Hotel meeting. Sent to human review queue.',
   '2026-06-18 20:40:00+02'),

  -- EV9: NID_SCAN — Clean citizen, NO criminal record (data discarded per Law 058/2021)
  (ev9, 'NID_SCAN', NULL, off_rnp_pat1, 'RNP',
   NULL, NULL, NULL, NULL,
   'UNCLASSIFIED', FALSE, NULL,
   NULL,
   'Routine checkpoint scan. Identity verified against NIDA. No criminal record. Citizen data not retained per Law No. 058/2021.',
   '2026-06-27 08:22:00+02'),

  -- EV10: FACE_SCAN + INTERPOL — Niyongabo at Kigali Airport (source chain links ev7)
  (ev10, 'FACE_SCAN', NULL, off_niss_off, 'NISS',
   s_niyongabo, -1.9685, 30.1395, 5,
   'TOP_SECRET', TRUE, 0.974,
   'e5f7a9b2c4d6e8f1a3b5c7d9e2f4a6b8c1d3e5f7a9b2c4d6e8f1a3b5c7d9e2f4',
   'HIGH CONFIDENCE face match: Niyongabo Jean — Interpol Red Notice subject — at Kigali International Airport transit zone. NISS-only alert. Arrest coordinated with airport security.',
   '2026-06-22 14:55:00+02',
   ev7),  -- links to INTERPOL_FEED event

  -- EV11: SYSTEM_ALERT — Nsengiyumva sentence end approaching
  (ev11, 'SYSTEM_ALERT', NULL, NULL, 'RCS',
   s_nsengiyumva, NULL, NULL, NULL,
   'CONFIDENTIAL', FALSE, NULL,
   NULL,
   'SYSTEM: Prisoner Nsengiyumva Pierre sentence end date within 90 days. Pre-release risk assessment required. Automatic notification sent to RNP and NISS.',
   '2026-04-01 06:00:00+02'),

  -- EV12: NID_SCAN — Uwimana Christine at RCS intake
  (ev12, 'NID_SCAN', NULL, off_rcs_sup, 'RCS',
   s_uwimana, -1.9590, 30.0611, 5,
   'TOP_SECRET', TRUE, NULL,
   NULL,
   'RCS intake identity verification for Uwimana Christine. NID scan confirmed match with IMS criminal record. Criminal record transmitted at TOP SECRET.',
   '2024-06-15 10:30:00+02'),

  -- EV13: PARTNER_QUERY — Uganda CID face image query via NISS gateway
  (ev13, 'PARTNER_QUERY', 'UGA-CID', NULL, 'NISS',
   NULL, NULL, NULL, NULL,
   'CONFIDENTIAL', FALSE, 0.712,
   'f6a8b1c3d5e7f9a2b4c6d8e1f3a5b7c9d2e4f6a8b1c3d5e7f9a2b4c6d8e1f3a5',
   'Uganda Criminal Investigations Directorate submitted face image query. Possible match confidence 0.712 — below PROBABLE threshold. Sent to NISS human review. No match returned to partner.',
   '2026-06-15 11:00:00+02'),

  -- EV14: CCTV_NODE — Musanze border junction, Mugisha POSSIBLE match
  (ev14, 'CCTV_NODE', 'MSZ-JUNCTION-02', NULL, 'RNP',
   s_mugisha, NULL, NULL, NULL,
   'CONFIDENTIAL', FALSE, 0.776,
   'a1b3c5d7e9f2a4b6c8d1e3f5a7b9c2d4e6f8a1b3c5d7e9f2a4b6c8d1e3f5a7b9',
   'POSSIBLE match at Musanze junction camera. Confidence 0.776 — below PROBABLE threshold. Sent to human review queue. Location NOT transmitted.',
   '2026-06-23 16:42:00+02')

  ON CONFLICT DO NOTHING;

  -- Fix ev10 to include linked_event_ids (source chain)
  UPDATE intelligence_events
  SET linked_event_ids = ARRAY[ev7]
  WHERE id = ev10;

  -- ============================================================
  -- NID VERIFICATIONS (DIV App records)
  -- ============================================================
  INSERT INTO nid_verifications
    (id, method, officer_id, national_id_hash, nida_match,
     ims_criminal_record, suspect_id_linked,
     location_lat, location_lng, classification,
     citizen_data_retained, intelligence_event_id, verified_at)
  VALUES
  -- NV1: Mugisha NID_SCAN — criminal record found
  (nv1, 'NID_SCAN', off_rnp_pat1,
   encode(sha256('1199780012345001'), 'hex'),
   TRUE, TRUE, s_mugisha,
   -1.9441, 30.0619,
   'TOP_SECRET', FALSE, ev2,
   '2026-06-26 10:45:11+02'),

  -- NV2: Uwimana NID_SCAN — RCS intake
  (nv2, 'NID_SCAN', off_rcs_sup,
   encode(sha256('1198560023456002'), 'hex'),
   TRUE, TRUE, s_uwimana,
   -1.9590, 30.0611,
   'TOP_SECRET', FALSE, ev12,
   '2024-06-15 10:30:00+02'),

  -- NV3: Kabera NID_MANUAL — criminal record
  (nv3, 'NID_MANUAL', off_rib_inv1,
   encode(sha256('1199920045678004'), 'hex'),
   TRUE, TRUE, s_kabera,
   -1.9503, 30.0614,
   'TOP_SECRET', FALSE, ev4,
   '2026-06-20 16:05:30+02'),

  -- NV4: Clean citizen — no criminal record, data discarded
  (nv4, 'NID_SCAN', off_rnp_pat1,
   encode(sha256('1200150034567999'), 'hex'),  -- fictional clean citizen NID
   TRUE, FALSE, NULL,
   NULL, NULL,
   'UNCLASSIFIED', FALSE, ev9,
   '2026-06-27 08:22:00+02')

  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- ALERTS
  -- ============================================================
  INSERT INTO alerts
    (id, intelligence_event_id, suspect_id, priority, classification,
     source_tag, title, message, target_institutions, acknowledged,
     acknowledged_by, acknowledged_at, created_at)
  VALUES

  -- AL1: CCTV Bizimungu — Gatuna border
  (al1, ev1, s_bizimungu, 'CRITICAL', 'TOP_SECRET', 'CCTV_NODE',
   '[CCTV_NODE] Bizimungu Vital — Gatuna Border Post',
   'SOURCE: CCTV_NODE | Camera: GTN-BORDER-04 | Location: Gatuna Border Post (-1.3773, 29.7551) | Suspect: Vital Bizimungu | Confidence: 0.962 | Status: ACTIVE | Time: 2026-06-26T07:14:32+02',
   ARRAY['RDF','RNP','NISS']::institution_type[], FALSE, NULL, NULL,
   '2026-06-26 07:14:33+02'),

  -- AL2: NID_SCAN Mugisha — KG Ave checkpoint
  (al2, ev2, s_mugisha, 'CRITICAL', 'TOP_SECRET', 'NID_SCAN',
   '[NID_SCAN] Mugisha Alexis — WANTED suspect identified at KG Ave',
   'SOURCE: NID_SCAN | Officer: RNP-PAT-006 | Location: Kigali KG Ave (-1.9441, 30.0619) | Suspect: Alexis Mugisha | Record: Armed Robbery (×6), WANTED | Active warrant | Time: 2026-06-26T10:45:11+02',
   ARRAY['RNP','NISS']::institution_type[], TRUE, off_rnp_det1,
   '2026-06-26 10:52:00+02',
   '2026-06-26 10:45:12+02'),

  -- AL3: FACE_SCAN Mukamana — Kigali Airport
  (al3, ev3, s_mukamana, 'CRITICAL', 'TOP_SECRET', 'FACE_SCAN',
   '[FACE_SCAN] Mukamana Goreth — WANTED, Kigali International Airport',
   'SOURCE: FACE_SCAN | Officer: RIB-INV-002 | Location: Kigali Airport (-1.9685, 30.1395) | Suspect: Goreth Mukamana | Confidence: 0.971 | Status: WANTED (Trafficking) | Active warrant | Time: 2026-06-24T14:22:05+02',
   ARRAY['RIB','RNP','NISS']::institution_type[], TRUE, off_rib_inv1,
   '2026-06-24 14:35:00+02',
   '2026-06-24 14:22:06+02'),

  -- AL4: CCTV Ndayambaje — Bus Park
  (al4, ev5, s_ndayambaje, 'HIGH', 'TOP_SECRET', 'CCTV_NODE',
   '[CCTV_NODE] Ndayambaje Eric — WANTED, Nyabugogo Bus Terminal',
   'SOURCE: CCTV_NODE | Camera: KGL-BUSPARK-01 | Location: Nyabugogo (-1.9472, 30.0602) | Suspect: Eric Ndayambaje | Confidence: 0.943 | Status: WANTED (Drug Trafficking) | Time: 2026-06-25T09:33:17+02',
   ARRAY['RNP','NISS']::institution_type[], FALSE, NULL, NULL,
   '2026-06-25 09:33:18+02'),

  -- AL5: FACE_SCAN + INTERPOL — Niyongabo Airport (TOP SECRET — NISS ONLY)
  (al5, ev10, s_niyongabo, 'CRITICAL', 'TOP_SECRET', 'FACE_SCAN',
   '[FACE_SCAN + INTERPOL_FEED] Niyongabo Jean — Interpol Red Notice — Kigali Airport',
   'SOURCE: FACE_SCAN + INTERPOL_FEED | Officer: NISS-OFF-003 | Location: Kigali Airport (-1.9685, 30.1395) | Interpol Red Notice: A-5674/2-2025 | Confidence: 0.974 | Charges: War crimes / Financial crimes | Time: 2026-06-22T14:55:00+02',
   ARRAY['NISS']::institution_type[], TRUE, off_niss_off,
   '2026-06-22 15:01:00+02',
   '2026-06-22 14:55:01+02'),

  -- AL6: SYSTEM_ALERT — Nsengiyumva release approaching
  (al6, ev11, s_nsengiyumva, 'MEDIUM', 'CONFIDENTIAL', 'SYSTEM_ALERT',
   '[SYSTEM_ALERT] Sentence end approaching — Pierre Nsengiyumva (Mpanga Prison)',
   'SOURCE: SYSTEM_ALERT | Prisoner: Pierre Nsengiyumva | Facility: Mpanga Central Prison | Sentence end: 2026-08-03 | 90-day pre-release window opened | Pre-release risk assessment required',
   ARRAY['RCS','RNP','NISS']::institution_type[], FALSE, NULL, NULL,
   '2026-04-01 06:00:01+02')

  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Sample intelligence events, NID verifications, and alerts inserted.';
END $$;
