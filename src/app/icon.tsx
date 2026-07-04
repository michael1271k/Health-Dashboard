import { ImageResponse } from 'next/og'

// Browser favicon — the neon "A" monogram.
export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(145deg, #0c2329 0%, #050711 70%)',
          color: '#2DF5A0', fontSize: 46, fontWeight: 900, fontFamily: 'sans-serif',
        }}
      >
        A
      </div>
    ),
    { ...size },
  )
}
