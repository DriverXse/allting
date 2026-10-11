// Static WebP only. Rebuild the container with just pixel/alpha chunks, discarding
// EXIF, XMP and ICC metadata even when a client bypasses the image picker.
export function sanitizeWebp(
  buffer: ArrayBuffer,
  maxDimension: number,
): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(buffer),
    v = new DataView(buffer);
  const str = (start: number, n: number) =>
    String.fromCharCode(...b.slice(start, start + n));
  if (
    b.length < 30 ||
    str(0, 4) !== "RIFF" ||
    str(8, 4) !== "WEBP" ||
    v.getUint32(4, true) !== b.length - 8
  )
    throw new Error("Bilden kunde inte läsas.");
  let width = 0,
    height = 0,
    canvasWidth = 0,
    canvasHeight = 0,
    pixels = 0;
  const kept: Uint8Array[] = [];
  for (let at = 12; at < b.length;) {
    if (at + 8 > b.length) throw new Error("Bilden är ofullständig.");
    const name = str(at, 4),
      len = v.getUint32(at + 4, true),
      end = at + 8 + len + (len % 2);
    if (end > b.length) throw new Error("Bilden är ofullständig.");
    const p = at + 8;
    if (name === "ANIM" || name === "ANMF")
      throw new Error("Välj en stillbild.");
    if (name === "VP8X") {
      if (len !== 10 || canvasWidth)
        throw new Error("Bilden kunde inte läsas.");
      canvasWidth = 1 + (b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16));
      canvasHeight = 1 + (b[p + 7] | (b[p + 8] << 8) | (b[p + 9] << 16));
      const chunk = b.slice(at, end);
      chunk[8] &= 0x10;
      kept.push(chunk);
    } else if (name === "VP8 ") {
      if (len < 10 || b[p + 3] !== 0x9d || b[p + 4] !== 1 || b[p + 5] !== 0x2a)
        throw new Error("Bilden kunde inte läsas.");
      width = v.getUint16(p + 6, true) & 0x3fff;
      height = v.getUint16(p + 8, true) & 0x3fff;
      pixels++;
      kept.push(b.slice(at, end));
    } else if (name === "VP8L") {
      if (len < 5 || b[p] !== 0x2f) throw new Error("Bilden kunde inte läsas.");
      width = 1 + ((b[p + 1] | (b[p + 2] << 8)) & 0x3fff);
      height =
        1 + (((b[p + 2] >> 6) | (b[p + 3] << 2) | (b[p + 4] << 10)) & 0x3fff);
      pixels++;
      kept.push(b.slice(at, end));
    } else if (name === "ALPH") kept.push(b.slice(at, end));
    at = end;
  }
  if (
    pixels !== 1 ||
    !width ||
    !height ||
    width > maxDimension ||
    height > maxDimension ||
    (canvasWidth && (canvasWidth !== width || canvasHeight !== height))
  )
    throw new Error("Bilden har fel storlek.");
  const size = 12 + kept.reduce((sum, c) => sum + c.length, 0),
    result = new Uint8Array(size);
  result.set(b.slice(0, 12));
  new DataView(result.buffer).setUint32(4, size - 8, true);
  let at = 12;
  for (const chunk of kept) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}
