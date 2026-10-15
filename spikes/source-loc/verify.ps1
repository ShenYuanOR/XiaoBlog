# V-07：dev 点选偏移、HMR、嵌套 slot、生产构建无标记。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:ASTRO_TELEMETRY_DISABLED = '1'
Set-Location $root

function Read-Loc([string]$html, [string]$pattern) {
  $match = [regex]::Match($html, $pattern)
  if (-not $match.Success) { throw "没有匹配 $pattern" }
  return $match.Groups[1].Value
}

function Assert-PointsAt([string]$loc, [string]$prefix) {
  $split = $loc.LastIndexOf(':')
  if ($split -lt 1) { throw "偏移格式不对：$loc" }
  $file = $loc.Substring(0, $split)
  $offset = [int]$loc.Substring($split + 1)
  $full = Join-Path $root ($file -replace '/', '\')
  $text = [System.IO.File]::ReadAllText($full)
  $slice = $text.Substring($offset, [Math]::Min($prefix.Length, $text.Length - $offset))
  if ($slice -ne $prefix) { throw "$loc 指向 $slice ，期望 $prefix" }
}

$page = Join-Path $root 'src\pages\index.astro'
$original = [System.IO.File]::ReadAllText($page)
$log = Join-Path $root '.dev.log'
if (Test-Path $log) { Remove-Item $log -Force }
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = $env:ComSpec
$psi.Arguments = '/d /s /c pnpm exec astro dev --host 127.0.0.1 --port 4477'
$psi.WorkingDirectory = $root
$psi.UseShellExecute = $false
$dev = [System.Diagnostics.Process]::Start($psi)
try {
  $html = $null
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    if ($dev.HasExited) { throw "dev 提前退出 $($dev.ExitCode)" }
    try {
      $html = (Invoke-WebRequest -Uri 'http://127.0.0.1:4477/' -UseBasicParsing).Content
      if ($html.Contains('data-xiao-loc')) { break }
    } catch {
      $html = $null
    }
    Start-Sleep -Milliseconds 400
  }
  if (-not $html -or -not $html.Contains('data-xiao-loc')) { throw 'dev 页面没有 data-xiao-loc' }
  $orderPath = Join-Path $root '.xiao-loc-order.json'
  if (-not (Test-Path $orderPath)) { throw '没有插件顺序记录' }
  $order = Get-Content $orderPath -Raw | ConvertFrom-Json
  if ($order.strategy -ne 'load') { throw "注入策略不是 load：$($order | ConvertTo-Json -Compress)" }
  if ($order.transformBeforeAstro) { throw '用户插件居然排在 astro:build 前面，和实测前提不一致' }
  $card = Read-Loc $html 'class="card"[^>]*data-xiao-loc="([^"]+)"|data-xiao-loc="([^"]+)"[^>]*class="card"'
  if (-not $card) {
    $cardMatch = [regex]::Match($html, 'data-xiao-loc="([^"]+)"[^>]*class="card"|class="card"[^>]*data-xiao-loc="([^"]+)"')
    $card = if ($cardMatch.Groups[1].Value) { $cardMatch.Groups[1].Value } else { $cardMatch.Groups[2].Value }
  }
  if (-not $card) { throw '卡片没有 data-xiao-loc' }
  Assert-PointsAt $card '<Card'
  $innerMatch = [regex]::Match($html, 'id="inner"[^>]*data-xiao-loc="([^"]+)"|data-xiao-loc="([^"]+)"[^>]*id="inner"')
  $inner = if ($innerMatch.Groups[1].Value) { $innerMatch.Groups[1].Value } else { $innerMatch.Groups[2].Value }
  if (-not $inner) { throw '槽内段落没有 data-xiao-loc' }
  Assert-PointsAt $inner '<p'
  $shellMatch = [regex]::Match($html, 'class="shell"[^>]*data-xiao-loc="([^"]+)"|data-xiao-loc="([^"]+)"[^>]*class="shell"')
  $shell = if ($shellMatch.Groups[1].Value) { $shellMatch.Groups[1].Value } else { $shellMatch.Groups[2].Value }
  if (-not $shell) { throw '布局外壳没有 data-xiao-loc' }
  Assert-PointsAt $shell '<Layout'
  $beforeOffset = [int]($card.Substring($card.LastIndexOf(':') + 1))
  $shifted = $original.Replace('<Layout>', "<!--shift-->`n<Layout>")
  [System.IO.File]::WriteAllText($page, $shifted)
  $updated = $false
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $again = (Invoke-WebRequest -Uri 'http://127.0.0.1:4477/' -UseBasicParsing).Content
    $againMatch = [regex]::Match($again, 'data-xiao-loc="([^"]+)"[^>]*class="card"|class="card"[^>]*data-xiao-loc="([^"]+)"')
    $againLoc = if ($againMatch.Groups[1].Value) { $againMatch.Groups[1].Value } else { $againMatch.Groups[2].Value }
    if ($againLoc) {
      $againOffset = [int]($againLoc.Substring($againLoc.LastIndexOf(':') + 1))
      if ($againOffset -ne $beforeOffset) {
        Assert-PointsAt $againLoc '<Card'
        $updated = $true
        break
      }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $updated) { throw 'HMR 后偏移没有更新' }
  Write-Output 'DEV_OK'
} finally {
  [System.IO.File]::WriteAllText($page, $original)
  if ($dev -and -not $dev.HasExited) {
    & taskkill.exe /pid $dev.Id /T /F | Out-Null
  }
}

pnpm exec astro build
if ($LASTEXITCODE -ne 0) { throw 'build 失败' }
$dist = Join-Path $root 'dist'
$hits = @(Get-ChildItem $dist -Recurse -File | Select-String -Pattern 'data-xiao-loc|data-astro-source')
if ($hits.Count -ne 0) { throw "生产构建仍有标记：$($hits.Count)" }
Write-Output 'BUILD_OK'
Write-Output 'V07_OK'
