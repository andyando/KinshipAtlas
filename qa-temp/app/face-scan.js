/* Kinship Atlas – offline MediaPipe face scanning for the media library.
 *
 * Implements templates/mediapipe-face-detection-integration.md with MediaPipe
 * Face Detector (blaze_face_short_range). Everything runs locally: the runtime,
 * wasm bundle and model are vendored under vendor/mediapipe and models/, and
 * nothing is fetched from a CDN or uploaded anywhere.
 *
 *   window.KinshipFaceScan.analyse(file)  -> Promise<record>
 *   window.KinshipFaceScan.isAvailable()  -> boolean
 *   window.KinshipFaceScan.initialise()   -> Promise<void> (loads wasm + model)
 *
 * Record shape (guide step 12):
 *   { hasFace, faceCount, portraitScore, classification, scanned, faceCluster,
 *     recognizedPerson, size, lastModified }
 */
(() => {
  'use strict';

  // Paths are document-relative: the scanner loads from the app root, and the
  // wasm runtime and model live beside index.html.


  const RUNTIME_MODULE = './vendor/mediapipe/vision_bundle.mjs';
  const WASM_BASE = './vendor/mediapipe/wasm';
  const MODEL_URL = './models/blaze_face_short_range.tflite';
  const SCANNER_VERSION = 3;
  const SCAN_EDGE = 512;
  const MIN_FACE_CONFIDENCE = 0.65;

  let modulePromise = null;
  let detectorPromise = null;
  let detector = null;

  async function loadRuntime() {
    if (!modulePromise) {
      modulePromise = import(RUNTIME_MODULE).catch((error) => {
        modulePromise = null;
        const wrapped = new Error('The local face detector runtime could not be loaded.', { cause: error });
        wrapped.code = 'FACE_RUNTIME_LOAD_FAILED';
        throw wrapped;
      });
    }
    return modulePromise;
  }

  async function initialise() {
    if (detector) return;
    if (!detectorPromise) {
      detectorPromise = (async () => {
        try {
          const vision = await loadRuntime();
          const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
          detector = await vision.FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: MODEL_URL },
            runningMode: 'IMAGE',
            minDetectionConfidence: MIN_FACE_CONFIDENCE
          });
        } catch (error) {
          if (error?.code === 'FACE_RUNTIME_LOAD_FAILED') throw error;
          const wrapped = new Error('The local face detector model could not be loaded.', { cause: error });
          wrapped.code = 'FACE_MODEL_LOAD_FAILED';
          throw wrapped;
        }
      })();
      detectorPromise.catch(() => { detectorPromise = null; });
    }
    return detectorPromise;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = file.kinshipUrl || URL.createObjectURL(file);
      const temporaryUrl = !file.kinshipUrl;
      const image = new Image();
      image.onload = () => {
        if (temporaryUrl) URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        if (temporaryUrl) URL.revokeObjectURL(url);
        reject(new Error('image_unreadable'));
      };
      image.src = url;
    });
  }

  // Keep enough resolution for small faces in old group photographs while
  // bounding memory and processing time for very large scans.
  function analyseSync(image, detector) {
    const scale = Math.min(1, SCAN_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return { hasFace: false, faceCount: 0, portraitScore: 0, classification: 'Document' };
    context.drawImage(image, 0, 0, width, height);
    const detections = detector.detect(canvas).detections.filter((detection) => {
      const score = detection.categories?.[0]?.score || 0;
      const box = detection.boundingBox || {};
      const edgeDistance = Math.min(
        box.originX || 0,
        box.originY || 0,
        width - ((box.originX || 0) + (box.width || 0)),
        height - ((box.originY || 0) + (box.height || 0))
      );
      // Archive scans commonly contain letterforms, seals and page corners that
      // resemble a face. Weak detections abutting a page edge are almost always
      // those artifacts; retain high-confidence edge crops as possible portraits.
      return score >= MIN_FACE_CONFIDENCE &&
        (score >= 0.85 || edgeDistance >= Math.min(width, height) * 0.04);
    });
    const faceCount = detections.length;
    let largest = 0;
    let highestConfidence = 0;
    for (const detection of detections) {
      const box = detection.boundingBox || {};
      const area = ((box.width || 0) * (box.height || 0)) / (width * height || 1);
      largest = Math.max(largest, area);
      highestConfidence = Math.max(highestConfidence, detection.categories?.[0]?.score || 0);
    }
    // Portrait = one face that dominates the frame (integration guide step 5:
    // score = min(1, faceArea / imageArea * 3); studio portraits land > 0.8).
    const portraitScore = faceCount === 1 ? Math.min(1, largest * 3) : 0;
    const classification = faceCount === 0 ? 'Document' : faceCount === 1 ? 'Portrait' : 'Family photo';
    return {
      hasFace: faceCount > 0,
      faceCount,
      confidence: Math.round(highestConfidence * 100) / 100,
      portraitScore: Math.round(portraitScore * 100) / 100,
      classification,
      faceCluster: null,
      recognizedPerson: null
    };
  }

  async function analyse(file) {
    const image = await loadImage(file);
    await initialise();
    const base = analyseSync(image, detector);
    return {
      ...base,
      scanned: true,
      scannerVersion: SCANNER_VERSION,
      size: file.size,
      lastModified: file.lastModified
    };
  }

  // MediaPipe exposes the detector from the vendored bundle; the .tflite weights
  // are the blaze_face_short_range model the task guide expects.
  window.KinshipFaceScan = {
    analyse,
    initialise,
    version: SCANNER_VERSION,
    isAvailable: () => typeof document !== 'undefined' && typeof Image !== 'undefined'
  };
})();
