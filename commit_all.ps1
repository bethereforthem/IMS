# IMS — Sequential per-file commit and push (fixed)
$ErrorActionPreference = 'Continue'
Set-Location "D:\InnovationHub\RCIMS"

$LOG = "D:\InnovationHub\RCIMS\commit_log.txt"
"[$(Get-Date -f 'HH:mm:ss')] Starting sequential commit/push" | Out-File $LOG

$MESSAGES = @{
  "commit_log.txt"                                                               = "Update commit progress log"
  "database/seeds/seed_test_users.sql"                                           = "Add test users seed with bcrypt hashes for all roles (password: IMS@Sample2026!)"
  "mobile/.gitignore"                                                            = "Add Flutter mobile .gitignore"
  "mobile/.metadata"                                                             = "Add Flutter project metadata"
  "mobile/README.md"                                                             = "Add mobile project README"
  "mobile/analysis_options.yaml"                                                 = "Add Dart analysis options"
  "mobile/android/.gitignore"                                                    = "Add Android .gitignore"
  "mobile/android/app/build.gradle.kts"                                          = "Configure Android app build: minSdk 21, targetSdk 34"
  "mobile/android/app/src/main/AndroidManifest.xml"                              = "Set app label to IMS and declare all required permissions"
  "mobile/android/app/src/main/kotlin/com/example/ims_mobile/MainActivity.kt"   = "Add Flutter Android MainActivity"
  "mobile/android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png"    = "Add hdpi adaptive icon foreground"
  "mobile/android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png"    = "Add mdpi adaptive icon foreground"
  "mobile/android/app/src/main/res/drawable-v21/launch_background.xml"          = "Add Android v21 launch background"
  "mobile/android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png"   = "Add xhdpi adaptive icon foreground"
  "mobile/android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png"  = "Add xxhdpi adaptive icon foreground"
  "mobile/android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png" = "Add xxxhdpi adaptive icon foreground"
  "mobile/android/app/src/main/res/drawable/launch_background.xml"              = "Add Android launch background drawable"
  "mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"           = "Add adaptive icon XML for Android 8+ API 26"
  "mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png"                 = "Add hdpi IMS shield launcher icon 72x72"
  "mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png"                 = "Add mdpi IMS shield launcher icon 48x48"
  "mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png"                = "Add xhdpi IMS shield launcher icon 96x96"
  "mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png"               = "Add xxhdpi IMS shield launcher icon 144x144"
  "mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"              = "Add xxxhdpi IMS shield launcher icon 192x192"
  "mobile/android/app/src/main/res/values-night/styles.xml"                     = "Add Android night mode styles"
  "mobile/android/app/src/main/res/values/colors.xml"                           = "Add Android colors including adaptive icon background #052e16"
  "mobile/android/app/src/main/res/values/styles.xml"                           = "Add Android LaunchTheme and NormalTheme styles"
  "mobile/android/app/src/profile/AndroidManifest.xml"                          = "Add Android profile build manifest"
  "mobile/android/build.gradle.kts"                                              = "Add Android root build.gradle with AGP and Kotlin plugins"
  "mobile/android/gradle.properties"                                             = "Add Android Gradle properties with AndroidX and Kotlin flags"
  "mobile/android/gradle/wrapper/gradle-wrapper.properties"                     = "Add Gradle wrapper configuration"
  "mobile/android/settings.gradle.kts"                                           = "Add Android settings.gradle with Flutter SDK plugin management"
  "mobile/assets/images/launcher_icon.png"                                       = "Add IMS shield launcher icon source PNG 1024x1024 transparent"
  "mobile/assets/images/launcher_icon_fg.png"                                    = "Add IMS shield adaptive foreground icon PNG safe-zone sized"
  "mobile/ios/.gitignore"                                                        = "Add iOS .gitignore"
  "mobile/ios/Flutter/AppFrameworkInfo.plist"                                    = "Add iOS Flutter framework info plist"
  "mobile/ios/Flutter/Debug.xcconfig"                                            = "Add iOS Flutter debug xcconfig"
  "mobile/ios/Flutter/Release.xcconfig"                                          = "Add iOS Flutter release xcconfig"
  "mobile/ios/Runner.xcodeproj/project.pbxproj"                                  = "Add iOS Xcode project file"
  "mobile/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata"    = "Add iOS xcworkspace contents"
  "mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"    = "Add iOS IDE workspace checks plist"
  "mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings" = "Add iOS workspace settings"
  "mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme"          = "Add iOS Xcode Runner scheme"
  "mobile/ios/Runner.xcworkspace/contents.xcworkspacedata"                      = "Add iOS Runner xcworkspace contents"
  "mobile/ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"         = "Add iOS Runner xcworkspace IDE checks"
  "mobile/ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings"     = "Add iOS Runner xcworkspace settings"
  "mobile/ios/Runner/AppDelegate.swift"                                          = "Add iOS AppDelegate for Flutter"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"          = "Add iOS app icon asset catalog"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png" = "Add iOS 1024x1024 app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png"  = "Add iOS 20pt@1x notification icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png"  = "Add iOS 20pt@2x notification icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png"  = "Add iOS 20pt@3x notification icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png"  = "Add iOS 29pt@1x settings icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png"  = "Add iOS 29pt@2x settings icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png"  = "Add iOS 29pt@3x settings icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png"  = "Add iOS 40pt@1x spotlight icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png"  = "Add iOS 40pt@2x spotlight icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png"  = "Add iOS 40pt@3x spotlight icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png"  = "Add iOS 60pt@2x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png"  = "Add iOS 60pt@3x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png"  = "Add iOS 76pt@1x iPad icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png"  = "Add iOS 76pt@2x iPad icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png" = "Add iOS 83.5pt@2x iPad Pro icon"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/Contents.json"        = "Add iOS launch image asset catalog"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png"      = "Add iOS launch image 1x"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png"   = "Add iOS launch image 2x"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png"   = "Add iOS launch image 3x"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md"            = "Add iOS launch image README"
  "mobile/ios/Runner/Base.lproj/LaunchScreen.storyboard"                        = "Add iOS launch screen storyboard"
  "mobile/ios/Runner/Base.lproj/Main.storyboard"                                = "Add iOS main storyboard"
  "mobile/ios/Runner/Info.plist"                                                 = "Add iOS Info.plist with camera and location usage descriptions"
  "mobile/ios/Runner/Runner-Bridging-Header.h"                                   = "Add iOS Swift-ObjC bridging header"
  "mobile/ios/Runner/SceneDelegate.swift"                                        = "Add iOS SceneDelegate"
  "mobile/ios/RunnerTests/RunnerTests.swift"                                     = "Add iOS unit test stub"
  "mobile/linux/.gitignore"                                                      = "Add Linux .gitignore"
  "mobile/linux/CMakeLists.txt"                                                  = "Add Linux top-level CMakeLists"
  "mobile/linux/flutter/CMakeLists.txt"                                          = "Add Linux Flutter CMakeLists"
  "mobile/linux/flutter/generated_plugin_registrant.cc"                          = "Add Linux generated plugin registrant cpp"
  "mobile/linux/flutter/generated_plugin_registrant.h"                           = "Add Linux generated plugin registrant header"
  "mobile/linux/flutter/generated_plugins.cmake"                                 = "Add Linux generated plugins cmake"
  "mobile/linux/runner/CMakeLists.txt"                                           = "Add Linux runner CMakeLists"
  "mobile/linux/runner/main.cc"                                                  = "Add Linux runner main entry point"
  "mobile/linux/runner/my_application.cc"                                        = "Add Linux GtkApplication implementation"
  "mobile/linux/runner/my_application.h"                                         = "Add Linux GtkApplication header"
  "mobile/macos/.gitignore"                                                      = "Add macOS .gitignore"
  "mobile/macos/Flutter/Flutter-Debug.xcconfig"                                  = "Add macOS Flutter debug xcconfig"
  "mobile/macos/Flutter/Flutter-Release.xcconfig"                                = "Add macOS Flutter release xcconfig"
  "mobile/macos/Flutter/GeneratedPluginRegistrant.swift"                         = "Add macOS generated plugin registrant Swift"
  "mobile/macos/Runner.xcodeproj/project.pbxproj"                                = "Add macOS Xcode project file"
  "mobile/macos/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist" = "Add macOS IDE workspace checks"
  "mobile/macos/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme"        = "Add macOS Xcode Runner scheme"
  "mobile/macos/Runner.xcworkspace/contents.xcworkspacedata"                    = "Add macOS xcworkspace contents"
  "mobile/macos/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"       = "Add macOS xcworkspace IDE checks"
  "mobile/macos/Runner/AppDelegate.swift"                                        = "Add macOS AppDelegate"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"        = "Add macOS app icon asset catalog"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_1024.png"    = "Add macOS 1024px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_128.png"     = "Add macOS 128px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_16.png"      = "Add macOS 16px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_256.png"     = "Add macOS 256px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_32.png"      = "Add macOS 32px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_512.png"     = "Add macOS 512px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_64.png"      = "Add macOS 64px app icon"
  "mobile/macos/Runner/Base.lproj/MainMenu.xib"                                  = "Add macOS main menu XIB"
  "mobile/macos/Runner/Configs/AppInfo.xcconfig"                                 = "Add macOS app info xcconfig"
  "mobile/macos/Runner/Configs/Debug.xcconfig"                                   = "Add macOS debug build xcconfig"
  "mobile/macos/Runner/Configs/Release.xcconfig"                                 = "Add macOS release build xcconfig"
  "mobile/macos/Runner/Configs/Warnings.xcconfig"                                = "Add macOS compiler warnings xcconfig"
  "mobile/macos/Runner/DebugProfile.entitlements"                                = "Add macOS debug and profile entitlements"
  "mobile/macos/Runner/Info.plist"                                               = "Add macOS Info.plist"
  "mobile/macos/Runner/MainFlutterWindow.swift"                                  = "Add macOS main Flutter window Swift"
  "mobile/macos/Runner/Release.entitlements"                                     = "Add macOS release entitlements"
  "mobile/macos/RunnerTests/RunnerTests.swift"                                   = "Add macOS unit test stub"
  "mobile/test/widget_test.dart"                                                 = "Add Flutter widget test stub"
  "mobile/web/favicon.png"                                                       = "Add Flutter web favicon PNG"
  "mobile/web/icons/Icon-192.png"                                                = "Add Flutter web 192px PWA icon"
  "mobile/web/icons/Icon-512.png"                                                = "Add Flutter web 512px PWA icon"
  "mobile/web/icons/Icon-maskable-192.png"                                       = "Add Flutter web 192px maskable PWA icon"
  "mobile/web/icons/Icon-maskable-512.png"                                       = "Add Flutter web 512px maskable PWA icon"
  "mobile/web/index.html"                                                        = "Add Flutter web index.html entry point"
  "mobile/web/manifest.json"                                                     = "Add Flutter web PWA manifest"
  "mobile/windows/.gitignore"                                                    = "Add Windows .gitignore"
  "mobile/windows/CMakeLists.txt"                                                = "Add Windows top-level CMakeLists"
  "mobile/windows/flutter/CMakeLists.txt"                                        = "Add Windows Flutter CMakeLists"
  "mobile/windows/flutter/generated_plugin_registrant.cc"                        = "Add Windows generated plugin registrant cpp"
  "mobile/windows/flutter/generated_plugin_registrant.h"                         = "Add Windows generated plugin registrant header"
  "mobile/windows/flutter/generated_plugins.cmake"                               = "Add Windows generated plugins cmake"
  "mobile/windows/runner/CMakeLists.txt"                                         = "Add Windows runner CMakeLists"
  "mobile/windows/runner/Runner.rc"                                               = "Add Windows resource script with version metadata"
  "mobile/windows/runner/flutter_window.cpp"                                     = "Add Windows FlutterWindow implementation"
  "mobile/windows/runner/flutter_window.h"                                        = "Add Windows FlutterWindow header"
  "mobile/windows/runner/main.cpp"                                               = "Add Windows runner main entry point"
  "mobile/windows/runner/resource.h"                                             = "Add Windows resource header"
  "mobile/windows/runner/resources/app_icon.ico"                                 = "Add Windows application icon ICO"
  "mobile/windows/runner/runner.exe.manifest"                                    = "Add Windows executable manifest with DPI awareness"
  "mobile/windows/runner/utils.cpp"                                              = "Add Windows UTF-8 string conversion utilities"
  "mobile/windows/runner/utils.h"                                                = "Add Windows utility functions header"
  "mobile/windows/runner/win32_window.cpp"                                       = "Add Windows Win32 window class implementation"
  "mobile/windows/runner/win32_window.h"                                         = "Add Windows Win32 window class header"
}

# Get pending files
$rawLines = git status --short --untracked-files=all 2>&1
$allFiles = $rawLines | ForEach-Object {
    $line = "$_"
    if ($line.Length -lt 4) { return }
    $line.Substring(3).Trim()
}

$total     = $allFiles.Count
$committed = 0
$skipped   = 0
$failed    = @()
$num       = 0

"[$(Get-Date -f 'HH:mm:ss')] $total files to process" | Out-File $LOG -Append

foreach ($fp in $allFiles) {
    $num++
    $key = $fp.Replace('\','/')

    $msg = if ($MESSAGES.ContainsKey($key)) {
        $MESSAGES[$key]
    } else {
        $parts = $key -split '/'
        $name  = $parts[-1]
        $dir   = if ($parts.Count -gt 1) { ($parts[0..($parts.Count-2)] -join '/') } else { '.' }
        "Add $name to $dir"
    }

    Write-Host "[$num/$total] $fp" -ForegroundColor Cyan

    # Stage the file
    git add -- $fp 2>&1 | Out-Null

    # Check if anything is actually staged for this path
    git diff --cached --quiet -- $fp 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  SKIP (already up to date)" -ForegroundColor DarkGray
        "[$num/$total] SKIP $fp" | Out-File $LOG -Append
        $skipped++
        continue
    }

    # Commit
    $fullMsg = "$msg`n`nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
    $out = git commit -m $fullMsg 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  COMMIT FAILED: $out" -ForegroundColor Red
        "[$num/$total] COMMIT-FAIL $fp -- $out" | Out-File $LOG -Append
        $failed += $fp
        git restore --staged $fp 2>&1 | Out-Null
        continue
    }
    $sha = (git rev-parse --short HEAD 2>&1).ToString().Trim()
    Write-Host "  Committed $sha" -ForegroundColor DarkGreen

    # Push with retry
    $pushed = $false
    for ($try = 1; $try -le 3; $try++) {
        git push origin main 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $pushed = $true; break }
        Write-Host "  Push attempt $try failed, retrying..." -ForegroundColor Yellow
        # Pull --rebase in case remote is ahead
        git pull --rebase origin main 2>&1 | Out-Null
        Start-Sleep -Seconds (2 * $try)
    }

    if ($pushed) {
        Write-Host "  Pushed  OK  [$num/$total]" -ForegroundColor Green
        "[$num/$total] OK $sha $fp" | Out-File $LOG -Append
        $committed++
    } else {
        Write-Host "  PUSH FAILED after 3 attempts" -ForegroundColor Red
        "[$num/$total] PUSH-FAIL $fp" | Out-File $LOG -Append
        $failed += $fp
    }
}

# Summary
$summary = @"

============================================================
SUMMARY  $(Get-Date -f 'yyyy-MM-dd HH:mm:ss')
------------------------------------------------------------
Total found  : $total
Pushed       : $committed
Skipped      : $skipped
Failed       : $($failed.Count)
"@
if ($failed.Count -gt 0) {
    $summary += "`nFailed files:" + ($failed -join "`n  ")
}
$summary += "`n============================================================"
Write-Host $summary
$summary | Out-File $LOG -Append
