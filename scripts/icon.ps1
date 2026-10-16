Add-Type -AssemblyName System.Drawing
$taskSource = [System.Drawing.Image]::FromFile((Join-Path $PSScriptRoot '../public/logo.png'))
$taskBitmap = New-Object System.Drawing.Bitmap 256,256
$taskGraphics = [System.Drawing.Graphics]::FromImage($taskBitmap)
$taskGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$taskWidth = [int](256 * $taskSource.Width / $taskSource.Height)
$taskGraphics.DrawImage($taskSource,[int]((256-$taskWidth)/2),0,$taskWidth,256)
$taskPng = Join-Path $PSScriptRoot '../public/icon256.png'
$taskBitmap.Save($taskPng,[System.Drawing.Imaging.ImageFormat]::Png)
$taskGraphics.Dispose()
$taskBitmap.Dispose()
$taskSource.Dispose()
$taskBytes = [System.IO.File]::ReadAllBytes($taskPng)
$taskHeader = New-Object byte[] 22
[System.BitConverter]::GetBytes([uint16]1).CopyTo($taskHeader,2)
[System.BitConverter]::GetBytes([uint16]1).CopyTo($taskHeader,4)
[System.BitConverter]::GetBytes([uint16]1).CopyTo($taskHeader,10)
[System.BitConverter]::GetBytes([uint16]32).CopyTo($taskHeader,12)
[System.BitConverter]::GetBytes([uint32]$taskBytes.Length).CopyTo($taskHeader,14)
[System.BitConverter]::GetBytes([uint32]22).CopyTo($taskHeader,18)
[System.IO.File]::WriteAllBytes((Join-Path $PSScriptRoot '../public/icon.ico'),($taskHeader + $taskBytes))
