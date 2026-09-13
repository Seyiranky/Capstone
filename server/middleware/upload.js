const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const GIG_IMAGE_DIR = path.join(UPLOAD_ROOT, 'gigs');
const EVIDENCE_DIR = path.join(UPLOAD_ROOT, 'evidence');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Video and audio are capped well below the image-per-pixel equivalent because
// the people uploading them are on metered mobile data.
const EVIDENCE_LIMITS = {
  image: { mimes: ALLOWED_MIME_TYPES, maxBytes: 10 * 1024 * 1024, kind: 'photo' },
  video: { mimes: ['video/mp4', 'video/webm', 'video/quicktime'], maxBytes: 25 * 1024 * 1024, kind: 'video' },
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

const EXTENSION_BY_MIME = {
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

const diskStorage = (dir) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      // Browser-recorded blobs arrive without a usable filename, so the
      // extension comes from the declared type instead.
      const ext = path.extname(file.originalname) || EXTENSION_BY_MIME[file.mimetype] || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });

const gigImageFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
  cb(null, true);
};

const evidenceFilter = (req, file, cb) => {
  const allowed = Object.values(EVIDENCE_LIMITS).some((spec) => spec.mimes.includes(file.mimetype));
  if (!allowed) {
    return cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        'Evidence must be an image, an MP4/WebM video, an audio recording, or a PDF',
      ),
    );
  }
  cb(null, true);
};

exports.uploadGigImage = multer({
  storage: diskStorage(GIG_IMAGE_DIR),
  fileFilter: gigImageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

exports.uploadEvidence = multer({
  storage: diskStorage(EVIDENCE_DIR),
  fileFilter: evidenceFilter,
  // Multer enforces one ceiling, so the per-type limits below are checked after
  // upload; this is the outer bound.
  limits: { fileSize: 25 * 1024 * 1024, files: 5 },
});

/** Maps an uploaded file to its evidence kind, or null if the type is not allowed. */
exports.evidenceKindFor = (mimetype) => {
  const spec = Object.values(EVIDENCE_LIMITS).find((s) => s.mimes.includes(mimetype));
  return spec ? spec.kind : null;
};

/** Per-type size ceiling, so a 20MB voice note is rejected even though video allows it. */
exports.evidenceLimitFor = (mimetype) => {
  const spec = Object.values(EVIDENCE_LIMITS).find((s) => s.mimes.includes(mimetype));
  return spec ? spec.maxBytes : 0;
};

exports.EVIDENCE_DIR = EVIDENCE_DIR;
