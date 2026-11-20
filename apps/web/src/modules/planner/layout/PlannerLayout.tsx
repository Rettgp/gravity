import { LoaderCircle } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { GiftsFab } from '../components/ui'
import { usePlanner } from '../data/PlannerContext'
import { PlannerHeader } from './PlannerHeader'

const Loading = () => (
  <div className="loading-state">
    <LoaderCircle className="spin" size={28} />
    <span>Unwrapping your planner…</span>
  </div>
)

/** Header above every planner page; sends a brand-new household to Setup first. */
export function PlannerLayout() {
  const planner = usePlanner()
  const { pathname } = useLocation()
  const isPrint = pathname.endsWith('/print')
  const noYears = !planner.loading && planner.years.length === 0
  // The occasion comes from the URL: /app/planner/<christmas|birthday>/<page>. No shortcut on the Gifts page itself.
  const [, occasion, page] = /\/planner\/(christmas|birthday)\/([^/]+)/.exec(pathname) ?? []
  const giftsFab = occasion && page !== 'gifts' && !isPrint && !noYears ? `/app/planner/${occasion}/gifts` : null
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  if (noYears && !pathname.endsWith('/setup')) return <Navigate to="/app/planner/christmas/setup" replace />
  if (planner.loading && !planner.data) return <Loading />
  return (
    <>
      {!isPrint && !noYears && <PlannerHeader />}
      {giftsFab && <GiftsFab key={occasion} to={giftsFab} />}
      {planner.error && noYears && (
        <p role="alert" className="small err">
          {planner.error}
        </p>
      )}
      <div key={pathname} className="route-fade">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </div>
    </>
  )
}
