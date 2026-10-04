import { Icon, type IconName } from '../../components/Icon';

/** The heading for a block in the day sheet: an icon chip and a larger title so the sections read as separate. */
export function SectionHead({ icon, children }: { icon: IconName; children: string }) {
  return (
    <h3 className="jr-h">
      <span className="jr-h-ico" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      {children}
    </h3>
  );
}
