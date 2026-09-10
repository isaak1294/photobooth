import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'POPFLASH — Index',
  description: 'The app surfaces, plus the four candidate product pages.',
};

// Dev index. The app itself lives at /kiosk, /booth and /s/<token>; the four
// product pages below are the design explorations POPFLASH came out of.
const surfaces = [
  {
    href: '/kiosk',
    name: 'Kiosk',
    vibe: 'iPad on a stand — one button, four shots, QR handoff',
  },
  {
    href: '/booth',
    name: 'Booth screen',
    vibe: 'HDMI display — QR only, the phone does the rest',
  },
];

const directions = [
  {
    href: '/popflash',
    name: 'POPFLASH',
    vibe: 'Neobrutalist party — hard shadows, stickers, marquee',
    picked: true,
  },
  {
    href: '/mirra',
    name: 'Mirra',
    vibe: 'Editorial luxury — ivory, oversized serif, hairline rules',
  },
  {
    href: '/shindig',
    name: 'Shindig',
    vibe: '70s funk — sunburst, ticket stubs, warm cream & burnt orange',
  },
  {
    href: '/shoebox',
    name: 'shoebox',
    vibe: 'Handmade scrapbook — washi tape, polaroids, sticky notes',
  },
];

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-pop-yellow p-6 sm:p-8">
      <div className="w-full max-w-2xl">
        <h1 className="mb-8 inline-block -rotate-2 font-display text-4xl uppercase sm:text-5xl">
          POP<span className="text-pop-pink">FLASH</span>
        </h1>

        <Section title="The app" items={surfaces} />
        <div className="h-8" />
        <Section title="Product page directions" items={directions} />
      </div>
    </main>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: { href: string; name: string; vibe: string; picked?: boolean }[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold tracking-[0.25em] uppercase">{title}</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="pop-press flex flex-col gap-1 border-4 border-pop-ink bg-pop-paper px-5 py-4 shadow-pop sm:flex-row sm:items-baseline sm:gap-4"
            >
              <span className="font-display text-xl uppercase">{item.name}</span>
              {item.picked && (
                <span className="w-fit border-2 border-pop-ink bg-pop-lime px-2 py-0.5 text-[10px] font-bold uppercase">
                  Shipping
                </span>
              )}
              <span className="text-sm font-bold sm:ml-auto sm:text-right">{item.vibe}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
