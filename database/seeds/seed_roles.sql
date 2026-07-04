-- ============================================================
-- IMS v3.0 — Seed: Institutions & Initial System Admin
-- ============================================================

INSERT INTO institutions (code, name, description) VALUES
  ('RNP',           'Rwanda National Police',
   'Primary law enforcement. Full access to criminal records and all identification pathways.'),
  ('RIB',           'Rwanda Investigation Bureau',
   'Investigates serious and organized crimes. Deep case history and financial intelligence.'),
  ('RDF',           'Rwanda Defence Force',
   'Border and national security protection.'),
  ('NISS',          'National Intelligence and Security Service',
   'Apex institution. Highest clearance. Sole authority to classify/declassify and manage international cooperation.'),
  ('RCS',           'Rwanda Correctional Service',
   'Manages convicted persons. Full criminal lifecycle from arrest through release.'),
  ('VILLAGE_LEADER', 'Village Leader',
   'Community intelligence reporting. Receives insecurity reports from community members and submits them to the intelligence system.'),
  ('INTERNATIONAL', 'International Partners',
   'Foreign law enforcement partners with MOU-governed query access.')
ON CONFLICT (code) DO NOTHING;
