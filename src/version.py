"""Single place for the app name, version and creation timestamp. Bump __version__ per release (and VERSION
in web/src/reconcile_core.ts and web/package.json). BUILD_DATETIME is stamped automatically when the exe and web
app are built."""
APP_NAME = "PlayerReconcile"
APP_TITLE = "Player Reconciliation"
__version__ = "1.7.1"
BUILD_DATETIME = "development build"  # replaced with the UK build time by the release workflow
