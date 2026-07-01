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
  ('IRONDO',        'Irondo ry''Umwuga',
   'Community patrol. Watchlist and incident reporting. Limited DIV app access.'),
  ('DASSO',         'Dasso',
   'Local administrative security. GPS-tagged incident reports and zone watchlist alerts.'),
  ('INTERNATIONAL', 'International Partners',
   'Foreign law enforcement partners with MOU-governed query access.')
ON CONFLICT (code) DO NOTHING;
