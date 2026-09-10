import type { Metadata, Viewport } from 'next';
import { Kiosk } from '@/components/kiosk/Kiosk';

export const metadata: Metadata = {
  title: 'POPFLASH — Kiosk',
};

// Kiosk-only viewport: the iPad is pinned to one screen, so pinch-zoom and
// rubber-banding are accidents waiting to happen. The rest of the app (the
// guest's phone especially, where they zoom into photos) keeps the root
// viewport's defaults.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#ffde03',
};

export default function KioskPage() {
  return <Kiosk />;
}
