import React from 'react'
import ReactDOM from 'react-dom/client'
import Overlay from './Overlay'
import './index.css'

// Entry for the floating always-on-top recording widget (overlay.html).
ReactDOM.createRoot(document.getElementById('overlay-root') as HTMLElement).render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
)
