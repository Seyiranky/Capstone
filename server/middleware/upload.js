const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const GIG_IMAGE_DIR = path.join(__dirname, '..', 'uploads', 'gigs');
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(GIG_IMAGE_DIR, { recursive: true });
    cb(null, GIG_IMAGE_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only JPEG, PNG, WEBP, or GIF images are allowed'));
  }
  cb(null, true);
};

exports.uploadGigImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
