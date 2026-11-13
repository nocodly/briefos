import { ImageResponse } from 'next/og'

export const alt = 'Minutama — AI notes for every meeting. No bot.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#FBFAF7',
          color: '#15171C',
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#FF6A3D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5
            }}
          >
            {[28, 16, 16, 28].map((h, i) => (
              <div key={i} style={{ width: 7, height: h, borderRadius: 4, background: '#fff' }} />
            ))}
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>Minutama</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>Meeting notes that</div>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, color: '#FF6A3D' }}>
            write themselves
          </div>
          <div style={{ fontSize: 32, marginTop: 28, color: '#4A4F5C' }}>
            AI notes for Zoom, Meet, Teams & more — no bot joins the call.
          </div>
        </div>
      </div>
    ),
    size
  )
}
