import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { generateDemoDays } from '@gravity/shared';
import { Wordmark } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Orbit } from '../components/Orbit';
import { useAuth } from '../lib/auth';
import { localToday } from '../lib/dates';
import { useTheme } from '../lib/theme';
import { JournalApiContext, createDemoApi } from '../modules/journal/api';
import { JournalView } from '../modules/journal/JournalView';
import { MODULES } from '../modules/registry';

const EASE = [0.16, 1, 0.3, 1] as const;
const DEMO_PROFILE = { id: 'demo', name: 'Alex', color: '#2c95c8' };

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.300 3-7.300z" />
      <path fill="#34A853" d="M12 22c2.700 0 5-.9 6.600-2.400l-3.200-2.500c-.9.600-2 1-3.400 1-2.600 0-4.800-1.800-5.600-4.100H3.100v2.600A10 10 0 0 0 12 22z" />
      <path fill="#FBBC05" d="M6.400 14c-.2-.6-.3-1.300-.3-2s.1-1.400.3-2V7.400H3.100a10 10 0 0 0 0 9.200z" />
      <path fill="#EA4335" d="M12 5.900c1.500 0 2.800.5 3.800 1.500l2.800-2.800A10 10 0 0 0 3.100 7.400L6.400 10c.8-2.300 3-4.100 5.600-4.100z" />
    </svg>
  );
}

export function Landing() {
  const { signIn, config } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const showRef = useRef<HTMLElement>(null);
  const inView = useInView(showRef, { once: true, margin: '300px' });

  const onSignIn = () => (config?.mode === 'cognito' ? void signIn() : nav('/login'));

  const { scrollYProgress: heroP } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const orbitScale = useTransform(heroP, [0, 1], [1, reduce ? 1 : 1.5]);
  const orbitOpacity = useTransform(heroP, [0, 0.9], [1, reduce ? 1 : 0.15]);
  const { scrollYProgress: showP } = useScroll({ target: showRef, offset: ['start end', 'start 0.35'] });
  const tilt = useTransform(showP, [0, 1], [reduce ? 0 : 10, 0]);
  const frameOpacity = useTransform(showP, [0, 1], [reduce ? 1 : 0.35, 1]);
  const frameY = useTransform(showP, [0, 1], [reduce ? 0 : 60, 0]);

  const today = localToday();
  const demoApi = useMemo(() => createDemoApi(today), [today]);
  const demoDate = useMemo(() => generateDemoDays(today, 75).reverse().find((d, i) => i > 2 && d.unwell)?.date ?? today, [today]);

  const rise = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.65, delay, ease: EASE },
  });

  return (
    <div className="landing">
      <header className="land-nav glass">
        <Wordmark />
        <nav aria-label="Sections" className="land-links">
          <a href="#see-it">Journal</a>
          <a href="#private">Privacy</a>
        </nav>
        <div className="land-nav-cta">
          <button className="btn btn-ghost btn-sm jr-icon-btn" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <button className="btn btn-sm land-signin" onClick={onSignIn}>Sign in</button>
        </div>
      </header>

      <section className="hero" ref={heroRef}>
        <div className="hero-bg" aria-hidden="true" />
        <motion.div className="hero-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.9, ease: EASE }}>
          <motion.div className="hero-stage-inner" style={{ scale: orbitScale, opacity: orbitOpacity }}>
            <Orbit />
          </motion.div>
        </motion.div>
        <div className="hero-copy">
          <motion.h1 {...rise(0.1)}>
            Everything your family keeps track of. <span className="grad-text">In one private place.</span>
          </motion.h1>
          <motion.p {...rise(0.22)}>A home base for meals, health and the little things that make a household run. Built for phones, locked to your family.</motion.p>
          <motion.div className="hero-cta" {...rise(0.34)}>
            <button className="btn btn-light btn-lg" onClick={onSignIn}>
              <GoogleG /> Sign in with Google
            </button>
            <p className="hero-note"><Icon name="lock" size={14} /> Invite-only. Just your family&apos;s accounts.</p>
          </motion.div>
        </div>
      </section>

      <section id="see-it" className="showcase" ref={showRef}>
        <div className="showcase-head">
          <h2>See the whole day at a glance</h2>
          <p className="muted">A food and symptom journal that shows which days felt off, and what came before them. This is a live demo with sample data.</p>
        </div>
        <motion.div className="frame" style={{ rotateX: tilt, opacity: frameOpacity, y: frameY }} aria-label="Interactive demo with sample data">
          {inView ? (
            <JournalApiContext.Provider value={demoApi}>
              <JournalView profiles={[DEMO_PROFILE]} family={[DEMO_PROFILE]} defaultProfileId="demo" inline initialDate={demoDate} />
            </JournalApiContext.Provider>
          ) : (
            <div className="frame-skeleton" />
          )}
        </motion.div>
      </section>

      <section id="private" className="features">
        <motion.article className="feature" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: EASE }}>
          <Icon name="shield" size={26} />
          <h3>Private by design</h3>
          <p>Only Google accounts on your family list can get in, and each person&apos;s journal is theirs unless they share a day.</p>
        </motion.article>
        <motion.article className="feature" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.08, ease: EASE }}>
          <Icon name="heart" size={26} />
          <h3>Built for phones</h3>
          <p>Log breakfast in one hand. Install it to your home screen and it opens like an app, in light or dark.</p>
        </motion.article>
        <motion.article className="feature" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, delay: 0.16, ease: EASE }}>
          <Icon name="spark" size={26} />
          <h3>Grows with you</h3>
          <p>Each service is its own small module: {MODULES.filter((m) => m.soon).map((m) => m.name.toLowerCase()).join(', ')} and more are on the way.</p>
        </motion.article>
      </section>

      <footer className="land-foot muted">
        Gravity &middot; a private family dashboard &middot; <a href="/privacy.html">Privacy policy</a>
      </footer>
    </div>
  );
}
