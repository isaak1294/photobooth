// Placeholder "camera frames" for nobooth mode. Drawn on a canvas so no demo
// asset has to ship, and seeded so successive shots look different.
export function makeMockPhoto(seed: number): string {
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
