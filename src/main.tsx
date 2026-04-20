import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import './index.css'
import { Home } from './routes/Home'
import { Results } from './routes/Results'
import { DebugLinks } from './routes/DebugLinks'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/results" element={<Results />} />
        <Route path="/debug/links" element={<DebugLinks />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
