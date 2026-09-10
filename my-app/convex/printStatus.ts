import { v } from 'convex/values';

// The print lifecycle, as reported by the Pi's print agent. Deliberately COARSE:
// the agent's own worker states are finer-grained (composing, retrying,
// waiting-operator, rejected…) and change as the hardware path evolves. Those
// travel in `detail` as free text so a worker tweak never needs a migration.
//
// Convex does NOT drive this machine — the Pi does. Printing is a local,
// offline-capable path (capture -> compose -> CUPS) that needs no cloud round
// trip, so these rows are a MIRROR for the phone and the operator, never a work
// queue the Pi pulls from.
export const printStatus = v.union(
  v.literal('queued'), // job accepted by the agent, waiting on the printer
  v.literal('composing'), // laying 4 frames into the 2-up sheet
  v.literal('printing'), // handed to CUPS, job in flight (~41s)
  v.literal('printed'), // paper is out — terminal
  v.literal('blocked'), // needs a human: media-empty, jam, cover-open, ribbon
  v.literal('failed'), // gave up after retries — terminal
);

// Statuses where the printer still owes this burst a sheet. Used by the phone to
// decide whether to keep showing a live print indicator.
export const ACTIVE_PRINT_STATUSES = ['queued', 'composing', 'printing', 'blocked'];

// One strip is four cells (StripLayout.photos in photobooth_print.py). A burst of
// any other length is a plain capture run and never produces a print job.
export const STRIP_FRAMES = 4;
