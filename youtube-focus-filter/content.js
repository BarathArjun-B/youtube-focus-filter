/* YouTube Focus Filter - YouTube content script */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    SETTINGS: "ytff.settings"
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    strictMode: false,
    blurIntensity: 8,
    customBlockedKeywords: [],
    customAllowedKeywords: []
  };

  const state = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    observer: null,
    scanQueued: false,
    currentUrl: location.href,
    revealedIds: {},
    pendingIds: {}
  };

  init();

  function init() {
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, function (data) {
      state.settings = normalizeSettings(data[STORAGE_KEYS.SETTINGS]);
      applySettingsToRoot();
      scanPage();
      observeYouTube();
      watchRouteChanges();
    });

    chrome.runtime.onMessage.addListener(function (message) {
      if (message && message.type === "YTFF_SETTINGS_UPDATED") {
        state.settings = normalizeSettings(message.settings);
        state.revealedIds = {};
        state.pendingIds = {};
        applySettingsToRoot();
        resetAnalyzedCards();
        scanPage();
      }
    });

    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== "local" || !changes[STORAGE_KEYS.SETTINGS]) return;
      state.settings = normalizeSettings(changes[STORAGE_KEYS.SETTINGS].newValue);
      state.revealedIds = {};
      state.pendingIds = {};
      applySettingsToRoot();
      resetAnalyzedCards();
      scanPage();
    });

    document.addEventListener("click", function (event) {
      const button = event.target.closest(".ytff-reveal-button");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const card = button.closest(".ytff-card");
      if (!card) return;
      const id = card.getAttribute("data-ytff-id");
      state.revealedIds[id] = true;
      card.classList.remove("ytff-distracting", "ytff-pending");
      card.classList.add("ytff-revealed");
      removeOverlay(card);
    }, true);
  }

  function normalizeSettings(settings) {
    const merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    merged.enabled = Boolean(merged.enabled);
    merged.strictMode = Boolean(merged.strictMode);
    merged.blurIntensity = clamp(Number(merged.blurIntensity) || DEFAULT_SETTINGS.blurIntensity, 2, 18);
    merged.customBlockedKeywords = normalizeKeywordList(merged.customBlockedKeywords);
    merged.customAllowedKeywords = normalizeKeywordList(merged.customAllowedKeywords);
    return merged;
  }

  function normalizeKeywordList(value) {
    if (Array.isArray(value)) return value.map(cleanKeyword).filter(Boolean);
    if (typeof value === "string") return value.split(",").map(cleanKeyword).filter(Boolean);
    return [];
  }

  function cleanKeyword(value) {
    return String(value || "").trim().toLowerCase();
  }

  function applySettingsToRoot() {
    document.documentElement.classList.toggle("ytff-enabled", state.settings.enabled);
    document.documentElement.classList.toggle("ytff-strict", state.settings.strictMode);
    document.documentElement.style.setProperty("--ytff-blur", state.settings.blurIntensity + "px");
  }

  function observeYouTube() {
    if (state.observer) state.observer.disconnect();
    state.observer = new MutationObserver(queueScan);
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function watchRouteChanges() {
    setInterval(function () {
      if (state.currentUrl === location.href) return;
      state.currentUrl = location.href;
      state.revealedIds = {};
      state.pendingIds = {};
      setTimeout(function () {
        resetAnalyzedCards();
        scanPage();
      }, 250);
    }, 500);
  }

  function queueScan() {
    if (state.scanQueued) return;
    state.scanQueued = true;
    window.requestAnimationFrame(function () {
      state.scanQueued = false;
      scanPage();
    });
  }

  function scanPage() {
    applySettingsToRoot();
    findVideoCards().forEach(analyzeCard);
  }

  function findVideoCards() {
    const selectors = [
      "ytd-rich-item-renderer",
      "ytd-video-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-reel-item-renderer",
      "ytd-playlist-video-renderer",
      "ytd-radio-renderer",
      "ytd-rich-grid-media",
      "ytd-search ytd-video-renderer"
    ];
    return Array.prototype.slice.call(document.querySelectorAll(selectors.join(",")));
  }

  function resetAnalyzedCards() {
    document.querySelectorAll(".ytff-card").forEach(function (card) {
      card.classList.remove("ytff-card", "ytff-distracting", "ytff-productive", "ytff-revealed", "ytff-pending");
      card.removeAttribute("data-ytff-id");
      card.removeAttribute("data-ytff-category");
      card.removeAttribute("data-ytff-scanned");
      removeOverlay(card);
    });
  }

  function analyzeCard(card) {
    if (!card || !state.settings.enabled) {
      removeOverlay(card);
      return;
    }

    const video = extractVideoData(card);
    if (!video.title && !video.metadata && !video.channelName) return;

    const signature = getScanSignature(video);
    if (card.getAttribute("data-ytff-scanned") === signature) return;
    if (state.pendingIds[signature]) return;

    card.classList.add("ytff-card", "ytff-pending");
    card.setAttribute("data-ytff-id", video.id);
    card.setAttribute("data-ytff-scanned", signature);
    state.pendingIds[signature] = true;

    chrome.runtime.sendMessage({ type: "YTFF_CLASSIFY_VIDEO", video: video }, function (result) {
      delete state.pendingIds[signature];
      if (chrome.runtime.lastError || !result) {
        card.classList.remove("ytff-pending");
        return;
      }
      renderClassification(card, result);
    });
  }

  function renderClassification(card, result) {
    if (!card || !document.documentElement.contains(card)) return;

    const id = result.id || card.getAttribute("data-ytff-id");
    card.classList.add("ytff-card");
    card.classList.remove("ytff-distracting", "ytff-productive", "ytff-revealed", "ytff-pending");
    card.setAttribute("data-ytff-id", id);
    card.setAttribute("data-ytff-category", result.category || "Neutral");

    if (!state.settings.enabled || state.revealedIds[id]) {
      card.classList.add("ytff-revealed");
      removeOverlay(card);
      return;
    }

    if (result.shouldBlur) {
      card.classList.add("ytff-distracting");
      ensureOverlay(card, result);
      chrome.runtime.sendMessage({ type: "YTFF_RECORD_DISTRACTION", result: result }, function () {
        void chrome.runtime.lastError;
      });
      return;
    }

    card.classList.add("ytff-productive");
    removeOverlay(card);
  }

  function extractVideoData(card) {
    const titleNode = card.querySelector("#video-title, #video-title-link, a#video-title, h3 a, h3");
    const channelNode = card.querySelector("ytd-channel-name, #channel-name, .ytd-channel-name");
    const metadataNode = card.querySelector("#metadata-line, #metadata, .metadata, ytd-video-meta-block");
    const badgeNodes = card.querySelectorAll("ytd-badge-supported-renderer, .badge, .badge-style-type-simple");
    const durationNode = card.querySelector("ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer, .ytd-thumbnail-overlay-time-status-renderer");
    const link = card.querySelector("a#video-title, a#thumbnail, a[href*='/watch'], a[href*='/shorts/']");

    const title = getNodeText(titleNode);
    const channelName = getNodeText(channelNode);
    const metadata = getNodeText(metadataNode);
    const durationText = getNodeText(durationNode);
    const badges = Array.prototype.map.call(badgeNodes, getNodeText).filter(Boolean);
    const href = link && link.href ? link.href : "";
    const id = href ? href.split("&list=")[0] : "text:" + hashText([title, channelName, metadata].join("|"));

    return {
      id: id,
      title: title,
      channelName: channelName,
      metadata: metadata,
      badges: badges,
      durationText: durationText,
      durationSeconds: parseDuration(durationText),
      url: href,
      pageUrl: location.href
    };
  }

  function getNodeText(node) {
    if (!node) return "";
    return (node.getAttribute("title") || node.getAttribute("aria-label") || node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function parseDuration(text) {
    const clean = String(text || "").trim();
    if (!clean || clean.toLowerCase() === "live") return 0;
    const parts = clean.split(":").map(Number);
    if (parts.some(isNaN)) return 0;
    return parts.reduce(function (total, part) {
      return total * 60 + part;
    }, 0);
  }

  function ensureOverlay(card, result) {
    let overlay = card.querySelector(".ytff-overlay");
    const confidence = Number(result.confidence) || 0;
    const source = result.aiUsed ? "AI" : "Rules";
    const label = result.contentCategory || result.category || "Distracting";
    const reason = result.reason || "High distraction score";

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "ytff-overlay";
      overlay.innerHTML = [
        '<div class="ytff-overlay-panel">',
        '  <strong>⚠ Distracting Content</strong>',
        '  <span class="ytff-category"></span>',
        '  <span class="ytff-reason"></span>',
        '  <button type="button" class="ytff-reveal-button">Reveal Anyway</button>',
        '</div>'
      ].join("");

      const thumbnail = getThumbnailContainer(card);
      if (thumbnail) {
        thumbnail.appendChild(overlay);
      } else {
        card.appendChild(overlay);
      }
    }

    overlay.querySelector(".ytff-category").textContent = label + " · " + confidence + "% · " + source;
    overlay.querySelector(".ytff-reason").textContent = reason;
  }

  function removeOverlay(card) {
    if (!card) return;
    const overlay = card.querySelector(".ytff-overlay");
    if (overlay) overlay.remove();
  }

  function getThumbnailContainer(card) {
    return card.querySelector("ytd-thumbnail, #thumbnail, .ytd-thumbnail, a#thumbnail");
  }

  function getScanSignature(video) {
    return [
      video.id,
      video.title,
      video.channelName,
      video.metadata,
      video.durationText,
      state.settings.enabled ? "on" : "off",
      state.settings.strictMode ? "strict" : "normal",
      state.settings.blurIntensity,
      state.settings.customBlockedKeywords.join("|"),
      state.settings.customAllowedKeywords.join("|")
    ].join("::");
  }

  function hashText(text) {
    let hash = 0;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return String(Math.abs(hash));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
