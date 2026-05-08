/* YouTube Focus Filter - popup */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    SETTINGS: "ytff.settings",
    STATS: "ytff.stats"
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    strictMode: false,
    blurIntensity: 8,
    customBlockedKeywords: [],
    customAllowedKeywords: []
  };

  const enabled = document.getElementById("enabled");
  const strict = document.getElementById("strict");
  const blocked = document.getElementById("blocked");
  const allowed = document.getElementById("allowed");
  const blur = document.getElementById("blur");
  const blurValue = document.getElementById("blur-value");
  const save = document.getElementById("save");
  const reset = document.getElementById("reset");
  const status = document.getElementById("status");
  const blockedCount = document.getElementById("blocked-count");
  const score = document.getElementById("score");
  const streak = document.getElementById("streak");
  const aiConfidence = document.getElementById("ai-confidence");
  const aiCount = document.getElementById("ai-count");

  init();

  function init() {
    chrome.runtime.sendMessage({ type: "YTFF_GET_STATE" }, function (state) {
      if (chrome.runtime.lastError || !state) {
        chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS], function (data) {
          renderSettings(Object.assign({}, DEFAULT_SETTINGS, data[STORAGE_KEYS.SETTINGS] || {}));
          renderStats(data[STORAGE_KEYS.STATS]);
        });
        return;
      }
      renderSettings(state.settings);
      renderStats(state.stats);
    });

    blur.addEventListener("input", function () {
      blurValue.textContent = blur.value + "px";
      autoSave();
    });

    enabled.addEventListener("change", autoSave);
    strict.addEventListener("change", autoSave);
    blocked.addEventListener("input", debounceAutoSave);
    allowed.addEventListener("input", debounceAutoSave);
    save.addEventListener("click", saveSettings);
    reset.addEventListener("click", resetKeywords);
  }

  let saveTimer = null;

  function debounceAutoSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autoSave, 350);
  }

  function autoSave() {
    saveSettings("Settings saved.");
  }

  function renderSettings(settings) {
    enabled.checked = Boolean(settings.enabled);
    strict.checked = Boolean(settings.strictMode);
    blur.value = Number(settings.blurIntensity) || DEFAULT_SETTINGS.blurIntensity;
    blurValue.textContent = blur.value + "px";
    blocked.value = listToText(settings.customBlockedKeywords);
    allowed.value = listToText(settings.customAllowedKeywords);
  }

  function renderStats(stats) {
    const summary = getStatsSummary(stats);
    blockedCount.textContent = String(summary.distractionsBlocked);
    score.textContent = String(summary.productiveScore);
    streak.textContent = String(summary.streak);
    aiConfidence.textContent = summary.averageConfidence + "%";
    aiCount.textContent = String(summary.aiClassifications);
  }

  function saveSettings(message) {
    const settings = {
      enabled: enabled.checked,
      strictMode: strict.checked,
      blurIntensity: Number(blur.value),
      customBlockedKeywords: textToList(blocked.value),
      customAllowedKeywords: textToList(allowed.value)
    };

    chrome.runtime.sendMessage({ type: "YTFF_SET_SETTINGS", settings: settings }, function (response) {
      if (chrome.runtime.lastError || !response || !response.ok) {
        chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, function () {
          status.textContent = typeof message === "string" ? message : "Settings saved.";
        });
        return;
      }
      renderSettings(response.settings);
      status.textContent = typeof message === "string" ? message : "Settings saved.";
    });
  }

  function resetKeywords() {
    blocked.value = "";
    allowed.value = "";
    saveSettings("Custom keywords reset.");
  }

  function textToList(value) {
    return String(value || "")
      .split(",")
      .map(function (item) {
        return item.trim().toLowerCase();
      })
      .filter(Boolean)
      .filter(function (item, index, array) {
        return array.indexOf(item) === index;
      });
  }

  function listToText(value) {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  function getStatsSummary(stats) {
    if (stats && stats.today) {
      return {
        distractionsBlocked: Number(stats.today.distractionsBlocked) || 0,
        productiveScore: Number(stats.today.productiveScore) || 100,
        aiClassifications: Number(stats.today.aiClassifications) || 0,
        averageConfidence: Number(stats.today.averageConfidence) || 0,
        streak: Number(stats.streak) || 0
      };
    }

    const normalized = stats && stats.days ? stats : { days: {} };
    const today = getTodayKey();
    const day = normalized.days[today] || {};
    return {
      distractionsBlocked: Number(day.distractionsBlocked) || 0,
      productiveScore: Number(day.productiveScore) || 100,
      aiClassifications: Number(day.aiClassifications) || 0,
      averageConfidence: day.confidenceSamples ? Math.round((Number(day.confidenceTotal) || 0) / day.confidenceSamples) : 0,
      streak: calculateStreak(normalized.days, today)
    };
  }

  function calculateStreak(days, todayKey) {
    let count = 0;
    const cursor = parseDateKey(todayKey);
    while (cursor) {
      const key = formatDateKey(cursor);
      if (!days[key] || !days[key].focusUsed) break;
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }

  function getTodayKey() {
    return formatDateKey(new Date());
  }

  function formatDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function parseDateKey(key) {
    const parts = String(key).split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
})();
