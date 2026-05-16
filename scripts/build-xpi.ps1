$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root "dist"
$package = Get-Content (Join-Path $root "package.json") | ConvertFrom-Json
$xpi = Join-Path $dist "paper-viewer-$($package.version).xpi"

New-Item -ItemType Directory -Force -Path $dist | Out-Null

if (Test-Path $xpi) {
  Remove-Item -Force $xpi
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$archive = [System.IO.Compression.ZipFile]::Open($xpi, [System.IO.Compression.ZipArchiveMode]::Create)

try {
  $files = @(
    @{ Source = Join-Path $root "manifest.json"; Entry = "manifest.json" },
    @{ Source = Join-Path $root "bootstrap.js"; Entry = "bootstrap.js" },
    @{ Source = Join-Path $root "content\paperFeed.js"; Entry = "content/paperFeed.js" }
  )

  foreach ($file in $files) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $file.Source,
      $file.Entry,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
}
finally {
  $archive.Dispose()
}

Write-Host "Built $xpi"
