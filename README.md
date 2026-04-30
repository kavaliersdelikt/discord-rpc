<p align=center>
  <a href="https://github.com/kavaliersdelikt/discord-rpc/releases/latest"><img alt="GitHub release (latest by date)" src="https://img.shields.io/github/v/tag/kavaliersdelikt/discord-rpc?color=19e2e2&label=latest&logo=github"></a>
  <a href="https://github.com/kavaliersdelikt/discord-rpc/releases/latest"><img alt="GitHub Releases" src="https://img.shields.io/github/downloads/kavaliersdelikt/discord-rpc/latest/total?color=19e2e2&label=downloads&logo=github"></a>
  <a href="https://github.com/kavaliersdelikt/discord-rpc/releases"><img alt="All GitHub Releases" src="https://img.shields.io/github/downloads/kavaliersdelikt/discord-rpc/total?color=19e2e2&label=total%20downloads&logo=github"></a>
</p>

# RPC Manager

RPC Manager is a modern Windows Discord Rich Presence maker and manager. It includes onboarding, live Discord RPC connection, easy preset management, local asset preview, and background tray support.

## Features

- Guided onboarding and setup
- Discord RPC connection with live status updates
- Preset manager with custom details, state, buttons, and timestamp support
- Image browsing and local preview for large/small assets
- Background tray mode and clear-presence controls
- Theme support and easy settings
- Built for production-ready Windows deployment

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Start development mode:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

## Packaging

To produce a Windows executable package locally:

```bash
npm run package:exe
```

The packaged installers and portable builds will be generated under `dist/builder`.

## CI and automatic build

A GitHub Actions workflow is included that automatically builds an `.exe` package whenever code is pushed to `main`.

## Credits

Built by kavaliersdelikt.
