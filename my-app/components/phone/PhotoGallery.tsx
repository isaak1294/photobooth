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

export function PhotoGallery({ photos, selectedPhotoId, onSelect }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
        <h2 className="font-semibold text-slate-800">Your photos will appear here</h2>
        <p className="mt-2 text-sm text-slate-500">Tap Take Picture and look at the booth camera.</p>
      </section>
    );
  }

  const selectedPhoto = photos.find((photo) => photo._id === selectedPhotoId) ?? photos[photos.length - 1];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="photo-gallery-title">
      <div className="flex items-baseline justify-between">
        <h2 id="photo-gallery-title" className="font-semibold text-slate-900">
          Your photos
        </h2>
        <span className="text-xs text-slate-500" aria-live="polite">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl bg-slate-100">
        {selectedPhoto.url ? (
          <img src={selectedPhoto.url} alt="Selected photobooth capture" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <div
            className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-slate-500"
            role="img"
            aria-label="Selected photo is unavailable"
          >
            This photo is temporarily unavailable.
          </div>
        )}
      </div>

      {photos.length > 1 && (
        <div className="grid grid-cols-3 gap-2" aria-label="Choose a photo">
          {photos.map((photo, index) => {
            const isSelected = photo._id === selectedPhoto._id;

            return (
              <button
                key={photo._id}
                type="button"
                onClick={() => onSelect(photo._id)}
                aria-label={`Select photo ${index + 1}`}
                aria-pressed={isSelected}
                className="overflow-hidden rounded-xl bg-slate-100 outline-offset-2 ring-slate-950 focus-visible:outline-2 aria-pressed:ring-2"
              >
                {photo.url ? (
                  <img src={photo.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                ) : (
                  <span className="flex aspect-square items-center justify-center px-2 text-xs text-slate-500">
                    Unavailable
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
