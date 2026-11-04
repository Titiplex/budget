# Mobile releases: Android / iOS

This branch adds the first mobile release scaffold with Capacitor.

It does **not** magically make the Electron runtime available on mobile. The current desktop app uses Electron IPC and Prisma/SQLite through the Electron main process. Capacitor can reuse the Vue/Vite renderer, but the desktop data layer must progressively move behind platform adapters before the mobile app is fully functional.

## What this adds

- `capacitor.config.ts` configured for the existing Vite output: `dist/renderer`.
- Mobile npm scripts for Android/iOS initialization, sync, run and build.
- A watcher script that rebuilds the Vite app and runs `cap sync` when JS/TS/Vue/CSS/assets change.
- A GitHub Actions workflow that can build an Android debug APK and, when signing secrets are configured, a release AAB.

## First install after applying the patch

Run this once after copying the files:

```bash
npm install
```

This updates `package-lock.json` with the Capacitor dependencies.

## Initialize Android

```bash
npm run mobile:init:android
```

This runs:

1. `npm run build:vite`
2. `npx cap add android` if `android/` does not exist
3. `npx cap sync android`

After reviewing the generated native project, commit the `android/` directory. Do not commit `android/.gradle/`, `android/**/build/`, or generated APK/AAB files.

## Work normally and auto-sync Android

Open one terminal for your normal development flow if needed, and one terminal for mobile sync:

```bash
npm run mobile:android:watch
```

While this is running, edits under `src/`, `assets/`, `index.html`, `vite.config.mjs`, `capacitor.config.ts`, or `package.json` trigger:

```bash
npm run build:vite
npx cap sync android
```

That means you can keep working in JS/TS/Vue and the Android native project receives updated web assets automatically.

## Open Android Studio

```bash
npm run mobile:open:android
```

## Run Android

```bash
npm run mobile:run:android
```

## Build Android locally

Debug APK:

```bash
npm run mobile:android:build
```

Release AAB:

```bash
npm run mobile:android:release
```

The release AAB requires proper Android signing configuration before it can be uploaded to Google Play.

## Initialize iOS

Requires macOS + Xcode.

```bash
npm run mobile:init:ios
```

Then open Xcode:

```bash
npm run mobile:open:ios
```

## App identifiers

Defaults:

```txt
Android/iOS app id: com.titiplex.budget
App name: Budget
Web dir: dist/renderer
```

Override them with environment variables:

```bash
CAPACITOR_APP_ID=com.example.budget CAPACITOR_APP_NAME=Budget npm run mobile:init:android
```

## Android GitHub Actions signing secrets

The workflow builds a debug APK without secrets.

For release AAB signing, configure these repository secrets:

```txt
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

Create the keystore locally:

```bash
keytool -genkeypair \
  -v \
  -keystore budget-release.keystore \
  -alias budget \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Encode it:

```bash
base64 -w 0 budget-release.keystore
```

On macOS:

```bash
base64 -i budget-release.keystore | tr -d '\n'
```

Put the output into `ANDROID_KEYSTORE_BASE64`.

## Current limitation

This is the release scaffold, not the complete mobile data port.

The next technical step is to introduce a shared repository/service interface, then implement:

- Desktop adapter: Electron IPC + Prisma.
- Mobile adapter: Capacitor + native SQLite.

Until that adapter work is done, any renderer code that calls `window.db`, `window.wealth`, `window.imports`, `window.file`, `window.secrets`, etc. will not work correctly inside the mobile WebView.
