# MoonCanvas

MoonCanvas is a private, browser-based drawing space.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Vite migration commands

MoonCanvas runs as a client-only Vite application. Recording sessions remain in browser local storage and are never uploaded.

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

For Vercel, use `npm run build` with `dist` as the output directory. The included `vercel.json` routes direct SPA requests to `index.html`.
