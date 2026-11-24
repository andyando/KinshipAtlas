$lib = 'G:\Kinship Atlas - Copy\tree-app\Primary Media Library\Ancestry_01112026_media'
$out = 'G:\Git\Kinship_Experimental\tree-app\tools\analysis\restore-log.txt'
$log = @()
$allDirs = [System.IO.Directory]::GetDirectories($lib)
$bad = @($allDirs | Where-Object { $_ -match 'unknown-unknown' })
$log += "bad folders: $($bad.Count)"
# Build the lookup of good folders once, keyed by the [Ixxxx] id.
$goodBySuffix = @{}
foreach ($d in $allDirs) {
    if ($d -match 'unknown-unknown') { continue }
    if ($d -match '\[([^\]]+)\]\s*$') {
        $suffix = $Matches[1]
        if (-not $goodBySuffix.ContainsKey($suffix)) { $goodBySuffix[$suffix] = @() }
        $goodBySuffix[$suffix] += $d
    }
}
$moved = 0
$dedup = 0
$clash = 0
$noMatch = 0
foreach ($src in $bad) {
    $files = [System.IO.Directory]::GetFiles($src)
    if ($files.Count -eq 0) { continue }
    $id = [regex]::Match($src, '\[([^\]]+)\]\s*$').Groups[1].Value
    $candidates = @($goodBySuffix[$id] | Where-Object { $_ -notmatch 'unknown-unknown' })
    if ($candidates.Count -ne 1) { $log += "NO MATCH ($($candidates.Count)): $(Split-Path $src -Leaf)"; $noMatch++; continue }
    $target = $candidates[0]
    foreach ($f in $files) {
        $name = [System.IO.Path]::GetFileName($f)
        $dest = Join-Path $target $name
        if ([System.IO.File]::Exists($dest)) {
            $a = (Get-Item -LiteralPath $f).Length
            $b = (Get-Item -LiteralPath $dest).Length
            if ($a -eq $b) {
                Remove-Item -LiteralPath $f -Force
                $dedup++
                $log += "DEDUP removed: $(Split-Path $src -Leaf)\$name"
            } else {
                $clash++
                $log += "CLASH kept both: $(Split-Path $src -Leaf)\$name"
            }
        } else {
            Move-Item -LiteralPath $f -Destination $dest
            $moved++
        }
    }
}
# Remove every bad folder that is now empty.
$removed = 0
foreach ($src in $bad) {
    if ([System.IO.Directory]::GetFileSystemEntries($src).Count -eq 0) {
        Remove-Item -LiteralPath $src -Force
        $removed++
    }
}
$remaining = @([System.IO.Directory]::GetDirectories($lib) | Where-Object { $_ -match 'unknown-unknown' }).Count
$log += "MOVED: $moved  DEDUP: $dedup  CLASHES: $clash  NOMATCH: $noMatch  FOLDERS REMOVED: $removed  bad folders remaining: $remaining"
$log | Set-Content $out
Write-Output "DONE. moved=$moved dedup=$dedup clash=$clash noMatch=$noMatch removed=$removed remaining=$remaining"
