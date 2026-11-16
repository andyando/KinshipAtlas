$appDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $appDir
try {
$lines = (Get-Content app.js).Count
$decls = Select-String -Path app.js -Pattern '^\s*(async\s+)?function\s+([A-Za-z_$]+)'
"TOTAL LINES: $lines"
"FUNCTION DECLS: $($decls.Count)"
$arrows = (Select-String -Path app.js -Pattern '^\s*(const|let)\s+[A-Za-z_$]+\s*=\s*(async\s*)?\(').Count
"ARROW FN ASSIGNS: $arrows"
""
"LARGEST TOP-LEVEL FUNCTIONS (>= 100 lines):"
for ($i = 0; $i -lt $decls.Count; $i++) {
  $start = $decls[$i].LineNumber
  $end = if ($i + 1 -lt $decls.Count) { $decls[$i + 1].LineNumber } else { $lines }
  $size = $end - $start
  if ($size -ge 100) { "{0,5} lines  {1} (line {2})" -f $size, $decls[$i].Matches[0].Groups[2].Value, $start }
}
} finally { Pop-Location }
