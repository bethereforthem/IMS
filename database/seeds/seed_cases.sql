-- ============================================================
-- IMS v3.0 — Sample Cases, Warrants & Case-Suspect Links
-- ============================================================

DO $$
DECLARE
  -- Officer references
  off_rnp_cmd UUID; off_rnp_det1 UUID; off_rnp_det2 UUID;
  off_rib_inv1 UUID; off_rib_inv2 UUID;
  off_niss_off UUID;
  off_rdf_cmd  UUID;

  -- Suspect references
  s_mugisha    UUID; s_uwimana   UUID; s_nsengiyumva UUID;
  s_kabera     UUID; s_mukamana  UUID; s_niyongabo   UUID;
  s_hakizimana UUID; s_bizimungu UUID; s_ndayambaje  UUID;
  s_iradukunda UUID;

  -- Case IDs
  c1 UUID := gen_random_uuid();  -- Armed robbery series Kigali
  c2 UUID := gen_random_uuid();  -- SACCO fraud Musanze
  c3 UUID := gen_random_uuid();  -- Homicide Nyamirambo
  c4 UUID := gen_random_uuid();  -- Cybercrime banking fraud
  c5 UUID := gen_random_uuid();  -- Human trafficking corridor
  c6 UUID := gen_random_uuid();  -- NISS organized crime
  c7 UUID := gen_random_uuid();  -- Corruption civil service
  c8 UUID := gen_random_uuid();  -- Drug trafficking Kigali
  c9 UUID := gen_random_uuid();  -- Border smuggling Gatuna

BEGIN
  -- Load officer IDs
  SELECT id INTO off_rnp_cmd  FROM users WHERE badge_number = 'RNP-CMD-001';
  SELECT id INTO off_rnp_det1 FROM users WHERE badge_number = 'RNP-DET-003';
  SELECT id INTO off_rnp_det2 FROM users WHERE badge_number = 'RNP-DET-004';
  SELECT id INTO off_rib_inv1 FROM users WHERE badge_number = 'RIB-INV-001';
  SELECT id INTO off_rib_inv2 FROM users WHERE badge_number = 'RIB-INV-002';
  SELECT id INTO off_niss_off FROM users WHERE badge_number = 'NISS-OFF-003';
  SELECT id INTO off_rdf_cmd  FROM users WHERE badge_number = 'RDF-CMD-001';

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

  -- --------------------------------------------------------
  -- CASES
  -- --------------------------------------------------------
  INSERT INTO cases (id, case_reference, title, category, status, clearance_level,
    owning_institution, lead_officer_id, summary,
    incident_date, location_lat, location_lng, location_name, created_by)
  VALUES
  -- C1: Armed robbery Kigali CBD
  (c1, 'RWA-RNP-2024-00034', 'Armed Robbery Series — Kigali CBD',
   'ROBBERY', 'UNDER_INVESTIGATION', 'CONFIDENTIAL',
   'RNP', off_rnp_det1,
   'Series of 6 armed robberies in Kigali Central Business District between March and August 2024. Armed perpetrators targeting businesses and pedestrians near the Kigali Convention Centre area. Primary suspect identified as Mugisha Alexis.',
   '2024-03-11 21:30:00+02', -1.9502, 30.0588, 'Kigali CBD, near KCC', off_rnp_cmd),

  -- C2: SACCO fraud
  (c2, 'RWA-RIB-2024-00012', 'Umurenge SACCO Fraud — Musanze District',
   'FRAUD', 'PROSECUTION', 'CONFIDENTIAL',
   'RIB', off_rib_inv1,
   'Systematic fraud targeting Umurenge Savings and Credit Co-operatives across Musanze, Burera, and Rulindo districts. Fraudulent loan applications and identity impersonation used to extract RWF 450 million over 18 months.',
   '2023-01-15 00:00:00+02', -1.4990, 29.6348, 'Musanze District SACCO offices', off_rib_inv1),

  -- C3: Homicide Nyamirambo
  (c3, 'RWA-RNP-2022-00089', 'Homicide — Nyamirambo Sector',
   'HOMICIDE', 'CLOSED', 'CONFIDENTIAL',
   'RNP', off_rnp_det2,
   'Murder of male victim (35, identity confirmed) in Nyamirambo sector. Perpetrator Pierre Nsengiyumva convicted in 2023. Case closed following sentencing.',
   '2022-08-03 23:15:00+02', -1.9711, 30.0432, 'Nyamirambo Sector, Kigali', off_rnp_cmd),

  -- C4: Cybercrime banking fraud
  (c4, 'RWA-RIB-2025-00007', 'Banking App Phishing Campaign — Nationwide',
   'CYBERCRIME', 'UNDER_INVESTIGATION', 'SECRET',
   'RIB', off_rib_inv2,
   'Sophisticated phishing campaign impersonating Bank of Kigali, Equity Bank, and MTN Mobile Money. Estimated 1,200 victims; financial losses exceeding RWF 180 million. Primary suspect Kabera Dieudonne identified through IP analysis.',
   '2025-02-01 00:00:00+02', -1.9441, 30.0619, 'Nationwide / Digital', off_rib_inv1),

  -- C5: Human trafficking
  (c5, 'RWA-RIB-2024-00019', 'Human Trafficking — Rwanda-Uganda-Gulf Corridor',
   'TRAFFICKING', 'UNDER_INVESTIGATION', 'SECRET',
   'RIB', off_rib_inv1,
   'Trafficking network operating under cover of domestic labor recruitment agencies. Victims (primarily women aged 18-30) trafficked to Gulf states under false employment promises. Network leader identified as Mukamana Goreth. Interpol cooperation requested.',
   '2024-05-20 00:00:00+02', -1.9403, 30.0618, 'Kigali, recruitment agencies', off_rib_inv1),

  -- C6: NISS organized crime
  (c6, 'RWA-NISS-2026-00003', 'Cross-Border Organized Crime Syndicate',
   'ORGANIZED_CRIME', 'OPEN', 'TOP_SECRET',
   'NISS', off_niss_off,
   'Intelligence-led investigation into transnational organized crime network with operations in Rwanda, Kenya, Uganda, and Burundi. Money laundering, smuggling, and extortion. NISS-classified. Suspect Iradukunda Cécile identified as suspected organizer.',
   '2026-01-10 00:00:00+02', -1.9403, 30.0618, 'Multiple locations — CLASSIFIED', off_niss_off),

  -- C7: Corruption
  (c7, 'RWA-RIB-2026-00001', 'Public Funds Corruption — Kigali Sector',
   'CORRUPTION', 'UNDER_INVESTIGATION', 'CONFIDENTIAL',
   'RIB', off_rib_inv2,
   'Former civil servant Fidele Hakizimana arrested for soliciting and receiving bribes at Kicukiro sector office. Investigation ongoing to determine full scope of misappropriation.',
   '2026-06-01 00:00:00+02', -1.9734, 30.1021, 'Kicukiro Sector Office, Kigali', off_rib_inv2),

  -- C8: Drug trafficking Kigali
  (c8, 'RWA-RNP-2025-00056', 'Drug Trafficking — Kimironko & Kacyiru Zones',
   'DRUG_OFFENSE', 'OPEN', 'CONFIDENTIAL',
   'RNP', off_rnp_det1,
   'Ongoing drug distribution network in Kimironko and Kacyiru sectors. Cannabis and heroin seized in multiple operations. Suspected network leader: Ndayambaje Eric. Arrest warrant active.',
   '2025-03-18 00:00:00+02', -1.9275, 30.0934, 'Kimironko, Kacyiru — Kigali', off_rnp_cmd),

  -- C9: Border smuggling
  (c9, 'RWA-RDF-2025-00003', 'Systematic Border Smuggling — Gatuna Post',
   'BORDER_VIOLATION', 'UNDER_INVESTIGATION', 'SECRET',
   'RDF', off_rdf_cmd,
   'Intelligence indicating systematic exploitation of border procedures at Gatuna post for smuggling of contraband goods. Suspect Bizimungu Vital linked to 7 documented incidents. Coordination with Uganda DCI initiated.',
   '2024-09-01 00:00:00+02', -1.3773, 29.7551, 'Gatuna Border Post, Rwanda-Uganda', off_rdf_cmd)

  ON CONFLICT (case_reference) DO NOTHING;

  -- --------------------------------------------------------
  -- CASE-SUSPECT LINKS
  -- --------------------------------------------------------
  INSERT INTO case_suspects (case_id, suspect_id, role, added_by) VALUES
  (c1, s_mugisha,     'PRIMARY_SUSPECT', off_rnp_det1),
  (c2, s_uwimana,     'PRIMARY_SUSPECT', off_rib_inv1),
  (c3, s_nsengiyumva, 'PRIMARY_SUSPECT', off_rnp_det2),
  (c4, s_kabera,      'PRIMARY_SUSPECT', off_rib_inv2),
  (c5, s_mukamana,    'PRIMARY_SUSPECT', off_rib_inv1),
  (c5, s_iradukunda,  'ACCOMPLICE',      off_rib_inv1),
  (c6, s_iradukunda,  'PRIMARY_SUSPECT', off_niss_off),
  (c6, s_niyongabo,   'ACCOMPLICE',      off_niss_off),
  (c7, s_hakizimana,  'PRIMARY_SUSPECT', off_rib_inv2),
  (c8, s_ndayambaje,  'PRIMARY_SUSPECT', off_rnp_det1),
  (c9, s_bizimungu,   'PRIMARY_SUSPECT', off_rdf_cmd)
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- CASE-OFFICER ASSIGNMENTS
  -- --------------------------------------------------------
  INSERT INTO case_officers (case_id, officer_id, role) VALUES
  (c1, off_rnp_det1, 'LEAD_INVESTIGATOR'),
  (c1, off_rnp_det2, 'CO-INVESTIGATOR'),
  (c2, off_rib_inv1, 'LEAD_INVESTIGATOR'),
  (c3, off_rnp_det2, 'LEAD_INVESTIGATOR'),
  (c4, off_rib_inv2, 'LEAD_INVESTIGATOR'),
  (c4, off_rib_inv1, 'CO-INVESTIGATOR'),
  (c5, off_rib_inv1, 'LEAD_INVESTIGATOR'),
  (c5, off_niss_off, 'LIAISON'),
  (c6, off_niss_off, 'LEAD_INVESTIGATOR'),
  (c7, off_rib_inv2, 'LEAD_INVESTIGATOR'),
  (c8, off_rnp_det1, 'LEAD_INVESTIGATOR'),
  (c9, off_rdf_cmd,  'LEAD_INVESTIGATOR')
  ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- WARRANTS
  -- --------------------------------------------------------
  INSERT INTO warrants (suspect_id, warrant_type, issued_by, issued_by_court,
    case_reference, charges, issued_at, active)
  VALUES
  -- Mugisha Alexis — arrest warrant (WANTED)
  (s_mugisha, 'ARREST', 'RNP', 'Tribunal de Grande Instance de Kigali',
   'RWA-RNP-2024-00034',
   'Armed robbery (6 counts); illegal possession of firearms; assault causing bodily harm',
   '2024-09-15 10:00:00+02', TRUE),

  -- Mukamana Goreth — arrest warrant (WANTED)
  (s_mukamana, 'ARREST', 'RIB', 'Tribunal de Grande Instance de Kigali',
   'RWA-RIB-2024-00019',
   'Human trafficking (aggravated); exploitation of persons; conspiracy to traffic persons across international borders',
   '2024-11-20 09:00:00+02', TRUE),

  -- Ndayambaje Eric — arrest warrant (WANTED)
  (s_ndayambaje, 'ARREST', 'RNP', 'Tribunal de Grande Instance de Kigali',
   'RWA-RNP-2025-00056',
   'Drug trafficking; illegal possession of controlled substances; illegal possession of a firearm',
   '2025-08-01 08:00:00+02', TRUE),

  -- Niyongabo Jean — extradition warrant (Interpol)
  (s_niyongabo, 'EXTRADITION', 'NISS', 'High Court of Rwanda',
   'RWA-NISS-2026-00003',
   'War crimes (count 1); financial crimes — grand larceny of public funds; crimes against humanity (charges per DRC authorities and Interpol Red Notice A-5674/2-2025)',
   '2025-12-01 00:00:00+02', TRUE),

  -- Kabera Dieudonne — search warrant (active investigation)
  (s_kabera, 'SEARCH', 'RIB', 'Tribunal de Grande Instance de Kigali',
   'RWA-RIB-2025-00007',
   'Search of premises: Kigali residence and Kimihurura office for electronic devices, servers, and financial records related to banking phishing operation',
   '2025-09-10 14:00:00+02', TRUE)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Sample cases, warrants, and links inserted.';
END $$;
