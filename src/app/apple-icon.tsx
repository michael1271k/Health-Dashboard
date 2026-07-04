import { ImageResponse } from 'next/og'

// iOS home-screen icon — the neon "A" monogram on a dark rounded square.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(145deg, #0c2329 0%, #050711 70%)',
          color: '#2DF5A0', fontSize: 132, fontWeight: 900, fontFamily: 'sans-serif',
          textShadow: '0 0 26px rgba(25,227,177,0.65)',
        }}
      >
        A
      </div>
    ),
    { ...size },
  )
}
