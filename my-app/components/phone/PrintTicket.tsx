// The physical-output half of the guest's deliverable. The Pi composes and
// prints from LOCAL disk the moment the fourth frame lands — no cloud round
// trip, no GMI — so this card is a mirror of something already happening at the
// booth, not a control surface. There is no "print" button anywhere by design.
//
// The phone gallery is the primary deliverable; paper is the keepsake. So a
// failure here is stated plainly and without alarm: the guest's photos are safe
// on the phone either way.

export type PrintState = {
  status: 'queued' | 'composing' | 'printing' | 'printed' | 'blocked' | 'failed';
  detail: string | null;
  error: string | null;
  sheets: number;
};

// One sheet is two identical strips separated by a single centre cut — the pair
// a photo booth traditionally hands over.
const stripsFor = (sheets: number) => sheets * 2;

export function PrintTicket({ state }: { state: PrintState | null }) {
  if (state === null) return null;

  const { tone, headline, sub } = describe(state);

  return (
    <section className={`pop-frame p-4 ${tone}`} aria-label="Photo strip printing" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-sm uppercase">Photo strip</p>
        {state.status === 'printing' && <span className="text-xs font-bold uppercase opacity-70">~40 sec</span>}
      </div>
      <p className="mt-1 font-display text-lg uppercase">{headline}</p>
      {sub !== null && <p className="mt-1 text-sm font-bold">{sub}</p>}
    </section>
  );
}

function describe(state: PrintState): {
  tone: string;
  headline: string;
  sub: string | null;
} {
  switch (state.status) {
    case 'queued':
      return {
        tone: 'bg-pop-paper',
        headline: 'In the print queue',
        // `detail` carries the agent's queue depth, e.g. "2 ahead". Each sheet
        // ahead of you is ~41s, so this is the honest wait estimate.
        sub: state.detail,
      };
    case 'composing':
      return { tone: 'bg-pop-paper', headline: 'Laying out your strip', sub: null };
    case 'printing':
      return { tone: 'bg-pop-yellow', headline: 'Printing now', sub: 'Head to the booth' };
    case 'printed':
      return {
        tone: 'bg-pop-lime',
        headline: 'Ready at the booth',
        sub: `${stripsFor(state.sheets)} strips — grab yours`,
      };
    case 'blocked':
      // Consumables or a jam. Someone has to walk over; the job is parked and
      // resumes by itself once the printer is happy again.
      return {
        tone: 'bg-pop-violet',
        headline: 'Printer needs a hand',
        sub: 'Ask a host — your photos are safe on your phone',
      };
    case 'failed':
      return {
        tone: 'bg-pop-pink',
        headline: "Strip didn't print",
        sub: 'Your photos are still on your phone',
      };
  }
}
