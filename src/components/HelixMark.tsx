'use client'

import Image from 'next/image'

/**
 * HelixMark — the HELIX brandmark. Renders the premium app icon (two interlocking
 * helical ribbons: brushed platinum + molten ember, forming an implied H). The
 * source is the same asset shipped as the iOS/PWA icon, so the login hero, the
 * loading splash, and the home-screen icon are always one identity.
 *
 * Sized purely by `className` (e.g. `w-16 h-16`) so it tracks whatever it sits in;
 * the intrinsic 512² keeps it razor-sharp at any render size.
 */
export function HelixMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <Image
      src="/icon-512.png"
      alt=""
      width={512}
      height={512}
      priority
      className={`${className} rounded-[22%] object-contain select-none`}
      aria-hidden="true"
    />
  )
}
