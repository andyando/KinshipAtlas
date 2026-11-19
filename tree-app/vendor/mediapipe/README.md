# Kinship Atlas – local MediaPipe assets

The face scanner (`face-scan.js`) runs MediaPipe Face Detector completely offline.
It needs two assets, both vendored here so nothing is loaded from a CDN:

```text
tree-app/
├── vendor/mediapipe/
│   ├── vision_bundle.mjs          (from @mediapipe/tasks-vision)
│   └── wasm/                      (vision_wasm_internal.js/.wasm etc.)
└── models/
    └── blaze_face_short_range.tflite
```

## Refreshing the assets

From the repository root (`G:\Git\Kinship_Experimental`):

```powershell
# 1. Runtime + wasm (already installed as a dev dependency)
Copy-Item node_modules\@mediapipe\tasks-vision\vision_bundle.mjs tree-app\vendor\mediapipe\ -Force
Copy-Item node_modules\@mediapipe\tasks-vision\wasm tree-app\vendor\mediapipe\wasm -Recurse -Force

# 2. Model (one-time download; keep the file in the repo afterwards)
Invoke-WebRequest `
  -Uri 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite' `
  -OutFile tree-app\models\blaze_face_short_range.tflite
```

If the model file is missing the scanner
reports the image as unscanned rather than guessing, and the Media Library shows
a failure message after the user starts a scan.
