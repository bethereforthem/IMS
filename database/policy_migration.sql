-- ============================================================================
-- Terms & Privacy Agreement System Migration
-- ============================================================================

-- ── policy_documents ─────────────────────────────────────────────────────────
-- Versioned policy documents. When a new version is created for a type,
-- all users must re-accept. Old versions are retained for audit history.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.policy_documents (
  id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_type      TEXT          NOT NULL
                     CHECK (policy_type IN (
                       'TERMS_OF_SERVICE','PRIVACY_POLICY',
                       'SECURITY_POLICY','LOCATION_SHARING_POLICY'
                     )),
  version          INTEGER       NOT NULL DEFAULT 1,
  title            TEXT          NOT NULL,
  summary          TEXT          NOT NULL,  -- one-paragraph plain-text summary shown in tab header
  content          TEXT          NOT NULL,  -- full policy in Markdown
  is_active        BOOLEAN       NOT NULL DEFAULT TRUE,
  effective_date   DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_by       UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_by_name  TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (policy_type, version)
);

CREATE INDEX IF NOT EXISTS idx_policy_type_active
  ON public.policy_documents(policy_type, is_active, version DESC);

-- ── user_policy_acceptances ───────────────────────────────────────────────────
-- Records every acceptance. One row per user per policy document.
-- On new policy version, old acceptance rows are irrelevant (checked by version).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_policy_acceptances (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  policy_document_id UUID        NOT NULL REFERENCES public.policy_documents(id) ON DELETE CASCADE,
  policy_type        TEXT        NOT NULL,
  policy_version     INTEGER     NOT NULL,
  accepted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address         TEXT,
  device_info        TEXT,
  gps_lat            DECIMAL(10,7),
  gps_lng            DECIMAL(10,7),
  badge_number       TEXT,
  full_name          TEXT,
  institution        TEXT,
  role               TEXT,
  UNIQUE (user_id, policy_document_id)
);

CREATE INDEX IF NOT EXISTS idx_policy_accept_user
  ON public.user_policy_acceptances(user_id, policy_type);

CREATE INDEX IF NOT EXISTS idx_policy_accept_document
  ON public.user_policy_acceptances(policy_document_id);

-- ── Seed initial policy versions ─────────────────────────────────────────────

INSERT INTO public.policy_documents (policy_type, version, title, summary, content, is_active, effective_date)
VALUES

('TERMS_OF_SERVICE', 1,
 'Terms of Service — Rwanda Intelligence Management System',
 'This system is exclusively for authorized personnel of Rwanda''s national security agencies. Unauthorized access, misuse, or sharing of system data is a criminal offense under Rwandan law.',
 E'# Terms of Service\n**Effective Date: July 2026 · Version 1.0**\n\n## 1. Authorized Use Only\nThe Rwanda Intelligence Management System (RCIMS) is a classified government information system. Access is restricted to authorized officers of the National Intelligence and Security Service (NISS), Rwanda National Police (RNP), Rwanda Investigation Bureau (RIB), Rwanda Defence Force (RDF), Rwanda Correctional Service (RCS), and approved partner agencies.\n\n## 2. Legal Framework\nUse of this system is governed by the Law on Cybersecurity (Law No. 60/2018), the Law Relating to the Protection of Personal Data and Privacy (Law No. 058/2021), and Rwanda''s national security legislation. Unauthorized access or misuse constitutes a criminal offense subject to prosecution.\n\n## 3. Permitted Use\nYou may use this system solely for:\n- Official law enforcement and intelligence operations\n- Authorized investigations within your institutional mandate\n- Supervision and command functions within your assigned role\n\n## 4. Prohibited Actions\nYou must not:\n- Share login credentials or allow others to use your account\n- Access records outside your assigned clearance level\n- Export, copy, or transmit classified data without authorization\n- Use system data for personal, commercial, or unauthorized purposes\n- Attempt to bypass authentication, audit logging, or access controls\n\n## 5. Account Responsibility\nYou are personally accountable for all actions performed under your badge number. All system interactions are logged and auditable. Suspected compromise of your credentials must be reported immediately to your superior and the system administrator.\n\n## 6. Session Monitoring\nYour active sessions, accessed pages, and operational actions are continuously monitored for security purposes. Anomalous behavior may trigger automatic alerts and investigation.\n\n## 7. Termination\nSystem access will be revoked immediately upon termination of employment, disciplinary action, or at the discretion of system administrators. All classified information accessed during your tenure remains subject to confidentiality obligations after access is revoked.\n\n## 8. Amendments\nThese terms may be updated. You will be required to re-accept any material changes before continued system access.',
 true, CURRENT_DATE),

('PRIVACY_POLICY', 1,
 'Privacy Policy — Data Collection and Processing',
 'RCIMS collects operational data including officer activity logs, location records, and device information to support national security operations and system integrity. Data is processed under Rwandan law and is accessible only to authorized personnel.',
 E'# Privacy Policy\n**Effective Date: July 2026 · Version 1.0**\n\n## 1. Data Controller\nThe National Intelligence and Security Service (NISS), on behalf of the Government of Rwanda, acts as data controller for all information processed within RCIMS.\n\n## 2. Data We Collect\n### 2.1 Account and Identity Data\n- Badge number, full name, institution, role, and clearance level\n- Email address and phone number for authentication and notifications\n\n### 2.2 Operational Activity Data\n- All CRUD operations (records created, viewed, updated, deleted)\n- Case assignments, suspect records accessed, and intelligence events logged\n- Field reports and agent tracking session data\n\n### 2.3 System Access Data\n- Login timestamps, IP addresses, device type and browser information\n- Pages visited and time spent within the system\n- Session tokens (stored as cryptographic hashes only)\n\n### 2.4 Location Data\n- GPS coordinates captured during field operations and active tracking sessions\n- Location data attached to audit log entries (see Location Sharing Policy)\n- Border crossing verification locations\n\n### 2.5 Communications and Alerts\n- SOS emergency signals and commander rescue requests\n- Interagency alert acknowledgments\n\n## 3. How We Use Your Data\n- **Security monitoring**: Detecting intrusions, unauthorized access, and anomalous behavior\n- **Audit compliance**: Maintaining complete records of all operational actions\n- **Operational integrity**: Supporting investigations, case management, and intelligence analysis\n- **System administration**: Managing user accounts, permissions, and access control\n\n## 4. Data Retention\n- Audit logs: minimum 7 years\n- Session records: 2 years\n- Intelligence and case data: per applicable security legislation\n- Location records: retained as long as operationally necessary\n\n## 5. Data Access\nYour personal activity data may be accessed by:\n- System administrators for security investigations\n- Your institutional supervisors for operational review\n- Law enforcement and judicial authorities pursuant to legal process\n\n## 6. Data Security\nAll data is encrypted in transit (TLS 1.3) and at rest. Access is controlled by role-based permissions and multi-factor authentication. Security incidents are logged and investigated.\n\n## 7. Your Rights\nAs a government officer using a classified system, your privacy rights are balanced against national security obligations. Requests regarding your personal data should be directed to your institution''s data protection officer.',
 true, CURRENT_DATE),

('SECURITY_POLICY', 1,
 'Security Policy — Officer Obligations',
 'All officers must comply with security obligations including credential protection, classification handling, incident reporting, and prohibition of unauthorized data exfiltration. Violations are subject to criminal prosecution.',
 E'# Security Policy\n**Effective Date: July 2026 · Version 1.0**\n\n## 1. Credential Security\n- Your password must be a minimum of 12 characters with complexity requirements\n- Never share your password, badge number, or OTP codes with any person\n- Report suspected credential compromise within 1 hour to your supervisor and system admin\n- Do not use the same password across multiple systems\n- Log out completely when leaving your workstation unattended\n\n## 2. Multi-Factor Authentication\nAll logins require a one-time password (OTP) sent to your registered email. You must not forward OTP codes or allow others to complete authentication on your behalf.\n\n## 3. Classification Handling\n- Access only records at or below your assigned clearance level\n- Do not discuss TOP SECRET or SECRET records on unsecured channels\n- Do not screenshot, photograph, or copy classified system data\n- Handle physical outputs (prints) in accordance with your institution''s document security policy\n\n## 4. Device and Network Security\n- Access RCIMS only from authorized devices on secure networks\n- Do not access the system from public Wi-Fi, VPNs, or proxy services\n- Attempts to access via VPN or proxy will generate automatic security alerts\n- Ensure your device has current security patches before accessing the system\n\n## 5. Incident Reporting\nYou must immediately report to your supervisor and the system administrator:\n- Any suspected unauthorized access to your account\n- Discovery of system vulnerabilities or data exposure\n- Loss or theft of devices used to access the system\n- Unusual system behavior or unexpected alerts\n\n## 6. Audit Awareness\nAll your actions within RCIMS are permanently logged, including:\n- Every record you view, create, update, or delete\n- Your login location, device, and IP address\n- GPS coordinates (if location sharing is enabled)\n- Time spent on each section of the system\n\nAudit logs cannot be deleted or modified by any user including administrators.\n\n## 7. Prohibited Conduct\n- Attempting to access another officer''s account\n- Using automated scripts, bots, or tools against the system\n- Deliberately generating false records or altering data without authorization\n- Circumventing any security control\n\n## 8. Consequences\nViolation of this security policy may result in immediate access revocation, disciplinary action, and criminal prosecution under Rwandan law.',
 true, CURRENT_DATE),

('LOCATION_SHARING_POLICY', 1,
 'Location Sharing Policy — GPS Data Collection',
 'RCIMS collects your GPS location while you are using the system to enrich audit trails, support field operations, and provide situational awareness. Location sharing is mandatory for field agents and strongly recommended for all users.',
 E'# Location Sharing Policy\n**Effective Date: July 2026 · Version 1.0**\n\n## 1. What Location Data is Collected\nWhen you use RCIMS, your browser may request access to your device''s GPS location. If granted, your approximate coordinates are:\n- Attached to audit log entries for all CREATE, UPDATE, and DELETE operations\n- Transmitted to the server as HTTP headers with each API request\n- Stored in the `audit_log` table alongside the action, timestamp, and device information\n- Included in agent tracking sessions during active field operations\n- Captured during border identity verification events\n- Logged with SOS and commander rescue signals\n\n## 2. Why Location is Collected\n- **Audit enrichment**: GPS coordinates help verify that actions were taken from authorized locations\n- **Field accountability**: Location data supports operational awareness and officer safety\n- **Incident correlation**: Location data helps correlate field actions with intelligence events\n- **Security investigation**: In the event of a security incident, location data helps establish timelines\n- **Compliance**: Operational requirements under Rwanda''s national security framework\n\n## 3. Accuracy and Frequency\n- Location is requested once when you open a dashboard session\n- Coordinates are cached for up to 2 minutes before a new reading is requested\n- Accuracy depends on your device and environment (GPS, Wi-Fi, cellular)\n- Location data is approximate and may reflect a building or street, not an exact position\n\n## 4. Location for Field Agents\nIf you are designated as a field agent, continuous location tracking is enabled during active tracking sessions. This is disclosed separately during session initiation. Tracking stops automatically when your session is closed or paused.\n\n## 5. Who Can See Your Location\n- Your institutional commanders can view your location during active field sessions\n- System administrators can view location data in audit logs for security investigations\n- NISS oversight can access cross-institutional location audit data\n- Location data is never shared with external parties without legal authorization\n\n## 6. Consent and Opt-Out\nBy accepting this policy and granting browser location permissions, you consent to the collection and use of your GPS data as described above. If you deny browser location permissions:\n- You may still use the system normally\n- Audit log entries will be recorded without GPS coordinates\n- For field agents, some operational features may have reduced functionality\n\n## 7. Retention\nLocation data embedded in audit logs is retained for a minimum of 7 years per the audit retention policy. Field tracking session locations are retained for 2 years. Location data is deleted upon expiration or pursuant to legal process.\n\n## 8. Questions\nQuestions about location data collection should be directed to your institution''s data protection officer or the RCIMS system administrator.',
 true, CURRENT_DATE)

ON CONFLICT (policy_type, version) DO NOTHING;
