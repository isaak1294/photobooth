import type { Metadata } from "next";
import { DynaPuff, Caveat, Nunito } from "next/font/google";
import { BookingForm, type BookingTheme } from "@/components/product/BookingForm";

const dynapuff = DynaPuff({
  subsets: ["latin"],
  variable: "--font-dynapuff",
});
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });

export const metadata: Metadata = {
  title: "Shoebox — Parties worth keeping",
};

function Tape({ className = "" }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute h-7 w-24 bg-[#f9d976]/70 shadow-sm ${className}`}
      style={{
        clipPath:
          "polygon(2% 0, 98% 4%, 100% 96%, 96% 100%, 4% 98%, 0 6%)",
      }}
      aria-hidden
    />
  );
}

function Squiggle({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 40"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M6 28 C 20 8, 34 8, 46 24 S 76 40, 90 20 S 108 10, 114 16" />
      <path d="M104 8 L 114 16 L 102 22" />
    </svg>
  );
}

const bookingTheme: BookingTheme = {
  label: "text-xl leading-none text-[#4a3f35]/80 [font-family:var(--font-caveat)]",
  input:
    "w-full rounded-xl border-2 border-dashed border-[#c9b99a] bg-[#fdf8f0] px-4 py-2.5 font-semibold text-[#4a3f35] focus:border-[#e2648c] focus:outline-none",
  button:
    "w-full cursor-pointer rounded-full bg-[#e2648c] px-10 py-4 text-lg font-extrabold text-white shadow-[0_4px_0_#b34367] transition-all hover:translate-y-1 hover:shadow-[0_1px_0_#b34367]",
  successWrap: "py-6 text-center",
  successTitle: "text-4xl text-[#e2648c] [font-family:var(--font-dynapuff)]",
  successBody: "mt-3 text-2xl text-[#4a3f35]/70 [font-family:var(--font-caveat)]",
};

const notes = [
  {
    color: "bg-[#fff3ad]",
    rotate: "-rotate-2",
    title: "the booth",
    body: "A cozy little corner with twinkle lights and the comfiest bench. Squeeze in six friends, we dare you.",
    doodle: "♡",
  },
  {
    color: "bg-[#ffd6e7]",
    rotate: "rotate-1",
    title: "the prints",
    body: "Two strips every time — one for you, one for the friendship scrapbook. Sticker-backed, obviously.",
    doodle: "✿",
  },
  {
    color: "bg-[#cdeffd]",
    rotate: "-rotate-1",
    title: "the keepsies",
    body: "Every photo lands in a shared album by morning, plus a little box of doubles mailed to you.",
    doodle: "☆",
  },
];

const polaroids = [
  {
    grad: "linear-gradient(135deg,#ffd6e7,#f9a8c9)",
    caption: "maya's 30th!!",
    rotate: "-rotate-3",
  },
  {
    grad: "linear-gradient(135deg,#cdeffd,#93d6f2)",
    caption: "cried a lil :')",
    rotate: "rotate-2",
  },
  {
    grad: "linear-gradient(135deg,#d9f2d0,#a8dfa0)",
    caption: "the whole crew",
    rotate: "-rotate-1",
  },
  {
    grad: "linear-gradient(135deg,#f9d976,#f2b95c)",
    caption: "do NOT post this",
    rotate: "rotate-3",
  },
];

export default function Shoebox() {
  return (
    <main
      className={`${dynapuff.variable} ${caveat.variable} ${nunito.variable} min-h-screen overflow-x-hidden bg-[#fdf8f0] text-[#4a3f35]`}
      style={{
        fontFamily: "var(--font-nunito)",
        backgroundImage:
          "radial-gradient(circle, #e8ddcc 1.2px, transparent 1.2px)",
        backgroundSize: "26px 26px",
      }}
    >
      {/* Nav */}
      <header className="px-4 pt-6">
        <div className="relative mx-auto flex max-w-5xl items-center justify-between rounded-2xl border-2 border-dashed border-[#c9b99a] bg-white/80 px-6 py-3">
          <Tape className="-top-3 left-8 -rotate-6" />
          <span
            className="text-2xl text-[#e2648c]"
            style={{ fontFamily: "var(--font-dynapuff)" }}
          >
            shoebox
          </span>
          <nav
            className="hidden gap-7 text-xl sm:flex"
            style={{ fontFamily: "var(--font-caveat)" }}
          >
            <a href="#deal" className="hover:text-[#e2648c]">how it works</a>
            <a href="#album" className="hover:text-[#e2648c]">the album</a>
            <a href="#book" className="hover:text-[#e2648c]">prices &amp; stuff</a>
          </nav>
          <a
            href="#book"
            className="rounded-full bg-[#e2648c] px-5 py-2 text-sm font-extrabold text-white shadow-[0_3px_0_#b34367] transition-all hover:translate-y-0.5 hover:shadow-[0_1px_0_#b34367]"
          >
            save your date ♡
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-6 pb-24 pt-20 text-center">
        <p
          className="text-3xl text-[#7fae72]"
          style={{ fontFamily: "var(--font-caveat)" }}
        >
          hi! we&rsquo;re a photobooth ♡
        </p>
        <h1
          className="mx-auto mt-4 max-w-3xl text-5xl leading-tight text-[#4a3f35] sm:text-7xl"
          style={{ fontFamily: "var(--font-dynapuff)" }}
        >
          parties worth{" "}
          <span className="relative inline-block text-[#e2648c]">
            keeping
            <svg
              viewBox="0 0 200 20"
              className="absolute -bottom-3 left-0 w-full text-[#f9d976]"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 14 C 50 6, 150 6, 194 12" />
            </svg>
          </span>
        </h1>
        <p className="mx-auto mt-8 max-w-md text-lg font-semibold leading-relaxed text-[#4a3f35]/80">
          Shoebox is the booth for people who still print their pictures.
          Soft light, silly props, and photo strips made to be taped into
          something.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#book"
            className="rounded-full bg-[#4a3f35] px-8 py-4 text-lg font-extrabold text-[#fdf8f0] shadow-[0_4px_0_#2c251e] transition-all hover:translate-y-1 hover:shadow-[0_1px_0_#2c251e]"
          >
            book the booth
          </a>
          <span
            className="text-2xl text-[#4a3f35]/70"
            style={{ fontFamily: "var(--font-caveat)" }}
          >
            ← it takes like 2 mins, promise
          </span>
        </div>

        {/* polaroid pile */}
        <div id="album" className="mt-20 flex flex-wrap items-start justify-center gap-8">
          {polaroids.map((p) => (
            <figure
              key={p.caption}
              className={`relative ${p.rotate} w-44 bg-white p-3 pb-2 shadow-[0_8px_20px_rgba(74,63,53,0.18)] sm:w-52`}
            >
              <Tape className="-top-3 left-1/2 w-20 -translate-x-1/2 rotate-2" />
              <div
                className="aspect-square w-full"
                style={{ background: p.grad }}
              />
              <figcaption
                className="mt-2 text-center text-2xl"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                {p.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Sticky note features */}
      <section id="deal" className="bg-[#f4ead8]/80 py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2
              className="text-4xl sm:text-5xl"
              style={{ fontFamily: "var(--font-dynapuff)" }}
            >
              the whole deal
            </h2>
            <p
              className="mt-3 text-2xl text-[#4a3f35]/60"
              style={{ fontFamily: "var(--font-caveat)" }}
            >
              (we wrote it on sticky notes so you know it&rsquo;s true)
            </p>
          </div>
          <div className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-3">
            {notes.map((n) => (
              <article
                key={n.title}
                className={`relative ${n.color} ${n.rotate} p-7 pb-9 shadow-[0_10px_18px_rgba(74,63,53,0.15)] transition-transform hover:rotate-0`}
                style={{ borderRadius: "2px 2px 14px 2px" }}
              >
                <span className="absolute right-4 top-3 text-2xl text-[#4a3f35]/40">
                  {n.doodle}
                </span>
                <h3
                  className="text-3xl"
                  style={{ fontFamily: "var(--font-caveat)" }}
                >
                  {n.title}
                </h3>
                <p className="mt-3 font-semibold leading-relaxed text-[#4a3f35]/80">
                  {n.body}
                </p>
                {/* folded corner */}
                <span
                  className="absolute bottom-0 right-0 h-6 w-6 bg-[#fdf8f0]"
                  style={{ clipPath: "polygon(100% 0, 100% 100%, 0 100%)" }}
                  aria-hidden
                />
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Photo strip + note section */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div className="flex flex-col items-center gap-16 lg:flex-row lg:justify-between">
          {/* strip */}
          <div className="relative shrink-0 -rotate-2">
            <Tape className="-top-4 left-1/2 -translate-x-1/2 -rotate-3" />
            <div className="w-40 bg-white p-3 pb-5 shadow-[0_12px_24px_rgba(74,63,53,0.2)]">
              {[
                "linear-gradient(135deg,#f9a8c9,#e2648c)",
                "linear-gradient(135deg,#93d6f2,#5bb8e0)",
                "linear-gradient(135deg,#f9d976,#f2b95c)",
                "linear-gradient(135deg,#a8dfa0,#7fae72)",
              ].map((g, i) => (
                <div
                  key={i}
                  className="mb-2.5 aspect-square w-full"
                  style={{ background: g }}
                />
              ))}
              <p
                className="text-center text-xl"
                style={{ fontFamily: "var(--font-caveat)" }}
              >
                shoebox ♡ jun 14
              </p>
            </div>
          </div>

          {/* handwritten letter */}
          <div className="relative max-w-lg rounded-lg border-2 border-dashed border-[#c9b99a] bg-white/90 p-8 shadow-sm">
            <Tape className="-top-3 right-10 rotate-6" />
            <h2
              className="text-4xl"
              style={{ fontFamily: "var(--font-dynapuff)" }}
            >
              why print stuff?
            </h2>
            <div
              className="mt-5 space-y-4 text-2xl leading-snug text-[#4a3f35]/85"
              style={{ fontFamily: "var(--font-caveat)" }}
            >
              <p>
                because your camera roll has 14,000 photos and you look at,
                like, none of them.
              </p>
              <p>
                but the strip on your fridge? you see it every single morning.
                that&rsquo;s the good stuff.
              </p>
              <p className="text-[#e2648c]">— the shoebox crew xoxo</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / RSVP card */}
      <section id="book" className="pb-28">
        <div className="relative mx-auto max-w-xl px-6">
          <div className="relative rotate-1 rounded-2xl bg-white p-10 text-center shadow-[0_14px_30px_rgba(74,63,53,0.18)]">
            <Tape className="-top-3 left-10 -rotate-6" />
            <Tape className="-top-3 right-10 rotate-6" />
            <p
              className="text-3xl text-[#7fae72]"
              style={{ fontFamily: "var(--font-caveat)" }}
            >
              you&rsquo;re invited to book us!
            </p>
            <p
              className="mt-4 text-6xl text-[#e2648c]"
              style={{ fontFamily: "var(--font-dynapuff)" }}
            >
              $350
            </p>
            <p className="mt-1 font-bold text-[#4a3f35]/60">
              per evening · everything included
            </p>
            <ul
              className="mx-auto mt-6 max-w-xs space-y-1 text-left text-2xl"
              style={{ fontFamily: "var(--font-caveat)" }}
            >
              <li>☑ unlimited photo strips</li>
              <li>☑ the props basket</li>
              <li>☑ shared album next morning</li>
              <li>☑ a lil box of doubles, mailed</li>
            </ul>
            <div className="mt-8 border-t-2 border-dashed border-[#c9b99a] pt-8">
              <BookingForm
                theme={bookingTheme}
                submitLabel="rsvp yes ♡"
                successTitle="eee, yay!!"
                successBody="got it! we'll write back super soon — check your inbox ♡"
              />
            </div>
          </div>
          <Squiggle className="absolute -right-2 -top-10 w-28 rotate-12 text-[#5bb8e0]" />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-dashed border-[#c9b99a] bg-[#f4ead8]/60 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 sm:flex-row">
          <span
            className="text-xl text-[#e2648c]"
            style={{ fontFamily: "var(--font-dynapuff)" }}
          >
            shoebox
          </span>
          <span
            className="text-2xl text-[#4a3f35]/60"
            style={{ fontFamily: "var(--font-caveat)" }}
          >
            made with sticky fingers in portland, maine ♡
          </span>
          <span className="text-sm font-bold text-[#4a3f35]/50">
            hello@shoebox.pics
          </span>
        </div>
      </footer>
    </main>
  );
}
