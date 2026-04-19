# Electron Vue Prisma Template

A starter template for cross-platform desktop applications built with:

- Electron
- Vue 3
- Vite
- Tailwind CSS
- DaisyUI
- Prisma
- SQLite

This template is intended for local-first desktop apps with a clean separation between:

- **Electron main process** for native APIs and database access
- **preload bridge** for secure IPC exposure
- **Vue renderer** for the user interface

## Features

- Electron Forge packaging for Windows, macOS and Linux
- Vue 3 + Vite renderer setup
- Tailwind CSS + DaisyUI styling
- Prisma ORM with SQLite
- TypeScript-ready project with JavaScript still allowed
- Template-friendly project structure

## Project structure

```text
.
├── electron/
│   ├── main.js
│   ├── preload.js
│   └── db.js
├── prisma/
│   └── schema.prisma
├── src/
│   ├── App.vue
│   ├── renderer.js
│   ├── input.css
│   └── styles/
│       └── output.css
├── index.html
├── vite.config.mjs
├── forge.config.js
├── tsconfig.json
└── package.json
```

## Getting started

### 1. Install dependencies

````shell
npm install
````

### 2. Create your environment file

Copy .env.example to .env:

````shell
cp .env.example .env
````

On Windows PowerShell:

````powershell
Copy-Item .env.example .env
````

### 3. Generate Prisma client

````shell
npm run prisma:generate
````

### 4. Create the database

````shell
npm run db:migrate
````

### 5. Start the app

````shell
npm run start
````

## Available scripts

### Build CSS and renderer

````shell
npm run build:vite
````

### Type-check Vue / TypeScript files

````shell
npm run typecheck
````

### Generate Prisma client

````shell
npm run prisma:generate
````

### Run Prisma migrations

````shell
npm run db:migrate
````

### Open Prisma Studio

````shell
npm run db:studio
````

### Package the application

````shell
npm run package
````

### Create distributables

````shell
npm run make
````

### Publish GitHub draft release

````shell
npm run publish
````

## Database notes

This template uses **Prisma + SQLite** by default.

For development, the database URL points to a local SQLite file. For packaged production builds, you should store user
data inside Electron's ``userData`` directory instead of writing into the application folder.

## Security notes

- Keep database access in the Electron main process
- Expose only narrow APIs through preload.js
- Do not import Prisma directly in the Vue renderer
- Keep contextIsolation enabled

## Turning this repository into your own app

You should rename:

- `name` in ``package.json``
- productName in ``package.json``
- the GitHub repository URL
- the application title in ``index.html``

Then update:

- Prisma models in ``prisma/schema.prisma``
- preload APIs
- Vue UI components

## License

MIT