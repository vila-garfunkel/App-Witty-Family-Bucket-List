type IconName = 'plus' | 'arrow' | 'check' | 'edit' | 'trash' | 'calendar' | 'close' | 'spark' | 'heart' | 'list' | 'people' | 'message' | 'send' | 'back' | 'search' | 'lock' | 'clock'

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m5 12 14 0m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    edit: <><path d="m14 5 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-5-5L4 14z" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z" /></>,
    heart: <path d="M20 5c-3-3-7-1-8 2-1-3-5-5-8-2-5 5 4 12 8 15 4-3 13-10 8-15Z" />,
    list: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 8h8m-8 4h8m-8 4h5" /></>,
    people: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2" /></>,
    message: <path d="M20 15a3 3 0 0 1-3 3H9l-5 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3zM8 8h8m-8 5h5" />,
    send: <path d="m21 3-7 18-4-7-7-4 18-7ZM10 14l6-6" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function BucketArt() {
  return <svg className="bucket-art" viewBox="0 0 320 260" fill="none" aria-hidden="true">
    <ellipse cx="167" cy="234" rx="99" ry="9" fill="#E5D8BC" opacity=".45" />
    <path d="m102 115 14 105q49 24 100-4l15-104" fill="#F2B147" stroke="#443B30" strokeWidth="2.5" />
    <path d="m116 162 5 51q44 20 88-1l6-53" fill="#F5C66C" />
    <path d="M110 126c-36-100 134-103 113 1" stroke="#443B30" strokeWidth="4" />
    <path d="M112 126c-30-89 118-92 108 0" stroke="#F8E8C7" strokeWidth="3" />
    <path d="m127 115-7-62 65-10 10 74" fill="#FAF9F2" stroke="#443B30" strokeWidth="2" transform="rotate(-9 158 84)" />
    <path d="m139 64 26-6m-24 17 34-7m-32 18 26-6" stroke="#D9B7A2" strokeWidth="2" />
    <path d="m167 118 13-48 54 14-17 59" fill="#B4C7AD" stroke="#443B30" strokeWidth="2" />
    <path d="m190 95 6 9 16-13" stroke="#53694E" strokeWidth="3" />
    <ellipse cx="166" cy="123" rx="66" ry="17" fill="#F6C166" stroke="#443B30" strokeWidth="2.5" />
    <path d="M102 123c14 16 101 29 129-1" stroke="#443B30" strokeWidth="2" />
    <path d="M150 167c-7-15-25-6-17 7l21 21 19-23c9-15-13-20-23-5Z" fill="#EF795F" stroke="#443B30" strokeWidth="2" />
    <path d="m245 52 4 12 13 2-12 6-1 13-7-11-13 1 9-10-2-13 9 8" fill="#EF795F" />
    <path d="m70 125 3 8 9 2-8 4-1 9-5-8-9 1 6-7-2-9 7 5" fill="#A9BA9F" />
    <path d="m80 56 9 6m-1-24 3 10m-27-5 8 4M258 160l10-4m-12 18 10 3" stroke="#443B30" strokeWidth="2" strokeLinecap="round" />
    <path d="M78 192c-20-16-41 6-24 13 13 5 21-16 5-24" stroke="#A4B298" strokeWidth="2" strokeLinecap="round" />
  </svg>
}
