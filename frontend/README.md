# Canopy: frontend

The React 19 + TypeScript + Vite UI for Canopy. See the [root README](../README.md) for the full documentation.

```powershell
npm install
npm run dev      # UI only, in a browser (native calls are mocked)
npm run build    # type-check + production build (used by `cargo tauri build`)
npm run lint
```

To run the full desktop app, use `cargo tauri dev` from `../src-tauri`.
