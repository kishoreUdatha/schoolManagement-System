# BrightCampus Parent — Android

A thin Android shell around the parent app the web server already serves at
`/parent`. The phone loads it over the school's network, so the app is always
the version on the server; nothing is duplicated here.

## The address it opens

`capacitor.config.json` → `server.url`. It is this machine's Wi-Fi address
today (192.168.29.250:3100), which means the phone must be on the same
Wi-Fi. Put a real hostname there when the server is hosted, and drop
`cleartext` once it is HTTPS.

## Build

    npm install
    npx cap sync android
    cd android && ./gradlew assembleDebug

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Install

With the phone plugged in and USB debugging on: `adb install -r <that apk>`.
Otherwise copy the file to the phone and open it.
