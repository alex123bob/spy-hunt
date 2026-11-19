export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function fireNotification(
  title: string,
  opts?: { body?: string; tag?: string; onClick?: () => void },
): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  let n: Notification
  try {
    n = new Notification(title, { body: opts?.body, tag: opts?.tag })
  } catch {
    // Some browsers (e.g. Android Chrome without a registered service worker) throw
    // on construction instead of simply being unsupported.
    return
  }
  n.onclick = () => {
    window.focus()
    opts?.onClick?.()
    n.close()
  }
}
