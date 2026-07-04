export const C = {
  // Backgrounds
  bg:       '#0f172a',
  surface:  '#1e293b',
  surface2: '#334155',
  border:   '#334155',

  // Text
  text:     '#f1f5f9',
  textMid:  '#cbd5e1',
  muted:    '#94a3b8',
  faint:    '#475569',

  // Semantic
  danger:   '#ef4444',
  dangerBg: '#450a0a',
  warning:  '#f59e0b',
  warnBg:   '#451a03',
  success:  '#22c55e',
  okBg:     '#052e16',

  // SOS
  sos:      '#dc2626',
  sosBg:    '#7f1d1d',

  // Institution accent colors
  rnp:      '#3b82f6',
  rdf:      '#22c55e',
  niss:     '#a855f7',
  village:  '#f97316',
  rib:      '#e11d48',
  rcs:      '#64748b',
}

export const INSTITUTION_COLOR: Record<string, string> = {
  RNP:            C.rnp,
  RDF:            C.rdf,
  NISS:           C.niss,
  VILLAGE_LEADER: C.village,
  RIB:            C.rib,
  RCS:            C.rcs,
}

export const INSTITUTION_LABEL: Record<string, string> = {
  RNP:            'Rwanda National Police',
  RDF:            'Rwanda Defence Force',
  NISS:           'National Intelligence',
  VILLAGE_LEADER: 'Village Leader',
  RIB:            'Investigation Bureau',
  RCS:            'Correctional Service',
}

export const FONT = {
  regular: 'System',
  medium:  'System',
  bold:    'System',
}

export const FONT_SIZE = {
  xs:   10,
  sm:   12,
  base: 14,
  md:   16,
  lg:   18,
  xl:   22,
  xxl:  28,
}

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  full: 999,
}
