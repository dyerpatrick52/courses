// Vibrant but not garish palette. LEC = darker shade, other components = lighter shade of same hue.
const PALETTE = [
  { dark: '#2563eb', light: '#5182ef' },
  { dark: '#16a34a', light: '#45b56e' },
  { dark: '#be185d', light: '#cb467d' },
  { dark: '#7c3aed', light: '#9661f1' },
  { dark: '#ea580c', light: '#ee793d' },
  { dark: '#0891b2', light: '#39a7c1' },
  { dark: '#4338ca', light: '#6960d5' },
  { dark: '#b45309', light: '#c3753a' },
];

const courseColorIndex = new Map<string, number>();

export function getCourseColor(courseCode: string, component: string): string {
  if (!courseColorIndex.has(courseCode)) {
    courseColorIndex.set(courseCode, courseColorIndex.size % PALETTE.length);
  }
  const idx = courseColorIndex.get(courseCode)!;
  return component === 'LEC' ? PALETTE[idx].dark : PALETTE[idx].light;
}

export function resetCourseColors(): void {
  courseColorIndex.clear();
}
