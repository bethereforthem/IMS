-- ============================================================
-- IMS v3.0 — Sample Suspects
-- All national ID numbers, names, and records are FICTIONAL.
-- SHA-256 hashes are of the fictional 16-digit NID strings below.
-- ============================================================

DO $$
DECLARE
  created_by_rnp UUID;
  created_by_rib UUID;
  created_by_niss UUID;
  created_by_rdf UUID;

  s1 UUID := gen_random_uuid();  -- Mugisha Alexis       (WANTED, threat 5)
  s2 UUID := gen_random_uuid();  -- Uwimana Christine    (IN_CUSTODY, fraud)
  s3 UUID := gen_random_uuid();  -- Nsengiyumva Pierre   (CONVICTED, homicide)
  s4 UUID := gen_random_uuid();  -- Kabera Dieudonne     (ACTIVE, cybercrime)
  s5 UUID := gen_random_uuid();  -- Mukamana Goreth      (WANTED, trafficking)
  s6 UUID := gen_random_uuid();  -- Niyongabo Jean       (INTERPOL_FLAGGED)
  s7 UUID := gen_random_uuid();  -- Hakizimana Fidele    (ARRESTED, corruption)
  s8 UUID := gen_random_uuid();  -- Uwera Solange        (RELEASED, robbery)
  s9 UUID := gen_random_uuid();  -- Bizimungu Vital      (ACTIVE, border violation)
  s10 UUID := gen_random_uuid(); -- Ndayambaje Eric      (WANTED, drug trafficking)
  s11 UUID := gen_random_uuid(); -- Karangwa Théodore    (CONVICTED, sexual offense)
  s12 UUID := gen_random_uuid(); -- Iradukunda Cécile    (ACTIVE, organized crime)
BEGIN
  SELECT id INTO created_by_rnp  FROM users WHERE badge_number = 'RNP-DET-003';
  SELECT id INTO created_by_rib  FROM users WHERE badge_number = 'RIB-INV-001';
  SELECT id INTO created_by_niss FROM users WHERE badge_number = 'NISS-OFF-003';
  SELECT id INTO created_by_rdf  FROM users WHERE badge_number = 'RDF-CMD-001';

  -- --------------------------------------------------------
  -- Suspect 1: Mugisha Alexis — WANTED, armed robbery & terrorism
  -- NID: 1199780012345001  SHA-256 below
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color, distinguishing_marks,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s1, 'RWA-IMS-2024-00001', 'WANTED', 'TOP_SECRET',
    'Alexis', 'Mugisha',
    ARRAY['Alex M', 'The Shadow', 'Umukozi'],
    '1978-03-14', 'M', 'RWA',
    encode(sha256('1199780012345001'), 'hex'),
    178, 82, 'Brown',
    'Scar on left cheek (5 cm), tattoo of eagle on right forearm',
    'RNP', 5,
    'Primary suspect in Kigali CBD armed robbery series (2023). Suspected links to cross-border criminal network. Approach with extreme caution.',
    created_by_rnp
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 2: Uwimana Christine — IN_CUSTODY, financial fraud
  -- NID: 1198560023456002
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s2, 'RWA-IMS-2024-00002', 'IN_CUSTODY', 'CONFIDENTIAL',
    'Christine', 'Uwimana',
    ARRAY['Chris U', 'Mama Finance'],
    '1985-07-22', 'F', 'RWA',
    encode(sha256('1198560023456002'), 'hex'),
    162, 64, 'Brown',
    'RIB', 3,
    'Accused of defrauding Umurenge SACCOs across 5 districts. Estimated losses: RWF 450 million. Currently at Mageragere facility.',
    created_by_rib
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 3: Nsengiyumva Pierre — CONVICTED, homicide
  -- NID: 1197040034567003
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color, distinguishing_marks,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s3, 'RWA-IMS-2023-00001', 'CONVICTED', 'CONFIDENTIAL',
    'Pierre', 'Nsengiyumva',
    '1970-11-05', 'M', 'RWA',
    encode(sha256('1197040034567003'), 'hex'),
    172, 74, 'Dark Brown',
    'Missing right index finger',
    'RNP', 4,
    'Convicted of murder in Nyamirambo (2022). Sentence: 25 years. Currently serving at Mpanga Central Prison.',
    created_by_rnp
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 4: Kabera Dieudonne — ACTIVE, cybercrime
  -- NID: 1199920045678004
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s4, 'RWA-IMS-2025-00001', 'ACTIVE', 'SECRET',
    'Dieudonne', 'Kabera',
    ARRAY['DieuK', 'GhostByte', 'admin_rw'],
    '1992-04-17', 'M', 'RWA',
    encode(sha256('1199920045678004'), 'hex'),
    168, 65, 'Brown',
    'RIB', 3,
    'Suspected operator of phishing ring targeting Rwandan banking apps. IP traces to Kigali, Nairobi, and Kampala. Under active surveillance.',
    created_by_rib
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 5: Mukamana Goreth — WANTED, human trafficking
  -- NID: 1198800056789005
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color, distinguishing_marks,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s5, 'RWA-IMS-2024-00003', 'WANTED', 'SECRET',
    'Goreth', 'Mukamana',
    ARRAY['Mama Goreth', 'Madame G'],
    '1980-09-30', 'F', 'RWA',
    encode(sha256('1198800056789005'), 'hex'),
    155, 58, 'Brown',
    'Birthmark above left eyebrow, gold tooth (upper left)',
    'RIB', 4,
    'Suspected leader of trafficking network operating Rwanda-Uganda-Middle East corridor. Interpol cooperation requested. Last seen Kigali, June 2026.',
    created_by_rib
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 6: Niyongabo Jean — INTERPOL_FLAGGED (Red Notice)
  -- NID: 1196560067890006
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, passport_number, height_cm, weight_kg, eye_color,
    distinguishing_marks, owning_institution, interpol_file_no, interpol_notice,
    threat_level, notes, created_by)
  VALUES (
    s6, 'RWA-IMS-2025-00002', 'INTERPOL_FLAGGED', 'TOP_SECRET',
    'Jean', 'Niyongabo',
    ARRAY['Johnny N', 'Le Fantôme'],
    '1965-02-18', 'M', 'RWA',
    encode(sha256('1196560067890006'), 'hex'),
    'RP1234567',
    180, 88, 'Brown',
    'Vertical scar on right temple, partially deaf in left ear',
    'NISS', 'A-5674/2-2025', 'RED',
    5,
    'Subject of Interpol Red Notice issued by DRC authorities for war crimes and financial crimes. May be traveling under false documents. NISS-only access.',
    created_by_niss
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 7: Hakizimana Fidele — ARRESTED, corruption
  -- NID: 1197660078901007
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s7, 'RWA-IMS-2026-00001', 'ARRESTED', 'CONFIDENTIAL',
    'Fidele', 'Hakizimana',
    '1976-06-12', 'M', 'RWA',
    encode(sha256('1197660078901007'), 'hex'),
    175, 78, 'Dark Brown',
    'RIB', 2,
    'Former civil servant. Arrested June 2026 for solicitation of bribes at Kigali sector office. Under RIB investigation for broader public funds misappropriation.',
    created_by_rib
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 8: Uwera Solange — RELEASED (completed sentence, robbery)
  -- NID: 1199100089012008
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s8, 'RWA-IMS-2022-00001', 'RELEASED', 'CONFIDENTIAL',
    'Solange', 'Uwera',
    '1991-12-03', 'F', 'RWA',
    encode(sha256('1199100089012008'), 'hex'),
    160, 55, 'Brown',
    'RNP', 1,
    'Completed 3-year sentence for armed robbery (Remera, 2021). Released March 2025. On conditional supervision.',
    created_by_rnp
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 9: Bizimungu Vital — ACTIVE, border violations
  -- NID: 1198340090123009
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s9, 'RWA-IMS-2025-00003', 'ACTIVE', 'SECRET',
    'Vital', 'Bizimungu',
    ARRAY['Vito', 'Smuggler V'],
    '1983-08-25', 'M', 'RWA',
    encode(sha256('1198340090123009'), 'hex'),
    170, 76, 'Brown',
    'RDF', 3,
    'Suspected of systematic smuggling at Gatuna border post. Linked to 7 border incidents 2024-2025. RDF maintains file.',
    created_by_rdf
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 10: Ndayambaje Eric — WANTED, drug trafficking
  -- NID: 1199560001234010
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color, distinguishing_marks,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s10, 'RWA-IMS-2025-00004', 'WANTED', 'SECRET',
    'Eric', 'Ndayambaje',
    ARRAY['Rico', 'E-Money', 'Mwenda'],
    '1989-05-07', 'M', 'RWA',
    encode(sha256('1199560001234010'), 'hex'),
    173, 70, 'Brown',
    'Three dots tattooed on left hand (between index and thumb)',
    'RNP', 4,
    'Wanted for drug trafficking — cannabis and heroin. Active in Kimironko and Kacyiru zones. Known to carry weapons. Arrest warrant issued 2025.',
    created_by_rnp
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 11: Karangwa Théodore — CONVICTED, sexual offense
  -- NID: 1196820012345011
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s11, 'RWA-IMS-2023-00002', 'CONVICTED', 'CONFIDENTIAL',
    'Théodore', 'Karangwa',
    '1968-01-19', 'M', 'RWA',
    encode(sha256('1196820012345011'), 'hex'),
    165, 71, 'Dark Brown',
    'RNP', 3,
    'Convicted 2023 for aggravated sexual assault. Sentence: 20 years. Serving at Nyagatare facility.',
    created_by_rnp
  ) ON CONFLICT DO NOTHING;

  -- --------------------------------------------------------
  -- Suspect 12: Iradukunda Cécile — ACTIVE, organized crime
  -- NID: 1199240023456012
  -- --------------------------------------------------------
  INSERT INTO suspects (id, ims_reference, status, clearance_level,
    first_name, last_name, aliases, date_of_birth, gender, nationality,
    national_id_hash, height_cm, weight_kg, eye_color, distinguishing_marks,
    owning_institution, threat_level, notes, created_by)
  VALUES (
    s12, 'RWA-IMS-2026-00002', 'ACTIVE', 'TOP_SECRET',
    'Cécile', 'Iradukunda',
    ARRAY['La Patronne', 'CC', 'Mama Réseau'],
    '1975-10-28', 'F', 'RWA',
    encode(sha256('1199240023456012'), 'hex'),
    158, 62, 'Brown',
    'Distinctive cornrow hairstyle, always wears dark glasses in public',
    'NISS', 5,
    'Suspected organizer of cross-border organized crime syndicate. Connections to Kenya, Uganda, Burundi networks. NISS-classified file. Maintain covert surveillance.',
    created_by_niss
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Sample suspects inserted successfully.';
END $$;
