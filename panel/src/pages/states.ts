import type { Tone } from '../components/ui';
import type { FleetState } from '../lib/fleet';
import type { TripStatusCode } from '../lib/trips';

/** Same colours as the app: on the road green, on a trip but not moving amber, no trip grey. */
export const STATE_TONE: Record<FleetState, Tone> = { moving: 'green', stopped: 'amber', paused: 'amber', nosignal: 'amber', idle: 'grey' };

/** A trip to complete amber, in progress blue, complete green, in the trash grey. */
export const STATUS_TONE: Record<TripStatusCode, Tone> = { pending: 'amber', running: 'blue', complete: 'green', deleted: 'grey' };
