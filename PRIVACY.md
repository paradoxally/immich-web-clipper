# Privacy Policy for Immich Web Clipper

**Last updated:** January 2026

## Overview

Immich Web Clipper is a browser extension that allows you to save images from the web to your self-hosted Immich photo management server. This privacy policy explains what data the extension accesses and how it's used.

## Data Collection

**We do not collect any personal data.** 

This extension:
- Does NOT collect analytics or usage data
- Does NOT track your browsing activity
- Does NOT transmit data to any third-party servers
- Does NOT use cookies or tracking technologies

## Data Storage

The extension stores the following data locally in your browser using Chrome's sync storage:

| Data | Purpose |
|------|---------|
| Server URL | To connect to your Immich server |
| API Key | To authenticate with your Immich server |
| Default Album ID | To remember your preferred album |
| Theme Preference | To remember light/dark mode setting |
| Statistics | Count of saved images and total size |
| Settings | Your notification and album preferences |

This data:
- Is stored locally in your browser
- Syncs across your Chrome browsers if you're signed into Chrome
- Is never transmitted to us or any third party
- Can be deleted by removing the extension

## Network Requests

The extension only makes network requests to:
- **Your Immich server** - The URL you configure in settings

These requests are used to:
- Verify your connection and API key
- Fetch your album list
- Upload images you choose to save

## Permissions

The extension requires these permissions:

| Permission | Reason |
|------------|--------|
| `contextMenus` | To add "Save to Immich" to right-click menu |
| `storage` | To save your settings locally |
| `activeTab` | To show notifications on the current tab |
| `scripting` | To inject notification UI on webpages |
| `host_permissions` | To communicate with your Immich server |

## Data Security

- Your API key is stored in Chrome's secure sync storage
- All communication with your Immich server uses your server's protocol (HTTPS recommended)
- No data is ever sent to any server other than your configured Immich instance

## Your Rights

You can:
- View all stored data via Chrome's developer tools
- Delete all data by removing the extension
- Disconnect from your server at any time via the extension popup

## Changes to This Policy

If we make changes to this privacy policy, we will update the "Last updated" date above.

## Contact

For questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/paradoxally/immich-web-clipper).

## Open Source

This extension is open source. You can review the complete source code to verify these privacy claims.
