import multer from 'multer';
import { AppError, payloadTooLarge, validationFailed } from '../../utils/errors.js';

/**
 * Express middleware that accepts one multipart file field into memory, enforces the size limit
 * while streaming, and converts multer errors into the standard error shape.
 * The file lands on req.file with its buffer; nothing is written to disk until validated.
 */
export function createSingleFileUpload({ fieldName = 'file', maxBytes }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 5, parts: 8 },
  }).single(fieldName);

  return function singleFileUpload(req, res, next) {
    upload(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof AppError) {
        next(err);
      } else if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(payloadTooLarge(`Files can be at most ${Math.floor(maxBytes / 1024 / 1024)} MB`));
        } else {
          next(validationFailed([{ path: fieldName, message: 'Invalid upload' }]));
        }
      } else {
        next(err);
      }
    });
  };
}
