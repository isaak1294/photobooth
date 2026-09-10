import type { Metadata } from "next";
import { BookingForm, type BookingTheme } from "@/components/product/BookingForm";

// The fonts and the marquee keyframes this page introduced now live in the
// shared design system (app/layout.tsx, app/globals.css), because the app
// surfaces are built on them too.

export const metadata: Metadata = {
  title: "POPFLASH — Your party. But louder.",
};

const bookingTheme: BookingTheme = {
  label: "text-xs font-black uppercase",
  input:
    "w-full border-2 border-black bg-white px-3 py-2.5 font-bold shadow-[3px_3px_0_0_#000] focus:bg-[#fffbd6] focus:outline-none",
  button:
    "w-full cursor-pointer border-4 border-black bg-black px-8 py-4 text-xl font-black text-[#ffde03] shadow-[6px_6px_0_0_#ff2d95] transition-all hover:translate-x-[6px] hover:translate-y-[6px] hover:shadow-none [font-family:var(--font-archivo)]",
  successWrap:
    "-rotate-1 border-4 border-black bg-[#a8ff60] p-8 text-center shadow-[8px_8px_0_0_#000]",
  successTitle: "text-4xl uppercase [font-family:var(--font-archivo)]",
  successBody: "mt-3 font-bold",
};

const marqueeWords = [
  "NO BORING PHOTOS",
  "★",
  "INSTANT PRINTS",
  "★",
  "GIFS THAT SLAP",
  "★",
  "ZERO SETUP",
  "★",
];

const plans = [
  {
    name: "HOUSE PARTY",
    price: "$249",
    per: "/night",
    bg: "bg-[#7df9ff]",
    items: ["1 booth", "Unlimited snaps", "GIF mode", "Digital gallery"],
  },
  {
    name: "FULL SEND",
    price: "$499",
    per: "/night",
    bg: "bg-[#ff90e8]",
    tag: "MOST HYPE",
    items: [
      "Everything in House Party",
      "Instant prints",
      "Props crate",
      "Custom frames",
    ],
  },
  {
    name: "ABSOLUTE CHAOS",
    price: "$999",
    per: "/night",
    bg: "bg-[#a8ff60]",
    items: [
      "2 booths",
      "360° cam",
      "On-site hype human",
      "Same-night highlight reel",
    ],
  },
];

export default function Popflash() {
  return (
    <main className="min-h-screen bg-pop-yellow text-black overflow-x-hidden">
      {/* Nav */}
      <header className="border-b-4 border-black bg-[#ffde03] sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <span
            className="text-2xl -rotate-2 inline-block"
            style={{ fontFamily: "var(--font-archivo)" }}
          >
            POP<span className="text-[#ff2d95]">FLASH</span>
          </span>
          <nav className="hidden md:flex gap-2 font-bold">
            {[
              ["THE BOOTH", "#box"],
              ["PRICING", "#pricing"],
              ["PICS OR IT DIDN'T HAPPEN", "#pics"],
            ].map(([l, href]) => (
              <a
                key={l}
                href={href}
                className="px-3 py-1 border-2 border-black bg-white hover:bg-[#7df9ff] shadow-[3px_3px_0_0_#000] hover:shadow-[1px_1px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-sm"
              >
                {l}
              </a>
            ))}
          </nav>
          <a
            href="#book"
            className="px-4 py-2 border-2 border-black bg-[#ff2d95] text-white font-bold shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all text-sm"
          >
            BOOK IT →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-24">
        {/* stickers */}
        <div className="absolute right-6 top-8 rotate-12 border-2 border-black bg-white px-4 py-2 font-bold shadow-[4px_4px_0_0_#000] text-sm">
          📸 3…2…1…
        </div>
        <div className="absolute left-2 top-40 -rotate-6 border-2 border-black bg-[#a8ff60] px-4 py-2 font-bold shadow-[4px_4px_0_0_#000] text-sm hidden sm:block">
          ZERO SETUP FR
        </div>

        <h1
          className="text-[16vw] md:text-[9rem] leading-[0.85] uppercase"
          style={{ fontFamily: "var(--font-archivo)" }}
        >
          Your party.
          <br />
          <span className="text-white [text-shadow:5px_5px_0_#000,-2px_-2px_0_#000,2px_-2px_0_#000,-2px_2px_0_#000]">
            But louder.
          </span>
        </h1>

        <p className="mt-8 max-w-xl text-lg font-medium border-l-4 border-black pl-4">
          POPFLASH is the photobooth that shows up, goes off, and prints the
          receipts. Boomerangs, GIFs, glossy prints — before the beat drops
          twice.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <a
            href="#book"
            className="px-8 py-4 border-4 border-black bg-black text-[#ffde03] text-xl font-black shadow-[6px_6px_0_0_#ff2d95] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all"
            style={{ fontFamily: "var(--font-archivo)" }}
          >
            GET A BOOTH
          </a>
          <a
            href="#pics"
            className="px-8 py-4 border-4 border-black bg-white text-xl font-black shadow-[6px_6px_0_0_#000] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all"
            style={{ fontFamily: "var(--font-archivo)" }}
          >
            SEE THE CHAOS
          </a>
        </div>

        {/* polaroid pile */}
        <div id="pics" className="mt-16 flex flex-wrap gap-6 scroll-mt-24">
          {[
            { r: "-rotate-3", bg: "bg-[#ff2d95]", cap: "bridesmaids.gif" },
            { r: "rotate-2", bg: "bg-[#7df9ff]", cap: "office party 😭" },
            { r: "-rotate-1", bg: "bg-[#a8ff60]", cap: "grandma went off" },
            { r: "rotate-6", bg: "bg-[#b28dff]", cap: "3am energy" },
          ].map((p) => (
            <div
              key={p.cap}
              className={`${p.r} border-2 border-black bg-white p-2 pb-4 shadow-[5px_5px_0_0_#000] w-40 sm:w-48`}
            >
              <div className={`${p.bg} aspect-square border-2 border-black`} />
              <p className="mt-2 text-center text-sm font-bold">{p.cap}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Marquee */}
      <div className="border-y-4 border-black bg-black text-[#ffde03] py-3 overflow-hidden">
        <div
          className="flex whitespace-nowrap w-max"
          style={{ animation: "pop-marquee 18s linear infinite" }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex">
              {marqueeWords.concat(marqueeWords).map((w, i) => (
                <span
                  key={`${copy}-${i}`}
                  className="mx-6 text-xl"
                  style={{ fontFamily: "var(--font-archivo)" }}
                >
                  {w}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <section id="box" className="mx-auto max-w-6xl px-4 py-20 scroll-mt-16">
        <h2
          className="text-5xl sm:text-6xl uppercase mb-12 rotate-[-1deg]"
          style={{ fontFamily: "var(--font-archivo)" }}
        >
          What&rsquo;s in the box?!
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { e: "⚡", t: "11-SEC PRINTS", d: "Glossy 4×6s faster than you can say cheese twice." },
            { e: "🌀", t: "GIF + BOOMERANG", d: "Loops so good they end up as someone's contact photo." },
            { e: "🎛️", t: "IDIOT-PROOF", d: "One big button. That's the whole manual." },
            { e: "📲", t: "AIRDROP-SPEED SHARE", d: "QR on screen, pics on phones, posted before midnight." },
          ].map((f, i) => (
            <div
              key={f.t}
              className={`border-4 border-black bg-white p-6 shadow-[6px_6px_0_0_#000] ${
                i % 2 ? "rotate-1" : "-rotate-1"
              } hover:rotate-0 transition-transform`}
            >
              <div className="text-4xl">{f.e}</div>
              <h3
                className="mt-4 text-xl"
                style={{ fontFamily: "var(--font-archivo)" }}
              >
                {f.t}
              </h3>
              <p className="mt-2 font-medium text-sm">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#ff2d95] border-y-4 border-black py-20 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2
            className="text-5xl sm:text-6xl uppercase text-white [text-shadow:4px_4px_0_#000] mb-12"
            style={{ fontFamily: "var(--font-archivo)" }}
          >
            Pick your poison
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`relative border-4 border-black ${p.bg} p-6 shadow-[8px_8px_0_0_#000] flex flex-col`}
              >
                {p.tag && (
                  <span className="absolute -top-4 right-4 rotate-6 border-2 border-black bg-black text-[#ffde03] px-3 py-1 text-xs font-black">
                    {p.tag}
                  </span>
                )}
                <h3
                  className="text-2xl"
                  style={{ fontFamily: "var(--font-archivo)" }}
                >
                  {p.name}
                </h3>
                <p className="mt-4">
                  <span
                    className="text-5xl"
                    style={{ fontFamily: "var(--font-archivo)" }}
                  >
                    {p.price}
                  </span>
                  <span className="font-bold">{p.per}</span>
                </p>
                <ul className="mt-6 space-y-2 font-bold text-sm flex-1">
                  {p.items.map((it) => (
                    <li key={it}>✔ {it}</li>
                  ))}
                </ul>
                <a
                  href="#book"
                  className="mt-8 block text-center border-2 border-black bg-white py-3 font-black shadow-[4px_4px_0_0_#000] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
                >
                  LET&rsquo;S GO
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Booking */}
      <section id="book" className="bg-[#7df9ff] border-b-4 border-black py-20 scroll-mt-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2
            className="text-5xl sm:text-6xl uppercase rotate-[-1deg] mb-4"
            style={{ fontFamily: "var(--font-archivo)" }}
          >
            Lock it in
          </h2>
          <p className="mb-10 max-w-md border-l-4 border-black pl-4 font-bold">
            Fill this out and we&rsquo;ll text you back before you finish your
            playlist. No deposit till you&rsquo;re sure.
          </p>
          <div className="border-4 border-black bg-white p-6 shadow-[8px_8px_0_0_#000] sm:p-8">
            <BookingForm
              theme={bookingTheme}
              packages={[
                "HOUSE PARTY — $249",
                "FULL SEND — $499",
                "ABSOLUTE CHAOS — $999",
              ]}
              submitLabel="SEND IT →"
              successTitle="YOU'RE IN!!"
              successBody="Booth request received. Keep your phone loud — we reply stupid fast."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-6">
          <span
            className="text-3xl"
            style={{ fontFamily: "var(--font-archivo)" }}
          >
            POP<span className="text-[#ffde03]">FLASH</span>
          </span>
          <p className="font-bold text-sm text-center">
            © 2026 POPFLASH INC · MADE LOUD IN LOS ANGELES · 📞 1-800-SAY-CHZZ
          </p>
        </div>
      </footer>
    </main>
  );
}
