import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Mirra — The camera your guests remember",
};

const features = [
  {
    n: "No. 1",
    title: "Studio light, anywhere",
    body: "A calibrated key light and a lens tuned for skin. Every frame looks like it took an hour to set up, because for us it did — once.",
  },
  {
    n: "No. 2",
    title: "Directed, not posed",
    body: "Gentle on-screen direction coaxes people out of the stiff smile. Three frames, eight seconds, one keeper every time.",
  },
  {
    n: "No. 3",
    title: "Delivered before dessert",
    body: "Prints in eleven seconds. A private gallery on every guest's phone before they sit back down.",
  },
];

const galleryTones = [
  "from-stone-300 via-stone-400 to-stone-600",
  "from-neutral-400 via-neutral-500 to-neutral-800",
  "from-stone-200 via-stone-300 to-stone-500",
  "from-zinc-400 via-zinc-600 to-zinc-800",
  "from-stone-300 via-stone-500 to-stone-700",
];

export default function Mirra() {
  return (
    <main
      className={`${fraunces.variable} ${inter.variable} min-h-screen bg-[#f4f1ea] text-[#1c1a17]`}
      style={{ fontFamily: "var(--font-inter)" }}
    >
      {/* Masthead */}
      <header className="border-b border-[#1c1a17]/20">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-baseline justify-between">
          <span
            className="text-xl tracking-tight"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            Mirra
          </span>
          <nav className="hidden sm:flex gap-8 text-[11px] uppercase tracking-[0.25em] text-[#1c1a17]/70">
            <a href="#" className="hover:text-[#1c1a17]">The Studio</a>
            <a href="#" className="hover:text-[#1c1a17]">Occasions</a>
            <a href="#" className="hover:text-[#1c1a17]">Journal</a>
          </nav>
          <a
            href="#"
            className="text-[11px] uppercase tracking-[0.25em] border-b border-[#1c1a17] pb-0.5 hover:opacity-60"
          >
            Enquire
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
        <p className="text-[11px] uppercase tracking-[0.35em] text-[#8a6f4d] mb-8">
          A portrait studio for one evening only
        </p>
        <h1
          className="text-[13vw] sm:text-[7.5rem] leading-[0.95] tracking-[-0.02em] max-w-5xl"
          style={{ fontFamily: "var(--font-fraunces)" }}
        >
          The camera your guests remember.
        </h1>
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-12 gap-10 items-end">
          <p className="sm:col-span-5 text-[15px] leading-relaxed text-[#1c1a17]/75">
            Mirra arrives quietly, sets itself in a corner of the room, and
            leaves behind the only photographs from the night anyone frames.
            Weddings, openings, dinners of consequence.
          </p>
          <div className="sm:col-span-7 flex justify-end">
            <div className="w-full sm:w-4/5 aspect-[4/3] bg-gradient-to-br from-stone-300 via-stone-400 to-stone-700 relative">
              <span className="absolute bottom-3 left-3 text-[10px] uppercase tracking-[0.25em] text-white/80">
                Fig. 01 — The Booth, Walnut &amp; Brass
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Rule + manifesto line */}
      <div className="border-y border-[#1c1a17]/20">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p
            className="text-2xl sm:text-3xl leading-snug max-w-3xl italic"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            &ldquo;Nobody remembers the centrepieces. Everybody keeps the
            portrait.&rdquo;
          </p>
        </div>
      </div>

      {/* Numbered features */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#1c1a17]/20 border border-[#1c1a17]/20">
          {features.map((f) => (
            <article key={f.n} className="bg-[#f4f1ea] p-8 min-h-[18rem] flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.3em] text-[#8a6f4d]">
                {f.n}
              </span>
              <h2
                className="mt-6 text-3xl leading-tight"
                style={{ fontFamily: "var(--font-fraunces)" }}
              >
                {f.title}
              </h2>
              <p className="mt-auto pt-8 text-[14px] leading-relaxed text-[#1c1a17]/70">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Gallery strip */}
      <section className="pb-20">
        <div className="mx-auto max-w-6xl px-6 mb-6 flex items-baseline justify-between">
          <h3
            className="text-2xl"
            style={{ fontFamily: "var(--font-fraunces)" }}
          >
            From recent evenings
          </h3>
          <span className="text-[11px] uppercase tracking-[0.25em] text-[#1c1a17]/50">
            Selected frames, 2025–26
          </span>
        </div>
        <div className="flex gap-4 overflow-x-auto px-6 pb-4 [scrollbar-width:thin]">
          {galleryTones.map((tone, i) => (
            <div
              key={i}
              className={`shrink-0 w-56 sm:w-72 aspect-[3/4] bg-gradient-to-b ${tone} relative`}
            >
              <span className="absolute bottom-2 left-2 text-[10px] tracking-[0.2em] text-white/70">
                {String(i + 1).padStart(2, "0")} / 05
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Booking */}
      <section className="border-t border-[#1c1a17]/20">
        <div className="mx-auto max-w-6xl px-6 py-24 grid grid-cols-1 sm:grid-cols-2 gap-12 items-center">
          <div>
            <h3
              className="text-5xl leading-[1.05]"
              style={{ fontFamily: "var(--font-fraunces)" }}
            >
              One evening.
              <br />
              Every portrait.
            </h3>
            <p className="mt-6 text-[15px] leading-relaxed text-[#1c1a17]/70 max-w-md">
              Engagements from $1,800, inclusive of delivery, an attendant in
              black, and archival prints for every guest.
            </p>
          </div>
          <div className="flex sm:justify-end">
            <a
              href="#"
              className="inline-block border border-[#1c1a17] px-12 py-5 text-[12px] uppercase tracking-[0.3em] hover:bg-[#1c1a17] hover:text-[#f4f1ea] transition-colors"
            >
              Request a date
            </a>
          </div>
        </div>
      </section>

      {/* Colophon */}
      <footer className="border-t border-[#1c1a17]/20">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col sm:flex-row gap-4 justify-between text-[11px] uppercase tracking-[0.25em] text-[#1c1a17]/50">
          <span>Mirra Studio — est. MMXXVI</span>
          <span>New York · London · Copenhagen</span>
          <span>hello@mirra.studio</span>
        </div>
      </footer>
    </main>
  );
}
