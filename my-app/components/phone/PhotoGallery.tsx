/* eslint-disable @next/next/no-img-element */

export type GalleryPhoto = {
  _id: string;
  url: string | null;
};

type PhotoGalleryProps = {
  photos: GalleryPhoto[];
  selectedPhotoId: string | null;
  onSelect: (photoId: string) => void;
};

// The guest's shots: the selected one large, the rest as a swipeable thumbnail
// rail underneath (horizontal scroll beats a grid on a phone held one-handed).
export function PhotoGallery({ photos, selectedPhotoId, onSelect }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-white/15 p-8 text-center">
        <h2 className="font-semibold text-white/80">Your photos appear here</h2>
        <p className="mt-2 text-sm text-white/45">Tap the button above and look at the booth.</p>
      </section>
    );
  }

  const selectedPhoto = photos.find((photo) => photo._id === selectedPhotoId) ?? photos[photos.length - 1];

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
        {selectedPhoto.url ? (
          <img src={selectedPhoto.url} alt="Selected photobooth capture" className="aspect-[4/3] w-full object-cover" />
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

      {photos.length > 1 && (
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1" aria-label="Choose a photo">
          {photos.map((photo, index) => {
            const isSelected = photo._id === selectedPhoto._id;

            return (
              <button
                key={photo._id}
                type="button"
                onClick={() => onSelect(photo._id)}
                aria-label={`Select photo ${index + 1}`}
                aria-pressed={isSelected}
                className={`h-16 w-16 shrink-0 snap-start overflow-hidden rounded-xl border bg-white/5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400 ${
                  isSelected ? 'border-fuchsia-400 ring-2 ring-fuchsia-500/60' : 'border-white/10 opacity-70'
                }`}
              >
                {photo.url ? (
                  <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-white/45">N/A</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
