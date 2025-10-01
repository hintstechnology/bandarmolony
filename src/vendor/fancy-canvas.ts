// Minimal shim for 'fancy-canvas' used by local lightweight-charts source.
// This is not feature-complete; it only provides the symbols imported by the library.

export type Size = { width: number; height: number };
export function size(width: number, height: number): Size {
  return { width, height };
}

export function equalSizes(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

export type CanvasRenderingTarget2D = CanvasRenderingContext2D;

export function tryCreateCanvasRenderingTarget2D(canvas: HTMLCanvasElement): CanvasRenderingTarget2D | null {
  return canvas.getContext('2d');
}

export function bindCanvasElementBitmapSizeTo(canvas: HTMLCanvasElement, getSize: () => Size, ratio: number = window.devicePixelRatio || 1): void {
  const { width, height } = getSize();
  const displayWidth = Math.max(1, Math.floor(width));
  const displayHeight = Math.max(1, Math.floor(height));
  if (canvas.width !== Math.floor(displayWidth * ratio) || canvas.height !== Math.floor(displayHeight * ratio)) {
    canvas.width = Math.floor(displayWidth * ratio);
    canvas.height = Math.floor(displayHeight * ratio);
  }
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
}
