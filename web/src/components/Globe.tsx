import { useMemo } from "react";
import { OrbitControls, Instance, Instances, Sphere } from "@react-three/drei";
import { Color } from "three";
import { countries, latLngToVector3, totalExposure } from "../lib/network";

const RADIUS = 2;

const LOW_COLOR = new Color("#3b4252");
const HIGH_COLOR = new Color("#e63946");
const SHOCK_COLOR = new Color("#ffb703");

interface GlobeProps {
  distress: number[]; // parallel to countries order, current iteration's h(t)
  shockedId: string | null;
  onSelect: (id: string) => void;
}

export function Globe({ distress, shockedId, onSelect }: GlobeProps) {
  const maxExposure = useMemo(
    () => Math.max(...countries.map((c) => totalExposure(c.id)), 1),
    [],
  );

  return (
    <>
      <ambientLight intensity={0.9} />
      <pointLight position={[5, 5, 5]} intensity={1.2} />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={8} />

      <Sphere args={[RADIUS - 0.02, 48, 48]}>
        <meshStandardMaterial color="#111827" opacity={0.9} transparent />
      </Sphere>

      <Instances limit={countries.length}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshStandardMaterial />
        {countries.map((c, i) => {
          const level = distress[i] ?? 0;
          const isShocked = c.id === shockedId;
          const scale = 0.02 + 0.03 * Math.sqrt(totalExposure(c.id) / maxExposure);
          const color = isShocked
            ? SHOCK_COLOR
            : LOW_COLOR.clone().lerp(HIGH_COLOR, Math.min(1, level));
          return (
            <Instance
              key={c.id}
              position={latLngToVector3(c.lat, c.lng, RADIUS)}
              scale={scale}
              color={color}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(c.id);
              }}
            />
          );
        })}
      </Instances>
    </>
  );
}
