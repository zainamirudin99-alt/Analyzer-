import { NextRequest, NextResponse } from 'next/server';
import zlib from 'zlib';

export const dynamic = 'force-dynamic';

function parseSkillMetadata(rawText: string, fallbackName: string): {
  name: string;
  description?: string;
  content: string;
} {
  const trimmed = rawText.trim();

  // 1. Coba parse sebagai JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const name = parsed.name || cleanSkillName(fallbackName);
        const description = parsed.description || undefined;
        const content = parsed.content || parsed.instructions || parsed.prompt || trimmed;
        return { name, description, content };
      }
    } catch {}
  }

  // 2. Coba parse YAML Frontmatter
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    return { name: cleanSkillName(fallbackName), content: trimmed };
  }

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\r\n]+)["']?/m);
  let description: string | undefined = undefined;

  const descMultilineMatch = frontmatter.match(/^description:\s*[>|]?\s*\r?\n((?:[ \t]+[^\r\n]*\r?\n?)+)/m);
  if (descMultilineMatch) {
    description = descMultilineMatch[1]
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .join(' ');
  } else {
    const descMatch = frontmatter.match(/^description:\s*["']?([^"'\r\n]+)["']?/m);
    description = descMatch?.[1]?.trim();
  }

  return {
    name: cleanSkillName(nameMatch?.[1]?.trim() || fallbackName),
    description,
    content: body || trimmed
  };
}

function cleanSkillName(raw: string): string {
  return raw
    .replace(/\.(skill|md|txt|json|yaml|yml|zip)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || 'Skill Bantuan';
}

function extractFromZipBufferNode(buffer: Buffer): string | null {
  const candidates: Array<{ name: string; content: string }> = [];

  // 1. Scan Central Directory jika ada
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset !== -1) {
    const cdCount = buffer.readUInt16LE(eocdOffset + 10);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    let ptr = cdOffset;

    for (let idx = 0; idx < cdCount && ptr + 46 <= buffer.length; idx++) {
      if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
      const method = buffer.readUInt16LE(ptr + 10);
      const compSize = buffer.readUInt32LE(ptr + 20);
      const nameLen = buffer.readUInt16LE(ptr + 28);
      const extraLen = buffer.readUInt16LE(ptr + 30);
      const commentLen = buffer.readUInt16LE(ptr + 32);
      const localOffset = buffer.readUInt32LE(ptr + 42);
      const fileName = buffer.toString('utf-8', ptr + 46, ptr + 46 + nameLen);

      if (
        !fileName.endsWith('/') &&
        (fileName.toLowerCase().endsWith('.md') ||
          fileName.toLowerCase().endsWith('.txt') ||
          fileName.toLowerCase().endsWith('.skill') ||
          fileName.toLowerCase().endsWith('.yaml') ||
          fileName.toLowerCase().endsWith('.json'))
      ) {
        // Baca data dari local header
        const lh = localOffset;
        if (lh + 30 <= buffer.length && buffer.readUInt32LE(lh) === 0x04034b50) {
          const lhNameLen = buffer.readUInt16LE(lh + 26);
          const lhExtraLen = buffer.readUInt16LE(lh + 28);
          const dataStart = lh + 30 + lhNameLen + lhExtraLen;
          const dataEnd = dataStart + compSize;

          if (dataEnd <= buffer.length) {
            const compressed = buffer.subarray(dataStart, dataEnd);
            let uncompressed: Buffer | null = null;
            if (method === 0) {
              uncompressed = compressed;
            } else if (method === 8) {
              try {
                uncompressed = zlib.inflateRawSync(compressed);
              } catch {
                try {
                  uncompressed = zlib.inflateSync(compressed);
                } catch {}
              }
            }

            if (uncompressed) {
              candidates.push({ name: fileName, content: uncompressed.toString('utf-8') });
            }
          }
        }
      }

      ptr += 46 + nameLen + extraLen + commentLen;
    }
  }

  // 2. Jika Central Directory tidak menghasilkan file, scan local headers secara linear
  if (candidates.length === 0) {
    let pos = 0;
    while (pos + 30 <= buffer.length) {
      if (buffer.readUInt32LE(pos) === 0x04034b50) {
        const method = buffer.readUInt16LE(pos + 8);
        let compSize = buffer.readUInt32LE(pos + 18);
        const nameLen = buffer.readUInt16LE(pos + 26);
        const extraLen = buffer.readUInt16LE(pos + 28);
        const name = buffer.toString('utf-8', pos + 30, pos + 30 + nameLen);
        const dataStart = pos + 30 + nameLen + extraLen;

        if (compSize === 0) {
          let next = dataStart;
          while (next + 4 <= buffer.length) {
            const sig = buffer.readUInt32LE(next);
            if (sig === 0x04034b50 || sig === 0x02014b50 || sig === 0x08074b50) {
              compSize = next - dataStart;
              break;
            }
            next++;
          }
        }

        if (dataStart + compSize <= buffer.length) {
          const slice = buffer.subarray(dataStart, dataStart + compSize);
          let uncompressed: Buffer | null = null;
          if (method === 0) {
            uncompressed = slice;
          } else if (method === 8) {
            try {
              uncompressed = zlib.inflateRawSync(slice);
            } catch {
              try {
                uncompressed = zlib.inflateSync(slice);
              } catch {}
            }
          }

          if (
            uncompressed &&
            !name.endsWith('/') &&
            (name.toLowerCase().endsWith('.md') ||
              name.toLowerCase().endsWith('.txt') ||
              name.toLowerCase().endsWith('.skill') ||
              name.toLowerCase().endsWith('.yaml') ||
              name.toLowerCase().endsWith('.json'))
          ) {
            candidates.push({ name, content: uncompressed.toString('utf-8') });
          }
        }

        pos = dataStart + compSize;
      } else {
        pos++;
      }
    }
  }

  if (candidates.length === 0) return null;

  // Prioritaskan file dengan nama SKILL.md
  candidates.sort((a, b) => {
    const aIsSkill = a.name.toLowerCase().endsWith('skill.md') ? 0 : 1;
    const bIsSkill = b.name.toLowerCase().endsWith('skill.md') ? 0 : 1;
    return aIsSkill - bIsSkill;
  });

  return candidates[0]?.content || null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'File tidak ditemukan.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name || 'skill.skill';
    const fallbackName = fileName.replace(/\.(skill|md|txt|json|yaml|yml|zip)$/i, '');

    // Cek apakah ZIP archive (PK\x03\x04)
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const extractedText = extractFromZipBufferNode(buffer);
      if (extractedText && extractedText.trim()) {
        const parsed = parseSkillMetadata(extractedText, fallbackName);
        return NextResponse.json({ success: true, data: parsed });
      }
      return NextResponse.json({
        success: false,
        error: 'Tidak ditemukan berkas SKILL.md atau instruksi teks di dalam paket .skill/.zip ini.'
      }, { status: 422 });
    }

    // Berkas teks biasa
    const text = buffer.toString('utf-8');
    if (text && text.trim()) {
      const parsed = parseSkillMetadata(text, fallbackName);
      return NextResponse.json({ success: true, data: parsed });
    }

    return NextResponse.json({ success: false, error: 'File kosong atau format tidak dapat dibaca.' }, { status: 400 });
  } catch (err: any) {
    console.error('[API Skill Parse Error]:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Terjadi kesalahan sistem saat memproses file skill.'
    }, { status: 500 });
  }
}

