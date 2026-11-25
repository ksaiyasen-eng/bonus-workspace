import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-lao/400.css'
import '@fontsource/noto-sans-lao/600.css'
import '@fontsource/noto-sans-lao/700.css'
import './app.css'
import App from './App.tsx'

// start at the top after a reload, so a warning above the page content is never scrolled out of view
history.scrollRestoration = 'manual'

createRoot(document.getElementById('root')!).render(<App />)
