export function backSlotIndex(frontIndex: number, cols: number): number {
  const row = Math.floor(frontIndex / cols);
  const col = frontIndex % cols;
  return row * cols + (cols - 1 - col);
}

export function imposeBackPage<T>(
  frontPage: T[],
  slotsPerPage: number,
  cols: number,
): (T | undefined)[] {
  const out: (T | undefined)[] = new Array(slotsPerPage).fill(undefined);
  for (let i = 0; i < frontPage.length; i++) {
    out[backSlotIndex(i, cols)] = frontPage[i];
  }
  return out;
}
