# Image Prompt Studio Website

The website reuses the extension's prompt, image-processing, API, cancellation and result-parsing source files without changing them. Run `node build-web.cjs` after changing extension source.

## Local Preview

Run `python -m http.server 8080 --directory web`, then open http://localhost:8080.

## Deployment

The GitHub Actions workflow deploys the `web` directory to GitHub Pages. The current private repository's plan does not support Pages. The owner must either explicitly make the repository public or use a hosting service supporting private repositories. No repository visibility changes are made by the build.

Expected Pages URL after enabling deployment: https://yuliye0409-hue.github.io/image-prompt-studio/

## Browser And API Requirements

Use a current Chrome, Edge, Firefox or Safari version. Upload works on mobile; clipboard image paste depends on browser and operating-system support. Extension-only features such as the browser sidebar and right-click image menu do not exist in the website.

Each device must configure its own API settings. Keys are stored in browser localStorage, not in GitHub source. Clear the key after using a shared device. Images are sent directly to the configured API provider. Do not configure an untrusted API endpoint.

The API provider must allow cross-origin browser requests (CORS). Extension host permissions cannot be carried over to a website. If the provider blocks browser requests, it must enable CORS or a separately secured backend is required. Never embed a shared API secret in a public frontend.

The website must remain open while generating. Closing or refreshing it stops client-side processing. Existing API quota, upstream timeouts and model availability still apply.

## Verification

Run `node test-web.cjs`. This checks adapter storage, settings synchronization, bootstrap wiring and exact parity with extension JavaScript. Real API generation and cross-browser visual testing require separate verification.
