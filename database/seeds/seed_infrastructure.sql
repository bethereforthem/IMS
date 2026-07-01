-- ============================================================
-- IMS v3.0 — Sample Infrastructure
-- Camera nodes, Interpol notices, Corrections records,
-- Watchlists, SIEM events, International partners
-- ============================================================

DO $$
DECLARE
  -- Suspects
  s_mugisha     UUID; s_uwimana    UUID; s_nsengiyumva UUID;
  s_kabera      UUID; s_mukamana   UUID; s_niyongabo   UUID;
  s_hakizimana  UUID; s_ndayambaje UUID;
  s_iradukunda  UUID; s_bizimungu  UUID;

  -- Officers
  off_rcs_sup  UUID; off_rcs_off UUID;
  off_niss_dir UUID; off_niss_off UUID;
  off_rib_inv1 UUID;
  off_rnp_cmd  UUID;

  -- Cases
  case_fraud  UUID; case_homicide UUID; case_trafficking UUID;
  case_border UUID; case_corruption UUID;

  -- Watchlist IDs
  wl1 UUID := gen_random_uuid();  -- RNP Priority Wanted
  wl2 UUID := gen_random_uuid();  -- Interpol Flagged (NISS)
  wl3 UUID := gen_random_uuid();  -- Drug & Trafficking (RIB)
  wl4 UUID := gen_random_uuid();  -- Border Watch (RDF)

  -- Partner IDs
  uga_partner UUID := gen_random_uuid();
  ken_partner UUID := gen_random_uuid();
  drc_partner UUID := gen_random_uuid();

  -- Interpol notice IDs
  in1 UUID := gen_random_uuid();
  in2 UUID := gen_random_uuid();
  in3 UUID := gen_random_uuid();

BEGIN
  -- Load references
  SELECT id INTO s_mugisha     FROM suspects WHERE ims_reference = 'RWA-IMS-2024-00001';
  SELECT id INTO s_uwimana     FROM suspects WHERE ims_reference = 'RWA-IMS-2024-00002';
  SELECT id INTO s_nsengiyumva FROM suspects WHERE ims_reference = 'RWA-IMS-2023-00001';
  SELECT id INTO s_kabera      FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00001';
  SELECT id INTO s_mukamana    FROM suspects WHERE ims_reference = 'RWA-IMS-2024-00003';
  SELECT id INTO s_niyongabo   FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00002';
  SELECT id INTO s_hakizimana  FROM suspects WHERE ims_reference = 'RWA-IMS-2026-00001';
  SELECT id INTO s_ndayambaje  FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00004';
  SELECT id INTO s_iradukunda  FROM suspects WHERE ims_reference = 'RWA-IMS-2026-00002';
  SELECT id INTO s_bizimungu   FROM suspects WHERE ims_reference = 'RWA-IMS-2025-00003';

  SELECT id INTO off_rcs_sup  FROM users WHERE badge_number = 'RCS-SUP-001';
  SELECT id INTO off_rcs_off  FROM users WHERE badge_number = 'RCS-OFF-003';
  SELECT id INTO off_niss_dir FROM users WHERE badge_number = 'NISS-DIR-001';
  SELECT id INTO off_niss_off FROM users WHERE badge_number = 'NISS-OFF-003';
  SELECT id INTO off_rib_inv1 FROM users WHERE badge_number = 'RIB-INV-001';
  SELECT id INTO off_rnp_cmd  FROM users WHERE badge_number = 'RNP-CMD-001';

  SELECT id INTO case_fraud       FROM cases WHERE case_reference = 'RWA-RIB-2024-00012';
  SELECT id INTO case_homicide    FROM cases WHERE case_reference = 'RWA-RNP-2022-00089';
  SELECT id INTO case_trafficking FROM cases WHERE case_reference = 'RWA-RIB-2024-00019';
  SELECT id INTO case_border      FROM cases WHERE case_reference = 'RWA-RDF-2025-00003';
  SELECT id INTO case_corruption  FROM cases WHERE case_reference = 'RWA-RIB-2026-00001';

  -- ============================================================
  -- CAMERA NODES (Raspberry Pi 4)
  -- ============================================================
  INSERT INTO camera_nodes
    (node_id, name, location_name, location_lat, location_lng,
     institution, tls_cert_hash, last_heartbeat, active, firmware_version)
  VALUES
  -- Gatuna Border Post (Rwanda-Uganda)
  ('GTN-BORDER-01', 'Gatuna Border — Main Gate Camera A', 'Gatuna Border Post, Gicumbi District',
   -1.3773, 29.7551, 'RDF',
   'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   NOW() - INTERVAL '2 minutes', TRUE, '3.0.1'),

  ('GTN-BORDER-02', 'Gatuna Border — Main Gate Camera B', 'Gatuna Border Post, Gicumbi District',
   -1.3774, 29.7552, 'RDF',
   'b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
   NOW() - INTERVAL '3 minutes', TRUE, '3.0.1'),

  ('GTN-BORDER-03', 'Gatuna Border — Pedestrian Lane', 'Gatuna Border Post, Gicumbi District',
   -1.3772, 29.7550, 'RDF',
   'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
   NOW() - INTERVAL '1 minute', TRUE, '3.0.1'),

  ('GTN-BORDER-04', 'Gatuna Border — Eastern Flank Watch Point', 'Gatuna Border Post (East), Gicumbi District',
   -1.3773, 29.7560, 'RDF',
   'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
   '2026-06-26 07:20:00+02', TRUE, '3.0.1'),

  -- Kigali International Airport
  ('KGL-AIRPORT-01', 'Kigali Airport — Arrivals Hall A', 'Kigali International Airport, Kicukiro',
   -1.9685, 30.1395, 'RNP',
   'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
   NOW() - INTERVAL '5 minutes', TRUE, '3.0.2'),

  ('KGL-AIRPORT-02', 'Kigali Airport — Departures Security', 'Kigali International Airport, Kicukiro',
   -1.9682, 30.1398, 'RNP',
   'f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
   NOW() - INTERVAL '4 minutes', TRUE, '3.0.2'),

  ('KGL-AIRPORT-03', 'Kigali Airport — Transit Zone', 'Kigali International Airport Transit',
   -1.9680, 30.1400, 'NISS',
   'a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3',
   NOW() - INTERVAL '2 minutes', TRUE, '3.0.2'),

  -- Kigali Bus Parks
  ('KGL-BUSPARK-01', 'Nyabugogo Bus Terminal — Platform A', 'Nyabugogo Bus Terminal, Kigali',
   -1.9472, 30.0602, 'RNP',
   'b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4',
   NOW() - INTERVAL '6 minutes', TRUE, '3.0.0'),

  ('KGL-BUSPARK-02', 'Nyabugogo Bus Terminal — Entrance Gate', 'Nyabugogo Bus Terminal, Kigali',
   -1.9470, 30.0600, 'RNP',
   'c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5',
   NOW() - INTERVAL '8 minutes', TRUE, '3.0.0'),

  -- Kigali CBD
  ('KGL-CBD-01', 'KG Ave Vehicle Checkpoint', 'KG Avenue, Kigali CBD',
   -1.9441, 30.0619, 'RNP',
   'd5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6',
   NOW() - INTERVAL '3 minutes', TRUE, '3.0.1'),

  -- Musanze (Northern Province)
  ('MSZ-JUNCTION-01', 'Musanze — Northern Entry Junction A', 'Musanze District, Northern Province',
   -1.4990, 29.6348, 'RNP',
   'e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7',
   NOW() - INTERVAL '12 minutes', TRUE, '3.0.0'),

  ('MSZ-JUNCTION-02', 'Musanze — Northern Entry Junction B', 'Musanze District, Northern Province',
   -1.4992, 29.6350, 'RNP',
   'f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2b3c4d5e6f7a2',
   '2026-06-23 16:45:00+02', TRUE, '3.0.0'),

  -- Rubavu (Gisenyi) — Congo border
  ('RBV-BORDER-01', 'Petite Barrière — Vehicle Lane', 'Rubavu Border Post (DRC border), Western Province',
   -1.7003, 29.2575, 'RDF',
   'a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4',
   NOW() - INTERVAL '7 minutes', TRUE, '3.0.1'),

  ('RBV-BORDER-02', 'Petite Barrière — Pedestrian Lane', 'Rubavu Border Post (DRC border), Western Province',
   -1.7004, 29.2576, 'RDF',
   'b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5',
   NOW() - INTERVAL '9 minutes', TRUE, '3.0.1'),

  -- Rusizi (Burundi/DRC border)
  ('RSZ-BORDER-01', 'Rusizi Border — Main Gate', 'Rusizi, Western Province',
   -2.4847, 28.9064, 'RDF',
   'c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6',
   NOW() - INTERVAL '11 minutes', TRUE, '3.0.0'),

  -- Offline node (for SIEM offline detection demo)
  ('NYG-BORDER-01', 'Nyagatare Border — Eastern Rwanda', 'Nyagatare, Eastern Province',
   -1.2949, 30.3230, 'RDF',
   'd6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7f8a3b4c5d6e7',
   NOW() - INTERVAL '25 minutes',   -- > 15 min threshold → triggers SIEM offline rule
   TRUE, '2.9.5')

  ON CONFLICT (node_id) DO NOTHING;

  -- ============================================================
  -- INTERPOL NOTICES (locally cached from I-24/7 sync)
  -- ============================================================
  INSERT INTO interpol_notices
    (id, file_number, notice_color, subject_name, subject_dob,
     subject_nationality, charges, issuing_country, issued_at,
     expires_at, suspect_id, active)
  VALUES
  -- Red Notice — Niyongabo Jean (linked to IMS suspect)
  (in1, 'A-5674/2-2025', 'RED',
   'Jean NIYONGABO', '1965-02-18', 'RWA',
   'War crimes — crimes against civilian populations; Grand theft of public funds exceeding USD 12 million; Crimes against humanity',
   'COD', '2025-11-20', '2027-11-20',
   s_niyongabo, TRUE),

  -- Red Notice — unmatched foreign subject (no IMS suspect yet)
  (in2, 'A-3311/4-2026', 'RED',
   'Mohammed AL-RASHIDI', '1971-08-14', 'YEM',
   'Terrorism financing; Money laundering; Weapons trafficking',
   'SAU', '2026-01-10', '2028-01-10',
   NULL, TRUE),

  -- Blue Notice — information request on known associate
  (in3, 'B-2250/1-2026', 'BLUE',
   'Akello GRACE', '1982-03-29', 'UGA',
   'Request for information — suspected associate of trafficking network operating Rwanda-Uganda corridor',
   'UGA', '2026-03-15', '2027-03-15',
   NULL, TRUE)

  ON CONFLICT (file_number) DO NOTHING;

  -- ============================================================
  -- CORRECTIONS RECORDS (RCS)
  -- ============================================================
  INSERT INTO corrections_records
    (suspect_id, case_id, facility_name, facility_code,
     custody_status, intake_date, intake_verified_by,
     sentence_start, sentence_end, offense_description,
     court_name, judge_name, release_date, notes)
  VALUES
  -- Uwimana Christine — IN_CUSTODY, pre-trial (fraud)
  (s_uwimana, case_fraud,
   'Mageragere Prison', 'MAG-001',
   'PRE_TRIAL', '2024-06-15 10:30:00+02', off_rcs_sup,
   NULL, NULL,
   'Financial fraud — misappropriation of SACCO funds across 3 districts. Pre-trial detention pending court verdict.',
   'Tribunal de Grande Instance de Musanze', NULL, NULL,
   'High-risk prisoner. Financial documents secured as evidence by RIB.'),

  -- Nsengiyumva Pierre — SENTENCED, serving 25 years (homicide)
  (s_nsengiyumva, case_homicide,
   'Mpanga Central Prison', 'MPN-001',
   'SENTENCED', '2023-02-10 09:00:00+02', off_rcs_sup,
   '2023-02-10', '2048-02-10',
   'Murder — first degree. Victim identified, case fully closed.',
   'Tribunal de Grande Instance de Kigali', 'Juge Président Nkusi Celestin',
   '2048-02-10', 'Medium security wing. Behaviour: cooperative. Annual review 2027.'),

  -- Hakizimana Fidele — ARRESTED (awaiting arraignment)
  (s_hakizimana, case_corruption,
   'Kigali Central Prison', 'KGL-CEN-001',
   'PRE_TRIAL', '2026-06-10 14:00:00+02', off_rcs_off,
   NULL, NULL,
   'Corruption — solicitation and receipt of bribes as public servant.',
   'Tribunal de Grande Instance de Kigali', NULL, NULL,
   'Recent intake. First offence on record. RIB investigation active.')

  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- INTERNATIONAL PARTNERS
  -- ============================================================
  INSERT INTO international_partners
    (id, country_code, country_name, api_key_hash, mou_includes_identity, active)
  VALUES
  (uga_partner, 'UGA', 'Uganda',
   encode(sha256('UGA-API-KEY-SAMPLE-2026'), 'hex'), TRUE, TRUE),
  (ken_partner, 'KEN', 'Kenya',
   encode(sha256('KEN-API-KEY-SAMPLE-2026'), 'hex'), FALSE, TRUE),
  (drc_partner, 'COD', 'Democratic Republic of Congo',
   encode(sha256('DRC-API-KEY-SAMPLE-2026'), 'hex'), FALSE, TRUE)
  ON CONFLICT (country_code) DO NOTHING;

  -- ============================================================
  -- WATCHLISTS
  -- ============================================================
  INSERT INTO watchlists (id, name, description, owning_institution, clearance_level, active)
  VALUES
  (wl1, 'RNP Priority Wanted — 2026', 'Active arrest warrants with highest operational priority. Shared with all patrol units.', 'RNP', 'CONFIDENTIAL', TRUE),
  (wl2, 'NISS — Interpol & High Threat', 'Subjects linked to Interpol notices or classified as threat level 5. NISS-only.', 'NISS', 'TOP_SECRET', TRUE),
  (wl3, 'RIB — Drug & Trafficking Network', 'Persons of interest in narcotics and human trafficking investigations.', 'RIB', 'SECRET', TRUE),
  (wl4, 'RDF — Border Security Watch', 'Border violation suspects and persons of interest at checkpoints.', 'RDF', 'SECRET', TRUE)
  ON CONFLICT DO NOTHING;

  -- Watchlist entries
  INSERT INTO watchlist_entries (watchlist_id, suspect_id, priority, notes)
  VALUES
  (wl1, s_mugisha,    'CRITICAL', 'Armed and dangerous. Do not approach alone. Arrest warrant active.'),
  (wl1, s_ndayambaje, 'HIGH',     'Drug trafficker. Known to carry weapons. Arrest warrant active.'),
  (wl1, s_mukamana,   'HIGH',     'Trafficking suspect. May attempt to use forged travel documents.'),
  (wl2, s_niyongabo,  'CRITICAL', 'Interpol Red Notice A-5674/2-2025. War crimes. NISS authorization required.'),
  (wl2, s_iradukunda, 'CRITICAL', 'Organized crime leader. Under NISS surveillance. Do not alert suspect.'),
  (wl3, s_kabera,     'MEDIUM',   'Cybercrime. Non-violent. Locate before alerting.'),
  (wl3, s_mukamana,   'HIGH',     'Trafficking network coordinator.'),
  (wl4, s_bizimungu,  'HIGH',     'Serial border smuggler. All Gatuna and Nyagatare posts notified.')
  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- SAMPLE SIEM EVENTS (historical)
  -- ============================================================
  INSERT INTO siem_events
    (rule_id, severity, actor_id, actor_institution, description,
     auto_actioned, action_taken, reviewed, reviewed_by, reviewed_at)
  VALUES
  -- Bulk enumeration — RNP detective queried 73 suspects in 10 min (drill scenario)
  ('BULK_ENUMERATION', 'HIGH', off_rnp_cmd, 'RNP',
   'User RNP-CMD-001 performed 73 suspect queries in 600s (limit: 50). Potential bulk data access.',
   TRUE, 'RATE_LIMIT', TRUE, off_niss_off, '2026-05-10 14:05:00+02'),

  -- Off-hours login
  ('OFF_HOURS_ACCESS', 'MEDIUM', off_rib_inv1, 'RIB',
   'Off-hours login at hour 02:xx — RIB-INV-001 logged in at 02:34 CAT.',
   FALSE, NULL, TRUE, off_niss_off, '2026-04-22 08:00:00+02'),

  -- Camera offline — Nyagatare border
  ('CAMERA_NODE_OFFLINE', 'MEDIUM', NULL, NULL,
   'Camera node NYG-BORDER-01 offline for 25.3 minutes (threshold: 15 min). Operations center notified.',
   TRUE, 'NISS_ALERT', FALSE, NULL, NULL),

  -- Location overaccess (false positive — NISS analyst doing system audit)
  ('LOCATION_OVERACCESS', 'HIGH', off_niss_off, 'NISS',
   'User NISS-OFF-003 accessed 24 location records in 3600s (limit: 20). System audit in progress.',
   TRUE, 'NISS_ALERT', TRUE, off_niss_off, '2026-06-01 16:00:00+02')

  ON CONFLICT DO NOTHING;

  -- ============================================================
  -- PARTNER QUERIES (sample)
  -- ============================================================
  INSERT INTO partner_queries
    (partner_id, query_image_hash, match_returned, niss_reviewer_id, response_released_at)
  VALUES
  -- Uganda CID query (no match returned)
  (uga_partner,
   'f6a8b1c3d5e7f9a2b4c6d8e1f3a5b7c9d2e4f6a8b1c3d5e7f9a2b4c6d8e1f3a5',
   FALSE, off_niss_off, '2026-06-15 11:45:00+02'),

  -- Kenya NPS query (match returned — within MOU identity sharing clause)
  (ken_partner,
   'a9b1c3d5e7f9a2b4c6d8e1f3a5b7c9d2e4f6a8b1c3d5e7f9a2b4c6d8e1f3a5b7',
   TRUE, off_niss_off, '2026-06-10 09:30:00+02')

  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Sample infrastructure, Interpol, corrections, watchlists, and SIEM events inserted.';
END $$;
