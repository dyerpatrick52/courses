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

// tracks which palette index has been assigned to each course code.
// stored outside the component so it persists across renders.
const courseColorIndex = new Map<string, number>();

// returns a color hex string for a given course and component type.
// LEC sections get the darker shade; labs, tutorials, etc. get the lighter shade.
// each course is assigned the next palette slot the first time it's seen.
export function getCourseColor(courseCode: string, component: string): string {
  if (!courseColorIndex.has(courseCode)) {
    // assign the next slot, wrapping around with % if we exceed the palette length
    courseColorIndex.set(courseCode, courseColorIndex.size % PALETTE.length);
  }
  const idx = courseColorIndex.get(courseCode)!; // ! asserts it's not undefined (we just set it)
  return component === 'LEC' ? PALETTE[idx].dark : PALETTE[idx].light;
}

// clears all color assignments — called before generating a new set of schedules
// so courses don't keep stale colors from the previous run
export function resetCourseColors(): void {
  courseColorIndex.clear();
}
