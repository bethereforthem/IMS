# ============================================================
# IMS — Sequential per-file commit & push script
# Processes all changed/untracked files one at a time.
# ============================================================
$ErrorActionPreference = 'Continue'
Set-Location "D:\InnovationHub\RCIMS"

$LOG = "D:\InnovationHub\RCIMS\commit_log.txt"
"[$(Get-Date -f 'HH:mm:ss')] Starting sequential commit/push for all pending files" | Tee-Object -FilePath $LOG

# ── Meaningful commit messages keyed by file path ─────────────────────────────
$MESSAGES = @{
  "mobile/lib/core/auth/auth_provider.dart"                              = "Add fullName and badgeNumber fields to AuthState with secure storage persistence"
  "mobile/lib/core/network/api_client.dart"                             = "Update API base URL to 192.168.30.223 and extend client with dashboard/alert helpers"
  "mobile/lib/core/router.dart"                                          = "Fix router recreation bug: use refreshListenable + _AuthChangeNotifier instead of ref.watch"
  "mobile/lib/features/alerts/screens/alerts_screen.dart"               = "Restyle alerts screen with dark theme and live data integration"
  "mobile/lib/features/auth/screens/login_screen.dart"                  = "Rewrite login screen with cyber animated background, boot splash, and form slide-in animation"
  "mobile/lib/features/dashboard/role_dashboard_dispatcher.dart"        = "Add VILLAGE_LEADER role to dashboard dispatcher routing"
  "mobile/lib/features/dashboard/screens/niss_dashboard.dart"           = "Connect NISS dashboard to live API: stats, alerts, and intel events"
  "mobile/lib/features/dashboard/screens/patrol_dashboard.dart"         = "Connect patrol dashboard to live API data"
  "mobile/lib/features/dashboard/screens/rcs_dashboard.dart"            = "Connect RCS dashboard to live API data"
  "mobile/lib/features/dashboard/screens/rdf_dashboard.dart"            = "Connect RDF dashboard to live API data"
  "mobile/lib/features/dashboard/screens/rib_dashboard.dart"            = "Connect RIB dashboard to live API data"
  "mobile/lib/features/dashboard/screens/rnp_dashboard.dart"            = "Connect RNP dashboard to live API data"
  "mobile/lib/features/dashboard/widgets/alert_card.dart"               = "Update alert card widget with dark theme and status indicators"
  "mobile/lib/features/dashboard/widgets/stat_tile.dart"                = "Update stat tile widget with dynamic color and icon support"
  "mobile/lib/features/div_app/screens/div_home_screen.dart"            = "Update DIV home screen layout and navigation"
  "mobile/lib/features/div_app/screens/face_scan_screen.dart"           = "Update face scan screen UI"
  "mobile/lib/features/div_app/screens/nid_manual_screen.dart"          = "Update NID manual entry screen"
  "mobile/lib/features/div_app/screens/nid_scan_screen.dart"            = "Update NID scan screen UI"
  "mobile/lib/main.dart"                                                 = "Update app title to IMS and adjust theme seed color"
  "mobile/pubspec.yaml"                                                  = "Add flutter_launcher_icons dev dependency and icon configuration"
  "web/package.json"                                                     = "Update web package dependencies"
  "web/src/app/api/v1/auth/login/route.ts"                              = "Fix login API: derive institution from role instead of missing DB column"
  "web/src/app/api/v1/partners/route.ts"                                = "Fix partners API route query"
  "database/seeds/seed_test_users.sql"                                   = "Add test users seed file with bcrypt-verified password hashes for all roles"
  "mobile/.gitignore"                                                    = "Add Flutter .gitignore for mobile project"
  "mobile/.metadata"                                                     = "Add Flutter project metadata file"
  "mobile/README.md"                                                     = "Add mobile project README"
  "mobile/analysis_options.yaml"                                        = "Add Dart analysis options configuration"
  "mobile/android/.gitignore"                                           = "Add Android .gitignore"
  "mobile/android/app/build.gradle.kts"                                 = "Configure Android app build: minSdk 21, targetSdk 34, app ID com.example.ims_mobile"
  "mobile/android/app/src/main/AndroidManifest.xml"                     = "Configure AndroidManifest: permissions (internet, camera, location, biometrics), app label IMS"
  "mobile/android/app/src/main/kotlin/com/example/ims_mobile/MainActivity.kt" = "Add Flutter MainActivity for Android"
  "mobile/android/app/src/main/res/drawable-hdpi/ic_launcher_foreground.png"   = "Add hdpi launcher foreground icon"
  "mobile/android/app/src/main/res/drawable-mdpi/ic_launcher_foreground.png"   = "Add mdpi launcher foreground icon"
  "mobile/android/app/src/main/res/drawable-v21/launch_background.xml"         = "Add Android v21 launch background drawable"
  "mobile/android/app/src/main/res/drawable-xhdpi/ic_launcher_foreground.png"  = "Add xhdpi launcher foreground icon"
  "mobile/android/app/src/main/res/drawable-xxhdpi/ic_launcher_foreground.png" = "Add xxhdpi launcher foreground icon"
  "mobile/android/app/src/main/res/drawable-xxxhdpi/ic_launcher_foreground.png"= "Add xxxhdpi launcher foreground icon"
  "mobile/android/app/src/main/res/drawable/launch_background.xml"             = "Add Android launch background drawable"
  "mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml"          = "Add adaptive icon XML for Android 8+ (API 26)"
  "mobile/android/app/src/main/res/mipmap-hdpi/ic_launcher.png"                = "Add hdpi IMS shield launcher icon (72x72)"
  "mobile/android/app/src/main/res/mipmap-mdpi/ic_launcher.png"                = "Add mdpi IMS shield launcher icon (48x48)"
  "mobile/android/app/src/main/res/mipmap-xhdpi/ic_launcher.png"               = "Add xhdpi IMS shield launcher icon (96x96)"
  "mobile/android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png"              = "Add xxhdpi IMS shield launcher icon (144x144)"
  "mobile/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png"             = "Add xxxhdpi IMS shield launcher icon (192x192)"
  "mobile/android/app/src/main/res/values-night/styles.xml"                    = "Add Android night mode styles"
  "mobile/android/app/src/main/res/values/colors.xml"                          = "Add Android colors resource including adaptive icon background"
  "mobile/android/app/src/main/res/values/styles.xml"                          = "Add Android styles resource (LaunchTheme, NormalTheme)"
  "mobile/android/app/src/profile/AndroidManifest.xml"                         = "Add Android profile manifest"
  "mobile/android/build.gradle.kts"                                            = "Add Android root build.gradle with Kotlin and AGP plugin declarations"
  "mobile/android/gradle.properties"                                           = "Add Android Gradle properties (AndroidX, Kotlin incremental off)"
  "mobile/android/gradle/wrapper/gradle-wrapper.properties"                    = "Add Gradle wrapper properties (Gradle 8.x)"
  "mobile/android/settings.gradle.kts"                                         = "Add Android settings.gradle with plugin management and Flutter SDK path"
  "mobile/assets/images/launcher_icon.png"                                     = "Add IMS shield launcher icon source PNG (1024x1024, transparent background)"
  "mobile/assets/images/launcher_icon_fg.png"                                  = "Add IMS shield adaptive foreground icon PNG (shield in safe zone)"
  "mobile/ios/.gitignore"                                                       = "Add iOS .gitignore"
  "mobile/ios/Flutter/AppFrameworkInfo.plist"                                   = "Add iOS Flutter framework info plist"
  "mobile/ios/Flutter/Debug.xcconfig"                                           = "Add iOS Flutter debug xcconfig"
  "mobile/ios/Flutter/Release.xcconfig"                                         = "Add iOS Flutter release xcconfig"
  "mobile/ios/Runner.xcodeproj/project.pbxproj"                                = "Add iOS Xcode project file"
  "mobile/ios/Runner.xcodeproj/project.xcworkspace/contents.xcworkspacedata"   = "Add iOS workspace contents"
  "mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist" = "Add iOS IDE workspace checks plist"
  "mobile/ios/Runner.xcodeproj/project.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings" = "Add iOS workspace settings"
  "mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme"         = "Add iOS Xcode scheme for Runner"
  "mobile/ios/Runner.xcworkspace/contents.xcworkspacedata"                     = "Add iOS xcworkspace contents"
  "mobile/ios/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"        = "Add iOS xcworkspace IDE checks"
  "mobile/ios/Runner.xcworkspace/xcshareddata/WorkspaceSettings.xcsettings"    = "Add iOS xcworkspace settings"
  "mobile/ios/Runner/AppDelegate.swift"                                         = "Add iOS AppDelegate for Flutter"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"         = "Add iOS app icon asset catalog contents"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png" = "Add iOS 1024x1024 app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@1x.png"     = "Add iOS 20x20@1x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@2x.png"     = "Add iOS 20x20@2x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-20x20@3x.png"     = "Add iOS 20x20@3x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@1x.png"     = "Add iOS 29x29@1x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@2x.png"     = "Add iOS 29x29@2x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-29x29@3x.png"     = "Add iOS 29x29@3x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@1x.png"     = "Add iOS 40x40@1x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@2x.png"     = "Add iOS 40x40@2x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-40x40@3x.png"     = "Add iOS 40x40@3x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@2x.png"     = "Add iOS 60x60@2x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-60x60@3x.png"     = "Add iOS 60x60@3x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@1x.png"     = "Add iOS 76x76@1x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-76x76@2x.png"     = "Add iOS 76x76@2x app icon"
  "mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png" = "Add iOS 83.5x83.5@2x app icon (iPad Pro)"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/Contents.json"           = "Add iOS launch image asset catalog contents"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage.png"         = "Add iOS launch image @1x"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@2x.png"      = "Add iOS launch image @2x"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/LaunchImage@3x.png"      = "Add iOS launch image @3x"
  "mobile/ios/Runner/Assets.xcassets/LaunchImage.imageset/README.md"               = "Add iOS launch image README"
  "mobile/ios/Runner/Base.lproj/LaunchScreen.storyboard"                           = "Add iOS launch screen storyboard"
  "mobile/ios/Runner/Base.lproj/Main.storyboard"                                   = "Add iOS main storyboard"
  "mobile/ios/Runner/Info.plist"                                                    = "Add iOS Info.plist with app permissions and configuration"
  "mobile/ios/Runner/Runner-Bridging-Header.h"                                     = "Add iOS Swift-ObjC bridging header"
  "mobile/ios/Runner/SceneDelegate.swift"                                           = "Add iOS SceneDelegate for multi-window support"
  "mobile/ios/RunnerTests/RunnerTests.swift"                                        = "Add iOS unit test stub"
  "mobile/linux/.gitignore"                                                         = "Add Linux .gitignore"
  "mobile/linux/CMakeLists.txt"                                                     = "Add Linux top-level CMakeLists"
  "mobile/linux/flutter/CMakeLists.txt"                                             = "Add Linux Flutter CMakeLists"
  "mobile/linux/flutter/generated_plugin_registrant.cc"                             = "Add Linux generated plugin registrant (C++)"
  "mobile/linux/flutter/generated_plugin_registrant.h"                              = "Add Linux generated plugin registrant header"
  "mobile/linux/flutter/generated_plugins.cmake"                                    = "Add Linux generated plugins cmake"
  "mobile/linux/runner/CMakeLists.txt"                                              = "Add Linux runner CMakeLists"
  "mobile/linux/runner/main.cc"                                                     = "Add Linux runner main entry point"
  "mobile/linux/runner/my_application.cc"                                           = "Add Linux GtkApplication implementation"
  "mobile/linux/runner/my_application.h"                                            = "Add Linux GtkApplication header"
  "mobile/macos/.gitignore"                                                         = "Add macOS .gitignore"
  "mobile/macos/Flutter/Flutter-Debug.xcconfig"                                     = "Add macOS Flutter debug xcconfig"
  "mobile/macos/Flutter/Flutter-Release.xcconfig"                                   = "Add macOS Flutter release xcconfig"
  "mobile/macos/Flutter/GeneratedPluginRegistrant.swift"                            = "Add macOS generated plugin registrant"
  "mobile/macos/Runner.xcodeproj/project.pbxproj"                                   = "Add macOS Xcode project file"
  "mobile/macos/Runner.xcodeproj/project.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist" = "Add macOS IDE workspace checks plist"
  "mobile/macos/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme"            = "Add macOS Xcode scheme"
  "mobile/macos/Runner.xcworkspace/contents.xcworkspacedata"                        = "Add macOS xcworkspace contents"
  "mobile/macos/Runner.xcworkspace/xcshareddata/IDEWorkspaceChecks.plist"           = "Add macOS xcworkspace IDE checks"
  "mobile/macos/Runner/AppDelegate.swift"                                            = "Add macOS AppDelegate"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json"            = "Add macOS app icon asset contents"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_1024.png"        = "Add macOS 1024px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_128.png"         = "Add macOS 128px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_16.png"          = "Add macOS 16px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_256.png"         = "Add macOS 256px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_32.png"          = "Add macOS 32px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_512.png"         = "Add macOS 512px app icon"
  "mobile/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_64.png"          = "Add macOS 64px app icon"
  "mobile/macos/Runner/Base.lproj/MainMenu.xib"                                     = "Add macOS main menu XIB"
  "mobile/macos/Runner/Configs/AppInfo.xcconfig"                                    = "Add macOS app info xcconfig"
  "mobile/macos/Runner/Configs/Debug.xcconfig"                                      = "Add macOS debug xcconfig"
  "mobile/macos/Runner/Configs/Release.xcconfig"                                    = "Add macOS release xcconfig"
  "mobile/macos/Runner/Configs/Warnings.xcconfig"                                   = "Add macOS warnings xcconfig"
  "mobile/macos/Runner/DebugProfile.entitlements"                                   = "Add macOS debug/profile entitlements"
  "mobile/macos/Runner/Info.plist"                                                  = "Add macOS Info.plist"
  "mobile/macos/Runner/MainFlutterWindow.swift"                                     = "Add macOS main Flutter window"
  "mobile/macos/Runner/Release.entitlements"                                        = "Add macOS release entitlements"
  "mobile/macos/RunnerTests/RunnerTests.swift"                                      = "Add macOS unit test stub"
  "mobile/test/widget_test.dart"                                                    = "Add Flutter widget test stub"
  "mobile/web/favicon.png"                                                          = "Add Flutter web favicon"
  "mobile/web/icons/Icon-192.png"                                                   = "Add Flutter web 192px PWA icon"
  "mobile/web/icons/Icon-512.png"                                                   = "Add Flutter web 512px PWA icon"
  "mobile/web/icons/Icon-maskable-192.png"                                          = "Add Flutter web 192px maskable PWA icon"
  "mobile/web/icons/Icon-maskable-512.png"                                          = "Add Flutter web 512px maskable PWA icon"
  "mobile/web/index.html"                                                           = "Add Flutter web index.html entry point"
  "mobile/web/manifest.json"                                                        = "Add Flutter web PWA manifest"
  "mobile/windows/.gitignore"                                                       = "Add Windows .gitignore"
  "mobile/windows/CMakeLists.txt"                                                   = "Add Windows top-level CMakeLists"
  "mobile/windows/flutter/CMakeLists.txt"                                           = "Add Windows Flutter CMakeLists"
  "mobile/windows/flutter/generated_plugin_registrant.cc"                           = "Add Windows generated plugin registrant (C++)"
  "mobile/windows/flutter/generated_plugin_registrant.h"                            = "Add Windows generated plugin registrant header"
  "mobile/windows/flutter/generated_plugins.cmake"                                  = "Add Windows generated plugins cmake"
  "mobile/windows/runner/CMakeLists.txt"                                            = "Add Windows runner CMakeLists"
  "mobile/windows/runner/Runner.rc"                                                 = "Add Windows resource script with version info"
  "mobile/windows/runner/flutter_window.cpp"                                        = "Add Windows Flutter window implementation"
  "mobile/windows/runner/flutter_window.h"                                          = "Add Windows Flutter window header"
  "mobile/windows/runner/main.cpp"                                                  = "Add Windows runner main entry point"
  "mobile/windows/runner/resource.h"                                                = "Add Windows resource header"
  "mobile/windows/runner/resources/app_icon.ico"                                    = "Add Windows application icon (.ico)"
  "mobile/windows/runner/runner.exe.manifest"                                       = "Add Windows executable manifest (DPI awareness)"
  "mobile/windows/runner/utils.cpp"                                                 = "Add Windows utility functions (UTF-8 conversion)"
  "mobile/windows/runner/utils.h"                                                   = "Add Windows utility functions header"
  "mobile/windows/runner/win32_window.cpp"                                          = "Add Windows Win32 window implementation"
  "mobile/windows/runner/win32_window.h"                                            = "Add Windows Win32 window header"
}

# ── Collect all pending files from git status ─────────────────────────────────
$rawLines = git status --short --untracked-files=all 2>&1
$allFiles = $rawLines | ForEach-Object {
    $line = $_.ToString()
    if ($line.Length -lt 4) { return }
    $filePath = $line.Substring(3).Trim()
    $filePath
}

$total = $allFiles.Count
"[$(Get-Date -f 'HH:mm:ss')] Found $total files to process" | Tee-Object $LOG -Append
""

$committed = 0
$skipped   = 0
$failed    = @()
$fileNum   = 0

foreach ($filePath in $allFiles) {
    $fileNum++
    $safeKey = $filePath.Replace('\','/')

    # Pick commit message
    if ($MESSAGES.ContainsKey($safeKey)) {
        $msg = $MESSAGES[$safeKey]
    } else {
        # Auto-generate from path
        $parts   = $safeKey -split '/'
        $fname   = [System.IO.Path]::GetFileNameWithoutExtension($parts[-1])
        $ext     = [System.IO.Path]::GetExtension($parts[-1])
        $area    = if ($parts.Count -gt 2) { $parts[0..($parts.Count-2)] -join '/' } else { $parts[0] }
        $msg = "Add $fname$ext to $area"
    }

    $banner = "[$fileNum/$total] $filePath"
    Write-Host $banner -ForegroundColor Cyan
    $banner | Out-File $LOG -Append

    # ── Stage ────────────────────────────────────────────────────────────────
    $addOut = git add -- $filePath 2>&1
    if ($LASTEXITCODE -ne 0) {
        $err = "  ERROR staging: $addOut"
        Write-Host $err -ForegroundColor Red
        $err | Out-File $LOG -Append
        $failed += $filePath
        continue
    }

    # Check something is actually staged
    $staged = git diff --cached --name-only 2>&1
    if (-not ($staged -match [regex]::Escape($filePath.Replace('/','[/\\]')))) {
        $warn = "  SKIP: nothing staged (already committed?)"
        Write-Host $warn -ForegroundColor Yellow
        $warn | Out-File $LOG -Append
        $skipped++
        continue
    }

    # ── Commit ───────────────────────────────────────────────────────────────
    $commitMsg = @"
$msg

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
"@
    $commitOut = git commit -m $commitMsg 2>&1
    if ($LASTEXITCODE -ne 0) {
        $err = "  ERROR committing: $commitOut"
        Write-Host $err -ForegroundColor Red
        $err | Out-File $LOG -Append
        $failed += $filePath
        git reset HEAD -- $filePath 2>&1 | Out-Null
        continue
    }
    $sha = git rev-parse --short HEAD 2>&1
    Write-Host "  Committed $sha" -ForegroundColor DarkGreen

    # ── Push (up to 3 attempts) ───────────────────────────────────────────────
    $pushed = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        $pushOut = git push origin main 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pushed = $true
            break
        }
        $pushStr = $pushOut -join ' '
        Write-Host "  Push attempt $attempt failed: $pushStr" -ForegroundColor Yellow
        if ($pushStr -match 'rejected|non-fast-forward') {
            # Remote is ahead — pull and retry
            Write-Host "  Pulling to reconcile..." -ForegroundColor Yellow
            git pull --rebase origin main 2>&1 | Out-Null
        }
        Start-Sleep -Seconds (3 * $attempt)
    }

    if ($pushed) {
        $ok = "  [OK] Pushed  [$fileNum/$total]"
        Write-Host $ok -ForegroundColor Green
        $ok | Out-File $LOG -Append
        $committed++
    } else {
        $err = "  ✗ Push FAILED after 3 attempts for: $filePath"
        Write-Host $err -ForegroundColor Red
        $err | Out-File $LOG -Append
        $failed += $filePath
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
""
$summary = @"
============================================================
SUMMARY  $(Get-Date -f 'yyyy-MM-dd HH:mm:ss')
------------------------------------------------------------
Total files found  : $total
Successfully pushed: $committed
Skipped            : $skipped
Failed             : $($failed.Count)
"@
if ($failed.Count -gt 0) {
    $summary += "`nFailed files:`n" + ($failed -join "`n")
}
$summary += "`n============================================================"
Write-Host $summary -ForegroundColor White
$summary | Out-File $LOG -Append
