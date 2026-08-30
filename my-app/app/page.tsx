import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Product page directions',
  description: 'Four candidate product pages, one per design direction.',
};

const directions = [
  {
    href: '/mirra',
    name: 'Mirra',
    vibe: 'Editorial luxury — ivory, oversized serif, hairline rules',
  },
  {
    href: '/popflash',
    name: 'POPFLASH',
    vibe: 'Neobrutalist party — hard shadows, stickers, marquee',
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
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-8 text-neutral-100">
      <div className="w-full max-w-xl">
        <p className="mb-6 text-xs uppercase tracking-[0.3em] text-neutral-500">
          Product page explorations
        </p>
        <ul className="divide-y divide-neutral-800 border-y border-neutral-800">
          {directions.map((d, i) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="group -mx-3 flex items-baseline gap-6 px-3 py-6 transition-colors hover:bg-neutral-900"
              >
                <span className="text-sm tabular-nums text-neutral-600">0{i + 1}</span>
                <span className="text-2xl font-semibold transition-transform group-hover:translate-x-1">
                  {d.name}
                </span>
                <span className="ml-auto max-w-64 text-right text-sm text-neutral-500">
                  {d.vibe}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-neutral-600">
          Looking for the app itself?{' '}
          <Link href="/booth" className="text-neutral-400 underline underline-offset-4 hover:text-neutral-200">
            Open the booth screen
          </Link>
        </p>
      </div>
    </main>
  );
}
