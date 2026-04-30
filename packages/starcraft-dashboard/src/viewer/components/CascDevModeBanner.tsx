import { isCascDevBillboardMode, isCascDevMode } from '../cascDevSeed'

export function CascDevModeBanner() {
  if (!isCascDevMode()) return null

  const billboards = isCascDevBillboardMode()

  return (
    <div
      style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2500,
        maxWidth: 'min(960px, 96vw)',
        padding: '10px 14px',
        background: billboards ? 'rgba(10, 40, 30, 0.92)' : 'rgba(30, 35, 60, 0.92)',
        border: billboards ? '1px solid #2a8' : '1px solid #56a',
        color: '#ddeeff',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
        lineHeight: 1.45,
        textAlign: 'center',
      }}
    >
      <strong>?cascdev=1</strong>
      {' — '}
      {billboards ? (
        <>
          <strong>CascbridgeScene</strong>: two entities use Remastered DDS (via <code>/casc-assets</code> PNG) on{' '}
          <strong>billboards</strong>, not 3D mesh models from CASC. Bridge WS is off here.
        </>
      ) : (
        <>
          <strong>ProceduralScene</strong>: two <strong>Three.js box meshes</strong> (stand-in geometry). This
          dashboard never loads GLB unit/building meshes from the archive. For DDS billboards run{' '}
          <code style={{ color: '#fff' }}>npm run start:casc</code> and reload. For full game renderer use{' '}
          <code style={{ color: '#fff' }}>?titan=1</code>.
        </>
      )}
    </div>
  )
}
