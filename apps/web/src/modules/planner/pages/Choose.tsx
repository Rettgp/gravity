import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../lib/auth'
import { Snowfall } from '../components/Snowfall'
import { christmasCountdown, defaultChristmasYear } from '../lib/format'
import { FAMILY, nextBirthday } from '../data/family'

const CONFETTI = ['hotpink', 'gold', 'turquoise', 'mediumpurple', 'white']

/** First screen after opening the app: pick which planner to work in. */
export function Choose() {
  const { user } = useAuth()
  const reduce = useReducedMotion()
  const firstName = (user?.name || '').split(' ')[0]
  const xmas = christmasCountdown(defaultChristmasYear())
  const next = FAMILY.map((f) => ({ ...f, ...nextBirthday(f.born) })).sort((a, b) => a.days - b.days)[0]!
  const rise = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.08 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } })

  return (
    <div className="choose">
      <motion.header className="choose-head" {...rise(0)}>
        <span className="eyebrow">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</span>
        <h1>What are we planning?</h1>
      </motion.header>
      <div className="choose-grid">
        <motion.div {...rise(1)}>
          <Link to="/app/planner/christmas/dashboard" className="choose-card xmas">
            <Snowfall density={0.6} />
            <span className="choose-emoji" aria-hidden>
              🎄
            </span>
            <span className="choose-title">Christmas</span>
            <span className="choose-sub">{xmas.isDay ? 'Merry Christmas!' : xmas.done ? 'Planning next year' : `${xmas.days} day${xmas.days === 1 ? '' : 's'} until Christmas`}</span>
            <span className="choose-cta">
              Open Christmas <ArrowRight size={18} />
            </span>
          </Link>
        </motion.div>
        <motion.div {...rise(2)}>
          <Link to="/app/planner/birthday/gifts" className="choose-card bday">
            <Snowfall density={0.5} confetti={CONFETTI} />
            <span className="choose-emoji" aria-hidden>
              🎂
            </span>
            <span className="choose-title">Birthdays</span>
            <span className="choose-sub">{next.days === 0 ? `Happy birthday, ${next.name}!` : `${next.name} turns ${next.age} in ${next.days} day${next.days === 1 ? '' : 's'}`}</span>
            <span className="choose-cta">
              Open Birthdays <ArrowRight size={18} />
            </span>
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
