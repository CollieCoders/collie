### Implementation Summary (html-runtime /collie/generated)

- Updated the HTML runtime to auto-scan `[id$='-collie']` placeholders, fetch from `/collie/generated/<partial>.html`, inject content, and expose `window.CollieHtmlRuntime.refresh()` for reloading.
- Verified build + version scripts already emit `dist/temp` bundles and versioned copies; documentation/config examples now write HTML partials into `public/collie/generated` to match the runtime’s fetch path.
- TODO: `collie-convert.ts` remains a stub and still needs a proper DOM conversion implementation once requirements exist.
