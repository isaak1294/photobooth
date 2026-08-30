import type { Metadata } from "next";
import { Shrikhand, Karla } from "next/font/google";
import { BookingForm, type BookingTheme } from "@/components/product/BookingForm";

const shrikhand = Shrikhand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-shrikhand",
});
const karla = Karla({ subsets: ["latin"], variable: "--font-karla" });

export const metadata: Metadata = {
  title: "Shindig — Get in the booth, sugar",
};

const bookingTheme: BookingTheme = {
  label: "text-xs font-bold uppercase tracking-[0.15em] text-[#3b2417]/70",
  input:
    "w-full rounded-xl border-2 border-[#3b2417]/25 bg-white px-4 py-3 font-semibold text-[#3b2417] focus:border-[#d95f18] focus:outline-none",
  button:
    "w-full cursor-pointer rounded-full bg-[#d95f18] px-10 py-4 text-xl font-bold text-[#f6ecd9] shadow-[0_6px_0_#3b2417] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_#3b2417]",
  successWrap:
    "rounded-2xl border-2 border-dashed border-[#3b2417]/40 bg-white p-10 text-center",
  successTitle: "text-4xl text-[#d95f18] [font-family:var(--font-shrikhand)]",
  successBody: "mt-4 font-semibold text-[#3b2417]/80",
};

const stubs = [
  {
    no: "A-01",
    title: "The Big Flash",
    body: "Warm tungsten glow, none of that clinical white. Everybody looks like an album cover.",
    color: "bg-[#e8a33d]",
  },
  {
    no: "A-02",
    title: "Four-Frame Strips",
    body: "The classic vertical strip, printed hot in seconds. Perfect for the fridge door.",
    color: "bg-[#d95f18]",
  },
  {
    no: "A-03",
    title: "The Prop Trunk",
    body: "Feather boas, aviators, a tambourine nobody asked for. Chaos, curated.",
    color: "bg-[#4f7d6d]",
  },
];

export default function Shindig() {
  return (
    <main
      className={`${shrikhand.variable} ${karla.variable} min-h-screen bg-[#f6ecd9] text-[#3b2417] overflow-x-hidden`}
      style={{ fontFamily: "var(--font-karla)" }}
    >
      <style>{`
        @keyframes sd-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Nav */}
      <header className="bg-[#3b2417] text-[#f6ecd9]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span
            className="text-2xl text-[#e8a33d]"
            style={{ fontFamily: "var(--font-shrikhand)" }}
          >
            Shindig
          </span>
          <nav className="hidden gap-8 text-sm font-bold uppercase tracking-wider sm:flex">
            <a href="#booth" className="hover:text-[#e8a33d]">The Booth</a>
            <a href="#lineup" className="hover:text-[#e8a33d]">Good Times</a>
            <a href="#book" className="hover:text-[#e8a33d]">Rates</a>
          </nav>
          <a
            href="#book"
            className="rounded-full bg-[#d95f18] px-5 py-2 text-sm font-bold uppercase tracking-wider text-[#f6ecd9] hover:bg-[#e8a33d] hover:text-[#3b2417] transition-colors"
          >
            Book the vibe
          </a>
        </div>
      </header>

      {/* Hero with sunburst */}
      <section className="relative overflow-hidden">
        {/* sunburst */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-[0.35]"
          style={{
            background:
              "repeating-conic-gradient(#e8a33d 0deg 9deg, transparent 9deg 18deg)",
            animation: "sd-spin 120s linear infinite",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-6 pt-24 pb-32 text-center">
          <p className="inline-block rounded-full border-2 border-[#3b2417] bg-[#f6ecd9] px-5 py-1.5 text-xs font-bold uppercase tracking-[0.25em]">
            ★ The photobooth with soul ★
          </p>
          <h1
            className="mt-10 text-6xl leading-[1.02] sm:text-8xl"
            style={{ fontFamily: "var(--font-shrikhand)" }}
          >
            <span className="block text-[#d95f18]">Get in the</span>
            <span className="block text-[#3b2417]">booth,</span>
            <span className="block text-[#4f7d6d]">sugar.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-md text-lg font-medium leading-relaxed">
            Shindig brings the warm flash, the velvet curtain, and the photo
            strips your mama kept from &rsquo;74 — to your party, this weekend.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="#book"
              className="rounded-full bg-[#3b2417] px-8 py-4 text-lg font-bold text-[#f6ecd9] shadow-[0_6px_0_#d95f18] transition-all hover:translate-y-1 hover:shadow-[0_2px_0_#d95f18]"
            >
              Save my date
            </a>
            <a
              href="#booth"
              className="rounded-full border-[3px] border-[#3b2417] px-8 py-4 text-lg font-bold transition-colors hover:bg-[#3b2417] hover:text-[#f6ecd9]"
            >
              Peek the strips
            </a>
          </div>

          {/* rotating badge */}
          <div className="pointer-events-none absolute right-4 bottom-6 hidden h-32 w-32 sm:block">
            <div
              className="grid h-full w-full place-items-center rounded-full bg-[#d95f18] text-[#f6ecd9]"
              style={{ animation: "sd-spin 14s linear infinite" }}
            >
              <svg viewBox="0 0 100 100" className="h-full w-full p-2">
                <defs>
                  <path
                    id="sd-circle"
                    d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
                  />
                </defs>
                <text className="fill-[#f6ecd9] text-[11px] font-bold uppercase tracking-[0.2em]">
                  <textPath href="#sd-circle">
                    good times · guaranteed · good times ·
                  </textPath>
                </text>
              </svg>
            </div>
            <span
              className="absolute inset-0 grid place-items-center text-2xl text-[#f6ecd9]"
              style={{ fontFamily: "var(--font-shrikhand)" }}
            >
              ✌
            </span>
          </div>
        </div>

        {/* wavy divider */}
        <svg
          viewBox="0 0 1440 90"
          preserveAspectRatio="none"
          className="relative block h-16 w-full"
        >
          <path
            d="M0,45 C240,90 480,0 720,45 C960,90 1200,0 1440,45 L1440,90 L0,90 Z"
            fill="#d95f18"
          />
        </svg>
      </section>

      {/* Photo strip showcase */}
      <section id="booth" className="bg-[#d95f18] pb-24 pt-8 text-[#f6ecd9]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:justify-between">
            <div className="max-w-md">
              <h2
                className="text-5xl leading-tight"
                style={{ fontFamily: "var(--font-shrikhand)" }}
              >
                Strips like they used to make &rsquo;em
              </h2>
              <p className="mt-6 text-lg font-medium leading-relaxed text-[#f6ecd9]/90">
                Real chemistry-warm tones on thick matte stock. Four frames,
                one story: cool, cooler, laughing, gone.
              </p>
              <ul className="mt-8 space-y-3 font-bold">
                <li>✦ Prints in 13 seconds, still warm</li>
                <li>✦ Two copies — one to keep, one to give</li>
                <li>✦ Your names &amp; date on every strip</li>
              </ul>
            </div>
            {/* strips */}
            <div className="flex gap-6">
              {[
                ["-rotate-6", ["#e8a33d", "#4f7d6d", "#8c5b3f", "#e8a33d"]],
                ["rotate-2", ["#4f7d6d", "#e8a33d", "#e8a33d", "#8c5b3f"]],
                ["rotate-6", ["#8c5b3f", "#4f7d6d", "#e8a33d", "#4f7d6d"]],
              ].map(([rot, frames], i) => (
                <div
                  key={i}
                  className={`${rot} w-24 bg-[#f6ecd9] p-2 pb-6 shadow-xl sm:w-28`}
                >
                  {(frames as string[]).map((c, j) => (
                    <div
                      key={j}
                      className="mb-2 aspect-square"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <p className="text-center text-[9px] font-bold uppercase tracking-widest text-[#3b2417]">
                    shindig ’26
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Ticket stub features */}
      <section id="lineup" className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#d95f18]">
            Admit everyone
          </p>
          <h2
            className="mt-4 text-5xl"
            style={{ fontFamily: "var(--font-shrikhand)" }}
          >
            The lineup
          </h2>
        </div>
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {stubs.map((s) => (
            <article
              key={s.no}
              className={`relative ${s.color} p-8 text-[#3b2417] shadow-lg`}
              style={{
                borderRadius: "14px",
                maskImage:
                  "radial-gradient(circle 12px at 0 65%, transparent 98%, black), radial-gradient(circle 12px at 100% 65%, transparent 98%, black)",
                maskComposite: "intersect",
                WebkitMaskComposite: "source-in",
              }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.3em]">
                Ticket {s.no}
              </p>
              <h3
                className="mt-4 text-3xl"
                style={{ fontFamily: "var(--font-shrikhand)" }}
              >
                {s.title}
              </h3>
              <div className="my-5 border-t-2 border-dashed border-[#3b2417]/40" />
              <p className="font-medium leading-relaxed">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Big quote band */}
      <section className="bg-[#4f7d6d] py-20 text-center text-[#f6ecd9]">
        <div className="mx-auto max-w-4xl px-6">
          <p
            className="text-4xl leading-snug sm:text-5xl"
            style={{ fontFamily: "var(--font-shrikhand)" }}
          >
            &ldquo;The dance floor was fine. The booth line? Around the
            block.&rdquo;
          </p>
          <p className="mt-6 text-sm font-bold uppercase tracking-[0.3em] text-[#e8a33d]">
            — Rosa &amp; Dee, married under a disco ball
          </p>
        </div>
      </section>

      {/* Rates + booking */}
      <section id="book" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2
          className="text-5xl"
          style={{ fontFamily: "var(--font-shrikhand)" }}
        >
          One rate, all night
        </h2>
        <p className="mt-6 text-lg font-medium">
          <span
            className="text-6xl text-[#d95f18]"
            style={{ fontFamily: "var(--font-shrikhand)" }}
          >
            $425
          </span>{" "}
          <span className="text-[#3b2417]/70">/ evening</span>
        </p>
        <p className="mx-auto mt-4 max-w-md font-medium text-[#3b2417]/80">
          Booth, attendant, unlimited strips, the prop trunk, and a digital
          shoebox of every frame the morning after. Tell us about your party
          and we&rsquo;ll hold the night.
        </p>
        <div className="mx-auto mt-12 max-w-2xl">
          <BookingForm
            theme={bookingTheme}
            submitLabel="Let's boogie →"
            successTitle="Far out!"
            successBody="Your night's on our calendar in pencil. We'll call to make it pen."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#3b2417] py-10 text-[#f6ecd9]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm font-bold uppercase tracking-wider sm:flex-row">
          <span
            className="text-xl normal-case tracking-normal text-[#e8a33d]"
            style={{ fontFamily: "var(--font-shrikhand)" }}
          >
            Shindig
          </span>
          <span>Austin, TX · Rolling since forever</span>
          <span>howdy@shindig.co</span>
        </div>
      </footer>
    </main>
  );
}
