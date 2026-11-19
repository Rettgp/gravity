/** App-wide feedback (core service). Pure: used by the service, the web app and the migration script. */

export const FEEDBACK_TYPES = ['Feature', 'Bug'] as const;
export const FEEDBACK_PK = 'FEEDBACK';
export const FEEDBACK_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const FEEDBACK_MAX_DESCRIPTION = 2000;
export const FEEDBACK_MAX_AREA = 40;
export const feedbackSk = (id: string) => `F#${id}`;

export interface FeedbackItem {
  id: string;
  type: (typeof FEEDBACK_TYPES)[number];
  /** A nav section label (the web app owns the list) or "Other". */
  area: string;
  description: string;
  done: boolean;
  /** Epoch ms. */
  createdAt: number;
  createdBy: string;
  doneAt: number | null;
  /** Only on items migrated from the old planner: its former area and Christmas/Birthday/Both. Never client-settable. */
  originalArea?: string;
  occasion?: string;
}
