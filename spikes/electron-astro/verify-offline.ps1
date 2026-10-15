# V-03：用 pnpm 12 原生 exe 做同盘离线安装并 build。失败时退出码非 0。
$ErrorActionPreference = 'Stop'
$pnpm = Join-Path $env:TEMP 'pnpm12-exe\unpacked\package\pnpm.exe'
$src = 'F:\XiaoBlog\spikes\electron-astro\site'
$archive = 'F:\xiao-pnpm12-fetch.tgz'
if (-not (Test-Path $pnpm)) { throw "缺少 $pnpm" }
if (-not (Test-Path $archive)) {
  & "$env:SystemRoot\System32\tar.exe" -czf $archive -C 'F:\' 'xiao-pnpm12-fetch'
  if ($LASTEXITCODE -ne 0) { throw "压缩离线仓库失败" }
}

$cases = @(
  @{ Name = 'c'; Site = 'C:\xiao-offline-site'; Disk = 'C:\' },
  @{ Name = 'd'; Site = 'D:\xiao-offline-site'; Disk = 'D:\' },
  @{ Name = 'zh'; Site = 'C:\xiao-离线站点'; Disk = 'C:\' }
)

function Copy-Site([string]$dest) {
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  & robocopy $src $dest /E /XD node_modules dist .astro /NFL /NDL /NJH /NJS /NC /NS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy 失败：$dest" }
  $global:LASTEXITCODE = 0
}

function Measure-Tree([string]$path) {
  $files = @(Get-ChildItem $path -Recurse -File -Force -ErrorAction SilentlyContinue)
  $sum = [int64]0
  foreach ($file in $files) { $sum += $file.Length }
  return "$($files.Count) files $sum bytes"
}

$env:HTTP_PROXY = 'http://127.0.0.1:9'
$env:HTTPS_PROXY = 'http://127.0.0.1:9'
$env:ALL_PROXY = 'http://127.0.0.1:9'
$env:http_proxy = $env:HTTP_PROXY
$env:https_proxy = $env:HTTPS_PROXY
$env:ASTRO_TELEMETRY_DISABLED = '1'

$stores = @{}
try {
  foreach ($disk in @('C:\', 'D:\')) {
    $storeParent = $disk
    if (Test-Path (Join-Path $storeParent 'xiao-pnpm12-fetch')) {
      Remove-Item (Join-Path $storeParent 'xiao-pnpm12-fetch') -Recurse -Force
    }
    & "$env:SystemRoot\System32\tar.exe" -xzf $archive -C $storeParent
    if ($LASTEXITCODE -ne 0) { throw "解压失败：$disk" }
    $stores[$disk] = Join-Path $storeParent 'xiao-pnpm12-fetch'
    Write-Output "STORE $disk $(Measure-Tree $stores[$disk])"
  }

  foreach ($case in $cases) {
    Write-Output "SETUP $($case.Name) $($case.Site)"
    Copy-Site $case.Site
    $store = $stores[$case.Disk]
    Push-Location $case.Site
    try {
      $sw = [Diagnostics.Stopwatch]::StartNew()
      & $pnpm install --offline --frozen-lockfile --ignore-workspace --store-dir $store
      if ($LASTEXITCODE -ne 0) { throw "offline install 失败：$($case.Site)" }
      $sw.Stop()
      Write-Output "INSTALL_MS $($case.Name) $($sw.ElapsedMilliseconds)"
      $sample = Get-ChildItem 'node_modules\.pnpm' -Recurse -File -Filter 'package.json' | Select-Object -First 1
      $links = @(& fsutil.exe hardlink list $sample.FullName)
      Write-Output "HARDLINKS $($case.Name) $($links.Count)"
      Write-Output "NODE_MODULES $($case.Name) $(Measure-Tree 'node_modules')"
      $sw.Restart()
      & $pnpm exec astro build
      if ($LASTEXITCODE -ne 0) { throw "build 失败：$($case.Site)" }
      $sw.Stop()
      Write-Output "BUILD_MS $($case.Name) $($sw.ElapsedMilliseconds)"
      $html = Get-Content 'dist\index.html' -Raw
      if (-not $html.Contains('srcset')) { throw "产物没有 srcset：$($case.Site)" }
    } finally {
      Pop-Location
    }
  }
  $archiveItem = Get-Item $archive
  Write-Output "ARCHIVE_BYTES $($archiveItem.Length)"
  Write-Output 'V03_OK'
} finally {
  foreach ($case in $cases) {
    if (Test-Path $case.Site) { Remove-Item $case.Site -Recurse -Force -ErrorAction SilentlyContinue }
  }
  foreach ($disk in @('C:\', 'D:\')) {
    $fetched = Join-Path $disk 'xiao-pnpm12-fetch'
    if (Test-Path $fetched) { Remove-Item $fetched -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
