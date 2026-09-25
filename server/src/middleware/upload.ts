import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type { Request } from 'express';
import type { EvidenceKind } from '../types/domain';

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const GIG_IMAGE_DIR = path.join(UPLOAD_ROOT, 'gigs');
const EVIDENCE_DIR = path.join(UPLOAD_ROOT, 'evidence');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface EvidenceSpec {
  mimes: string[];
  maxBytes: number;
  kind: EvidenceKind;
}

// Video and audio are capped well below the image-per-pixel equivalent because
// the people uploading them are on metered mobile data.
const EVIDENCE_LIMITS: Record<string, EvidenceSpec> = {
  image: { mimes: ALLOWED_MIME_TYPES, maxBytes: 10 * 1024 * 1024, kind: 'photo' },
  video: {
    mimes: ['video/mp4', 'video/webm', 'video/quicktime'],
    maxBytes: 25 * 1024 * 1024,
    kind: 'video',
  },
  audio: {
    mimes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'],
    maxBytes: 5 * 1024 * 1024,
    kind: 'voice',
  },
  // Most certificates here are paper, photographed on a phone, so images are
  // as much a document format as PDF is.
  document: {
    mimes: ['application/pdf'],
    maxBytes: 8 * 1024 * 1024,
    kind: 'document',
  },
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/**
 * A MulterError carrying a human-readable reason.
 *
 * Multer's second constructor argument is typed as the *field* name, but the
 * codebase has always passed an explanation here and the error middleware
 * relays `err.message` straight to the caller. Preserved deliberately: changing
 * it would replace a usable message with a field name in the API response.
 */
const rejectUpload = (message: string) =>
  new multer.MulterError('LIMIT_UNEXPECTED_FILE', message as unknown as string);

const diskStorage = (dir: string) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      // Browser-recorded blobs arrive without a usable filename, so the
      // extension comes from the declared type instead.
      const ext = path.extname(file.originalname) || EXTENSION_BY_MIME[file.mimetype] || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

const gigImageFilter: multer.Options['fileFilter'] = (
  _req: Request,
  file: Express.Multer.File,
  cb,
) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(rejectUpload('Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
  cb(null, true);
};

const evidenceFilter: multer.Options['fileFilter'] = (
  _req: Request,
  file: Express.Multer.File,
  cb,
) => {
  const allowed = Object.values(EVIDENCE_LIMITS).some((spec) => spec.mimes.includes(file.mimetype));
  if (!allowed) {
    return cb(
      rejectUpload('Evidence must be an image, an MP4/WebM video, an audio recording, or a PDF'),
    );
  }
  cb(null, true);
};

export const uploadGigImage = multer({
  storage: diskStorage(GIG_IMAGE_DIR),
  fileFilter: gigImageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadEvidence = multer({
  storage: diskStorage(EVIDENCE_DIR),
  fileFilter: evidenceFilter,
  // Multer enforces one ceiling, so the per-type limits below are checked after
  // upload; this is the outer bound.
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
});

/** Maps an uploaded file to its evidence kind, or null if the type is not allowed. */
export const evidenceKindFor = (mimetype: string): EvidenceKind | null => {
  const spec = Object.values(EVIDENCE_LIMITS).find((s) => s.mimes.includes(mimetype));
  return spec ? spec.kind : null;
};

/** Per-type size ceiling, so a 20MB voice note is rejected even though video allows it. */
export const evidenceLimitFor = (mimetype: string): number => {
  const spec = Object.values(EVIDENCE_LIMITS).find((s) => s.mimes.includes(mimetype));
  return spec ? spec.maxBytes : 0;
};

export { EVIDENCE_DIR };
