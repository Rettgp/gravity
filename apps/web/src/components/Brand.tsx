import { Link } from 'react-router-dom';

export function LogoMark({ size = 28, priority = false }: { size?: number; priority?: boolean }) {
  return (
    <picture>
      <source srcSet="/logo-mark.avif" type="image/avif" />
      <source srcSet="/logo-mark.webp" type="image/webp" />
      <img src="/logo-mark-96.png" alt="" width={size} height={Math.round(size * 0.966)} decoding="async" fetchPriority={priority ? 'high' : 'auto'} />
    </picture>
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
