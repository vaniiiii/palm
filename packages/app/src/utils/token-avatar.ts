const PALETTE = [
  "#06b6d4", "#8b5cf6", "#ec4899", "#f59e0b",
  "#10b981", "#3b82f6", "#ef4444", "#6366f1",
  "#14b8a6", "#f97316",
];

function hexByte(address: string, index: number): number {
  const clean = address.replace("0x", "");
  const i = (index * 2) % clean.length;
  return parseInt(clean.slice(i, i + 2), 16) || 0;
}

export function generateTokenAvatar(address: string): string {
  const b = (i: number) => hexByte(address, i);

  const bg = PALETTE[b(0) % PALETTE.length];
  const c1 = PALETTE[b(1) % PALETTE.length];
  const c2 = PALETTE[b(2) % PALETTE.length];

  const shapes: string[] = [];

  // Diamond
  const dx = 8 + (b(3) % 16);
  const dy = 8 + (b(4) % 16);
  const ds = 6 + (b(5) % 8);
  shapes.push(
    `<polygon points="${dx},${dy - ds} ${dx + ds},${dy} ${dx},${dy + ds} ${dx - ds},${dy}" fill="${c1}" opacity="0.7"/>`
  );

  // Triangle
  const tx = 4 + (b(6) % 24);
  const ty = 4 + (b(7) % 24);
  const ts = 5 + (b(8) % 10);
  shapes.push(
    `<polygon points="${tx},${ty - ts} ${tx + ts},${ty + ts} ${tx - ts},${ty + ts}" fill="${c2}" opacity="0.6"/>`
  );

  // Hexagon
  const hx = 10 + (b(9) % 12);
  const hy = 10 + (b(10) % 12);
  const hr = 4 + (b(11) % 6);
  const hex = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${hx + hr * Math.cos(angle)},${hy + hr * Math.sin(angle)}`;
  }).join(" ");
  shapes.push(`<polygon points="${hex}" fill="${c1}" opacity="0.5"/>`);

  // Small circle accent
  const cx = 6 + (b(12) % 20);
  const cy = 6 + (b(13) % 20);
  const cr = 2 + (b(14) % 4);
  shapes.push(`<circle cx="${cx}" cy="${cy}" r="${cr}" fill="${c2}" opacity="0.8"/>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="16" fill="${bg}"/>${shapes.join("")}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
