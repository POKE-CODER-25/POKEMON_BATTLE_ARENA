import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { runBattleValidationExamples } from './data/battleResolverValidationExamples.js'

if (import.meta.env.DEV) {
  window.runBattleValidationExamples = runBattleValidationExamples
  console.info(
    'Battle validation helper available: window.runBattleValidationExamples()',
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
