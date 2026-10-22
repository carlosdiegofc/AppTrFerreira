import type { Tone } from '../components/ui';
import type { FleetState } from '../lib/fleet';
import type { PaperState } from '../lib/papers';
import type { PresenceState } from '../lib/presence';
import type { TripStatusCode } from '../lib/trips';

/** Same colours as the app: on the road green, on a trip but not moving amber, no trip grey. */
export const STATE_TONE: Record<FleetState, Tone> = { moving: 'green', stopped: 'amber', paused: 'amber', nosignal: 'amber', idle: 'grey' };

/** A trip to complete amber, in progress blue, complete green, in the trash grey. */
export const STATUS_TONE: Record<TripStatusCode, Tone> = { pending: 'amber', running: 'blue', complete: 'green', deleted: 'grey' };

/** The words and colours of the app for a paper. */
export const PAPER_STATE: Record<PaperState, { label: string; tone: Tone }> = {
  late: { label: 'Vencido', tone: 'red' },
  soon: { label: 'Por vencer', tone: 'amber' },
  ok: { label: 'Vigente', tone: 'green' },
  nodate: { label: 'Sin fecha', tone: 'grey' },
};

/** On a trip blue, active with the app open green, not seen for a while grey. */
export const PRESENCE_TONE: Record<PresenceState, Tone> = { trip: 'blue', active: 'green', seen: 'grey' };
