# Kinship Atlas - Offline Face Detection Integration Guide

## Overview

This guide describes how to integrate offline face detection into the Kinship Atlas browser-based GEDCOM editor using MediaPipe Face Detector.

The goal is to:

- Detect faces in media library images
- Operate completely offline
- Cache scan results locally
- Add face-based filters
- Identify likely portrait photographs
- Suggest primary media candidates for individuals
- Scale efficiently to 2,000+ images

---

# Desired Features

Add the following Media Library filters:

- All Media
- Contains Face
- Portraits
- Family Photos
- No Faces

Optional future additions:

- Probable Profile Photos
- Unidentified Faces
- Similar Faces
- Face Matching

---

# Folder Structure

Add the following folders to the Kinship Atlas project:

```text
KinshipAtlas/
│
├── models/
│   └── face_detector.task
│
├── vendor/
│   └── mediapipe/
│
├── js/
│   └── media-face-scanner.js
│
├── data/
│   └── media-face-analysis.json
│
└── media/
```

---

# Step 1 - Download MediaPipe

Install MediaPipe Tasks Vision.

Required components:

- tasks-vision
- wasm runtime
- face detector model

Store locally inside the application.

Do not load from:

- CDN
- Internet URLs
- Cloud services

Everything should be packaged with Kinship Atlas.

---

# Step 2 - Create Analysis Cache

Create:

```text
data/media-face-analysis.json
```

Initial contents:

```json
{
  "version": 1,
  "images": {}
}
```

This file stores scan results and prevents rescanning every startup.

---

# Step 3 - Create Scanner Service

File:

```text
js/media-face-scanner.js
```

Basic structure:

```javascript
class MediaFaceScanner {

    constructor() {
        this.detector = null;
    }

    async initialize() {

        const vision =
            await FilesetResolver.forVisionTasks(
                "./vendor/mediapipe/wasm"
            );

        this.detector =
            await FaceDetector.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath:
                            "./models/face_detector.task"
                    },
                    runningMode: "IMAGE"
                }
            );
    }

}
```

---

# Step 4 - Scan Individual Images

Example:

```javascript
async scanImage(img) {

    const results =
        this.detector.detect(img);

    const faceCount =
        results.detections.length;

    return {
        hasFace: faceCount > 0,
        faceCount
    };
}
```

Outputs:

```json
{
  "hasFace": true,
  "faceCount": 1
}
```

---

# Step 5 - Portrait Detection

Portraits are generally:

- One face
- Large face area
- Close-up photographic subject

Example scoring:

```javascript
function calculatePortraitScore(
    faceCount,
    largestFaceArea,
    imageArea
) {

    if (faceCount !== 1)
        return 0;

    const ratio =
        largestFaceArea / imageArea;

    return Math.min(1, ratio * 3);
}
```

Examples:

| Image Type | Score |
|------------|--------|
| Studio portrait | 0.90 - 1.00 |
| Headshot | 0.80 - 1.00 |
| Group photo | 0.00 |
| Landscape | 0.00 |
| Census page | 0.00 |

---

# Step 6 - Categorise Photos

Suggested logic:

```javascript
if (faceCount === 0) {

    category = "Document";

}
else if (faceCount === 1) {

    category = "Portrait";

}
else {

    category = "Family photo";

}
```

Only apply automatically if:

```text
Current category = Unclassified
```

Never overwrite existing manual classifications.

---

# Step 7 - Store Analysis Results

Example cache record:

```json
{
  "photos/samuel-magnus.jpg": {
    "hasFace": true,
    "faceCount": 1,
    "portraitScore": 0.94,
    "classification": "Portrait",
    "scanned": true
  }
}
```

---

# Step 8 - Add Toolbar Scan Button

Example:

```html
<button id="scanFacesBtn">
    Scan Faces
</button>
```

Workflow:

```text
User clicks Scan Faces
            ↓
MediaPipe scans images
            ↓
Results cached
            ↓
Filters become available
```

---

# Step 9 - Add Media Filters

Example:

```html
<select id="faceFilter">

    <option value="all">
        All Media
    </option>

    <option value="faces">
        Contains Face
    </option>

    <option value="portrait">
        Portraits
    </option>

    <option value="family">
        Family Photos
    </option>

    <option value="noface">
        No Faces
    </option>

</select>
```

Example filtering:

```javascript
switch(filter) {

    case "faces":
        return item.hasFace;

    case "portrait":
        return item.portraitScore > 0.7;

    case "family":
        return item.faceCount > 1;

    case "noface":
        return !item.hasFace;
}
```

---

# Step 10 - Primary Media Suggestions

Kinship Atlas currently supports:

- primary-media
- additional-media

When a person's linked media is analysed:

```javascript
if (
    faceCount === 1 &&
    portraitScore > 0.8
) {

    candidatePrimaryMedia = true;
}
```

Selection rule:

```javascript
Use first detected portrait candidate
if no Primary Media already exists.
```

Alternative:

```javascript
Use highest Portrait Score.
```

Recommended approach:

```javascript
Highest Portrait Score
```

This will usually outperform relying on file order.

---

# Step 11 - Scan Only New Files

Never rescan the whole library every launch.

Example:

```javascript
if (
    !analysisCache[path]
) {
    scanImage(path);
}
```

This allows incremental updates.

Workflow:

```text
Add new image
        ↓
Scan new image only
        ↓
Update cache
```

---

# Step 12 - Recommended Cache Structure

Future-proof design:

```json
{
  "hasFace": true,

  "faceCount": 1,

  "portraitScore": 0.94,

  "classification": "Portrait",

  "scanned": true,

  "faceCluster": null,

  "recognizedPerson": null
}
```

The final two fields can support future face matching functionality without redesigning the data model.

---

# Future Enhancements

Potential v2 features:

- Face clustering
- Similar face matching
- Auto-grouping unidentified portraits
- Probable individual suggestions
- AI-assisted media categorisation
- Automatic portrait selection
- Portrait thumbnail generation

---

# Recommended Implementation Order

1. MediaPipe integration
2. Face scanning
3. Analysis cache
4. Contains Face filter
5. Portrait filter
6. Family Photo filter
7. Primary Media suggestions
8. Automatic classification
9. Face clustering (future)

This approach provides a fully offline solution that scales comfortably beyond 2,000 images while remaining fast and responsive for genealogy workflows.