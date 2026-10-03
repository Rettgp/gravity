import type { Glimmer } from '@gravity/shared';
import { useGlimmerImage } from './api';

/** Photo (or a gradient tile for caption-only glimmers) behind a glimmer card. */
export function GlimmerPicture({ glimmer }: { glimmer: Glimmer }) {
  const img = useGlimmerImage(glimmer.id, 'thumb', glimmer.hasImage);
  if (glimmer.hasImage && img.data) return <img className="gl-pic" src={img.data} alt="" />;
  return <span className={'gl-pic gl-pic-tile' + (glimmer.hasImage ? ' loading' : '')} aria-hidden="true" />;
}
