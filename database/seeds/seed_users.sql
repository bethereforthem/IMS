-- ============================================================
-- IMS v3.0 — Sample Users
-- Default password for ALL sample accounts: IMS@Sample2026!
-- bcrypt hash generated with passlib bcrypt rounds=12
-- CHANGE ALL PASSWORDS BEFORE ANY PRODUCTION USE
-- ============================================================

-- pgcrypto generates a valid bcrypt hash inline
-- Password: IMS@Sample2026!
-- We set the same TOTP secret for demo: JBSWY3DPEHPK3PXP
-- QR: otpauth://totp/IMS%20Rwanda:user@ims.gov.rw?secret=JBSWY3DPEHPK3PXP&issuer=IMS%20Rwanda

DO $$
DECLARE
  pwd_hash TEXT := crypt('IMS@Sample2026!', gen_salt('bf', 12));
  demo_totp TEXT := 'JBSWY3DPEHPK3PXP';   -- RFC 6238 base32 seed (demo only)

  -- Institution IDs
  inst_niss UUID; inst_rnp UUID; inst_rib UUID; inst_rdf UUID;
  inst_rcs UUID; inst_irondo UUID; inst_dasso UUID;
BEGIN
  SELECT id INTO inst_niss FROM institutions WHERE code = 'NISS';
  SELECT id INTO inst_rnp  FROM institutions WHERE code = 'RNP';
  SELECT id INTO inst_rib  FROM institutions WHERE code = 'RIB';
  SELECT id INTO inst_rdf  FROM institutions WHERE code = 'RDF';
  SELECT id INTO inst_rcs  FROM institutions WHERE code = 'RCS';
  SELECT id INTO inst_irondo FROM institutions WHERE code = 'IRONDO';
  SELECT id INTO inst_dasso FROM institutions WHERE code = 'DASSO';

  -- --------------------------------------------------------
  -- NISS (National Intelligence and Security Service)
  -- --------------------------------------------------------
  INSERT INTO users (institution_id, role, clearance_level, badge_number, full_name, email, phone, password_hash, totp_secret, active)
  VALUES
  (inst_niss, 'NISS_DIRECTOR',  'TOP_SECRET', 'NISS-DIR-001', 'Jean-Pierre Habimana',     'jp.habimana@niss.gov.rw',    '+250788100001', pwd_hash, demo_totp, TRUE),
  (inst_niss, 'NISS_DIRECTOR',  'TOP_SECRET', 'NISS-DIR-002', 'Aimable Nzeyimana',        'a.nzeyimana@niss.gov.rw',    '+250788100002', pwd_hash, demo_totp, TRUE),
  (inst_niss, 'NISS_OFFICER',   'TOP_SECRET', 'NISS-OFF-003', 'Claudine Mukasine',        'c.mukasine@niss.gov.rw',     '+250788100003', pwd_hash, demo_totp, TRUE),
  (inst_niss, 'NISS_OFFICER',   'TOP_SECRET', 'NISS-OFF-004', 'Patrick Rwigamba',         'p.rwigamba@niss.gov.rw',     '+250788100004', pwd_hash, demo_totp, TRUE),
  (inst_niss, 'SIEM_ANALYST',   'SECRET',     'NISS-SIEM-005','Diane Ingabire',           'd.ingabire@niss.gov.rw',     '+250788100005', pwd_hash, demo_totp, TRUE)
  ON CONFLICT (badge_number) DO NOTHING;

  -- --------------------------------------------------------
  -- RNP (Rwanda National Police)
  -- --------------------------------------------------------
  INSERT INTO users (institution_id, role, clearance_level, badge_number, full_name, email, phone, password_hash, totp_secret, active)
  VALUES
  (inst_rnp, 'RNP_COMMANDER',  'SECRET',      'RNP-CMD-001', 'Commissaire Bernard Nkurunziza',  'b.nkurunziza@rnp.gov.rw', '+250788200001', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_COMMANDER',  'SECRET',      'RNP-CMD-002', 'Commissaire Alice Mukamana',      'a.mukamana@rnp.gov.rw',   '+250788200002', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_DETECTIVE',  'CONFIDENTIAL','RNP-DET-003', 'Inspecteur Théogène Bizimana',    't.bizimana@rnp.gov.rw',   '+250788200003', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_DETECTIVE',  'CONFIDENTIAL','RNP-DET-004', 'Inspecteur Grace Uwimana',        'g.uwimana@rnp.gov.rw',    '+250788200004', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_DETECTIVE',  'CONFIDENTIAL','RNP-DET-005', 'Inspecteur Emmanuel Nshimiyimana','e.nshimiyimana@rnp.gov.rw','+250788200005', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_PATROL',     'CONFIDENTIAL','RNP-PAT-006', 'Agent Jacqueline Mukamurenzi',    'j.mukamurenzi@rnp.gov.rw','+250788200006', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_PATROL',     'CONFIDENTIAL','RNP-PAT-007', 'Agent François Nzabonimpa',       'f.nzabonimpa@rnp.gov.rw', '+250788200007', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'RNP_PATROL',     'CONFIDENTIAL','RNP-PAT-008', 'Agent Solange Uwera',             's.uwera@rnp.gov.rw',      '+250788200008', pwd_hash, demo_totp, TRUE),
  (inst_rnp, 'SYSTEM_ADMIN',   'SECRET',      'RNP-ADM-009', 'Ingénieur Oscar Karangwa',        'o.karangwa@rnp.gov.rw',   '+250788200009', pwd_hash, demo_totp, TRUE)
  ON CONFLICT (badge_number) DO NOTHING;

  -- --------------------------------------------------------
  -- RIB (Rwanda Investigation Bureau)
  -- --------------------------------------------------------
  INSERT INTO users (institution_id, role, clearance_level, badge_number, full_name, email, phone, password_hash, totp_secret, active)
  VALUES
  (inst_rib, 'RIB_INVESTIGATOR','SECRET',     'RIB-INV-001', 'Investigateur Pascal Habimana',   'p.habimana@rib.gov.rw',   '+250788300001', pwd_hash, demo_totp, TRUE),
  (inst_rib, 'RIB_INVESTIGATOR','SECRET',     'RIB-INV-002', 'Investigatrice Rose Kayitesi',    'r.kayitesi@rib.gov.rw',   '+250788300002', pwd_hash, demo_totp, TRUE),
  (inst_rib, 'RIB_INVESTIGATOR','SECRET',     'RIB-INV-003', 'Investigateur Sylvain Ndayisaba', 's.ndayisaba@rib.gov.rw',  '+250788300003', pwd_hash, demo_totp, TRUE),
  (inst_rib, 'RIB_ANALYST',    'CONFIDENTIAL','RIB-ANA-004', 'Analyste Martine Uwiringiyimana', 'm.uwiringiyimana@rib.gov.rw','+250788300004',pwd_hash, demo_totp, TRUE),
  (inst_rib, 'RIB_ANALYST',    'CONFIDENTIAL','RIB-ANA-005', 'Analyste Christian Niyonsenga',   'c.niyonsenga@rib.gov.rw', '+250788300005', pwd_hash, demo_totp, TRUE)
  ON CONFLICT (badge_number) DO NOTHING;

  -- --------------------------------------------------------
  -- RDF (Rwanda Defence Force)
  -- --------------------------------------------------------
  INSERT INTO users (institution_id, role, clearance_level, badge_number, full_name, email, phone, password_hash, totp_secret, active)
  VALUES
  (inst_rdf, 'RDF_COMMANDER',    'SECRET',      'RDF-CMD-001', 'Colonel Théophile Buregeya',    't.buregeya@rdf.mil.rw',   '+250788400001', pwd_hash, demo_totp, TRUE),
  (inst_rdf, 'RDF_COMMANDER',    'SECRET',      'RDF-CMD-002', 'Lieutenant-Colonel Vénuste Hakizimana','v.hakizimana@rdf.mil.rw','+250788400002',pwd_hash,demo_totp,TRUE),
  (inst_rdf, 'RDF_BORDER_OFFICER','CONFIDENTIAL','RDF-BRD-003','Sergent Janvier Nkurikiyimana', 'j.nkurikiyimana@rdf.mil.rw','+250788400003',pwd_hash,demo_totp,TRUE),
  (inst_rdf, 'RDF_BORDER_OFFICER','CONFIDENTIAL','RDF-BRD-004','Sergent Espérance Murorunkwere','e.murorunkwere@rdf.mil.rw','+250788400004', pwd_hash, demo_totp, TRUE),
  (inst_rdf, 'RDF_BORDER_OFFICER','CONFIDENTIAL','RDF-BRD-005','Caporal John Rugamba',          'j.rugamba@rdf.mil.rw',    '+250788400005', pwd_hash, demo_totp, TRUE)
  ON CONFLICT (badge_number) DO NOTHING;

  -- --------------------------------------------------------
  -- RCS (Rwanda Correctional Service)
  -- --------------------------------------------------------
  INSERT INTO users (institution_id, role, clearance_level, badge_number, full_name, email, phone, password_hash, totp_secret, active)
  VALUES
  (inst_rcs, 'RCS_SUPERINTENDENT','CONFIDENTIAL','RCS-SUP-001','Surintendant Joseph Muvunyi',   'j.muvunyi@rcs.gov.rw',    '+250788500001', pwd_hash, demo_totp, TRUE),
  (inst_rcs, 'RCS_SUPERINTENDENT','CONFIDENTIAL','RCS-SUP-002','Surintendante Chantal Nyiransabimana','c.nyiransabimana@rcs.gov.rw','+250788500002',pwd_hash,demo_totp,TRUE),
  (inst_rcs, 'RCS_OFFICER',      'CONFIDENTIAL','RCS-OFF-003','Agent de correction Didier Rutagengwa','d.rutagengwa@rcs.gov.rw','+250788500003',pwd_hash,demo_totp,TRUE),
  (inst_rcs, 'RCS_OFFICER',      'CONFIDENTIAL','RCS-OFF-004','Agente de correction Immaculée Mukandori','i.mukandori@rcs.gov.rw','+250788500004',pwd_hash,demo_totp,TRUE)
  ON CONFLICT (badge_number) DO NOTHING;

  -- --------------------------------------------------------
  -- Irondo & Dasso (community patrol — limited access)
  -- --------------------------------------------------------
  INSERT INTO users (institution_id, role, clearance_level, badge_number, full_name, email, phone, password_hash, totp_secret, active)
  VALUES
  (inst_irondo, 'IRONDO_PATROL','UNCLASSIFIED','IRO-PAT-001','Augustin Harerimana',   'a.harerimana@irondo.gov.rw', '+250788600001', pwd_hash, demo_totp, TRUE),
  (inst_irondo, 'IRONDO_PATROL','UNCLASSIFIED','IRO-PAT-002','Félicité Mukabagwiza',  'f.mukabagwiza@irondo.gov.rw','+250788600002', pwd_hash, demo_totp, TRUE),
  (inst_dasso,  'DASSO_OFFICER','UNCLASSIFIED','DAS-OFF-001','Révérien Nsengimana',   'r.nsengimana@dasso.gov.rw',  '+250788700001', pwd_hash, demo_totp, TRUE),
  (inst_dasso,  'DASSO_OFFICER','UNCLASSIFIED','DAS-OFF-002','Vestine Umulisa',       'v.umulisa@dasso.gov.rw',     '+250788700002', pwd_hash, demo_totp, TRUE)
  ON CONFLICT (badge_number) DO NOTHING;

END $$;
