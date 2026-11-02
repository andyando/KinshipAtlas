# Generates kinship-atlas.ico (the header brand mark: four amber nodes joined by teal lines on dark green).
Add-Type -AssemblyName System.Drawing
$sizes = 16, 24, 32, 48, 64, 128, 256
$ink = [Drawing.ColorTranslator]::FromHtml('#17352f')
$line = [Drawing.ColorTranslator]::FromHtml('#75b8a4')
$amber = [Drawing.ColorTranslator]::FromHtml('#f2bf75')

function New-Png($size) {
    $bmp = New-Object Drawing.Bitmap $size, $size
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([Drawing.Color]::Transparent)
    $u = $size / 100.0
    $path = New-Object Drawing.Drawing2D.GraphicsPath
    $r = 20 * $u
    $path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($size - $r, 0, $r, $r, 270, 90)
    $path.AddArc($size - $r, $size - $r, $r, $r, 0, 90); $path.AddArc(0, $size - $r, $r, $r, 90, 90)
    $path.CloseFigure()
    $g.FillPath((New-Object Drawing.SolidBrush $ink), $path)
    $pen = New-Object Drawing.Pen $line, ([Math]::Max(1.5, 5 * $u))
    $g.DrawLine($pen, 50 * $u, 17 * $u, 50 * $u, 83 * $u)
    $g.DrawLine($pen, 17 * $u, 50 * $u, 83 * $u, 50 * $u)
    $node = 24 * $u
    $fill = New-Object Drawing.SolidBrush $amber
    $edge = New-Object Drawing.Pen $ink, ([Math]::Max(1, 5 * $u))
    foreach ($x in 26, 74) { foreach ($y in 26, 74) {
        $rect = New-Object Drawing.RectangleF (($x * $u) - $node / 2), (($y * $u) - $node / 2), $node, $node
        $g.FillRectangle($fill, $rect); $g.DrawRectangle($edge, $rect.X, $rect.Y, $rect.Width, $rect.Height)
    } }
    $g.Dispose()
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    , $ms.ToArray()
}

$images = $sizes | ForEach-Object { , (New-Png $_) }
$out = New-Object IO.MemoryStream
$w = New-Object IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i]
    $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s }))); $w.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))
    $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
    $w.Write([uint32]$images[$i].Length); $w.Write([uint32]$offset)
    $offset += $images[$i].Length
}
foreach ($img in $images) { $w.Write($img) }
$w.Flush()
[IO.File]::WriteAllBytes((Join-Path $PSScriptRoot 'kinship-atlas.ico'), $out.ToArray())
Write-Host 'Wrote kinship-atlas.ico'
