'use client';

import { useState } from 'react';

// One booking form shared by every product-page candidate. Structure and
// behavior live here; each page supplies a theme of classNames (which may
// reference that page's next/font CSS variables) so the skin stays on-brand.
export type BookingTheme = {
  /** Extra classes for the <form> grid, e.g. width constraints. */
  form?: string;
  label: string;
  /** Shared by <input>, <select>, and <textarea>. */
  input: string;
  button: string;
  successWrap: string;
  successTitle: string;
  successBody: string;
};

const OCCASIONS = [
  'Wedding',
  'Birthday',
  'Corporate event',
  'Gala',
  'House party',
  'Something else',
];

export function BookingForm({
  theme,
  packages,
  submitLabel,
  successTitle,
  successBody,
}: {
  theme: BookingTheme;
  /** Optional package/tier names; rendered as an extra select when present. */
  packages?: string[];
  submitLabel: string;
  successTitle: string;
  successBody: string;
}) {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className={theme.successWrap} role="status">
        <p className={theme.successTitle}>{successTitle}</p>
        <p className={theme.successBody}>{successBody}</p>
      </div>
    );
  }

  const field = 'flex flex-col gap-1.5';

  return (
    <form
      className={`grid grid-cols-1 gap-x-6 gap-y-5 text-left sm:grid-cols-2 ${theme.form ?? ''}`}
      onSubmit={(e) => {
        // Doesn't go anywhere yet — swap for a real submission later.
        e.preventDefault();
        setSent(true);
      }}
    >
      <label className={field}>
        <span className={theme.label}>Your name</span>
        <input required name="name" type="text" autoComplete="name" className={theme.input} />
      </label>
      <label className={field}>
        <span className={theme.label}>Email</span>
        <input required name="email" type="email" autoComplete="email" className={theme.input} />
      </label>
      <label className={field}>
        <span className={theme.label}>Event date</span>
        <input required name="date" type="date" className={theme.input} />
      </label>
      <label className={field}>
        <span className={theme.label}>Occasion</span>
        <select name="occasion" defaultValue={OCCASIONS[0]} className={theme.input}>
          {OCCASIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      {packages && (
        <label className={field}>
          <span className={theme.label}>Package</span>
          <select name="package" defaultValue={packages[0]} className={theme.input}>
            {packages.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      )}
      <label className={field}>
        <span className={theme.label}>Guest count</span>
        <input name="guests" type="number" min={1} placeholder="80" className={theme.input} />
      </label>
      <label className={`${field} sm:col-span-2`}>
        <span className={theme.label}>Anything we should know?</span>
        <textarea name="notes" rows={3} className={theme.input} />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className={theme.button}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
