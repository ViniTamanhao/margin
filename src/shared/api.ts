export const channels = {
  appInfo: 'app:info'
} as const

export interface AppInfo {
  name: string
  version: string
}

export interface MarginAPI {
  app: { info(): Promise<AppInfo> }
}
