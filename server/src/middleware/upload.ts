import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import type { Request } from 'express';
import type { EvidenceKind } from '../types/domain';

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');
const GIG_IMAGE_DIR = path.join(UPLOAD_ROOT, 'gigs');
const EVIDENCE_DIR = path.join(UPLOAD_ROOT, 'evidence');
const JOB_PHOTO_DIR = path.join(UPLOAD_ROOT, 'jobs');
const MESSAGE_IMAGE_DIR = path.join(UPLOAD_ROOT, 'messages');
export const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
const SUPPORT_DIR = path.join(UPLOAD_ROOT, 'support');

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
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/aac': '.aac',
  'audio/x-m4a': '.m4a',
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
      // The extension always comes from the checked type, never from the
      // uploader's filename: a file named "x.html" but declared as an image
      // would otherwise be stored as .html and served as a web page.
      const ext = EXTENSION_BY_MIME[file.mimetype.split(';')[0].trim().toLowerCase()] ?? '.bin';
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

// Voice notes ───────────────────────────────────────────────────────────────
// Browsers record WebM/Opus (Chrome, Firefox) or MP4/AAC (Safari). Two minutes
// of Opus at the default bitrate is well under 2MB; 3MB leaves room for AAC.
export const VOICE_MAX_SECONDS = 120;
export const VOICE_MAX_BYTES = 3 * 1024 * 1024;
const VOICE_MIME_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a', 'audio/wav'];

/** The bare type: some browsers declare `audio/webm;codecs=opus`. */
export const bareMime = (mime: string) => mime.split(';')[0].trim().toLowerCase();

/** A photo under `image`, a voice note under the given audio field. */
const photoOrVoiceFilter =
  (audioField: string): multer.Options['fileFilter'] =>
  (_req: Request, file: Express.Multer.File, cb) => {
    if (file.fieldname === audioField) {
      if (!VOICE_MIME_TYPES.includes(bareMime(file.mimetype))) {
        return cb(rejectUpload('Voice notes must be WebM, Ogg, MP4/M4A, MP3 or WAV audio'));
      }
      return cb(null, true);
    }
    if (file.fieldname === 'image') {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        return cb(rejectUpload('Only JPEG, PNG, WEBP, or GIF images are allowed'));
      }
      return cb(null, true);
    }
    cb(rejectUpload(`Unexpected file field "${file.fieldname}"`));
  };

/** A gig's photo (`image`) and its voice note (`voice`), both optional. */
export const uploadGigMedia = multer({
  storage: diskStorage(GIG_IMAGE_DIR),
  fileFilter: photoOrVoiceFilter('voice'),
  limits: { fileSize: 5 * 1024 * 1024, files: 2 },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'voice', maxCount: 1 },
]);

/** One photo (`image`) and/or one voice note (`audio`) per message. */
export const uploadMessageMedia = multer({
  storage: diskStorage(MESSAGE_IMAGE_DIR),
  fileFilter: photoOrVoiceFilter('audio'),
  limits: { fileSize: 10 * 1024 * 1024, files: 2 },
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]);

/** The single file uploaded under a field by a `.fields()` handler, if any. */
export const fieldFile = (req: Request, field: string): Express.Multer.File | undefined => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
};

/**
 * Checks a voice note after upload: the byte cap multer cannot apply per field,
 * and the duration the device reports. Returns an error message, or null.
 * The duration is the sender's word for it; the byte cap is the real bound.
 */
export const checkVoiceNote = (
  file: Express.Multer.File,
  rawDuration: unknown,
): { error: string } | { durationSec: number | null } => {
  if (file.size > VOICE_MAX_BYTES) return { error: 'Voice notes can be at most 3MB' };
  if (rawDuration === undefined || rawDuration === null || rawDuration === '') return { durationSec: null };
  const seconds = Math.round(Number(rawDuration));
  if (!Number.isFinite(seconds) || seconds < 1) return { error: 'durationSec must be a positive number' };
  if (seconds > VOICE_MAX_SECONDS + 2) return { error: `Voice notes can be at most ${VOICE_MAX_SECONDS} seconds` };
  return { durationSec: Math.min(seconds, VOICE_MAX_SECONDS) };
};

/** Photos of finished work: images only, a few per job, sized for mobile uploads. */
export const MAX_JOB_PHOTOS = 3;
export const uploadJobPhotos = multer({
  storage: diskStorage(JOB_PHOTO_DIR),
  fileFilter: gigImageFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_JOB_PHOTOS },
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

/**
 * A profile picture. The browser crops it to a square and sends a small JPEG,
 * so 2MB is generous; PNG and WebP are accepted for clients that send those.
 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const uploadAvatar = multer({
  storage: diskStorage(AVATAR_DIR),
  fileFilter: (_req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(rejectUpload('A profile picture must be a JPEG, PNG or WebP image')),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
}).single('avatar');

/**
 * Whether a stored file's first bytes are really a JPEG, PNG or WebP image.
 * The declared type is the uploader's word; the bytes are not. A profile
 * picture is served to everyone, so anything else is refused.
 */
export const looksLikeImage = (filePath: string): boolean => {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const png = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const webp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
    return jpeg || png || webp;
  } finally {
    fs.closeSync(fd);
  }
};

/**
 * One screenshot or document on a support message. Private: served only with
 * a signed link, like chat media, because screenshots show numbers and money.
 */
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const SUPPORT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const uploadSupportAttachment = multer({
  storage: diskStorage(SUPPORT_DIR),
  fileFilter: (_req, file, cb) =>
    SUPPORT_MIMES.includes(file.mimetype)
      ? cb(null, true)
      : cb(rejectUpload('Attach a screenshot (JPEG, PNG or WebP) or a PDF')),
  limits: { fileSize: SUPPORT_ATTACHMENT_MAX_BYTES, files: 1 },
}).single('attachment');

/** Whether a stored file really is the image or PDF it claims to be. */
export const looksLikeImageOrPdf = (filePath: string): boolean => {
  if (looksLikeImage(filePath)) return true;
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(5);
    fs.readSync(fd, head, 0, 5, 0);
    return head.toString('ascii') === '%PDF-';
  } finally {
    fs.closeSync(fd);
  }
};
