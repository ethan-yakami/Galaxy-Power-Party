$files = Get-ChildItem -Path "src/server/*.js", "src/client/js/*.js", "src/client/*.html" -Recurse
$replacements = @{
    "ȴһλҼ롣" = "等待另一位玩家加入。"
    "ȴһλҼ뷿䡣" = "等待另一位玩家加入。"
    "绛夊緟鍙屾柟纭寮€灞€閰嶇疆" = "等待双方确认开局配置。"
    "ȴ˫ȷϿá" = "等待双方确认开局配置。"
    "测试玩家㣩" = "测试玩家"
    "㣩" = ""
    "????" = "???"
}

foreach ($f in $files) {
    Write-Host "Processing $($f.FullName)..."
    $content = [System.IO.File]::ReadAllText($f.FullName)
    $modified = $false
    foreach ($key in $replacements.Keys) {
        if ($content.Contains($key)) {
            $content = $content.Replace($key, $replacements[$key])
            $modified = $true
            Write-Host "  Fixed: $key"
        }
    }
    if ($modified) {
        [System.IO.File]::WriteAllText($f.FullName, $content, (New-Object System.Text.UTF8Encoding($false)))
    }
}
