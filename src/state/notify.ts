export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function fireNotification(
  title: string,
  opts?: { body?: string; tag?: string; onClick?: () => void },
): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  const n = new Notification(title, { body: opts?.body, tag: opts?.tag })
  if (opts?.onClick) {
    n.onclick = () => {
      window.focus()
      opts.onClick?.()
      n.close()
    }
  }
}
