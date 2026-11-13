import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { files } from '../db/schema';

export const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const KINDS = ['student-photo', 'staff-photo', 'gallery', 'admission-doc', 'other', 'logo'];
/** Student photos are children’s personal data: staff-only (served through a login), never public. */
export const PUBLIC_KINDS = ['staff-photo', 'gallery', 'logo']; // the logo is printed on public things anyway
export const MAX_PDF_BYTES = 3 * 1024 * 1024; export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export type Upload = { ownerKind: string; ownerId?: string; name: string; mime: string; data: string };

/** Checks and shrinks an upload: images are decoded (broken files are refused) and stored as a small JPEG; PDFs must really be PDFs. */
export async function normalizeUpload(b: Upload) {
  if (!KINDS.includes(b.ownerKind)) throw new BadRequestException('Unknown file type'); if (!MIMES.includes(b.mime)) throw new BadRequestException('Only JPG, PNG, WebP or PDF files are allowed');
  const raw = String(b.data || '').replace(/^data:[^,]+,/, ''); const rawBytes = Math.floor((raw.length * 3) / 4); const isImg = b.mime.startsWith('image/');
  if (!rawBytes) throw new BadRequestException('Empty file'); if (rawBytes > (isImg ? MAX_IMAGE_BYTES : MAX_PDF_BYTES)) throw new BadRequestException(isImg ? 'Photo is larger than 8 MB' : 'PDF is larger than 3 MB — please shrink it first');
  let buf = Buffer.from(raw, 'base64'); let mime = b.mime;
  if (isImg && b.ownerKind === 'logo') { try { buf = await sharp(buf).rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer(); mime = 'image/png'; } catch { throw new BadRequestException('This image could not be read. Please upload a PNG or JPG logo.'); } } // keep transparency
  else if (isImg) { try { const max = b.ownerKind === 'student-photo' || b.ownerKind === 'staff-photo' ? 600 : 1800; buf = await sharp(buf).rotate().resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer(); mime = 'image/jpeg'; } catch { throw new BadRequestException('This image could not be read. Please upload a JPG or PNG photo.'); } }
  else if (buf.slice(0, 4).toString() !== '%PDF') throw new BadRequestException('This is not a valid PDF');
  const name = String(b.name || 'file').replace(/\.(png|webp|jpe?g)$/i, isImg ? (b.ownerKind === 'logo' ? '.png' : '.jpg') : '$&').slice(0, 120);
  return { name, mime, buf };
}

export async function saveFile(db: any, centreId: string, b: Upload, pre?: { name: string; mime: string; buf: Buffer }) {
  const n = pre || (await normalizeUpload(b));
  if (b.ownerKind === 'student-photo' || b.ownerKind === 'staff-photo' || b.ownerKind === 'logo') await db.delete(files).where(and(eq(files.centreId, centreId), eq(files.ownerKind, b.ownerKind), eq(files.ownerId, b.ownerId || '')));
  const [f] = await db.insert(files).values({ centreId, ownerKind: b.ownerKind, ownerId: b.ownerId || null, name: n.name, mime: n.mime, size: n.buf.length, isPublic: PUBLIC_KINDS.includes(b.ownerKind), data: n.buf.toString('base64') }).returning({ id: files.id, name: files.name, mime: files.mime, size: files.size });
  return f;
}
