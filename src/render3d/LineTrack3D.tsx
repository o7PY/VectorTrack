import { useMemo } from 'react';
import { getLineMap } from '../maps/line';
import { rasterizeLineMap } from '../maps/line/rasterize';
import { isCustomRuntimeId, resolveCustomLineMap } from '../store/customMapResolvers';
import { buildLineTexture } from './lineTexture';
import { MM_TO_M } from './coords';

export function LineTrack3D({ mapId }: { mapId: string }) {
  const { bitmap, widthMm, heightMm } = useMemo(() => {
    if (isCustomRuntimeId(mapId)) {
      const custom = resolveCustomLineMap(mapId);
      return { bitmap: custom.bitmap, widthMm: custom.bitmap.width * custom.bitmap.mmPerPixel, heightMm: custom.bitmap.height * custom.bitmap.mmPerPixel };
    }
    const map = getLineMap(mapId);
    return { bitmap: rasterizeLineMap(map, 4), widthMm: map.widthMm, heightMm: map.heightMm };
  }, [mapId]);

  const texture = useMemo(() => buildLineTexture(bitmap), [bitmap]);

  const w = widthMm * MM_TO_M;
  const h = heightMm * MM_TO_M;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, h / 2]} receiveShadow>
      <planeGeometry args={[w, h]} />
      {texture ? <meshStandardMaterial map={texture} /> : <meshStandardMaterial color="#e5e5e5" />}
    </mesh>
  );
}
