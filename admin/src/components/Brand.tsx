import { BRAND } from '../brand'

type BrandMarkProps = {
  size?: number
  /** dark = 黑底白字（用于深色侧边栏），light = 白底黑字 */
  variant?: 'dark' | 'light'
  animated?: boolean
  className?: string
}

/** Joystick P 独立标志（对应 pixopixo-v4-joystick-mark.svg） */
export function BrandMark({
  size = 32,
  variant = 'dark',
  animated = false,
  className = '',
}: BrandMarkProps) {
  const body = variant === 'dark' ? BRAND.white : BRAND.coreBlack
  const cls = ['brand-mark', animated ? 'brand-animated' : '', className].filter(Boolean).join(' ')
  return (
    <svg
      className={cls}
      width={size}
      height={(size * 420) / 320}
      viewBox="0 0 320 420"
      role="img"
      aria-label="pixopixo"
    >
      <g className="brand-head">
        <circle cx="154" cy="160" r="110" fill={body} />
        <rect x="44" y="148" width="66" height="210" rx="33" fill={body} />
        <circle cx="167" cy="160" r="64" fill={BRAND.cobalt} />
        <path className="brand-triangle" d="M145 120L211 160L145 200Z" fill={BRAND.lime} />
      </g>
      <path
        className="brand-arc"
        d="M63 354Q154 314 245 354"
        fill="none"
        stroke={BRAND.cobalt}
        strokeWidth="24"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 黑底 App 图标（对应 pixopixo-v4-app-icon.svg），用于登录页等大尺寸场景 */
export function BrandAppIcon({ size = 72, animated = false, className = '' }: {
  size?: number
  animated?: boolean
  className?: string
}) {
  const cls = ['brand-app-icon', animated ? 'brand-animated' : '', className].filter(Boolean).join(' ')
  return (
    <svg
      className={cls}
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      role="img"
      aria-label="pixopixo app icon"
    >
      <rect x="32" y="32" width="960" height="960" rx="224" fill={BRAND.coreBlack} />
      <g className="brand-app-head">
        <circle cx="498" cy="388" r="260" fill={BRAND.white} />
        <rect x="238" y="360" width="150" height="430" rx="75" fill={BRAND.white} />
        <circle cx="530" cy="388" r="150" fill={BRAND.cobalt} />
        <path className="brand-app-triangle" d="M477 292L635 388L477 484Z" fill={BRAND.lime} />
      </g>
      <path
        className="brand-app-arc"
        d="M278 804Q498 716 718 804"
        fill="none"
        stroke={BRAND.cobalt}
        strokeWidth="62"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 文字字标锁版：标志 + pixopixo + 可选 ADMIN kicker */
export function BrandLockup({
  variant = 'dark',
  markSize = 26,
  showKicker = true,
  className = '',
}: {
  variant?: 'dark' | 'light'
  markSize?: number
  showKicker?: boolean
  className?: string
}) {
  const textColor = variant === 'dark' ? '#FFFFFF' : BRAND.coreBlack
  return (
    <span className={`brand-lockup ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BrandMark size={markSize} variant={variant} />
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <span
          style={{
            color: textColor,
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          pixopixo
        </span>
        {showKicker ? (
          <span
            style={{
              color: BRAND.lime,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.26em',
              marginTop: 3,
            }}
          >
            ADMIN
          </span>
        ) : null}
      </span>
    </span>
  )
}
