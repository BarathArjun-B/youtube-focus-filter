/* YouTube Focus Filter - background classifier */

(function () {
  "use strict";

  const STORAGE_KEYS = {
    SETTINGS: "ytff.settings",
    STATS: "ytff.stats",
    CACHE: "ytff.classificationCache"
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    strictMode: false,
    blurIntensity: 8,
    customBlockedKeywords: [],
    customAllowedKeywords: []
  };

  const DEFAULT_STATS = {
    days: {}
  };

  const CATEGORY = {
    EDUCATIONAL: "Educational",
    PRODUCTIVE: "Productive",
    ENTERTAINMENT: "Entertainment",
    DISTRACTING: "Distracting",
    NEUTRAL: "Neutral"
  };

  const DISTRACTION_THRESHOLD = 32;
  const STRICT_THRESHOLD = 18;
  const UNCERTAIN_LOW = -18;
  const UNCERTAIN_HIGH = 38;

  const DISTRACTION_RULES = [
    { pattern: "official music video", weight: 46, category: "Music Content", reason: "official music video" },
    { pattern: "music video", weight: 40, category: "Music Content", reason: "music video" },
    { pattern: "vevo", weight: 40, category: "Music Content", reason: "VEVO music channel" },
    { pattern: "lyrics", weight: 24, category: "Music Content", reason: "lyrics" },
    { pattern: "lyric video", weight: 34, category: "Music Content", reason: "lyric video" },
    { pattern: "song", weight: 24, category: "Music Content", reason: "song" },
    { pattern: "music", weight: 18, category: "Music Content", reason: "music" },
    { pattern: "remix", weight: 22, category: "Music Content", reason: "remix" },
    { pattern: "bgm", weight: 26, category: "Music Content", reason: "background music" },
    { pattern: "live concert", weight: 44, category: "Music Content", reason: "concert" },

    { pattern: "ronaldo", weight: 30, category: "Sports Entertainment", reason: "sports celebrity" },
    { pattern: "messi", weight: 30, category: "Sports Entertainment", reason: "sports celebrity" },
    { pattern: "cristiano", weight: 30, category: "Sports Entertainment", reason: "sports celebrity" },
    { pattern: "football skills", weight: 36, category: "Sports Entertainment", reason: "football skills" },
    { pattern: "skills", weight: 20, category: "Sports Entertainment", reason: "skills highlights" },
    { pattern: "goals", weight: 18, category: "Sports Entertainment", reason: "sports highlights" },
    { pattern: "highlights", weight: 18, category: "Sports Entertainment", reason: "highlight reel" },
    { pattern: "match highlights", weight: 34, category: "Sports Entertainment", reason: "match highlights" },
    { pattern: "ipl", weight: 26, category: "Sports Entertainment", reason: "sports league" },
    { pattern: "wwe", weight: 34, category: "Sports Entertainment", reason: "sports entertainment" },

    { pattern: "movie", weight: 30, category: "Cinema Content", reason: "movie content" },
    { pattern: "trailer", weight: 30, category: "Cinema Content", reason: "trailer" },
    { pattern: "teaser", weight: 24, category: "Cinema Content", reason: "teaser" },
    { pattern: "film", weight: 20, category: "Cinema Content", reason: "film content" },
    { pattern: "cinema", weight: 22, category: "Cinema Content", reason: "cinema content" },
    { pattern: "netflix", weight: 24, category: "Cinema Content", reason: "streaming content" },
    { pattern: "episode", weight: 18, category: "Cinema Content", reason: "episode" },

    { pattern: "election roast", weight: 34, category: "Political Entertainment", reason: "political entertainment" },
    { pattern: "political roast", weight: 34, category: "Political Entertainment", reason: "political roast" },
    { pattern: "debate highlights", weight: 28, category: "Political Entertainment", reason: "debate highlights" },
    { pattern: "political memes", weight: 38, category: "Political Entertainment", reason: "political memes" },
    { pattern: "news reaction", weight: 28, category: "Political Entertainment", reason: "news reaction" },

    { pattern: "meme", weight: 30, category: "Memes", reason: "meme content" },
    { pattern: "memes", weight: 32, category: "Memes", reason: "meme content" },
    { pattern: "funny", weight: 20, category: "Memes", reason: "comedy content" },
    { pattern: "try not to laugh", weight: 38, category: "Memes", reason: "comedy challenge" },
    { pattern: "prank", weight: 28, category: "Memes", reason: "prank content" },
    { pattern: "roast", weight: 24, category: "Memes", reason: "roast content" },
    { pattern: "reaction", weight: 24, category: "Memes", reason: "reaction video" },
    { pattern: "shorts", weight: 38, category: "Memes", reason: "Shorts content" },

    { pattern: "gaming", weight: 30, category: "Gaming", reason: "gaming content" },
    { pattern: "gameplay", weight: 30, category: "Gaming", reason: "gameplay" },
    { pattern: "minecraft", weight: 28, category: "Gaming", reason: "gaming title" },
    { pattern: "fortnite", weight: 28, category: "Gaming", reason: "gaming title" },
    { pattern: "valorant", weight: 28, category: "Gaming", reason: "gaming title" },
    { pattern: "pubg", weight: 28, category: "Gaming", reason: "gaming title" },
    { pattern: "free fire", weight: 30, category: "Gaming", reason: "gaming title" },
    { pattern: "ranked match", weight: 24, category: "Gaming", reason: "ranked gameplay" },

    { pattern: "celebrity", weight: 28, category: "Celebrity Content", reason: "celebrity content" },
    { pattern: "gossip", weight: 34, category: "Celebrity Content", reason: "gossip content" },
    { pattern: "bollywood gossip", weight: 42, category: "Celebrity Content", reason: "celebrity gossip" },
    { pattern: "hollywood gossip", weight: 42, category: "Celebrity Content", reason: "celebrity gossip" },
    { pattern: "paparazzi", weight: 34, category: "Celebrity Content", reason: "paparazzi content" },
    { pattern: "vlog", weight: 18, category: "Celebrity Content", reason: "vlog content" }
  ];

  const PRODUCTIVE_RULES = [
    { pattern: "tutorial", weight: -70, reason: "tutorial" },
    { pattern: "coding", weight: -48, reason: "coding" },
    { pattern: "leetcode", weight: -60, reason: "LeetCode practice" },
    { pattern: "dsa", weight: -60, reason: "DSA study" },
    { pattern: "data structures", weight: -58, reason: "data structures" },
    { pattern: "algorithm", weight: -44, reason: "algorithm learning" },
    { pattern: "lecture", weight: -46, reason: "lecture" },
    { pattern: "interview prep", weight: -58, reason: "interview prep" },
    { pattern: "system design", weight: -54, reason: "system design" },
    { pattern: "ai", weight: -32, reason: "AI learning" },
    { pattern: "machine learning", weight: -48, reason: "machine learning" },
    { pattern: "react", weight: -46, reason: "React learning" },
    { pattern: "javascript", weight: -42, reason: "JavaScript learning" },
    { pattern: "java", weight: -42, reason: "Java learning" },
    { pattern: "python", weight: -46, reason: "Python learning" },
    { pattern: "study", weight: -36, reason: "study content" },
    { pattern: "education", weight: -50, reason: "education" },
    { pattern: "educational", weight: -50, reason: "educational" },
    { pattern: "course", weight: -36, reason: "course content" },
    { pattern: "lesson", weight: -34, reason: "lesson content" },
    { pattern: "explained", weight: -26, reason: "explainer content" },
    { pattern: "programming", weight: -44, reason: "programming" },
    { pattern: "project", weight: -22, reason: "project learning" }
  ];

  chrome.runtime.onInstalled.addListener(function () {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS, STORAGE_KEYS.CACHE], function (data) {
      const updates = {};
      if (!data[STORAGE_KEYS.SETTINGS]) updates[STORAGE_KEYS.SETTINGS] = DEFAULT_SETTINGS;
      if (!data[STORAGE_KEYS.STATS]) updates[STORAGE_KEYS.STATS] = DEFAULT_STATS;
      if (!data[STORAGE_KEYS.CACHE]) updates[STORAGE_KEYS.CACHE] = {};
      if (Object.keys(updates).length) chrome.storage.local.set(updates);
    });
  });

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || !message.type) return false;

    if (message.type === "YTFF_CLASSIFY_VIDEO") {
      classifyVideo(message.video || {}, function (result) {
        sendResponse(result);
      });
      return true;
    }

    if (message.type === "YTFF_RECORD_DISTRACTION") {
      recordDistraction(message.result || {}, function (summary) {
        sendResponse({ ok: true, stats: summary });
      });
      return true;
    }

    if (message.type === "YTFF_GET_STATE") {
      getState(function (state) {
        sendResponse(state);
      });
      return true;
    }

    if (message.type === "YTFF_SET_SETTINGS") {
      saveSettings(message.settings || {}, function (settings) {
        broadcastSettings(settings);
        sendResponse({ ok: true, settings: settings });
      });
      return true;
    }

    return false;
  });

  function getState(callback) {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS], function (data) {
      const settings = normalizeSettings(data[STORAGE_KEYS.SETTINGS]);
      const stats = normalizeStats(data[STORAGE_KEYS.STATS]);
      callback({
        settings: settings,
        stats: summarizeStats(stats)
      });
    });
  }

  function saveSettings(partial, callback) {
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, function (data) {
      const settings = normalizeSettings(Object.assign({}, data[STORAGE_KEYS.SETTINGS] || {}, partial));
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, function () {
        callback(settings);
      });
    });
  }

  function broadcastSettings(settings) {
    chrome.tabs.query({ url: "https://www.youtube.com/*" }, function (tabs) {
      tabs.forEach(function (tab) {
        chrome.tabs.sendMessage(tab.id, { type: "YTFF_SETTINGS_UPDATED", settings: settings }, function () {
          void chrome.runtime.lastError;
        });
      });
    });
  }

  function classifyVideo(video, callback) {
    chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.CACHE], function (data) {
      const settings = normalizeSettings(data[STORAGE_KEYS.SETTINGS]);
      const fingerprint = getFingerprint(video, settings);
      const cache = data[STORAGE_KEYS.CACHE] || {};

      if (cache[fingerprint]) {
        callback(cache[fingerprint]);
        return;
      }

      const ruleResult = runRuleClassifier(video, settings);
      const shouldUseAi = ruleResult.confidence < 72 && ruleResult.score > UNCERTAIN_LOW && ruleResult.score < UNCERTAIN_HIGH;
      const finalResult = shouldUseAi ? runLocalAiClassifier(video, settings, ruleResult) : ruleResult;

      finalResult.id = video.id || fingerprint;
      finalResult.aiUsed = shouldUseAi;
      finalResult.strictMode = settings.strictMode;
      finalResult.shouldBlur = settings.enabled && shouldBlurResult(finalResult, settings);

      cache[fingerprint] = finalResult;
      pruneCache(cache);
      chrome.storage.local.set({ [STORAGE_KEYS.CACHE]: cache }, function () {
        callback(finalResult);
      });
    });
  }

  function runRuleClassifier(video, settings) {
    const text = buildSearchText(video);
    const matches = [];
    const categoryScores = {};
    let score = 0;

    PRODUCTIVE_RULES.concat(keywordRules(settings.customAllowedKeywords, -55, "custom allowed")).forEach(function (rule) {
      const count = countMatches(text, rule.pattern);
      if (!count) return;
      const weight = rule.weight * Math.min(count, 2);
      score += weight;
      matches.push({ keyword: rule.pattern, weight: weight, reason: rule.reason, type: "productive" });
    });

    const productiveOverride = getProductiveOverride(matches);
    if (productiveOverride) {
      return {
        source: "rules",
        category: CATEGORY.EDUCATIONAL,
        contentCategory: "Productive Content",
        confidence: 98,
        score: Math.min(score, -70),
        reason: "Allowed: " + productiveOverride.reason,
        signals: matches.slice(0, 6),
        protected: true
      };
    }

    DISTRACTION_RULES.concat(keywordRules(settings.customBlockedKeywords, 42, "custom blocked", "Custom Blocked")).forEach(function (rule) {
      const count = countMatches(text, rule.pattern);
      if (!count) return;
      const weight = rule.weight * Math.min(count, 2);
      score += weight;
      categoryScores[rule.category] = (categoryScores[rule.category] || 0) + Math.max(0, weight);
      matches.push({ keyword: rule.pattern, weight: weight, reason: rule.reason, category: rule.category, type: "distraction" });
    });

    score += durationScore(video.durationSeconds);
    score += badgeScore(video.badges || []);

    const contentCategory = topContentCategory(categoryScores);
    const category = categoryFromScore(score, settings.strictMode);
    return {
      source: "rules",
      category: category,
      contentCategory: contentCategory,
      confidence: confidenceFromScore(score),
      score: score,
      reason: buildReason(matches, score, category, contentCategory),
      signals: matches.slice(0, 6)
    };
  }

  function runLocalAiClassifier(video, settings, ruleResult) {
    const text = buildSearchText(video);
    const title = String(video.title || "").toLowerCase();
    const channel = String(video.channelName || "").toLowerCase();
    let entertainmentIntent = 0;
    let learningIntent = 0;
    const reasons = [];

    [
      "official", "album", "remix", "episode", "challenge", "highlights", "fails",
      "compilation", "behind the scenes", "teaser", "dance", "stream", "ranked"
    ].forEach(function (term) {
      if (containsTerm(text, term)) {
        entertainmentIntent += 12;
        reasons.push(term);
      }
    });

    [
      "how to", "full course", "roadmap", "crash course", "walkthrough", "problem",
      "solution", "class", "notes", "revision", "bootcamp", "build", "debug"
    ].forEach(function (term) {
      if (containsTerm(text, term)) {
        learningIntent += 16;
        reasons.push(term);
      }
    });

    if (/\b(part|episode)\s+\d+\b/.test(title)) entertainmentIntent += 8;
    if (/\b\d+\s*(hours?|mins?|minutes?)\b/.test(title) && containsTerm(text, "course")) learningIntent += 12;
    if (channel.indexOf("academy") >= 0 || channel.indexOf("university") >= 0 || channel.indexOf("freecodecamp") >= 0) learningIntent += 20;

    const blendedScore = ruleResult.score + entertainmentIntent - learningIntent;
    const category = categoryFromScore(blendedScore, settings.strictMode);
    const confidence = clamp(62 + Math.abs(entertainmentIntent - learningIntent) + Math.abs(ruleResult.score) / 3, 58, 94);

    return {
      source: "ai-local",
      category: category,
      contentCategory: ruleResult.contentCategory || category,
      confidence: Math.round(confidence),
      score: Math.round(blendedScore),
      reason: buildAiReason(category, reasons, ruleResult),
      signals: ruleResult.signals
    };
  }

  function shouldBlurResult(result, settings) {
    if (result.protected) return false;
    if (result.category === CATEGORY.EDUCATIONAL || result.category === CATEGORY.PRODUCTIVE) return false;
    const threshold = settings.strictMode ? STRICT_THRESHOLD : DISTRACTION_THRESHOLD;
    return result.category === CATEGORY.DISTRACTING || result.category === CATEGORY.ENTERTAINMENT || result.score >= threshold;
  }

  function recordDistraction(result, callback) {
    chrome.storage.local.get(STORAGE_KEYS.STATS, function (data) {
      const stats = normalizeStats(data[STORAGE_KEYS.STATS]);
      const today = getTodayKey();
      const id = result.id || "unknown";
      ensureDay(stats, today);

      if (!stats.days[today].seenDistractingIds[id]) {
        stats.days[today].seenDistractingIds[id] = true;
        stats.days[today].distractionsBlocked += 1;
        stats.days[today].aiClassifications += result.aiUsed ? 1 : 0;
        stats.days[today].confidenceTotal += Number(result.confidence) || 0;
        stats.days[today].confidenceSamples += 1;
        stats.days[today].productiveScore = calculateScore(stats.days[today]);
        stats.days[today].focusUsed = true;
      }

      chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats }, function () {
        callback(summarizeStats(stats));
      });
    });
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

  function keywordRules(keywords, weight, label, category) {
    return normalizeKeywordList(keywords).map(function (keyword) {
      return { pattern: keyword, weight: weight, reason: label + ": " + keyword, category: category || label };
    });
  }

  function buildSearchText(video) {
    return [
      video.title,
      video.channelName,
      (video.badges || []).join(" "),
      video.metadata,
      video.durationText
    ].join(" ").toLowerCase();
  }

  function countMatches(text, pattern) {
    const keyword = cleanKeyword(pattern);
    if (!keyword) return 0;
    if (keyword.indexOf(" ") >= 0) return text.indexOf(keyword) >= 0 ? 1 : 0;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "gi"));
    return matches ? matches.length : 0;
  }

  function containsTerm(text, term) {
    return countMatches(text, term) > 0;
  }

  function durationScore(durationSeconds) {
    const seconds = Number(durationSeconds) || 0;
    if (!seconds) return 0;
    if (seconds <= 75) return 22;
    if (seconds <= 180) return 8;
    if (seconds >= 3600) return -14;
    if (seconds >= 1800) return -8;
    return 0;
  }

  function badgeScore(badges) {
    const text = badges.join(" ").toLowerCase();
    let score = 0;
    if (text.indexOf("live") >= 0) score += 12;
    if (text.indexOf("new") >= 0) score += 4;
    return score;
  }

  function categoryFromScore(score, strictMode) {
    const threshold = strictMode ? STRICT_THRESHOLD : DISTRACTION_THRESHOLD;
    if (score <= -45) return CATEGORY.EDUCATIONAL;
    if (score <= -20) return CATEGORY.PRODUCTIVE;
    if (score >= threshold + 25) return CATEGORY.DISTRACTING;
    if (score >= threshold) return CATEGORY.ENTERTAINMENT;
    return CATEGORY.NEUTRAL;
  }

  function getProductiveOverride(matches) {
    const productiveMatches = matches.filter(function (match) {
      return match.type === "productive";
    });
    if (!productiveMatches.length) return null;
    productiveMatches.sort(function (a, b) {
      return a.weight - b.weight;
    });
    return productiveMatches[0];
  }

  function topContentCategory(categoryScores) {
    const categories = Object.keys(categoryScores || {});
    if (!categories.length) return "";
    categories.sort(function (a, b) {
      return categoryScores[b] - categoryScores[a];
    });
    return categories[0];
  }

  function confidenceFromScore(score) {
    return Math.round(clamp(52 + Math.abs(score) * 1.15, 50, 98));
  }

  function buildReason(matches, score, category, contentCategory) {
    if (contentCategory && score >= DISTRACTION_THRESHOLD) return contentCategory;
    if (!matches.length) return category + " by weighted score " + score + ".";
    const sorted = matches.slice().sort(function (a, b) {
      return Math.abs(b.weight) - Math.abs(a.weight);
    });
    if (sorted[0] && sorted[0].category && sorted[0].weight > 0) return sorted[0].category;
    return sorted.slice(0, 3).map(function (match) {
      return match.reason;
    }).join(", ");
  }

  function buildAiReason(category, reasons, ruleResult) {
    const unique = [];
    reasons.forEach(function (reason) {
      if (unique.indexOf(reason) === -1) unique.push(reason);
    });
    if (unique.length) return category + " pattern: " + unique.slice(0, 3).join(", ");
    return "AI fallback refined uncertain rule score " + ruleResult.score + ".";
  }

  function normalizeStats(stats) {
    const normalized = Object.assign({}, DEFAULT_STATS, stats || {});
    normalized.days = normalized.days || {};
    Object.keys(normalized.days).forEach(function (dayKey) {
      const day = normalized.days[dayKey] || {};
      normalized.days[dayKey] = {
        distractionsBlocked: Number(day.distractionsBlocked) || 0,
        productiveScore: Number(day.productiveScore) || 100,
        aiClassifications: Number(day.aiClassifications) || 0,
        confidenceTotal: Number(day.confidenceTotal) || 0,
        confidenceSamples: Number(day.confidenceSamples) || 0,
        seenDistractingIds: day.seenDistractingIds || {},
        focusUsed: Boolean(day.focusUsed)
      };
    });
    return normalized;
  }

  function ensureDay(stats, dayKey) {
    if (!stats.days[dayKey]) {
      stats.days[dayKey] = {
        distractionsBlocked: 0,
        productiveScore: 100,
        aiClassifications: 0,
        confidenceTotal: 0,
        confidenceSamples: 0,
        seenDistractingIds: {},
        focusUsed: false
      };
    }
  }

  function summarizeStats(stats) {
    const today = getTodayKey();
    ensureDay(stats, today);
    const day = stats.days[today];
    return {
      today: {
        distractionsBlocked: day.distractionsBlocked,
        productiveScore: calculateScore(day),
        aiClassifications: day.aiClassifications,
        averageConfidence: day.confidenceSamples ? Math.round(day.confidenceTotal / day.confidenceSamples) : 0
      },
      streak: calculateStreak(stats.days, today)
    };
  }

  function calculateScore(day) {
    return clamp(100 - day.distractionsBlocked * 3 + Math.min(day.aiClassifications, 10), 35, 100);
  }

  function calculateStreak(days, todayKey) {
    let streak = 0;
    const cursor = parseDateKey(todayKey);
    while (cursor) {
      const key = formatDateKey(cursor);
      if (!days[key] || !days[key].focusUsed) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function getFingerprint(video, settings) {
    return hashText([
      "classifier-v3-multicategory",
      video.id,
      video.title,
      video.channelName,
      video.metadata,
      video.durationText,
      settings.strictMode ? "strict" : "normal",
      settings.customBlockedKeywords.join("|"),
      settings.customAllowedKeywords.join("|")
    ].join("::"));
  }

  function pruneCache(cache) {
    const keys = Object.keys(cache);
    if (keys.length <= 600) return;
    keys.slice(0, keys.length - 500).forEach(function (key) {
      delete cache[key];
    });
  }

  function hashText(text) {
    let hash = 0;
    const value = String(text || "");
    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return "h" + Math.abs(hash);
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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
})();
