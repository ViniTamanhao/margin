import type { MarginAPI } from '../shared/api'

declare global {
  interface Window {
    margin: MarginAPI
  }
}
