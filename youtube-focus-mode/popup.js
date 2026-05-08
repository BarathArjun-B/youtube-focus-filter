/* YouTube Focus Mode - popup */

(function () {
  "use strict";

  const focusToggle = document.getElementById("focus-toggle");
  const strictToggle = document.getElementById("strict-toggle");
  const watchTime = document.getElementById("watch-time");
  const videosWatched = document.getElementById("videos-watched");
  const streak = document.getElementById("streak");
  const status = document.getElementById("status");

  init();

  function init() {
    chrome.runtime.sendMessage({ type: "YTFM_GET_STATE" }, function (state) {
      if (chrome.runtime.lastError || !state) {
        status.textContent = "Open YouTube to start focusing.";
        return;
      }

      renderSettings(state.settings);
      renderStats(state.stats);
    });

    focusToggle.addEventListener("change", saveSettings);
    strictToggle.addEventListener("change", saveSettings);
  }

  function renderSettings(settings) {
    focusToggle.checked = Boolean(settings.focusEnabled);
    strictToggle.checked = Boolean(settings.strictMode);
  }

  function renderStats(stats) {
    const today = stats && stats.today ? stats.today : { watchSeconds: 0, videosWatched: 0 };
    watchTime.textContent = formatDuration(today.watchSeconds || 0);
    videosWatched.textContent = String(today.videosWatched || 0);
    streak.textContent = (stats && stats.streak ? stats.streak : 0) + " days";
  }

  function saveSettings() {
    const settings = {
      focusEnabled: focusToggle.checked,
      strictMode: strictToggle.checked
    };

    status.textContent = "Saving...";
    chrome.runtime.sendMessage({ type: "YTFM_SET_SETTINGS", settings: settings }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        status.textContent = "Could not save settings.";
        return;
      }
      renderSettings(response.settings);
      status.textContent = response.settings.focusEnabled ? "Focus mode is active." : "Focus mode is paused.";
    });
  }

  function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) return hours + "h " + minutes + "m";
    if (minutes > 0) return minutes + "m";
    return seconds + "s";
  }
})();
