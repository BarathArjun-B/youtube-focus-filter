/* YouTube Focus Mode - YouTube content script */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    SETTINGS: "ytfm.settings",
    NOTES: "ytfm.notes",
    TIMER: "ytfm.timer",
    WIDGET: "ytfm.widgetPosition"
  };

  const DEFAULT_SETTINGS = {
    focusEnabled: true,
    strictMode: false
  };

  const TIMER_DURATIONS = {
    focus: 25 * 60,
    break: 5 * 60
  };

  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    observer: null,
    route: location.href,
    timer: {
      phase: "focus",
      remaining: TIMER_DURATIONS.focus,
      running: false,
      endAt: null
    },
    timerInterval: null,
    saveNotesTimer: null,
    heartbeatTimer: null,
    lastVideoSignature: ""
  };

  init();

  function init() {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.NOTES, STORAGE_KEYS.TIMER, STORAGE_KEYS.WIDGET], function (data) {
      state.settings = Object.assign({}, DEFAULT_SETTINGS, data[STORAGE_KEYS.SETTINGS] || {});
      restoreTimer(data[STORAGE_KEYS.TIMER]);
      injectWidget(data[STORAGE_KEYS.NOTES] || "", data[STORAGE_KEYS.WIDGET]);
      applyFocusMode();
      observeYouTube();
      watchRouteChanges();
      setupVideoTracking();
      markFocusActive();
    });

    chrome.runtime.onMessage.addListener(function (message) {
      if (message && message.type === "YTFM_SETTINGS_UPDATED") {
        state.settings = Object.assign({}, DEFAULT_SETTINGS, message.settings || {});
        applyFocusMode();
        markFocusActive();
      }
    });
  }

  function injectWidget(notes, savedPosition) {
    if (document.getElementById("ytfm-widget")) return;

    const widget = document.createElement("aside");
    widget.id = "ytfm-widget";
    widget.innerHTML = [
      '<div class="ytfm-widget-shell">',
      '  <header class="ytfm-drag-handle" title="Drag Focus Mode">',
      '    <div>',
      '      <span class="ytfm-kicker">Focus Mode</span>',
      '      <strong>YouTube Focus</strong>',
      '    </div>',
      '    <button class="ytfm-icon-button" id="ytfm-minimize" title="Collapse timer" aria-label="Collapse timer">−</button>',
      '  </header>',
      '  <section class="ytfm-timer-card">',
      '    <div class="ytfm-phase" id="ytfm-phase">Focus</div>',
      '    <div class="ytfm-time" id="ytfm-time">25:00</div>',
      '    <div class="ytfm-controls">',
      '      <button id="ytfm-start-pause">Start</button>',
      '      <button id="ytfm-reset">Reset</button>',
      '    </div>',
      '  </section>',
      '  <section class="ytfm-notes-card">',
      '    <div class="ytfm-notes-head">',
      '      <label for="ytfm-notes">Study notes</label>',
      '      <span id="ytfm-note-count">0 chars</span>',
      '    </div>',
      '    <textarea id="ytfm-notes" maxlength="5000" placeholder="Capture the idea, not the rabbit hole."></textarea>',
      '    <button id="ytfm-clear-notes" class="ytfm-secondary">Clear notes</button>',
      '  </section>',
      '</div>'
    ].join("");

    document.documentElement.appendChild(widget);

    if (savedPosition && typeof savedPosition.left === "number" && typeof savedPosition.top === "number") {
      widget.style.left = savedPosition.left + "px";
      widget.style.top = savedPosition.top + "px";
      widget.style.right = "auto";
    }

    const notesInput = document.getElementById("ytfm-notes");
    notesInput.value = notes;
    updateNoteCount();

    document.getElementById("ytfm-start-pause").addEventListener("click", toggleTimer);
    document.getElementById("ytfm-reset").addEventListener("click", resetTimer);
    document.getElementById("ytfm-minimize").addEventListener("click", toggleWidget);
    document.getElementById("ytfm-clear-notes").addEventListener("click", clearNotes);
    notesInput.addEventListener("input", scheduleNotesSave);

    makeDraggable(widget, widget.querySelector(".ytfm-drag-handle"));
    updateTimerDisplay();
    runTimerLoop();
  }

  function toggleWidget() {
    const widget = document.getElementById("ytfm-widget");
    const button = document.getElementById("ytfm-minimize");
    widget.classList.toggle("ytfm-collapsed");
    button.textContent = widget.classList.contains("ytfm-collapsed") ? "+" : "−";
  }

  function makeDraggable(widget, handle) {
    let drag = null;

    handle.addEventListener("pointerdown", function (event) {
      if (event.target.closest("button")) return;
      const rect = widget.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top
      };
      handle.setPointerCapture(event.pointerId);
      widget.classList.add("ytfm-dragging");
    });

    handle.addEventListener("pointermove", function (event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextLeft = clamp(drag.left + event.clientX - drag.startX, 8, window.innerWidth - widget.offsetWidth - 8);
      const nextTop = clamp(drag.top + event.clientY - drag.startY, 8, window.innerHeight - widget.offsetHeight - 8);
      widget.style.left = nextLeft + "px";
      widget.style.top = nextTop + "px";
      widget.style.right = "auto";
    });

    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);

    function finishDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const rect = widget.getBoundingClientRect();
      chrome.storage.local.set({ [STORAGE_KEYS.WIDGET]: { left: rect.left, top: rect.top } });
      widget.classList.remove("ytfm-dragging");
      drag = null;
    }
  }

  function toggleTimer() {
    if (state.timer.running) {
      pauseTimer();
    } else {
      state.timer.running = true;
      state.timer.endAt = Date.now() + state.timer.remaining * 1000;
      saveTimer();
      updateTimerDisplay();
    }
  }

  function pauseTimer() {
    state.timer.remaining = getRemainingSeconds();
    state.timer.running = false;
    state.timer.endAt = null;
    saveTimer();
    updateTimerDisplay();
  }

  function resetTimer() {
    state.timer.phase = "focus";
    state.timer.remaining = TIMER_DURATIONS.focus;
    state.timer.running = false;
    state.timer.endAt = null;
    saveTimer();
    updateTimerDisplay();
  }

  function runTimerLoop() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(function () {
      if (!state.timer.running) return;
      const remaining = getRemainingSeconds();
      if (remaining <= 0) {
        completeTimerPhase();
      } else {
        state.timer.remaining = remaining;
        updateTimerDisplay();
      }
    }, 500);
  }

  function completeTimerPhase() {
    state.timer.phase = state.timer.phase === "focus" ? "break" : "focus";
    state.timer.remaining = TIMER_DURATIONS[state.timer.phase];
    state.timer.running = false;
    state.timer.endAt = null;
    saveTimer();
    updateTimerDisplay();
    flashTimer();
  }

  function restoreTimer(timer) {
    if (!timer) return;
    state.timer.phase = timer.phase === "break" ? "break" : "focus";
    state.timer.remaining = Number(timer.remaining) || TIMER_DURATIONS[state.timer.phase];
    state.timer.running = Boolean(timer.running);
    state.timer.endAt = Number(timer.endAt) || null;
    if (state.timer.running) {
      state.timer.remaining = getRemainingSeconds();
      if (state.timer.remaining <= 0) completeTimerPhase();
    }
  }

  function getRemainingSeconds() {
    if (!state.timer.running || !state.timer.endAt) return state.timer.remaining;
    return Math.max(0, Math.ceil((state.timer.endAt - Date.now()) / 1000));
  }

  function saveTimer() {
    chrome.storage.local.set({ [STORAGE_KEYS.TIMER]: state.timer });
  }

  function updateTimerDisplay() {
    const time = document.getElementById("ytfm-time");
    const phase = document.getElementById("ytfm-phase");
    const button = document.getElementById("ytfm-start-pause");
    if (!time || !phase || !button) return;

    const remaining = state.timer.running ? getRemainingSeconds() : state.timer.remaining;
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    time.textContent = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
    phase.textContent = state.timer.phase === "focus" ? "Focus" : "Break";
    button.textContent = state.timer.running ? "Pause" : "Start";
  }

  function flashTimer() {
    const widget = document.getElementById("ytfm-widget");
    if (!widget) return;
    widget.classList.add("ytfm-pulse");
    setTimeout(function () {
      widget.classList.remove("ytfm-pulse");
    }, 1200);
  }

  function scheduleNotesSave() {
    updateNoteCount();
    clearTimeout(state.saveNotesTimer);
    state.saveNotesTimer = setTimeout(function () {
      const notes = document.getElementById("ytfm-notes").value;
      chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: notes });
    }, 250);
  }

  function clearNotes() {
    const notes = document.getElementById("ytfm-notes");
    notes.value = "";
    updateNoteCount();
    chrome.storage.local.set({ [STORAGE_KEYS.NOTES]: "" });
  }

  function updateNoteCount() {
    const notes = document.getElementById("ytfm-notes");
    const count = document.getElementById("ytfm-note-count");
    if (!notes || !count) return;
    count.textContent = notes.value.length + " chars";
  }

  function applyFocusMode() {
    document.documentElement.classList.toggle("ytfm-focus-enabled", Boolean(state.settings.focusEnabled));
    document.documentElement.classList.toggle("ytfm-strict-enabled", Boolean(state.settings.strictMode));

    if (state.settings.focusEnabled) hideDistractions();
    renderStrictOverlay();
  }

  function hideDistractions() {
    const selectors = [
      "#secondary",
      "#comments",
      "ytd-comments",
      "ytd-watch-next-secondary-results-renderer",
      "ytd-rich-section-renderer",
      "ytd-reel-shelf-renderer",
      "ytd-shorts",
      "ytd-mini-guide-entry-renderer[aria-label='Shorts']",
      "a[title='Shorts']",
      "ytd-guide-entry-renderer:has(a[title='Shorts'])",
      "ytd-browse[page-subtype='home'] ytd-rich-grid-renderer",
      "ytd-browse[page-subtype='home'] #contents",
      "ytd-compact-video-renderer",
      "ytd-compact-radio-renderer",
      ".ytp-ce-element",
      ".ytp-endscreen-content",
      ".ytp-paid-content-overlay",
      "ytd-merch-shelf-renderer",
      "ytd-player-legacy-desktop-watch-ads-renderer"
    ];

    selectors.forEach(function (selector) {
      try {
        document.querySelectorAll(selector).forEach(function (element) {
          element.setAttribute("data-ytfm-hidden", "true");
        });
      } catch (error) {
        // Some browsers may not support :has in querySelectorAll; CSS still handles it.
      }
    });
  }

  function renderStrictOverlay() {
    const shouldBlock = state.settings.focusEnabled && state.settings.strictMode && !isDirectVideoUrl();
    let overlay = document.getElementById("ytfm-strict-overlay");

    if (!shouldBlock) {
      if (overlay) overlay.remove();
      document.documentElement.classList.remove("ytfm-page-blocked");
      return;
    }

    document.documentElement.classList.add("ytfm-page-blocked");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "ytfm-strict-overlay";
      overlay.innerHTML = [
        '<div class="ytfm-strict-card">',
        '  <span class="ytfm-kicker">Strict Mode</span>',
        '  <h1>Focus Mode Enabled</h1>',
        '  <p>Search intentionally.</p>',
        '  <p class="ytfm-strict-detail">Open a direct YouTube video URL to continue. The homepage, feeds, comments, Shorts, and suggestion surfaces are blocked.</p>',
        '</div>'
      ].join("");
      document.documentElement.appendChild(overlay);
    }
  }

  function isDirectVideoUrl() {
    const url = new URL(location.href);
    return url.pathname === "/watch" && Boolean(url.searchParams.get("v"));
  }

  function observeYouTube() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(function () {
      if (state.settings.focusEnabled) hideDistractions();
      renderStrictOverlay();
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function watchRouteChanges() {
    setInterval(function () {
      if (state.route === location.href) return;
      state.route = location.href;
      setTimeout(function () {
        applyFocusMode();
        sendVideoHeartbeat();
      }, 150);
    }, 400);
  }

  function setupVideoTracking() {
    sendVideoHeartbeat();
    state.heartbeatTimer = setInterval(sendVideoHeartbeat, 10000);
    document.addEventListener("play", sendVideoHeartbeat, true);
    document.addEventListener("pause", sendVideoHeartbeat, true);
    document.addEventListener("visibilitychange", sendVideoHeartbeat);
    window.addEventListener("beforeunload", sendVideoHeartbeat);
  }

  function sendVideoHeartbeat() {
    const video = document.querySelector("video");
    const videoId = new URL(location.href).searchParams.get("v") || "";
    const isWatchPage = isDirectVideoUrl();
    const playing = Boolean(video && !video.paused && !video.ended && !document.hidden);
    const signature = [videoId, isWatchPage, playing, document.hidden].join("|");

    if (signature === state.lastVideoSignature && !playing) return;
    state.lastVideoSignature = signature;

    chrome.runtime.sendMessage({
      type: "YTFM_VIDEO_HEARTBEAT",
      payload: {
        videoId: videoId,
        isWatchPage: isWatchPage,
        playing: playing,
        title: document.title.replace(" - YouTube", "")
      }
    }, function () {
      void chrome.runtime.lastError;
    });
  }

  function markFocusActive() {
    if (!state.settings.focusEnabled) return;
    chrome.runtime.sendMessage({ type: "YTFM_FOCUS_ACTIVE" }, function () {
      void chrome.runtime.lastError;
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
