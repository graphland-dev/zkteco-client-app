# Changelog

## v0.3.0 — 2026-07-16

Auto-connect and attendance sync on startup, richer user management, and a demo mode for trying the app without a device.

### Features

- On launch, the app auto-connects to your saved device and syncs attendance when a webhook is configured, so previous punches show up without a manual sync
- Attendance log keeps history across machines and sessions, and shows new punches as they arrive
- Users can be synced to the portal one at a time; conflicts (same ID / different name, or same name / different ID) ask which side to keep so both end up matching
- Fingerprint and card icons appear beside a user’s name when those credentials are stored
- Optional User ID editing when updating a user
- Demo mode (toggle in code) seeds sample users and punches from Settings, with simulate attendance and full demo user CRUD
- Settings shows the app version in the bottom corner

### Fixes

- Role select and form labels render correctly (border and required asterisks stay inline)
- Rows-per-page control no longer clips page-size numbers
- Punch history sheet is wider so the full table and actions are visible

## v0.2.0 — 2026-07-16

Launch at login with tray-first startup, a Settings tab, and clearer punch labels.

### Features

- The app can start automatically when you sign in to your computer, and can open in the system tray by default so it stays out of the way
- A system tray icon lets you show the window or quit; closing the window keeps the app running in the tray
- New **Settings** tab to turn launch-at-login and start-in-tray on or off
- Punch history and forwarded attendance events show as **punched** instead of check-in / check-out (your backend still decides check-in vs check-out)

### Fixes

- Opening the UI in a normal browser tab now explains that you need the desktop app window
- Status messages and action buttons no longer sit flush against each other
