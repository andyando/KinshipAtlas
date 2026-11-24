# Moves the remaining application files (loose app files + the app's own
# directories) out of the media library into the stash folder, then removes the
# empty folders. App-data files (kinship-selections.json, primary-data.js) are
# copied to the stash and deleted — the app rewrites them when it runs.
$lib = 'G:\Kinship Atlas - Copy\tree-app\Primary Media Library\Ancestry_01112026_media'
$src = 'G:\Kinship Atlas - Copy\tree-app'
$stash = 'G:\Kinship Atlas - Copy\media-library-stash'
$moved = 0
# Loose files that belong to the app (or the app's data), not to any person.
foreach ($f in [System.IO.Directory]::GetFiles($lib)) {
    $name = [System.IO.Path]::GetFileName($f)
    if ($name -ieq 'kinship-selections.json' -or $name -ieq 'primary-data.js') {
        New-Item -ItemType Directory -Force -Path (Join-Path $stash 'app-data') | Out-Null
        Copy-Item -LiteralPath $f -Destination (Join-Path $stash "app-data\$name") -Force
        Remove-Item -LiteralPath $f -Force
        $moved++
        continue
    }
    # Any other loose file is app code if the app has the same-named file.
    if (Test-Path -LiteralPath (Join-Path $src $name)) {
        New-Item -ItemType Directory -Force -Path (Join-Path $stash 'loose') | Out-Null
        Move-Item -LiteralPath $f -Destination (Join-Path $stash "loose\$name") -Force
        $moved++
    }
}
# Remaining top-level directories that are app folders.
foreach ($t in 'tree-app', 'src', 'launcher', 'vendor', 'models', 'docs', 'flags', 'installer', 'tests', 'data', 'helpers', 'tools', 'backups') {
    $from = Join-Path $lib $t
    if (-not (Test-Path -LiteralPath $from)) { continue }
    foreach ($f in (Get-ChildItem -LiteralPath $from -Recurse -File)) {
        $rel = $f.FullName.Substring($from.Length + 1)
        $dest = Join-Path $stash (Join-Path $t $rel)
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        Move-Item -LiteralPath $f.FullName -Destination $dest -Force
        $moved++
    }
    Get-ChildItem -LiteralPath $from -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending | Remove-Item -Force
    Remove-Item -LiteralPath $from -Force
}
# Empty top-level folders (person folders the bug created) go.
$empty = 0
foreach ($d in [System.IO.Directory]::GetDirectories($lib)) {
    $name = [System.IO.Path]::GetFileName($d)
    if ($name -eq 'Archive') { continue }
    if ([System.IO.Directory]::GetFileSystemEntries($d).Count -eq 0) {
        Remove-Item -LiteralPath $d -Force
        $empty++
    }
}
Write-Output "moved=$moved emptyFoldersRemoved=$empty"
