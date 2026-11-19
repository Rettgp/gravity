import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import '../../styles/planner.css'
import { Themed } from './components/Themed'
import { PlannerProvider } from './data/PlannerContext'
import { PlannerLayout } from './layout/PlannerLayout'
import { Choose } from './pages/Choose'
import { Dashboard } from './pages/Dashboard'
import { Setup } from './pages/Setup'

const Todos = lazy(() => import('./pages/Todos'))
const Budget = lazy(() => import('./pages/Budget'))
const Gifts = lazy(() => import('./pages/Gifts'))
const Cards = lazy(() => import('./pages/Cards'))
const Decorations = lazy(() => import('./pages/Decorations'))
const Shopping = lazy(() => import('./pages/Shopping'))
const Meals = lazy(() => import('./pages/Meals'))
const Traditions = lazy(() => import('./pages/Traditions'))
const Travel = lazy(() => import('./pages/Travel'))
const YesDay = lazy(() => import('./pages/YesDay'))
const PrintView = lazy(() => import('./pages/PrintView'))

/** Christmas + Birthday planner, mounted at /app/planner/*. */
export default function PlannerModule() {
  return (
    <MotionConfig reducedMotion="user">
      <PlannerProvider>
        <Themed>
          <Suspense fallback={null}>
            <Routes>
              <Route index element={<Choose />} />
              <Route element={<PlannerLayout />}>
                <Route path="christmas">
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="setup" element={<Setup />} />
                  <Route path="todos" element={<Todos />} />
                  <Route path="budget" element={<Budget />} />
                  <Route path="gifts" element={<Gifts />} />
                  <Route path="cards" element={<Cards />} />
                  <Route path="decorations" element={<Decorations />} />
                  <Route path="shopping" element={<Shopping />} />
                  <Route path="meals" element={<Meals />} />
                  <Route path="traditions" element={<Traditions />} />
                  <Route path="travel" element={<Travel />} />
                  <Route path="print" element={<PrintView />} />
                </Route>
                <Route path="birthday">
                  <Route index element={<Navigate to="gifts" replace />} />
                  <Route path="budget" element={<Budget />} />
                  <Route path="gifts" element={<Gifts />} />
                  <Route path="decorations" element={<Decorations />} />
                  <Route path="yes-day" element={<YesDay />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/app/planner" replace />} />
            </Routes>
          </Suspense>
        </Themed>
      </PlannerProvider>
    </MotionConfig>
  )
}
