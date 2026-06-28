param(
    [string]$OutputPath = "public/branding/phaseforge-google-play-feature.png"
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$backgroundPath = Join-Path $root "public/login-bg.png"
$logoPath = Join-Path $root "public/branding/phaseforge-horizontal-lockup.png"
$resolvedOutput = Join-Path $root $OutputPath

$background = [System.Drawing.Image]::FromFile($backgroundPath)
$logo = [System.Drawing.Image]::FromFile($logoPath)
$canvas = New-Object System.Drawing.Bitmap 1024, 500, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)

try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $targetRatio = 1024.0 / 500.0
    $sourceRatio = $background.Width / [double]$background.Height

    if ($sourceRatio -gt $targetRatio) {
        $cropHeight = $background.Height
        $cropWidth = [int]($cropHeight * $targetRatio)
        $cropX = [int](($background.Width - $cropWidth) / 2)
        $cropY = 0
    } else {
        $cropWidth = $background.Width
        $cropHeight = [int]($cropWidth / $targetRatio)
        $cropX = 0
        $cropY = [int](($background.Height - $cropHeight) / 2)
    }

    $destination = New-Object System.Drawing.Rectangle 0, 0, 1024, 500
    $source = New-Object System.Drawing.Rectangle $cropX, $cropY, $cropWidth, $cropHeight
    $graphics.DrawImage($background, $destination, $source, [System.Drawing.GraphicsUnit]::Pixel)

    $shade = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $destination,
        [System.Drawing.Color]::FromArgb(145, 10, 13, 16),
        [System.Drawing.Color]::FromArgb(85, 30, 13, 3),
        0.0
    )
    $graphics.FillRectangle($shade, $destination)
    $shade.Dispose()

    $logoWidth = 690
    $logoHeight = [int]($logo.Height * ($logoWidth / [double]$logo.Width))
    $logoX = [int]((1024 - $logoWidth) / 2)
    $logoY = 127
    $graphics.DrawImage($logo, $logoX, $logoY, $logoWidth, $logoHeight)

    $accent = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235, 238, 137, 22))
    $graphics.FillRectangle($accent, 272, 356, 480, 3)
    $accent.Dispose()

    $font = New-Object System.Drawing.Font "Segoe UI Semibold", 19, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(242, 244, 239, 230))
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $format.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
    $textRect = New-Object System.Drawing.RectangleF 212, 372, 600, 38
    $graphics.DrawString("Projects  |  Scheduling  |  Dispatch", $font, $textBrush, $textRect, $format)

    $format.Dispose()
    $textBrush.Dispose()
    $font.Dispose()

    $outputDirectory = Split-Path -Parent $resolvedOutput
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $canvas.Save($resolvedOutput, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $canvas.Dispose()
    $logo.Dispose()
    $background.Dispose()
}

Write-Output $resolvedOutput
