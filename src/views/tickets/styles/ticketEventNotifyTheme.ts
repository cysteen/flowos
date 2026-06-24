/** 工单动态通知（催单 / 补充）· 与 OpStatGrid warn、OpActionModal tone 对齐 */
export const TICKET_EVENT_NOTIFY_THEME = {
  surface: '#ffffff',
  border: '#e5e7eb',
  shadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
  text: {
    title: '#111827',
    meta: '#6b7280',
    body: '#374151',
    muted: '#9ca3af',
  },
  urge: {
    accent: '#d97706',
    iconBg: '#fffbeb',
    icon: '#d97706',
  },
  supplement: {
    accent: '#1a6fff',
    iconBg: '#eff6ff',
    icon: '#1a6fff',
  },
} as const;
