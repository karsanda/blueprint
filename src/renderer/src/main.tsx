import '@fontsource-variable/overpass'
import '@fontsource-variable/cascadia-code'
import './theme/tokens.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { installProbe } from './terminal/probe'

// Load both faces before the first render, so terminals measure their cells with the right font.
await Promise.all([
  document.fonts.load('13px "Overpass Variable"'),
  document.fonts.load('13px "Cascadia Code Variable"'),
])

installProbe()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
