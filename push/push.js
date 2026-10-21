// DSH 订阅页逻辑 v2
//
// 关键顺序约束（design/01 §10.1，缺口 N1）：
//   Notification.requestPermission() 必须是用户点击后的**第一个**异步调用。
//   因此点击处理器里同步发起权限请求、拿到 Promise，再交给异步流程 await；
//   注册 Service Worker、取公钥等一律排在授权之后。
//
// 视觉与文案：design/02-订阅页UI视觉设计.md §6 / §8

// 改成通过 Cloudflare Tunnel 暴露的推送服务地址，不要在末尾加斜杠。
const PUSH_API_BASE = "https://push.kysoul.me";

// 距上次成功订阅不足该时长时，跳过重新订阅与测试通知（01 §10.3）。
const RESUBSCRIBE_THROTTLE_MS = 30_000;

const SW_URL = "./sw.js";

const el = {
  checks: document.getElementById("checks"),
  checkSummary: document.getElementById("checkSummary"),
  headerTag: document.getElementById("headerTag"),
  panelForm: document.getElementById("panelForm"),
  panelSubscribed: document.getElementById("panelSubscribed"),
  code: document.getElementById("code"),
  toggleCode: document.getElementById("toggleCode"),
  enable: document.getElementById("enable"),
  disable: document.getElementById("disable"),
  testPush: document.getElementById("testPush"),
  status: document.getElementById("status"),
  metaCreated: document.getElementById("metaCreated"),
  metaLast: document.getElementById("metaLast"),
  metaDevice: document.getElementById("metaDevice"),
  reauthRow: document.getElementById("reauthRow"),
  reauthLabel: document.getElementById("reauthLabel"),
  reauthCode: document.getElementById("reauthCode"),
  reauthConfirm: document.getElementById("reauthConfirm"),
  reauthCancel: document.getElementById("reauthCancel"),
  panelMessages: document.getElementById("panelMessages"),
  msgsList: document.getElementById("msgsList"),
  msgsMeta: document.getElementById("msgsMeta"),
  msgsHint: document.getElementById("msgsHint"),
};

// 阅读完整消息的凭证（订阅时服务端下发，只存在本机，不进订阅码）
const INBOX_KEY_STORAGE = "dsh-push-inbox-key";

// ---------------------------------------------------------------------------
// 环境检测（01 §10.2）
// ---------------------------------------------------------------------------

function detectEnvironment() {
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  const permission =
    typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  return { supported, standalone, permission };
}

let env = detectEnvironment();

const CHECK_DEFS = [
  {
    key: "supported",
    label: "浏览器支持网页推送",
    ok: "支持",
    bad: "不支持",
    fix: "请使用 iOS 16.4 或更高版本的 Safari，并从主屏幕图标打开。",
  },
  {
    key: "standalone",
    label: "已从主屏幕图标启动",
    ok: "是",
    bad: "否",
    fix: "点 Safari 的分享按钮 →「添加到主屏幕」→ 关闭 Safari → 从桌面图标重新打开。",
  },
  {
    key: "permission",
    label: "系统通知权限",
    ok: "已允许",
    warn: "尚未询问",
    bad: "已拒绝",
    fix: "若已拒绝，需在「设置 → 通知 → 对应网站」中重新开启。",
  },
];

function renderChecks() {
  const tones = {
    supported: env.supported ? "ok" : "bad",
    standalone: env.standalone ? "ok" : "bad",
    permission:
      env.permission === "granted" ? "ok" : env.permission === "denied" ? "bad" : "warn",
  };

  let pending = 0;
  el.checks.innerHTML = CHECK_DEFS.map((def) => {
    const tone = tones[def.key];
    if (tone === "bad") pending += 1;
    const fix = tone === "ok" ? "" : `<p class="check-fix">${def.fix}</p>`;
    return `<li class="check-row">
      <span class="check-label">${def.label}</span>
      <span class="tag tag--${tone}">${def[tone]}</span>
      ${fix}
    </li>`;
  }).join("");

  el.checkSummary.textContent = pending > 0 ? `${pending} 项待处理` : "全部通过";
}

// ---------------------------------------------------------------------------
// 状态机（02 §4）
// ---------------------------------------------------------------------------

const STATE = {
  CHECKING: "checking",
  UNSUPPORTED: "unsupported",
  IDLE: "idle",
  BUSY: "busy",
  SUBSCRIBED: "subscribed",
  ERROR: "error",
};

const MESSAGES = {
  checking: { text: "正在检测当前环境…", tone: "" },
  unsupported: { text: "当前环境不支持网页推送，请看上方自检结果的修复提示。", tone: "err" },
  idle: { text: "", tone: "" },
  busy: { text: "正在申请系统通知权限…", tone: "" },
  subscribed: { text: "已开启。测试通知即将到达。", tone: "ok" },
  error: { text: "订阅访问码不正确。", tone: "err" },
};

function setState(next, message) {
  const subscribed = next === STATE.SUBSCRIBED;
  const busy = next === STATE.BUSY;
  const blocked = busy || next === STATE.UNSUPPORTED || next === STATE.CHECKING;

  el.panelForm.hidden = subscribed;
  el.panelSubscribed.hidden = !subscribed;
  // 消息面板：已订阅（老订阅会自证端点补发凭证）或本机已有凭证时都显示
  el.panelMessages.hidden = !(subscribed || loadInboxKey());
  if (!el.panelMessages.hidden) loadMessages().catch(() => {});
  el.code.disabled = blocked;
  el.enable.disabled = blocked;
  el.disable.disabled = busy;
  el.testPush.disabled = busy;

  el.headerTag.textContent = subscribed ? "已订阅" : "未订阅";
  el.headerTag.className = subscribed ? "tag tag--ok" : "tag";

  el.enable.innerHTML = busy
    ? '<span class="spinner" aria-hidden="true"></span>正在开启…'
    : "开启 DSH 通知";

  if (message !== undefined) showStatus(message.text, message.tone);
}

function showStatus(text, tone) {
  if (!text) {
    el.status.textContent = "";
    el.status.removeAttribute("data-tone");
    return;
  }
  el.status.textContent = text;
  el.status.setAttribute("data-tone", tone || "");
}

// ---------------------------------------------------------------------------
// 访问码：只保留在内存，不落盘、不进浏览器存储
// ---------------------------------------------------------------------------

let sessionCode = "";
let lastSubscribeAt = 0;
let pendingResolver = null;

function ensureCode(prompt) {
  if (sessionCode) return Promise.resolve(sessionCode);
  return new Promise((resolve) => {
    pendingResolver = resolve;
    el.reauthLabel.textContent = prompt;
    el.reauthCode.value = "";
    el.reauthRow.hidden = false;
    el.reauthCode.focus();
  });
}

function closeReauth(value) {
  el.reauthRow.hidden = true;
  el.reauthCode.value = "";
  const resolve = pendingResolver;
  pendingResolver = null;
  if (resolve) resolve(value);
}

el.reauthConfirm.addEventListener("click", () => {
  const value = el.reauthCode.value.trim();
  if (!value) {
    showStatus("请先输入订阅访问码。", "err");
    return;
  }
  sessionCode = value;
  closeReauth(value);
});

el.reauthCancel.addEventListener("click", () => {
  closeReauth(null);
  showStatus("已取消。", "");
});

el.toggleCode.addEventListener("click", () => {
  const isHidden = el.code.type === "password";
  el.code.type = isHidden ? "text" : "password";
  el.toggleCode.setAttribute("aria-label", isHidden ? "隐藏访问码" : "显示访问码");
});

// ---------------------------------------------------------------------------
// 网络层
// ---------------------------------------------------------------------------

const ERROR_TEXT = {
  invalid_code: "订阅访问码不正确。",
  origin_not_allowed: "当前页面来源不在服务器白名单里，请检查 ALLOWED_ORIGINS 配置。",
  rate_limited: "操作过于频繁，请稍后再试。",
  invalid_subscription: "浏览器返回的订阅信息不完整，请重新开启一次。",
  subscription_not_found: "服务端没有这台设备的订阅记录，请重新开启一次。",
  push_failed: "推送服务返回失败，请查看服务端日志。",
  unsupported_media_type: "请求格式不被接受，请升级到最新版本。",
};

async function api(path, { method = "POST", code, body, inboxKey, endpoint } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (code) headers["X-Subscribe-Code"] = code;
  if (inboxKey) headers["X-Inbox-Key"] = inboxKey;
  if (endpoint) headers["X-Push-Endpoint"] = endpoint;

  const response = await fetch(`${PUSH_API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12_000),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(ERROR_TEXT[data.error] || `请求失败（${response.status}）。`);
    error.code = data.error;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// 订阅操作
// ---------------------------------------------------------------------------

async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  if (!window.location.protocol.startsWith("http")) return null; // file:// 下无 SW
  return navigator.serviceWorker.getRegistration("./");
}

async function currentSubscription() {
  const registration = await getRegistration();
  return (await registration?.pushManager.getSubscription()) || null;
}

/**
 * 点击「开启」。
 *
 * 顺序不能调换：访问码与环境必须**在弹系统权限框之前**校验完毕。
 * iOS 上权限一旦授予就无法在页面内撤销，若访问码为空也照弹，
 * 用户就白授权一次，之后还得去「设置 → 通知」里收拾。
 * 校验通过后才同步发起权限请求（N1：必须是手势后的第一个异步调用）。
 */
el.enable.addEventListener("click", () => {
  const code = el.code.value.trim();
  if (!code) {
    showStatus("请先输入订阅访问码。", "err");
    el.code.focus();
    return;
  }

  env = detectEnvironment();
  renderChecks();
  if (!env.supported || !env.standalone) {
    return setState(STATE.UNSUPPORTED, MESSAGES.unsupported);
  }

  let permissionPromise;
  try {
    // 同步发起：这一步必须落在手势上下文内（N1）
    permissionPromise =
      typeof Notification === "undefined"
        ? Promise.resolve("unsupported")
        : Notification.requestPermission();
  } catch (error) {
    showStatus("无法申请系统通知权限，请确认已从主屏幕图标打开本页。", "err");
    return;
  }

  void runEnable(permissionPromise, code);
});

async function runEnable(permissionPromise, code) {
  setState(STATE.BUSY, MESSAGES.busy);

  let permission;
  try {
    permission = await permissionPromise;
  } catch (error) {
    return setState(STATE.ERROR, {
      text: "系统通知权限申请失败，请确认已从主屏幕图标打开本页。",
      tone: "err",
    });
  }

  if (permission !== "granted") {
    env = detectEnvironment();
    renderChecks();
    return setState(STATE.ERROR, {
      text: "没有获得系统通知权限，请在「设置 → 通知」中允许。",
      tone: "err",
    });
  }

  try {
    const existing = await currentSubscription();
    const throttled = existing && Date.now() - lastSubscribeAt < RESUBSCRIBE_THROTTLE_MS;

    let subscription = existing;
    if (!throttled) {
      const registration = await navigator.serviceWorker.register(SW_URL);
      await navigator.serviceWorker.ready;
      const { publicKey } = await api("/api/public-key", { method: "GET" });
      subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const subscribed = await api("/api/subscribe", { code, body: { subscription } });
      // 服务端只在订阅响应里下发一次阅读凭证；存本机 localStorage，用来读完整消息
      if (subscribed?.inboxKey) saveInboxKey(subscribed.inboxKey);
      lastSubscribeAt = Date.now();
    }

    sessionCode = code;
    el.code.value = "";
    env = detectEnvironment();
    setState(STATE.SUBSCRIBED, MESSAGES.subscribed);
    await loadMeta();
  } catch (error) {
    return setState(STATE.ERROR, { text: error.message || "开启通知失败。", tone: "err" });
  }
}

el.testPush.addEventListener("click", async () => {
  const code = await ensureCode("发送测试通知前，请再输入一次订阅访问码");
  if (!code) return;

  setState(STATE.BUSY, { text: "正在发送…", tone: "" });
  try {
    const subscription = await currentSubscription();
    if (!subscription) {
      return setState(STATE.ERROR, {
        text: "这台设备目前没有有效订阅，请重新开启。",
        tone: "err",
      });
    }
    await api("/api/test", { code, body: { endpoint: subscription.endpoint } });
    setState(STATE.SUBSCRIBED, { text: "测试通知已发送，请查看通知中心。", tone: "ok" });
    await loadMeta();
  } catch (error) {
    setState(STATE.ERROR, { text: error.message || "发送测试通知失败。", tone: "err" });
  }
});

el.disable.addEventListener("click", async () => {
  const code = await ensureCode("关闭通知前，请再输入一次订阅访问码");
  if (!code) return;

  setState(STATE.BUSY, { text: "正在关闭…", tone: "" });
  try {
    const subscription = await currentSubscription();
    if (subscription) {
      await api("/api/unsubscribe", { code, body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
    }
    sessionCode = "";
    lastSubscribeAt = 0;
    clearInboxKey();
    clearMeta();
    env = detectEnvironment();
    setState(STATE.IDLE, { text: "已关闭这台设备的 DSH 通知。", tone: "ok" });
  } catch (error) {
    setState(STATE.ERROR, { text: error.message || "关闭通知失败。", tone: "err" });
  }
});

// ---------------------------------------------------------------------------
// 最近消息：点开通知进 PWA 后读完整正文
// ---------------------------------------------------------------------------

function saveInboxKey(value) {
  try {
    localStorage.setItem(INBOX_KEY_STORAGE, value);
  } catch {
    // 隐私模式下写不进去：只影响「看完整消息」，不影响收通知
  }
}

function loadInboxKey() {
  try {
    return localStorage.getItem(INBOX_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

function clearInboxKey() {
  try {
    localStorage.removeItem(INBOX_KEY_STORAGE);
  } catch {
    // 忽略
  }
}

const REASON_LABELS = {
  completed: "已完成",
  error: "出错",
  aborted: "已中止",
  blocked: "待处理",
  "max-tokens": "达上限",
  interrupted: "被打断",
  ended: "已结束",
};

function shortTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function messageCard(message) {
  const item = document.createElement("div");
  item.className = "msg-item";
  item.dataset.messageId = message.id;

  const head = document.createElement("div");
  head.className = "msg-head";

  const title = document.createElement("span");
  title.className = "msg-title";
  const label = REASON_LABELS[message.reason] || message.reason || "";
  title.textContent = message.title || "DSH 任务通知";
  if (label) {
    const badge = document.createElement("span");
    badge.className = "tag";
    badge.style.marginLeft = "6px";
    badge.textContent = label;
    title.append(badge);
  }

  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = shortTime(message.createdAt);
  time.title = message.createdAt || "";

  head.append(title, time);
  item.append(head);

  const body = document.createElement("p");
  body.className = "msg-body";
  body.textContent = message.body || "";
  item.append(body);

  // 完整正文只在和摘要不同的情况下才折叠展示，避免重复
  const detail = message.detail || "";
  if (detail && detail !== message.body) {
    const wrap = document.createElement("details");
    wrap.className = "msg-detail";
    const summary = document.createElement("summary");
    summary.textContent = "查看完整内容";
    const text = document.createElement("div");
    text.className = "msg-detail-body";
    text.textContent = detail;
    wrap.append(summary, text);
    item.append(wrap);
  }
  return item;
}

function renderMessages(data) {
  el.msgsList.textContent = "";
  const topics = Array.isArray(data?.topics) ? data.topics : [];
  const total = topics.reduce((sum, topic) => sum + (topic.messages?.length || 0), 0);

  if (total === 0) {
    const empty = document.createElement("p");
    empty.className = "msg-empty";
    empty.textContent = "还没有消息。DSH 任务结束时这里会出现完整内容。";
    el.msgsList.append(empty);
    el.msgsMeta.textContent = "";
    return;
  }

  el.msgsMeta.textContent = `${total} 条 · 每话题最多 ${data.keepPerTopic ?? 2} 条`;
  for (const topic of topics) {
    const box = document.createElement("div");
    box.className = "msg-topic";

    const head = document.createElement("div");
    head.className = "msg-topic-head";
    const name = document.createElement("span");
    name.className = "msg-topic-name";
    name.textContent = topic.name || "未命名话题";
    name.title = topic.name || "";
    const when = document.createElement("span");
    when.className = "msg-topic-time";
    when.textContent = shortTime(topic.lastActivityAt);
    head.append(name, when);
    box.append(head);

    for (const message of topic.messages || []) box.append(messageCard(message));
    el.msgsList.append(box);
  }
}

/** 取本设备当前的推送端点（端点本身即不可猜的凭证，用于给老订阅补发阅读凭证）。 */
async function currentPushEndpoint() {
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration(SW_URL)) ||
      (await navigator.serviceWorker.getRegistration());
    if (!registration) return "";
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint || "";
  } catch {
    return "";
  }
}

async function loadMessages() {
  const inboxKey = loadInboxKey();
  let data;
  if (inboxKey) {
    data = await api("/api/messages", { method: "GET", inboxKey });
  } else {
    // 升级前订阅的设备没有 inboxKey：用推送端点自证身份，服务端会补发一枚
    const endpoint = await currentPushEndpoint();
    if (!endpoint) return;
    data = await api("/api/messages", { method: "GET", endpoint });
    if (data?.inboxKey) saveInboxKey(data.inboxKey);
  }
  renderMessages(data);
  focusLinkedMessage();
}

/** 通知点击会带上 #m=<id>：定位并高亮那一条 */
function focusLinkedMessage() {
  const match = /(?:^|[#&])m=([A-Za-z0-9_]+)/.exec(location.hash || "");
  if (!match) return;
  const node = el.msgsList.querySelector(`[data-message-id="${match[1]}"]`);
  if (!node) return;
  node.classList.add("is-focus");
  const details = node.querySelector("details");
  if (details) details.open = true;
  node.scrollIntoView({ block: "center", behavior: "smooth" });
  // 清掉 hash，避免 PWA 被反复拉到同一条
  history.replaceState(null, "", location.pathname + location.search);
}

// 切回前台时刷新（通知点开、从桌面图标回来都会走这里）
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (el.panelMessages.hidden) return;
  loadMessages().catch(() => {});
});

window.addEventListener("hashchange", () => {
  if (!el.panelMessages.hidden) focusLinkedMessage();
});

// ---------------------------------------------------------------------------
// 订阅信息
// ---------------------------------------------------------------------------

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clearMeta() {
  el.metaCreated.textContent = "—";
  el.metaLast.textContent = "—";
  el.metaDevice.textContent = "—";
}

async function loadMeta() {
  if (!sessionCode) return clearMeta();
  try {
    const subscription = await currentSubscription();
    if (!subscription) return clearMeta();
    const info = await api("/api/subscription-info", {
      code: sessionCode,
      body: { endpoint: subscription.endpoint },
    });
    el.metaCreated.textContent = formatTime(info.createdAt);
    el.metaLast.textContent = formatTime(info.lastSentAt);
    el.metaDevice.textContent = info.device || "—";
  } catch {
    // 信息展示失败不影响订阅状态本身
    clearMeta();
  }
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

// ---------------------------------------------------------------------------
// 初始化（N7：updateStatus 必须捕获异常，否则产生 unhandledrejection）
// ---------------------------------------------------------------------------

async function refresh() {
  env = detectEnvironment();
  renderChecks();

  if (!env.supported) return setState(STATE.UNSUPPORTED, MESSAGES.unsupported);

  try {
    const subscription = await currentSubscription();
    if (!subscription) {
      if (!env.standalone) return setState(STATE.UNSUPPORTED, MESSAGES.unsupported);
      return setState(STATE.IDLE, MESSAGES.idle);
    }

    // 已有订阅但若不是独立窗口，通知可能不会展示 —— 明确提示（02 §4）
    setState(
      STATE.SUBSCRIBED,
      env.standalone
        ? { text: "已开启。这台设备会收到 DSH 通知。", tone: "ok" }
        : { text: "已订阅，但当前不是从主屏幕图标打开，通知可能不会展示。", tone: "warn" },
    );

    // 浏览器可能已重新授权，刷新自检显示
    if (env.permission !== "granted") {
      showStatus(
        "已订阅，但系统通知权限未开启，需在「设置 → 通知」中允许后才能收到通知。",
        "warn",
      );
    }
  } catch (error) {
    showStatus(`读取订阅状态失败：${error.message}`, "err");
    setState(STATE.IDLE, MESSAGES.idle);
  }
}

setState(STATE.CHECKING, MESSAGES.checking);
refresh().catch((error) => {
  showStatus(`初始化失败：${error.message}`, "err");
});
