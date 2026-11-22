import type { Source } from './types.ts';

export const MAX_BYTES = 25 * 1024 * 1024;
export const MAX_TEXT = 100_000;

export function chunks(text: string, page: number | null = null, offset = 0): Source[] {
  const cleaned = text.replace(/\u0000/g, '').trim();
  const out: Source[] = [];
  for (let i = 0; i < cleaned.length; i += 1800) {
    const piece = cleaned.slice(i, i + 1800);
    if (piece.trim()) {
      out.push({ id: `S${offset + out.length + 1}`, page, text: piece });
    }
  }
  return out;
}

function decodePdfLiteral(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === undefined) break;
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === '(' || next === ')' || next === '\\') out += next;
    else if (next === '\n') continue;
    else if (next === '\r') {
      if (raw[i + 1] === '\n') i++;
      continue;
    } else if (next >= '0' && next <= '7') {
      let oct = next;
      if (raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
      if (raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else {
      out += next;
    }
  }
  return out;
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length < 2) return '';
  if (clean.startsWith('FEFF') && clean.length >= 6) {
    let out = '';
    for (let i = 4; i + 3 < clean.length; i += 4) {
      out += String.fromCharCode(parseInt(clean.slice(i, i + 4), 16));
    }
    return out;
  }
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (code >= 32 || code === 9 || code === 10 || code === 13) {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

function extractTextOperators(streamText: string): string {
  const lines: string[] = [];
  const btRegex = /BT\b([\s\S]*?)\bET\b/g;
  let btMatch: RegExpExecArray | null;

  const parseSegment = (seg: string): string => {
    const parts: string[] = [];
    let i = 0;
    while (i < seg.length) {
      if (seg[i] === '(') {
        let depth = 1;
        let j = i + 1;
        while (j < seg.length && depth > 0) {
          if (seg[j] === '\\') {
            j += 2;
            continue;
          }
          if (seg[j] === '(') depth++;
          else if (seg[j] === ')') depth--;
          j++;
        }
        parts.push(decodePdfLiteral(seg.slice(i + 1, j - 1)));
        i = j;
      } else if (seg[i] === '<' && seg[i + 1] !== '<') {
        const end = seg.indexOf('>', i + 1);
        if (end !== -1) {
          parts.push(decodePdfHex(seg.slice(i + 1, end)));
          i = end + 1;
          continue;
        }
        i++;
      } else if (seg[i] === '[') {
        const end = seg.indexOf(']', i + 1);
        if (end !== -1) {
          const inner = seg.slice(i + 1, end);
          let k = 0;
          let joined = '';
          while (k < inner.length) {
            if (inner[k] === '(') {
              let depth = 1;
              let m = k + 1;
              while (m < inner.length && depth > 0) {
                if (inner[m] === '\\') {
                  m += 2;
                  continue;
                }
                if (inner[m] === '(') depth++;
                else if (inner[m] === ')') depth--;
                m++;
              }
              joined += decodePdfLiteral(inner.slice(k + 1, m - 1));
              k = m;
            } else if (inner[k] === '<') {
              const hexEnd = inner.indexOf('>', k + 1);
              if (hexEnd !== -1) {
                joined += decodePdfHex(inner.slice(k + 1, hexEnd));
                k = hexEnd + 1;
              } else {
                k++;
              }
            } else if (inner[k] === '-' && /\d/.test(inner[k + 1] || '')) {
              const numMatch = inner.slice(k).match(/^-(\d+)/);
              if (numMatch && Number(numMatch[1]) > 140) {
                joined += ' ';
              }
              k += numMatch ? numMatch[0].length : 1;
            } else {
              k++;
            }
          }
          if (joined) parts.push(joined);
          i = end + 1;
          continue;
        }
        i++;
      } else {
        i++;
      }
    }
    return parts.join(' ').replace(/[ \t]+/g, ' ').trim();
  };

  while ((btMatch = btRegex.exec(streamText)) !== null) {
    const text = parseSegment(btMatch[1]);
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

async function inflateBytes(bytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      void writer.write(copy);
      void writer.close();
      const buffer = await new Response(ds.readable).arrayBuffer();
      return new TextDecoder('latin1').decode(buffer);
    } catch {
      // try next deflate framing
    }
  }
  return null;
}

async function extractPdfBrowser(bytes: Uint8Array): Promise<Source[]> {
  const latin = new TextDecoder('latin1').decode(bytes);
  if (/\/Encrypt\b/.test(latin)) {
    throw new Error(
      'PDF could not be read. Use an unencrypted PDF with selectable text (maximum 100 pages).',
    );
  }
  const pageMatches = latin.match(/\/Type\s*\/Page\b(?!s)/g);
  if (pageMatches && pageMatches.length > 100) {
    throw new Error(
      'PDF could not be read. Use an unencrypted PDF with selectable text (maximum 100 pages).',
    );
  }

  const streamRegex = /<<([\s\S]*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  const pageTexts: string[] = [];

  while ((match = streamRegex.exec(latin)) !== null) {
    const dict = match[1];
    const bodyLatin = match[2];
    let decoded: string | null = bodyLatin;

    if (/\/FlateDecode\b/.test(dict)) {
      const start = match.index + match[0].indexOf(bodyLatin);
      const compressed = bytes.subarray(start, start + bodyLatin.length);
      decoded = await inflateBytes(compressed);
    }
    if (!decoded) continue;

    const extracted = extractTextOperators(decoded);
    if (extracted.trim()) {
      pageTexts.push(extracted.trim());
    }
  }

  if (pageTexts.length === 0) {
    const rawExtracted = extractTextOperators(latin);
    if (rawExtracted.trim()) {
      pageTexts.push(rawExtracted.trim());
    }
  }

  const result: Source[] = [];
  let total = 0;
  for (let i = 0; i < pageTexts.length; i++) {
    const text = pageTexts[i];
    total += text.length;
    if (total > MAX_TEXT) {
      throw new Error('Source exceeds 100,000 characters. Split it into chapters.');
    }
    result.push(...chunks(text, i + 1, result.length));
  }
  return result;
}

export async function extractBrowserFile(file: File): Promise<Source[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['pdf', 'md', 'markdown', 'txt'].includes(ext)) {
    throw new Error('Upload a PDF, Markdown or UTF-8 text file.');
  }
  if (!file.size || file.size > MAX_BYTES) {
    throw new Error('Files must be nonempty and no larger than 25 MB.');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let sections: Source[];

  if (ext === 'pdf') {
    const header = new TextDecoder('latin1').decode(bytes.subarray(0, 5));
    if (header !== '%PDF-') {
      throw new Error('The file is not a valid PDF.');
    }
    sections = await extractPdfBrowser(bytes);
  } else {
    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    } catch {
      throw new Error('Text files must use UTF-8 encoding.');
    }
    if (/[\x01-\x08\x0e-\x1f]/.test(text)) {
      throw new Error('Binary content is not supported.');
    }
    sections = chunks(text);
  }

  const size = sections.reduce((sum, s) => sum + s.text.length, 0);
  if (size < 40) {
    throw new Error(
      'No usable text found. Scanned PDFs need OCR before uploading; at least 40 text characters are required.',
    );
  }
  if (size > MAX_TEXT) {
    throw new Error('Source exceeds 100,000 characters. Split it into chapters.');
  }
  return sections;
}
