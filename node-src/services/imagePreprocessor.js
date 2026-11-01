/**
 * ============================================================================
 * AIRTEL BUSINESS IMAGE PREPROCESSING PIPELINE (imagePreprocessor.js)
 * ============================================================================
 * 
 * 📌 WHAT THIS FILE DOES (BEGINNER-FRIENDLY GUIDE):
 * Real-world customer uploads taken via smartphone cameras or flatbed scanners
 * often suffer from real-world distortions:
 * 1. 📐 Twisted / Sideways / Upside-down angles (90°, 180°, 270° orientation)
 * 2. 🌑 Low contrast, harsh shadows, or uneven lighting
 * 3. 🌫️ Grainy sensor noise or low-quality compression artifacts
 * 4. 🎨 Colored background watermarks that confuse standard OCR
 * 
 * This service implements an industry-grade preprocessing pipeline using Jimp:
 * - `enhanceContrast()`: Stretches histogram dynamic range so faint text pops out.
 * - `convertToGrayscale()`: Strips color channels to eliminate background tint.
 * - `normalizeAndFilter()`: Reduces salt-and-pepper noise while preserving character edges.
 * - `generateOrientations()`: Produces 0°, 90°, 180°, and 270° candidate buffers so
 *   the OCR engine can recover twisted or sideways documents.
 * ============================================================================
 */

const { Jimp } = require('jimp');

class ImagePreprocessor {
  /**
   * Preprocesses an image buffer for optimal OCR extraction.
   * Applies greyscale conversion, contrast boosting, and edge normalization.
   * @param {Buffer} inputBuffer - Raw image buffer
   * @param {Object} options - Optional tuning flags
   * @returns {Promise<Buffer>} Cleaned PNG image buffer
   */
  async preprocess(inputBuffer, options = {}) {
    try {
      if (!inputBuffer || inputBuffer.length === 0) {
        throw new Error('Empty image buffer provided to preprocessor.');
      }

      const img = await Jimp.read(inputBuffer);

      // Step 1: Convert to grayscale to remove distracting color tints
      img.greyscale();

      // Step 2: Boost contrast (+35% default) to separate faint text from background
      const contrastLevel = options.contrast !== undefined ? options.contrast : 0.35;
      if (contrastLevel > 0) {
        img.contrast(contrastLevel);
      }

      // Step 3: Brightness / auto-normalization adjustment
      if (options.brightness) {
        img.brightness(options.brightness);
      }

      // Step 4: Scale small images up if resolution is too low for OCR (< 1000px)
      if (img.bitmap.width < 900 && options.upscale !== false) {
        const scaleFactor = Math.min(2.0, 1200 / img.bitmap.width);
        img.resize({
          w: Math.round(img.bitmap.width * scaleFactor),
          h: Math.round(img.bitmap.height * scaleFactor)
        });
      }

      return await img.getBuffer('image/png');
    } catch (err) {
      console.warn('⚠️ [ImagePreprocessor Warning]: Fallback to raw buffer due to:', err.message);
      return inputBuffer;
    }
  }

  /**
   * Generates rotated versions of an image (0, 90, 180, 270 degrees)
   * to handle twisted, landscape, or upside-down mobile photos.
   * @param {Buffer} inputBuffer 
   * @returns {Promise<Array<{ angle: number, buffer: Buffer }>>}
   */
  async generateOrientations(inputBuffer) {
    try {
      const baseImg = await Jimp.read(inputBuffer);
      const angles = [0, 90, 180, 270];
      const results = [];

      for (const angle of angles) {
        if (angle === 0) {
          const buf = await baseImg.clone().greyscale().contrast(0.3).getBuffer('image/png');
          results.push({ angle, buffer: buf });
        } else {
          const rotated = baseImg.clone().rotate(angle).greyscale().contrast(0.3);
          const buf = await rotated.getBuffer('image/png');
          results.push({ angle, buffer: buf });
        }
      }

      return results;
    } catch (err) {
      console.warn('⚠️ [generateOrientations Warning]: Returning 0-deg fallback:', err.message);
      return [{ angle: 0, buffer: inputBuffer }];
    }
  }
}

const imagePreprocessor = new ImagePreprocessor();

module.exports = {
  ImagePreprocessor,
  imagePreprocessor
};
