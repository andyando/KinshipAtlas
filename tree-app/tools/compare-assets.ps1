$a = (Get-FileHash 'node_modules/@mediapipe/tasks-vision/vision_bundle.mjs' -Algorithm MD5).Hash
$b = (Get-FileHash 'tree-app/vendor/mediapipe/vision_bundle.mjs' -Algorithm MD5).Hash
Write-Output ("bundle same: " + ($a -eq $b))
$c = (Get-FileHash 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js' -Algorithm MD5).Hash
$d = (Get-FileHash 'tree-app/vendor/mediapipe/wasm/vision_wasm_internal.js' -Algorithm MD5).Hash
Write-Output ("wasm js same: " + ($c -eq $d))
$e = (Get-FileHash 'node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm' -Algorithm MD5).Hash
$f = (Get-FileHash 'tree-app/vendor/mediapipe/wasm/vision_wasm_internal.wasm' -Algorithm MD5).Hash
Write-Output ("wasm bin same: " + ($e -eq $f))
$pkg = Get-Content 'node_modules/@mediapipe/tasks-vision/package.json' | ConvertFrom-Json
Write-Output ("tasks-vision version: " + $pkg.version)
