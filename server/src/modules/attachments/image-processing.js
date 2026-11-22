import sharp from 'sharp';
import { unsupportedMedia } from '../../utils/errors.js';

const THUMBNAIL_SIZE = 480;
const AVATAR_SIZE = 256;
// Reject decompression bombs: a small file can declare enormous dimensions.
const MAX_INPUT_PIXELS = 50_000_000;

function open(buffer) {
  return sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
}

/** Read dimensions and build a WebP thumbnail. Corrupt images are rejected as unsupported. */
export async function processImage(buffer) {
  try {
    const metadata = await open(buffer).metadata();
    const thumbnail = await open(buffer)
      .rotate()
      .resize({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toBuffer();
    // EXIF orientation 5-8 swaps the displayed width and height.
    const swapped = metadata.orientation && metadata.orientation >= 5;
    return {
      width: swapped ? metadata.height : metadata.width,
      height: swapped ? metadata.width : metadata.height,
      thumbnail,
    };
  } catch (err) {
    if (err.statusCode) {
      throw err;
    }
    throw unsupportedMedia('The image could not be read');
  }
}

/** A square WebP avatar, cropped around the centre. Metadata such as EXIF is dropped. */
export async function processAvatar(buffer) {
  try {
    return await open(buffer)
      .rotate()
      .resize({ width: AVATAR_SIZE, height: AVATAR_SIZE, fit: 'cover' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw unsupportedMedia('The image could not be read');
  }
}
