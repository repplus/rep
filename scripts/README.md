# Packaging Scripts

Scripts to create production packages for Chrome Web Store submission.

## Usage

### macOS / Linux

```bash
npm run package
```

Or directly:
```bash
node scripts/package.js
```

### Windows (PowerShell)

```powershell
.\scripts\package.ps1
```

## What Gets Excluded

The package script automatically excludes:
- ✅ Test files (`tests/`, `*.test.js`, `*.spec.js`)
- ✅ Dev dependencies (`node_modules/`, `package.json`, `package-lock.json`)
- ✅ Build config (`vitest.config.js`)
- ✅ Git files (`.git/`, `.gitignore`)
- ✅ Documentation (`CONTRIBUTING.md`, `ARCHITECTURE_REVIEW.md`)
- ✅ Build artifacts (`dist/`, `build/`, `coverage/`)

## Output

Creates `rep-plus-extension.zip` in the project root, ready for Chrome Web Store upload.

## Build Workflow

```bash
# Run tests first, then package
npm run build

# Or separately:
npm test          # Run tests
npm run package   # Create zip
```

