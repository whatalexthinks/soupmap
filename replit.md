# Running Soupmap on Replit

- Keep the imported Vite/TypeScript app in its existing structure.
- Use Node.js 22 (the current dependencies require it).
- The **Start application** workflow runs `npm run dev` on `0.0.0.0:5000`.
- Open Preview to use the app. Run `npm test`, `npm run typecheck`, and `npm run validate` for checks.
- `npm run build` refreshes the PLATEAU catalog in soft mode, validates shop data, typechecks, and writes the production build to `dist/`.
- Post-merge setup runs `scripts/post-merge.sh` to install locked dependencies and typecheck.
- No credentials are required for the GSI map imagery and PLATEAU building mode. Google photorealistic tiles and Street View require the optional `VITE_GOOGLE_MAPS_KEY` with the relevant Google APIs enabled.
- Vite reads optional `VITE_*` settings at startup/build time. Use workspace Secrets rather than committing credentials.
