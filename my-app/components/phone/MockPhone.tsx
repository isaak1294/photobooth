'use client';

import { useEffect, useRef, useState } from 'react';
import { AmberGlow } from '../AmberGlow';
import { CapturePanel, type CapturePhase } from './CapturePanel';
import { GenerationBanner, type BannerState } from './GenerationBanner';
import { PhotoGallery, type PhotoVariant } from './PhotoGallery';
import { StylePicker, type AiStyle, type ThemeJob } from './StylePicker';
import { WelcomeSplash } from './WelcomeSplash';

// The phone surface running against a simulated booth (nobooth mode): captures
// and styled renders are generated locally with canvas, so every screen and
// state is reachable with no Convex deployment, Pi, or camera. Renders the same
// presentational components as the live page, so what you see is what ships.

type MockRender = { id: string; styleName: string; url: string };
type MockPhoto = { id: string; url: string; renders: MockRender[] };

const PRESET_STYLES: AiStyle[] = [
  { _id: 'professional', name: 'Professional', custom: false },
  { _id: 'ghibli', name: 'Ghibli', custom: false },
  { _id: 'vintage', name: 'Vintage', custom: false },
  { _id: 'valentine', name: 'Valentine', custom: false },
];

// Canvas filters standing in for the real style renders.
const STYLE_FILTERS: Record<string, string> = {
  professional: 'grayscale(0.85) contrast(1.1)',
  ghibli: 'saturate(1.7) hue-rotate(18deg) brightness(1.05)',
  vintage: 'sepia(0.8) contrast(0.95)',
  valentine: 'hue-rotate(-45deg) saturate(1.5)',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makePhoto(seed: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const hue = (seed * 47) % 360;
  const gradient = ctx.createLinearGradient(0, 0, 800, 600);
  gradient.addColorStop(0, `hsl(${hue} 45% 70%)`);
  gradient.addColorStop(1, `hsl(${(hue + 60) % 360} 45% 45%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = `hsl(${(hue + 180) % 360} 55% 82%)`;
  ctx.beginPath();
  ctx.arc(400, 280, 140, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Demo capture ${seed}`, 400, 560);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function stylize(url: string, filter: string, label: string): Promise<string> {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return url;
  ctx.filter = filter;
  ctx.drawImage(img, 0, 0);
  ctx.filter = 'none';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, canvas.width / 2, canvas.height - 60);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export function MockPhone() {
  const [splash, setSplash] = useState<'showing' | 'leaving' | 'gone'>('showing');
  useEffect(() => {
    const t1 = window.setTimeout(() => setSplash('leaving'), 1500);
    const t2 = window.setTimeout(() => setSplash('gone'), 2000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const [phase, setPhase] = useState<CapturePhase>({ kind: 'idle' });
  const [shots, setShots] = useState(1);
  const [burst, setBurst] = useState<{ index: number; total: number } | null>(null);
  const [photos, setPhotos] = useState<MockPhoto[]>([]);
  const [styles, setStyles] = useState<AiStyle[]>(PRESET_STYLES);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [variantKey, setVariantKey] = useState('original');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState>(null);
  const [lastRender, setLastRender] = useState<{ photoId: string; renderId: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [themeJob, setThemeJob] = useState<ThemeJob>(null);

  const seq = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const captureBusy = phase.kind !== 'idle' && phase.kind !== 'failed';

  async function runCapture() {
    if (captureBusy) return;
    const total = shots;
    for (let i = 1; i <= total; i++) {
      if (!alive.current) return;
      setBurst(total > 1 ? { index: i, total } : null);
      setPhase({ kind: 'starting' });
      await sleep(400);
      for (let s = 3; s >= 1; s--) {
        setPhase({ kind: 'counting_down', secondsLeft: s });
        await sleep(800);
      }
      setPhase({ kind: 'capturing' });
      await sleep(700);
      setPhase({ kind: 'uploading' });
      await sleep(600);
      if (!alive.current) return;
      const id = `photo-${++seq.current}`;
      setPhotos((prev) => [...prev, { id, url: makePhoto(seq.current), renders: [] }]);
      setSelectedPhotoId(id);
      setVariantKey('original');
      setPhase({ kind: 'saved' });
      await sleep(1000);
    }
    setBurst(null);
    setPhase({ kind: 'idle' });
  }

  const selectedPhoto = photos.find((photo) => photo.id === selectedPhotoId) ?? photos[photos.length - 1];
  const selectedStyle = styles.find((style) => style._id === selectedStyleId);

  async function generate() {
    if (!selectedPhoto || !selectedStyle || isGenerating) return;
    const photo = selectedPhoto;
    const style = selectedStyle;
    setIsGenerating(true);
    setBanner({ kind: 'working', label: `Creating your ${style.name} photo…` });
    await sleep(2500);
    if (!alive.current) return;
    const url = await stylize(photo.url, STYLE_FILTERS[style._id] ?? 'sepia(0.5)', style.name);
    const renderId = `render-${++seq.current}`;
    setPhotos((prev) =>
      prev.map((p) => (p.id === photo.id ? { ...p, renders: [...p.renders, { id: renderId, styleName: style.name, url }] } : p)),
    );
    setLastRender({ photoId: photo.id, renderId });
    setVariantKey(renderId);
    setIsGenerating(false);
    setBanner({ kind: 'ready', label: `Your ${style.name} photo is ready. Tap to view` });
  }

  async function createTheme() {
    if (themeJob !== null && themeJob.status !== 'failed') return;
    setSelectedStyleId(null);
    setThemeJob({ status: 'uploading' });
    await sleep(700);
    setThemeJob({ status: 'deriving' });
    await sleep(1500);
    if (!alive.current) return;
    const id = `custom-${++seq.current}`;
    setStyles((prev) => [...prev, { _id: id, name: 'Golden Hour', custom: true }]);
    setSelectedStyleId(id);
    setThemeJob(null);
  }

  function onBannerTap() {
    if (banner === null) return;
    if (lastRender !== null) {
      setSelectedPhotoId(lastRender.photoId);
      if (banner.kind === 'ready') setVariantKey(lastRender.renderId);
    }
    if (banner.kind !== 'working') setBanner(null);
  }

  const galleryPhotos = photos.map((photo) => ({
    _id: photo.id,
    url: photo.url,
    aiCount: photo.renders.length,
    aiBusy: isGenerating && photo.id === selectedPhoto?.id,
  }));

  const variants: PhotoVariant[] = selectedPhoto
    ? [
        { key: 'original', label: 'Original', url: selectedPhoto.url },
        ...selectedPhoto.renders.map((render) => ({ key: render.id, label: render.styleName, url: render.url })),
      ]
    : [];
  const selectedVariantKey = variants.some((v) => v.key === variantKey) ? variantKey : 'original';

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 overflow-x-clip px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      {splash !== 'gone' && <WelcomeSplash stage={splash === 'leaving' ? 'leaving' : 'showing'} />}
      <GenerationBanner state={banner} onTap={onBannerTap} />

      <AmberGlow sizeVh={90} />

      <header className="flex items-center justify-between pt-[max(1.25rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-semibold tracking-tight">Amber Photobooths</h1>
        <span className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 font-mono text-xs text-zinc-500">DEMO</span>
      </header>

      <p className="text-xs text-zinc-400">Demo mode. Captures and styles are simulated, no camera connected.</p>

      <div className="flex flex-col gap-5">
        <CapturePanel
          phase={phase}
          shots={shots}
          onShotsChange={setShots}
          burst={captureBusy ? burst : null}
          disabled={false}
          onCapture={() => void runCapture()}
        />

        <PhotoGallery
          photos={galleryPhotos}
          selectedPhotoId={selectedPhoto?.id ?? null}
          onSelect={(photoId) => setSelectedPhotoId(photoId)}
          variants={variants}
          selectedVariantKey={selectedVariantKey}
          onSelectVariant={setVariantKey}
        />

        {selectedPhoto && (
          <StylePicker
            styles={styles}
            selectedStyleId={selectedStyleId}
            isLoading={false}
            isGenerating={isGenerating}
            isDisabled={isGenerating}
            error={null}
            themeJob={themeJob}
            onSelect={setSelectedStyleId}
            onGenerate={() => void generate()}
            onCreateTheme={() => void createTheme()}
          />
        )}
      </div>
    </main>
  );
}
