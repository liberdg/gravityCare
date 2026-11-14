/** Valid role values (SQLite stores these as String) */
export const Role = {
  ASTRONAUT: 'ASTRONAUT',
  DOCTOR: 'DOCTOR',
  GROUND_CREW: 'GROUND_CREW',
  ADMIN: 'ADMIN'
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** Alert severity levels */
export const AlertSeverity = {
  INFO: 'INFO',
  WATCH: 'WATCH',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL'
} as const;

export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

/** Alert lifecycle status */
export const AlertStatus = {
  NEW: 'NEW',
  ANALYZING: 'ANALYZING',
  ANALYZED: 'ANALYZED',
  SENT_TO_DOCTOR: 'SENT_TO_DOCTOR',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED'
} as const;

export type AlertStatus = (typeof AlertStatus)[keyof typeof AlertStatus];
