import type { Tone } from '../components/ui';
import type { FleetState } from '../lib/fleet';

/** Same colours as the app: on the road green, on a trip but not moving amber, no trip grey. */
export const STATE_TONE: Record<FleetState, Tone> = { moving: 'green', stopped: 'amber', paused: 'amber', nosignal: 'amber', idle: 'grey' };
