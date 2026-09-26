# BrightCampus — Android

A thin Android shell around the mobile app the web server already serves at
`/app` (parents, teachers and students pick who they are there). The phone
loads it from the server, so the app is always the version on the server;
nothing is duplicated here.

## The server address

Asked on the phone, not built in. The first screen (`www/index.html`, bundled
in the APK) asks for the server's address, checks it answers, remembers it and
opens `<address>/app`. If it can't reach the saved server it says so and lets
the address be changed; "Change server" at the bottom of the app's front page
does the same. So one APK works on any network, and a new IP never needs a
rebuild.

For a server on your computer, the address is the computer's Wi-Fi IPv4 (from
`ipconfig`) and port 3100, e.g. `10.181.21.10:3100`. The phone must be on the
same Wi-Fi, the web app must be running with `npx next start -p 3100 -H 0.0.0.0`,
and Windows Firewall must allow port 3100 in:

    New-NetFirewallRule -DisplayName "BrightCampus 3100" -Direction Inbound -Protocol TCP -LocalPort 3100 -Action Allow

Test in the phone's Chrome first (`http://<address>/app`): if Chrome can't
reach it, neither can the app.

Plain HTTP is allowed to any address (`res/xml/network_security_config.xml`)
because the address is typed in. Once the server is hosted over HTTPS, delete
that file and its manifest line, and drop `cleartext` from the config.

## Build

    npm install
    npx cap sync android
    cd android && gradlew.bat assembleDebug      (./gradlew on Mac/Linux)

The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Install

Uninstall any older copy first: a debug build from another computer is signed
with a different key and Android refuses to install over it ("App not
installed"). Then `adb install -r <that apk>` with USB debugging on, or copy
the file to the phone and open it.
