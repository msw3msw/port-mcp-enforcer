# Changelog

## [1.0.3] - 2025-01-10

### Features
- Exclusion system now works correctly for all containers
- Excluded containers appear in Excluded tab (not just standardized ones)
- Progress bar: percentage = (standardized + excluded) / total
- Can reach 100% by standardizing OR excluding containers
- Added port impact analysis modal for safer port changes
- Modularized UI into separate orchestrator files

### Fixes
- Fix ExclusionManager API method names (getExcluded, toggle)
- Add exclude column CSS styling to layout.js
- Fix remaining count calculation in progress bar

### Improvements
- Improved port-checker HTML detection for auth redirects (Radarr, Sonarr, etc)
- Expanded classifier APP_KEYWORDS for better auto-classification
- Better VPN port preservation in update-container-ports action

## [1.0.2] - 2025-01-08

### Features
- Initial public release
- Docker port management UI
- Container classification (apps, games, system)
- Policy enforcement with user opt-in
- Snapshot and rollback functionality
