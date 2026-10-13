/**
 * Raspberry Pi model knowledge: revision-code decoding and default stream limits.
 * Pure data + pure functions, no filesystem access (that lives in the server package).
 */

export type PiFamily =
  | 'pi5'
  | 'pi4'
  | 'pi3'
  | 'zero2'
  | 'zero'
  | 'pi2'
  | 'pi1'
  | 'unknown';

export interface PiInfo {
  family: PiFamily;
  /** Human readable model string, e.g. "Raspberry Pi 4 Model B Rev 1.4" */
  modelString: string;
  /** Hex revision code from /proc/cpuinfo, e.g. "c03114" */
  revisionHex: string | null;
  ramMB: number | null;
  /** Default concurrent camera stream limit for this hardware. */
  defaultMaxStreams: number;
  /** Where the detection came from. */
  source: 'device-tree' | 'cpuinfo' | 'fallback';
}

/** New-style revision "type" field (bits 4..11) -> family. */
const TYPE_TO_FAMILY: Record<number, PiFamily> = {
  0x00: 'pi1', // A
  0x01: 'pi1', // B
  0x02: 'pi1', // A+
  0x03: 'pi1', // B+
  0x04: 'pi2', // 2B
  0x05: 'pi1', // Alpha
  0x06: 'pi1', // CM1
  0x08: 'pi3', // 3B
  0x09: 'zero', // Zero
  0x0a: 'pi3', // CM3
  0x0c: 'zero', // Zero W
  0x0d: 'pi3', // 3B+
  0x0e: 'pi3', // 3A+
  0x10: 'pi3', // CM3+
  0x11: 'pi4', // 4B
  0x12: 'zero2', // Zero 2 W
  0x13: 'pi4', // 400
  0x14: 'pi4', // CM4
  0x15: 'pi4', // CM4S
  0x17: 'pi5', // 5
  0x18: 'pi5', // CM5
  0x19: 'pi5', // 500
  0x1a: 'pi5', // CM5 Lite
};

const MEM_BITS_TO_MB = [256, 512, 1024, 2048, 4096, 8192, 16384];

export interface DecodedRevision {
  family: PiFamily;
  ramMB: number | null;
  type: number;
}

/** Decode a new-style (post-2012) revision code. Returns null for legacy codes. */
export function decodeRevision(revisionHex: string): DecodedRevision | null {
  const rev = parseInt(revisionHex.trim(), 16);
  if (Number.isNaN(rev)) return null;
  const newStyle = (rev >> 23) & 0x1;
  if (!newStyle) {
    // Legacy codes: all Pi 1 era boards.
    return { family: 'pi1', ramMB: null, type: -1 };
  }
  const type = (rev >> 4) & 0xff;
  const memBits = (rev >> 20) & 0x7;
  return {
    family: TYPE_TO_FAMILY[type] ?? 'unknown',
    ramMB: MEM_BITS_TO_MB[memBits] ?? null,
    type,
  };
}

/** Classify the human readable model string from /proc/device-tree/model. */
export function familyFromModelString(model: string): PiFamily {
  const m = model.trim();
  if (/Raspberry Pi (5|500|Compute Module 5)/i.test(m)) return 'pi5';
  if (/Raspberry Pi (4|400|Compute Module 4)/i.test(m)) return 'pi4';
  if (/Raspberry Pi Zero 2/i.test(m)) return 'zero2';
  if (/Raspberry Pi Zero/i.test(m)) return 'zero';
  if (/Raspberry Pi (3|Compute Module 3)/i.test(m)) return 'pi3';
  if (/Raspberry Pi 2/i.test(m)) return 'pi2';
  if (/Raspberry Pi (Model|Compute Module)\b/i.test(m) || /Raspberry Pi [AB]\b/i.test(m)) return 'pi1';
  return 'unknown';
}

export function defaultMaxStreamsFor(family: PiFamily, ramMB: number | null): number {
  switch (family) {
    case 'pi5':
      return 4;
    case 'pi4':
      return ramMB !== null && ramMB <= 1024 ? 1 : 2;
    case 'pi3':
    case 'zero2':
      return 1;
    case 'pi2':
    case 'pi1':
    case 'zero':
      return 0;
    case 'unknown':
    default:
      return 2;
  }
}

export const PI_FAMILY_LABEL: Record<PiFamily, string> = {
  pi5: 'Raspberry Pi 5 family',
  pi4: 'Raspberry Pi 4 family',
  pi3: 'Raspberry Pi 3 family',
  zero2: 'Raspberry Pi Zero 2 W',
  zero: 'Raspberry Pi Zero / Zero W',
  pi2: 'Raspberry Pi 2',
  pi1: 'Raspberry Pi 1',
  unknown: 'Unknown / non-Pi hardware',
};

/**
 * Combine the two detection inputs. The model string is authoritative for family (future proof);
 * the revision supplies RAM and acts as a fallback when the model string is unavailable.
 */
export function resolvePiInfo(modelString: string | null, revisionHex: string | null): PiInfo {
  const decoded = revisionHex ? decodeRevision(revisionHex) : null;
  let family: PiFamily = 'unknown';
  let source: PiInfo['source'] = 'fallback';

  if (modelString) {
    family = familyFromModelString(modelString);
    source = 'device-tree';
  }
  if (family === 'unknown' && decoded && decoded.family !== 'unknown') {
    family = decoded.family;
    source = 'cpuinfo';
  }
  const ramMB = decoded?.ramMB ?? null;
  return {
    family,
    modelString: modelString?.trim() || (decoded ? `Raspberry Pi (revision ${revisionHex})` : 'Unknown hardware'),
    revisionHex: revisionHex?.trim() ?? null,
    ramMB,
    defaultMaxStreams: defaultMaxStreamsFor(family, ramMB),
    source,
  };
}
