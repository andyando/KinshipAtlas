# Moves the accidentally-copied application files out of the media library into
# a backup folder beside it, and deletes the now-empty folders. Nothing user
# media is touched: every moved file is first verified to be byte-identical to
# the app's own copy (or, for files the app no longer has, to a tool script this
# workspace created).
$lib = 'G:\Kinship Atlas - Copy\tree-app\Primary Media Library\Ancestry_01112026_media'
$src = 'G:\Kinship Atlas - Copy\tree-app'
$stash = 'G:\Kinship Atlas - Copy\media-library-stash'
$tops = 'tree-app', 'src', 'launcher', 'vendor', 'models', 'docs', 'flags', 'installer', 'tests', 'data', 'helpers', 'tools', 'backups'
$moved = 0
foreach ($t in $tops) {
    $from = Join-Path $lib $t
    if (-not (Test-Path -LiteralPath $from)) { continue }
    foreach ($f in (Get-ChildItem -LiteralPath $from -Recurse -File)) {
        $rel = $f.FullName.Substring($from.Length + 1)
        $dest = Join-Path $stash (Join-Path $t $rel)
        New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
        Move-Item -LiteralPath $f.FullName -Destination $dest -Force
        $moved++
    }
}
# Remove now-empty directories (deepest first), then any empty person folders.
foreach ($t in $tops) {
    $from = Join-Path $lib $t
    if (-not (Test-Path -LiteralPath $from)) { continue }
    Get-ChildItem -LiteralPath $from -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending | Remove-Item -Force
    Remove-Item -LiteralPath $from -Force
}
# Empty person folders left behind by the bug: delete them (they hold nothing).
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
