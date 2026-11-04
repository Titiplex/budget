# Mobile bootstrap patch

Apply this zip on top of the `master` branch.

## Modified files

- `.gitignore`
- `package.json`

## Added files

- `capacitor.config.ts`
- `scripts/mobile-init.cjs`
- `scripts/mobile-sync.cjs`
- `scripts/mobile-watch.cjs`
- `docs/mobile-releases.md`
- `.github/workflows/android-mobile.yml`

## First commands

```bash
npm install
npm run mobile:init:android
npm run mobile:android:watch
```

`npm install` is intentionally required because this patch changes `package.json`. Commit the updated `package-lock.json` after installation.
