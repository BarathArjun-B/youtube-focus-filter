/* YouTube Focus Mode - background service worker */

const STORAGE_KEYS = {
  SETTINGS: "ytfm.settings",
  STATS: "ytfm.stats"
};

const DEFAULT_SETTINGS = {
  focusEnabled: true,
  strictMode: false
};

const DEFAULT_STATS = {
  days: {},
  activeSessions: {}
};

chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS], function (data) {
    const updates = {};
    if (!data[STORAGE_KEYS.SETTINGS]) updates[STORAGE_KEYS.SETTINGS] = DEFAULT_SETTINGS;
    if (!data[STORAGE_KEYS.STATS]) updates[STORAGE_KEYS.STATS] = DEFAULT_STATS;
    if (Object.keys(updates).length) chrome.storage.local.set(updates);
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return false;

  if (message.type === "YTFM_GET_STATE") {
    getState(function (state) {
      sendResponse(state);
    });
    return true;
  }

  if (message.type === "YTFM_SET_SETTINGS") {
    saveSettings(message.settings || {}, function (settings) {
      broadcastSettings(settings);
      sendResponse({ ok: true, settings: settings });
    });
    return true;
  }

  if (message.type === "YTFM_VIDEO_HEARTBEAT") {
    recordVideoHeartbeat(sender.tab && sender.tab.id, message.payload || {}, function (stats) {
      sendResponse({ ok: true, stats: stats });
    });
    return true;
  }

  if (message.type === "YTFM_FOCUS_ACTIVE") {
    markFocusDay(function (stats) {
      sendResponse({ ok: true, stats: stats });
    });
    return true;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  closeActiveSession(tabId);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === "loading") closeActiveSession(tabId);
});

function getState(callback) {
  chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS], function (data) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, data[STORAGE_KEYS.SETTINGS] || {});
    const stats = normalizeStats(data[STORAGE_KEYS.STATS]);
    callback({
      settings: settings,
      stats: buildStatsSummary(stats)
    });
  });
}

function saveSettings(partial, callback) {
  chrome.storage.local.get(STORAGE_KEYS.SETTINGS, function (data) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, data[STORAGE_KEYS.SETTINGS] || {}, partial);
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, function () {
      callback(settings);
    });
  });
}

function broadcastSettings(settings) {
  chrome.tabs.query({ url: "https://www.youtube.com/*" }, function (tabs) {
    tabs.forEach(function (tab) {
      chrome.tabs.sendMessage(tab.id, { type: "YTFM_SETTINGS_UPDATED", settings: settings }, function () {
        void chrome.runtime.lastError;
      });
    });
  });
}

function recordVideoHeartbeat(tabId, payload, callback) {
  if (typeof tabId !== "number") {
    callback(null);
    return;
  }

  chrome.storage.local.get(STORAGE_KEYS.STATS, function (data) {
    const stats = normalizeStats(data[STORAGE_KEYS.STATS]);
    const now = Date.now();
    const today = getLocalDateKey(now);
    ensureDay(stats, today);
    flushSession(stats, tabId, now);

    if (payload.isWatchPage && payload.videoId) {
      const day = stats.days[today];
      if (!day.watchedVideoIds[payload.videoId]) {
        day.watchedVideoIds[payload.videoId] = true;
        day.videosWatched += 1;
      }
    }

    if (payload.playing && payload.isWatchPage && payload.videoId) {
      stats.activeSessions[String(tabId)] = {
        videoId: payload.videoId,
        startedAt: now,
        lastSeenAt: now
      };
    } else {
      delete stats.activeSessions[String(tabId)];
    }

    chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats }, function () {
      callback(buildStatsSummary(stats));
    });
  });
}

function closeActiveSession(tabId) {
  chrome.storage.local.get(STORAGE_KEYS.STATS, function (data) {
    const stats = normalizeStats(data[STORAGE_KEYS.STATS]);
    flushSession(stats, tabId, Date.now());
    delete stats.activeSessions[String(tabId)];
    chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats });
  });
}

function flushSession(stats, tabId, now) {
  const sessionKey = String(tabId);
  const session = stats.activeSessions[sessionKey];
  if (!session || !session.startedAt) return;

  const seconds = Math.max(0, Math.min(60, Math.floor((now - session.startedAt) / 1000)));
  if (!seconds) return;

  const dayKey = getLocalDateKey(session.startedAt);
  ensureDay(stats, dayKey);
  stats.days[dayKey].watchSeconds += seconds;
  session.startedAt = now;
  session.lastSeenAt = now;
}

function markFocusDay(callback) {
  chrome.storage.local.get(STORAGE_KEYS.STATS, function (data) {
    const stats = normalizeStats(data[STORAGE_KEYS.STATS]);
    const today = getLocalDateKey(Date.now());
    ensureDay(stats, today);
    stats.days[today].focusUsed = true;
    chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats }, function () {
      callback(buildStatsSummary(stats));
    });
  });
}

function normalizeStats(stats) {
  const normalized = Object.assign({}, DEFAULT_STATS, stats || {});
  normalized.days = normalized.days || {};
  normalized.activeSessions = normalized.activeSessions || {};

  Object.keys(normalized.days).forEach(function (dayKey) {
    const day = normalized.days[dayKey] || {};
    normalized.days[dayKey] = {
      watchSeconds: Number(day.watchSeconds) || 0,
      videosWatched: Number(day.videosWatched) || 0,
      watchedVideoIds: day.watchedVideoIds || {},
      focusUsed: Boolean(day.focusUsed)
    };
  });

  return normalized;
}

function ensureDay(stats, dayKey) {
  if (!stats.days[dayKey]) {
    stats.days[dayKey] = {
      watchSeconds: 0,
      videosWatched: 0,
      watchedVideoIds: {},
      focusUsed: false
    };
  }
}

function buildStatsSummary(stats) {
  const now = Date.now();
  const todayKey = getLocalDateKey(now);
  ensureDay(stats, todayKey);

  const clone = JSON.parse(JSON.stringify(stats));
  Object.keys(clone.activeSessions).forEach(function (tabId) {
    flushSession(clone, tabId, now);
  });

  return {
    today: {
      date: todayKey,
      watchSeconds: clone.days[todayKey].watchSeconds,
      videosWatched: clone.days[todayKey].videosWatched
    },
    streak: calculateStreak(clone.days, todayKey)
  };
}

function calculateStreak(days, todayKey) {
  let streak = 0;
  let cursor = parseDateKey(todayKey);

  while (cursor) {
    const key = formatDateKey(cursor);
    if (!days[key] || !days[key].focusUsed) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getLocalDateKey(timestamp) {
  return formatDateKey(new Date(timestamp));
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseDateKey(key) {
  const parts = String(key).split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}
