import { Link } from 'react-router-dom';

export function LogoMark({ size = 28, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <img src="/logo-mark.svg" alt="" width={size} height={size} decoding="async" fetchPriority={priority ? 'high' : 'auto'} />
  );
}

export function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="wordmark" aria-label="Gravity home">
      <LogoMark size={28} />
      <span>Gravity</span>
    </Link>
  );
}
