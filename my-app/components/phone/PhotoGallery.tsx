/* eslint-disable @next/next/no-img-element */
'use client';

import { useState } from 'react';

export type GalleryPhoto = {
  _id: string;
  url: string | null;
  /** Finished AI renders of this photo — shown as a ✦ badge on its thumbnail. */
  aiCount: number;
  /** True while a render of this photo is queued/processing (pulsing badge). */
  aiBusy: boolean;
};

/** One face of the selected photo: the original frame or a finished AI render. */
export type PhotoVariant = {
  key: string; // 'original' or the render id
  label: string; // 'Original' or the style name
  url: string;
};

type PhotoGalleryProps = {
  photos: GalleryPhoto[];
  selectedPhotoId: string | null;
  onSelect: (photoId: string) => void;
  variants: PhotoVariant[];
  selectedVariantKey: string;
  onSelectVariant: (key: string) => void;
};

// The guest's roll: selected shot large with pills to flip between the original
// and its AI versions, and thumbnails below — a one-line strip by default,
// expandable to a full grid once the roll outgrows a swipe.
export function PhotoGallery({
  photos,
  selectedPhotoId,
  onSelect,
  variants,
  selectedVariantKey,
  onSelectVariant,
}: PhotoGalleryProps) {
  const [expanded, setExpanded] = useState(false);

  if (photos.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
        <h2 className="font-semibold text-white/80">Your photos appear here</h2>
        <p className="mt-2 text-sm text-white/45">Tap the button above and look at the booth.</p>
      </section>
    );
  }

  const selectedPhoto = photos.find((photo) => photo._id === selectedPhotoId) ?? photos[photos.length - 1];
  const shownVariant = variants.find((v) => v.key === selectedVariantKey) ?? variants[0];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="photo-gallery-title">
      <div className="flex items-baseline justify-between">
        <h2 id="photo-gallery-title" className="font-semibold">
          Your photos
        </h2>
        <span className="text-xs text-white/45" aria-live="polite">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
        {shownVariant?.url ? (
          <img
            src={shownVariant.url}
            alt={
              shownVariant.key === 'original'
                ? 'Selected photobooth capture'
                : `AI-generated ${shownVariant.label} version of the selected capture`
            }
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div
            className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-white/45"
            role="img"
            aria-label="Selected photo is unavailable"
          >
            This photo is temporarily unavailable.
          </div>
        )}
      </div>

      {/* Original ↔ AI-version pills. Only rendered once this photo has an AI
          result, so a fresh capture stays clutter-free. */}
      {variants.length > 1 && (
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1" aria-label="Photo versions">
          {variants.map((variant) => {
            const isShown = variant.key === shownVariant?.key;
            return (
              <button
                key={variant.key}
                type="button"
                onClick={() => onSelectVariant(variant.key)}
                aria-pressed={isShown}
                className={`shrink-0 snap-start rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                  isShown
                    ? 'border-fuchsia-400 bg-fuchsia-500/25 text-white'
                    : 'border-white/15 bg-white/5 text-white/60'
                }`}
              >
                {variant.key === 'original' ? 'Original' : <>✦ {variant.label}</>}
              </button>
            );
          })}
        </div>
      )}

      {shownVariant?.url && (
        <a
          href={shownVariant.url}
          download={`photobooth-${shownVariant.label.toLowerCase().replaceAll(' ', '-')}.jpg`}
          target="_blank"
          rel="noreferrer"
          className="rounded-2xl border border-white/20 px-6 py-3 text-center text-sm font-semibold text-white/90 transition-colors hover:border-white/40"
        >
          Download {shownVariant.key === 'original' ? 'photo' : `✦ ${shownVariant.label}`}
        </a>
      )}

      {photos.length > 1 && (
        <>
          {expanded ? (
            <div className="grid grid-cols-3 gap-2" aria-label="All photos">
              {photos.map((photo, index) => (
                <Thumb
                  key={photo._id}
                  photo={photo}
                  index={index}
                  isSelected={photo._id === selectedPhoto._id}
                  className="aspect-square w-full"
                  onClick={() => {
                    onSelect(photo._id);
                    setExpanded(false);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label="Choose a photo">
              {photos.map((photo, index) => (
                <Thumb
                  key={photo._id}
                  photo={photo}
                  index={index}
                  isSelected={photo._id === selectedPhoto._id}
                  className="h-16 w-16 shrink-0 snap-start"
                  onClick={() => onSelect(photo._id)}
                />
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="self-center rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/60 transition-colors hover:border-white/30"
          >
            {expanded ? 'Minimize ▲' : `View all ${photos.length} ▼`}
          </button>
        </>
      )}
    </section>
  );
}

function Thumb({
  photo,
  index,
  isSelected,
  className,
  onClick,
}: {
  photo: GalleryPhoto;
  index: number;
  isSelected: boolean;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Select photo ${index + 1}${photo.aiCount > 0 ? `, ${photo.aiCount} AI ${photo.aiCount === 1 ? 'version' : 'versions'}` : ''}`}
      aria-pressed={isSelected}
      className={`relative overflow-hidden rounded-xl border bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
        isSelected ? 'border-fuchsia-400 ring-2 ring-fuchsia-500/60' : 'border-white/10 opacity-70'
      } ${className}`}
    >
      {photo.url ? (
        <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] text-white/45">N/A</span>
      )}
      {(photo.aiCount > 0 || photo.aiBusy) && (
        <span
          aria-hidden
          className={`absolute top-1 right-1 rounded-full bg-fuchsia-500 px-1.5 py-0.5 text-[10px] leading-none font-bold text-white shadow ${
            photo.aiBusy ? 'animate-pulse motion-reduce:animate-none' : ''
          }`}
        >
          ✦{photo.aiCount > 1 ? photo.aiCount : ''}
        </span>
      )}
    </button>
  );
}
