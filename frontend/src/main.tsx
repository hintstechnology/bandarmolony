import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'

const rootElement = document.documentElement
rootElement.classList.remove('light')
rootElement.classList.add('dark')

if (typeof window !== 'undefined') {
  try {
    localStorage.setItem('theme', 'dark')
  } catch (error) {
    console.warn('Unable to persist theme preference', error)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>,
)
