# 打包后的 V-02 验收。工作目录任意。失败时退出码非 0。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root 'release\win-unpacked\XiaoSpike.exe'
$src = Join-Path $root 'site'
if (-not (Test-Path $exe)) { throw "缺少 $exe，先运行 pnpm run pack" }

$targets = @(
  @{ Name = 'space'; Path = 'F:\xiao spike site'; Cmd = 'dev' },
  @{ Name = 'zh'; Path = 'F:\xiao-spike-测试站点'; Cmd = 'build' },
  @{ Name = 'd'; Path = 'D:\xiao-spike-site'; Cmd = 'build' }
)

function Start-Spike([string[]]$argList) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $exe
  $psi.UseShellExecute = $false
  foreach ($arg in $argList) { [void]$psi.ArgumentList.Add($arg) }
  return [System.Diagnostics.Process]::Start($psi)
}

function Copy-Site([string]$dest) {
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  & robocopy $src $dest /E /XD node_modules dist .astro /NFL /NDL /NJH /NJS /NC /NS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy 失败：$LASTEXITCODE $dest" }
  $global:LASTEXITCODE = 0
}

function Install-Site([string]$dest) {
  Push-Location $dest
  try {
    pnpm install --ignore-workspace --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败：$dest" }
  } finally {
    Pop-Location
  }
}

function Assert-NoSpike {
  Start-Sleep -Seconds 2
  $left = @(Get-Process XiaoSpike -ErrorAction SilentlyContinue)
  if ($left.Count -gt 0) {
    $left | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    throw "关闭后仍有 XiaoSpike 进程：$($left.Id -join ',')"
  }
}

function Invoke-Build([string]$site, [string]$log) {
  if (Test-Path $log) { Remove-Item $log -Force }
  $p = Start-Spike @(
    '--site', $site, '--cmd', 'build', '--log-file', $log, '--exit-on-done', 'true'
  )
  if (-not $p.WaitForExit(180000)) {
    & taskkill.exe /pid $p.Id /T /F | Out-Null
    throw "build 超时：$site"
  }
  if ($p.ExitCode -ne 0) { throw "build 退出码 $($p.ExitCode)：$site" }
  $htmlPath = Join-Path $site 'dist\index.html'
  if (-not (Test-Path $htmlPath)) { throw "没有 dist/index.html：$site" }
  $html = Get-Content $htmlPath -Raw
  foreach ($token in @('srcset', '.webp', '.avif', 'BODY_MARKER')) {
    if (-not $html.Contains($token)) { throw "产物缺少 $token ：$site" }
  }
  Assert-NoSpike
  Write-Output "BUILD_OK $site"
}

function Invoke-Dev([string]$site, [string]$log, [string]$quit) {
  foreach ($file in @($log, $quit)) {
    if (Test-Path $file) { Remove-Item $file -Force }
  }
  $p = Start-Spike @(
    '--site', $site, '--cmd', 'dev', '--log-file', $log, '--quit-file', $quit
  )
  $url = $null
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if ($p.HasExited) { throw "dev 提前退出 $($p.ExitCode)：$site" }
    if (Test-Path $log) {
      $text = Get-Content $log -Raw
      $match = [regex]::Match($text, '\[spike\] preview (https?://\S+)')
      if ($match.Success) { $url = $match.Groups[1].Value.Trim(); break }
    }
    Start-Sleep -Milliseconds 500
  }
  if (-not $url) { throw "dev 未打印预览地址：$site" }
  $before = (Invoke-WebRequest -Uri $url -UseBasicParsing).Content
  if (-not $before.Contains('BODY_MARKER')) { throw "首页没有 BODY_MARKER" }
  $md = Join-Path $site 'src\content\posts\big\index.md'
  $raw = Get-Content $md -Raw
  Set-Content -Path $md -Value ($raw.Replace('BODY_MARKER', 'BODY_MARKER_EDITED')) -Encoding utf8NoBOM
  $seen = $false
  $deadline = (Get-Date).AddSeconds(40)
  while ((Get-Date) -lt $deadline) {
    $now = (Invoke-WebRequest -Uri $url -UseBasicParsing).Content
    if ($now.Contains('BODY_MARKER_EDITED')) { $seen = $true; break }
    Start-Sleep -Seconds 1
  }
  New-Item -ItemType File -Path $quit -Force | Out-Null
  if (-not $p.WaitForExit(20000)) {
    & taskkill.exe /pid $p.Id /T /F | Out-Null
    throw "dev 未能退出：$site"
  }
  Assert-NoSpike
  if (-not $seen) { throw "热更新未反映到页面：$site" }
  Write-Output "DEV_OK $url"
}

$logDir = Join-Path $root '.shim'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
try {
  foreach ($target in $targets) {
    Write-Output "SETUP $($target.Name) $($target.Path)"
    Copy-Site $target.Path
    Install-Site $target.Path
  }
  Invoke-Dev $targets[0].Path (Join-Path $logDir 'dev.log') (Join-Path $logDir 'dev.quit')
  Invoke-Build $targets[1].Path (Join-Path $logDir 'build-zh.log')
  Invoke-Build $targets[2].Path (Join-Path $logDir 'build-d.log')
  $probeLog = Join-Path $logDir 'probe.log'
  if (Test-Path $probeLog) { Remove-Item $probeLog -Force }
  $probe = Start-Spike @(
    '--site', $targets[0].Path, '--cmd', 'probe', '--log-file', $probeLog, '--exit-on-done', 'true'
  )
  if (-not $probe.WaitForExit(60000)) { throw 'probe 超时' }
  if ($probe.ExitCode -ne 0) { throw "probe 退出码 $($probe.ExitCode)" }
  $probeText = Get-Content $probeLog -Raw
  if (-not $probeText.Contains('24.21.0')) { throw 'probe 未得到 Electron 内置 Node 24.21.0' }
  if (-not $probeText.Contains('XiaoSpike.exe')) { throw 'probe 未走到 node shim' }
  Assert-NoSpike
  Write-Output 'PROBE_OK'
  Write-Output 'V02_OK'
} finally {
  foreach ($target in $targets) {
    if (Test-Path $target.Path) { Remove-Item $target.Path -Recurse -Force -ErrorAction SilentlyContinue }
  }
}
