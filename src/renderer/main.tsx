import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Entry for the main BriefOS window (index.html → #root).
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
