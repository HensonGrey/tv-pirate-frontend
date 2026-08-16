import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import Hls from 'hls.js'
import './index.css'
import App from './App.tsx'

// Hand vidstack's HLS provider its library from our bundle — its default is
// a runtime fetch from cdn.jsdelivr.net, which dies on networks that block
// the CDN. The inert tag in index.html makes the loader skip that fetch
// and take this constructor instead. vault:streaming-providers-deep-dive#architecture
declare global {
  interface Window {
    Hls: typeof Hls
  }
}
window.Hls = Hls

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* attribute="class" puts .dark on the html element (drives the dark variant); defaultTheme="system" follows the OS until the user picks one. */}
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
