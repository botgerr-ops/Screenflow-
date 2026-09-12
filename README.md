# ScreenFlow Player for Android

Native Android shell for the ScreenFlow narrowcasting player.

## Test target

- Samsung Galaxy Tab A8 (SM-X200)
- Android 14 / One UI 6.1
- Landscape playback

## First run

The app registers itself with ScreenFlow and shows a six-digit pairing code. In the ScreenFlow dashboard, open **Schermen**, choose **Android-player koppelen**, enter the code and select a screen. The player then opens the assigned fullscreen playlist.

## Build

Open this directory in Android Studio, let Gradle sync, and build the `debug` APK. The debug output is written to `app/build/outputs/apk/debug/app-debug.apk`.
