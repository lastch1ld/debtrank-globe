import { useMemo, useRef, useState } from "react";
import { extend, useFrame, type ThreeElement } from "@react-three/fiber";
import {
  Instance,
  Instances,
  OrbitControls,
  QuadraticBezierLine,
  Sphere,
  Stars,
  shaderMaterial,
} from "@react-three/drei";
import { AdditiveBlending, BackSide, BufferGeometry, Color, Float32BufferAttribute, type Group } from "three";
import { countries, latLngToVector3, loadBorders, topExposureEdges, type YearSnapshot } from "../lib/network";
import { ATMOSPHERE_LAYERS } from "./atmosphere";

const RADIUS = 2;
const ARC_COUNT = 140;

// Fresnel-style rim glow: the classic "planet atmosphere" shader -- intensity
// rises where the surface normal points away from the camera, giving a soft
// halo at the limb instead of a flat, spray-painted edge.
const AtmosphereMaterial = shaderMaterial(
  {
    glowColor: new Color("#38bdf8"),
    intensity: 0.68,
    opacity: 0.38,
    fresnelBias: 0.72,
    fresnelPower: 3.2,
  },
  /* glsl */ `
    uniform float fresnelBias;
    uniform float fresnelPower;
    varying float vIntensity;

    void main() {
      vec3 vNormal = normalize(normalMatrix * normal);
      vec3 viewDir = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
      float rim = max(fresnelBias - dot(vNormal, -viewDir), 0.0);
      vIntensity = pow(rim, fresnelPower);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform vec3 glowColor;
    uniform float intensity;
    uniform float opacity;
    varying float vIntensity;

    void main() {
      float alpha = clamp(vIntensity * intensity * opacity, 0.0, opacity);
      gl_FragColor = vec4(glowColor, alpha);
    }
  `,
);
extend({ AtmosphereMaterial });

declare module "@react-three/fiber" {
  interface ThreeElements {
    atmosphereMaterial: ThreeElement<typeof AtmosphereMaterial>;
  }
}

const NEUTRAL_COLOR = new Color("#94a3b8");
const DISTRESS_MID = new Color("#f59e0b");
const DISTRESS_HIGH = new Color("#dc2626");
const SHOCK_COLOR = new Color("#fde047");
const ARC_LOW = new Color("#164e63");
const ARC_HIGH = new Color("#facc15");
const ESTIMATED_EQUITY_RING = new Color("#64748b");

function distressColor(level: number): Color {
  if (level <= 0.5) return NEUTRAL_COLOR.clone().lerp(DISTRESS_MID, level / 0.5);
  return DISTRESS_MID.clone().lerp(DISTRESS_HIGH, (level - 0.5) / 0.5);
}

interface GlobeProps {
  yearData: YearSnapshot;
  distress: number[];
  shockedId: string | null;
  onSelect: (id: string) => void;
  /** true for nodes whose equity is a modeled proxy (GDP/capital-ratio/floor
   * fallback) rather than reported FX reserves -- same provenance data the
   * ranking list already surfaces, mirrored here as a thin ring so the
   * globe itself signals confidence, not just the sidebar. */
  estimatedEquity?: boolean[];
}

function ShockedMarker({ position, scale }: { position: [number, number, number]; scale: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pulse = 1 + 0.35 * Math.sin(clock.elapsedTime * 3.2);
    ref.current.scale.setScalar(scale * pulse);
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color={SHOCK_COLOR} toneMapped={false} />
      </mesh>
      <mesh scale={2.6}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          color={SHOCK_COLOR}
          transparent
          opacity={0.25}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function useBorderGeometry() {
  return useMemo(() => {
    const rings = loadBorders();
    const positions: number[] = [];
    for (const ring of rings) {
      const pts = ring.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [lng1, lat1] = pts[i];
        const [lng2, lat2] = pts[i + 1];
        positions.push(...latLngToVector3(lat1, lng1, RADIUS + 0.004));
        positions.push(...latLngToVector3(lat2, lng2, RADIUS + 0.004));
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geometry;
  }, []);
}

export function Globe({ yearData, distress, shockedId, onSelect, estimatedEquity }: GlobeProps) {
  const [dragging, setDragging] = useState(false);
  const borderGeometry = useBorderGeometry();

  const markerScale = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of topExposureEdges(yearData, 100000)) {
      totals.set(e.creditor, (totals.get(e.creditor) ?? 0) + e.amount);
      totals.set(e.debtor, (totals.get(e.debtor) ?? 0) + e.amount);
    }
    const max = Math.max(...totals.values(), 1);
    return (id: string) => 0.018 + 0.032 * Math.sqrt((totals.get(id) ?? 0) / max);
  }, [yearData]);

  const arcs = useMemo(() => {
    const byId = new Map(countries.map((c) => [c.id, c]));
    const edges = topExposureEdges(yearData, ARC_COUNT);
    const maxAmount = Math.max(...edges.map((e) => e.amount), 1);
    return edges
      .map((e) => {
        const from = byId.get(e.creditor);
        const to = byId.get(e.debtor);
        if (!from || !to) return null;
        const start = latLngToVector3(from.lat, from.lng, RADIUS + 0.005);
        const end = latLngToVector3(to.lat, to.lng, RADIUS + 0.005);
        const mid: [number, number, number] = [
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2,
          (start[2] + end[2]) / 2,
        ];
        const midLen = Math.hypot(mid[0], mid[1], mid[2]) || 1;
        const lift = RADIUS + 0.15 + 0.55 * Math.sqrt(e.amount / maxAmount);
        const control: [number, number, number] = [
          (mid[0] / midLen) * lift,
          (mid[1] / midLen) * lift,
          (mid[2] / midLen) * lift,
        ];
        const t = e.amount / maxAmount;
        return { start, end, control, color: ARC_LOW.clone().lerp(ARC_HIGH, t), opacity: 0.15 + 0.45 * t };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [yearData]);

  return (
    <>
      <color attach="background" args={["#040611"]} />
      <ambientLight intensity={0.55} />
      <pointLight position={[6, 4, 6]} intensity={1.4} color="#e0f2fe" />
      <pointLight position={[-6, -3, -4]} intensity={0.5} color="#f59e0b" />

      <Stars radius={90} depth={50} count={3500} factor={2.4} fade speed={0.4} />

      <OrbitControls
        enablePan={false}
        minDistance={3}
        maxDistance={9}
        autoRotate={!dragging}
        autoRotateSpeed={0.35}
        onStart={() => setDragging(true)}
        onEnd={() => setDragging(false)}
      />

      {/* Core planet -- deep ocean base, coastlines drawn on top */}
      <Sphere args={[RADIUS - 0.02, 64, 64]}>
        <meshStandardMaterial color="#050b1a" roughness={0.85} metalness={0.1} />
      </Sphere>

      {/* Real country/coastline borders (Natural Earth 110m), lit up against the ocean */}
      <lineSegments geometry={borderGeometry}>
        <lineBasicMaterial color="#a8c4e8" transparent opacity={0.65} />
      </lineSegments>

      {/* Layered Fresnel atmosphere: a defined inner rim and broad, faint outer haze. */}
      {ATMOSPHERE_LAYERS.map((layer, index) => (
        <Sphere key={index} args={[RADIUS * layer.scale, 64, 64]}>
          <atmosphereMaterial
            glowColor={new Color("#38bdf8")}
            intensity={layer.intensity}
            opacity={layer.opacity}
            fresnelBias={layer.bias}
            fresnelPower={layer.power}
            side={BackSide}
            transparent
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </Sphere>
      ))}

      {arcs.map((arc, i) => (
        <QuadraticBezierLine
          key={i}
          start={arc.start}
          end={arc.end}
          mid={arc.control}
          color={arc.color}
          lineWidth={0.6}
          transparent
          opacity={arc.opacity}
        />
      ))}

      <Instances limit={countries.length}>
        <sphereGeometry args={[1, 12, 12]} />
        {/* Unlit: a lit material fades to near-black on the globe's far side
            as it auto-rotates away from the point lights, which was making
            markers nearly invisible for roughly half of every rotation. */}
        <meshBasicMaterial toneMapped={false} />
        {countries.map((c, i) => {
          if (c.id === shockedId) return null; // rendered separately, pulsing
          const level = distress[i] ?? 0;
          const scale = markerScale(c.id);
          const color = level > 1e-4 ? distressColor(level) : NEUTRAL_COLOR;
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

      {estimatedEquity && (
        <Instances limit={countries.length}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshBasicMaterial color={ESTIMATED_EQUITY_RING} wireframe transparent opacity={0.45} toneMapped={false} />
          {countries.map((c, i) => {
            if (!estimatedEquity[i] || c.id === shockedId) return null;
            return (
              <Instance
                key={c.id}
                position={latLngToVector3(c.lat, c.lng, RADIUS)}
                scale={markerScale(c.id) * 1.7}
              />
            );
          })}
        </Instances>
      )}

      {shockedId &&
        (() => {
          const c = countries.find((x) => x.id === shockedId);
          if (!c) return null;
          return (
            <ShockedMarker
              position={latLngToVector3(c.lat, c.lng, RADIUS)}
              scale={markerScale(c.id)}
            />
          );
        })()}
    </>
  );
}
