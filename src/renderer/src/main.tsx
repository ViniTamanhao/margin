import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { defaultAppearance, parseAppearance } from '../../shared/appearance'
import { applyAppearance } from './appearance'

async function start(): Promise<void> {
  let appearance = defaultAppearance
  try {
    appearance = parseAppearance(await window.margin.appearance.read()) ?? defaultAppearance
  } catch (error) {
    console.warn('Could not load appearance settings.', error)
  }
  applyAppearance(appearance)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialAppearance={appearance} />
    </StrictMode>
  )
}
void start()
