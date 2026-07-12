(function () {
  "use strict";

  var script = document.currentScript;
  if (!script || script.dataset.aijouMounted === "true") return;
  script.dataset.aijouMounted = "true";

  var workspaceKey = script.dataset.workspace || "";
  var apiOrigin = new URL(script.src, window.location.href).origin;
  var storageKey = "aijou-widget:" + workspaceKey + ":" + window.location.origin;
  var state = loadState();
  var lastPollAt = new Date(Date.now() - 60000).toISOString();
  var pollingTimer = null;
  var syncPromise = null;
  var sessionPromise = null;
  var historyLoaded = false;

  var host = document.createElement("div");
  host.id = "aijou-chat-widget";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    '<style>' +
    ':host{all:initial;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#17201d}' +
    '.launcher{position:fixed;right:22px;bottom:22px;z-index:2147483000;width:58px;height:58px;border:0;border-radius:18px;background:#17201d;color:#fff;box-shadow:0 16px 42px rgba(15,30,25,.28);font-size:23px;cursor:pointer}' +
    '.panel{position:fixed;right:22px;bottom:92px;z-index:2147483000;width:min(380px,calc(100vw - 28px));height:min(610px,calc(100vh - 120px));background:#f7f8f5;border:1px solid #dfe5df;border-radius:22px;box-shadow:0 24px 70px rgba(15,30,25,.28);display:none;overflow:hidden}' +
    '.panel.open{display:grid;grid-template-rows:auto 1fr auto}.head{display:flex;align-items:center;gap:12px;padding:16px;background:#fff;border-bottom:1px solid #e5e9e5}' +
    '.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#17201d;color:#fff;font-weight:800}.head-copy{flex:1}.head strong,.head small{display:block}.head small{color:#6d7973;margin-top:2px}' +
    '.close{border:0;background:transparent;font-size:22px;cursor:pointer}.messages{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:10px}' +
    '.bubble{max-width:84%;padding:10px 12px;border-radius:14px;line-height:1.45;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}.agent{align-self:flex-start;background:#fff;border:1px solid #e0e5e0}.visitor{align-self:flex-end;background:#496d62;color:#fff}.system{align-self:center;color:#6d7973;font-size:12px}' +
    '.composer{display:grid;grid-template-columns:1fr auto;gap:8px;padding:12px;background:#fff;border-top:1px solid #e5e9e5}.composer input{min-width:0;border:1px solid #cfd7d1;border-radius:12px;padding:11px 12px;font:inherit}.composer button{border:0;border-radius:12px;padding:0 16px;background:#17201d;color:#fff;font-weight:700;cursor:pointer}.composer button:disabled{opacity:.55;cursor:wait}.error{color:#a2392f;font-size:12px;padding:0 14px 10px;background:#fff}' +
    '@media(max-width:520px){.launcher{right:14px;bottom:14px}.panel{right:14px;bottom:82px;height:calc(100vh - 100px)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}' +
    '</style>' +
    '<button class="launcher" type="button" aria-label="Buka chat Aijou" aria-haspopup="dialog" aria-expanded="false" aria-controls="aijou-chat-panel">AI</button>' +
    '<section class="panel" id="aijou-chat-panel" role="dialog" aria-modal="false" aria-labelledby="aijou-chat-title" tabindex="-1">' +
    '<header class="head"><span class="mark" aria-hidden="true">AI</span><span class="head-copy"><strong class="agent-name" id="aijou-chat-title">Aijou AI</strong><small>Online untuk membantu</small></span><button class="close" type="button" aria-label="Tutup chat">&times;</button></header>' +
    '<div class="messages" role="log" aria-live="polite" aria-relevant="additions"></div>' +
    '<div><form class="composer"><input maxlength="1200" autocomplete="off" placeholder="Ceritakan kebutuhanmu..." aria-label="Pesan"/><button type="submit">Kirim</button></form><div class="error" role="alert" aria-live="assertive" hidden></div></div>' +
    '</section>';

  var panel = root.querySelector(".panel");
  var launcher = root.querySelector(".launcher");
  var closeButton = root.querySelector(".close");
  var messages = root.querySelector(".messages");
  var form = root.querySelector(".composer");
  var input = form.querySelector("input");
  var submit = form.querySelector("button");
  var errorBox = root.querySelector(".error");
  var agentName = root.querySelector(".agent-name");
  var defaultGreeting = script.dataset.greeting || "Halo, saya Aijou. Ceritakan kebutuhan bisnis atau teknologi yang ingin kamu bangun.";
  var greetingBubble = addBubble("agent", defaultGreeting);

  applyWidgetConfig(state);
  if (state.pendingMessage && state.pendingMessage.text) {
    input.value = state.pendingMessage.text;
  }

  launcher.addEventListener("click", function () {
    if (panel.classList.contains("open")) {
      closePanel();
      return;
    }
    openPanel();
  });
  closeButton.addEventListener("click", closePanel);
  panel.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closePanel();
  });
  form.addEventListener("submit", sendMessage);

  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (parsed && parsed.token && Date.parse(parsed.expiresAt) > Date.now()) return parsed;
    } catch (_) {}
    localStorage.removeItem(storageKey);
    return {};
  }

  function openPanel() {
    panel.classList.add("open");
    launcher.setAttribute("aria-expanded", "true");
    clearError();
    input.focus();
    ensureSession()
      .then(syncHistory)
      .then(startPolling)
      .catch(showError);
  }

  function closePanel() {
    panel.classList.remove("open");
    launcher.setAttribute("aria-expanded", "false");
    stopPolling();
    launcher.focus();
  }

  function ensureSession() {
    if (state.token && Date.parse(state.expiresAt) > Date.now()) {
      applyWidgetConfig(state);
      return Promise.resolve(state);
    }
    if (sessionPromise) return sessionPromise;
    sessionPromise = fetchWithTimeout(apiOrigin + "/api/web-chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Aijou-Workspace": workspaceKey },
      body: JSON.stringify({ workspaceKey: workspaceKey })
    }, 15000).then(readJson).then(function (data) {
      historyLoaded = false;
      lastPollAt = new Date(Date.now() - 60000).toISOString();
      messages.textContent = "";
      greetingBubble = addBubble("agent", defaultGreeting);
      state = {
        token: data.token,
        expiresAt: data.expiresAt,
        agentName: data.agent,
        greeting: data.greeting,
        pendingMessage: state.pendingMessage
      };
      persistState();
      applyWidgetConfig(state);
      return state;
    }).finally(function () {
      sessionPromise = null;
    });
    return sessionPromise;
  }

  function sendMessage(event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || submit.disabled) return;
    var retry = state.pendingMessage && state.pendingMessage.text === text
      ? state.pendingMessage
      : { text: text, id: createId() };
    state.pendingMessage = retry;
    persistState();
    input.value = "";
    var optimisticBubble = addBubble("visitor", text);
    setBusy(true);
    clearError();

    ensureSession().then(syncHistory).then(function () {
      if (!optimisticBubble.isConnected) optimisticBubble = addBubble("visitor", text);
      return fetchWithTimeout(apiOrigin + "/api/web-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Aijou-Workspace": workspaceKey,
          "Authorization": "Bearer " + state.token
        },
        body: JSON.stringify({
          message: text,
          chatToken: state.token,
          workspaceKey: workspaceKey,
          clientMessageId: retry.id
        })
      }, 25000);
    }).then(readJson).then(function (data) {
      if (data.reply) addBubble("agent", data.reply);
      delete state.pendingMessage;
      persistState();
    }).catch(function (error) {
      optimisticBubble.remove();
      showError(error);
      input.value = text;
    }).finally(function () {
      setBusy(false);
      if (panel.classList.contains("open")) input.focus();
    });
  }

  function syncHistory() {
    if (!state.token) return Promise.resolve();
    if (syncPromise) return syncPromise;
    var pollStartedAt = new Date().toISOString();
    var includeHistory = !historyLoaded;
    var url = apiOrigin + "/api/web-chat?since=" + encodeURIComponent(lastPollAt) +
      (includeHistory ? "&history=1" : "");
    syncPromise = fetchWithTimeout(
      url,
      { headers: { "X-Aijou-Workspace": workspaceKey, "Authorization": "Bearer " + state.token } },
      12000
    ).then(readJson).then(function (data) {
      if (includeHistory) {
        historyLoaded = true;
        if (data.history && data.history.length) {
          messages.textContent = "";
          greetingBubble = null;
          data.history.forEach(function (item) {
            var role = item.role === "visitor" || item.role === "system" ? item.role : "agent";
            addBubble(role, item.text, item.id);
          });
        }
      }
      (data.messages || []).forEach(function (item) {
        if (!messages.querySelector('[data-id="' + cssEscape(item.id) + '"]')) {
          addBubble("agent", item.text, item.id);
        }
      });
      lastPollAt = pollStartedAt;
    }).finally(function () {
      syncPromise = null;
    });
    return syncPromise;
  }

  function startPolling() {
    if (!panel.classList.contains("open")) return;
    if (pollingTimer) clearInterval(pollingTimer);
    pollingTimer = setInterval(function () {
      if (!document.hidden && panel.classList.contains("open")) {
        ensureSession().then(syncHistory).catch(showError);
      }
    }, 5000);
  }

  function stopPolling() {
    if (!pollingTimer) return;
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  function addBubble(role, text, id) {
    var bubble = document.createElement("div");
    bubble.className = "bubble " + role;
    if (id) bubble.dataset.id = id;
    bubble.textContent = text;
    messages.appendChild(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    var requestOptions = Object.assign({}, options || {}, { signal: controller.signal });
    return fetch(url, requestOptions).catch(function (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Chat butuh waktu terlalu lama. Coba kirim lagi ya.");
      }
      throw error;
    }).finally(function () {
      clearTimeout(timer);
    });
  }

  function readJson(response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok) {
        if (response.status === 401) {
          resetSession();
        }
        throw new Error(data.error || "Chat sedang tidak tersedia.");
      }
      return data;
    });
  }

  function resetSession() {
    state = { pendingMessage: state.pendingMessage };
    historyLoaded = false;
    lastPollAt = new Date(Date.now() - 60000).toISOString();
    messages.textContent = "";
    greetingBubble = addBubble("agent", defaultGreeting);
    persistState();
    applyWidgetConfig(state);
  }

  function setBusy(value) {
    submit.disabled = value;
    form.setAttribute("aria-busy", value ? "true" : "false");
    submit.textContent = value ? "..." : "Kirim";
  }
  function showError(error) {
    errorBox.textContent = error && error.message ? error.message : "Chat sedang tidak tersedia.";
    errorBox.hidden = false;
  }
  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }
  function applyWidgetConfig(config) {
    var configuredName = script.dataset.agentName || config.agentName || "Aijou AI";
    var configuredGreeting = script.dataset.greeting || config.greeting || defaultGreeting;
    agentName.textContent = configuredName;
    if (greetingBubble && !historyLoaded) greetingBubble.textContent = configuredGreeting;
  }
  function persistState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {}
  }
  function createId() {
    return window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random();
  }
  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/"/g, "");
  }
})();
