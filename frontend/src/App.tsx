/**
 * Routes.
 *
 * Seven screens, all real: welcome, assistant, service discovery, service
 * detail, guided journey (index + per service), accessibility settings, and a
 * not-found page that offers a way back instead of a dead end.
 */

import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ChatProvider } from './context/ChatContext'
import { useSettings } from './context/SettingsContext'
import { LandingPage } from './pages/LandingPage'
import { AssistantPage } from './pages/AssistantPage'
import { ServicesPage } from './pages/ServicesPage'
import { ServiceDetailPage } from './pages/ServiceDetailPage'
import { NavigatorIndexPage } from './pages/NavigatorIndexPage'
import { NavigatorPage } from './pages/NavigatorPage'
import { SettingsPage } from './pages/SettingsPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  const { settings, t } = useSettings()

  return (
    <ChatProvider language={settings.language} state={settings.state} translate={t}>
      <AppShell>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
          <Route path="/navigator" element={<NavigatorIndexPage />} />
          <Route path="/navigator/:serviceId" element={<NavigatorPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </ChatProvider>
  )
}
