import { useMemo } from 'react';
import * as THREE from 'three';
import { getLineMap } from '../maps/line';
import { rasterizeLineMap } from '../maps/line/rasterize';
import { MM_TO_M } from './coords';

export function LineTrack3D({ mapId }: { mapId: string }) {
  const map = getLineMap(mapId);

  const texture = useMemo(() => {
    const bitmap = rasterizeLineMap(map, 4);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(bitmap.width, bitmap.height);
    for (let i = 0; i < bitmap.width * bitmap.height; i++) {
      const v = 255 - bitmap.data[i];
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }, [map]);

  const w = map.widthMm * MM_TO_M;
  const h = map.heightMm * MM_TO_M;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[w / 2, 0, h / 2]} receiveShadow>
      <planeGeometry args={[w, h]} />
      {texture ? <meshStandardMaterial map={texture} /> : <meshStandardMaterial color="#e5e5e5" />}
    </mesh>
  );
}
