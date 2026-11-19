const PLACEHOLDER = '/gift-placeholder.svg'

/** Gift photo, or the app's gift-box icon when there is none or the store blocks the hotlink. */
export function GiftImage({ src, className, lazy }: { src?: string; className: string; lazy?: boolean }) {
  return (
    <img
      className={`${className}${src ? '' : ' placeholder'}`}
      src={src || PLACEHOLDER}
      alt=""
      loading={lazy ? 'lazy' : undefined}
      referrerPolicy="no-referrer"
      onError={(e) => {
        const img = e.currentTarget
        if (img.classList.contains('placeholder')) return
        img.classList.add('placeholder')
        img.src = PLACEHOLDER
      }}
    />
  )
}
