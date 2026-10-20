// Service Worker：接收推送、渲染通知、处理点击。
// 规则出处：design/03-通知内容与交互设计.md §4.3（图标与元数据）、§5（点击行为）。

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "任务已经结束。" };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "DSH 任务通知", {
      body: data.body || "任务已经结束。",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      tag: data.tag || "dsh-finished",
      renotify: true,
      lang: "zh-CN",
      dir: "auto",
      // 用真实事件时间排序，而不是推送到达时间（03 §4.3）
      timestamp: Number(data.timestamp) || Date.now(),
      data: { url: data.url || "./" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || "./",
    self.location.href,
  ).href;

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        // 全等匹配 client.url 在 standalone PWA 里几乎不成立
        // （实际 URL 常带查询参数或 hash），改为按 origin 复用（03 §5.2）。
        const targetOrigin = new URL(targetUrl).origin;
        for (const client of windows) {
          if (new URL(client.url).origin !== targetOrigin) continue;
          if (!("focus" in client)) continue;
          const focused = await client.focus();
          // navigate() 在部分 iOS 版本不可用，做能力检测回退
          return focused?.navigate ? focused.navigate(targetUrl) : focused;
        }
        return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
      }),
  );
});
