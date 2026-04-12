"use client";

import { useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import type { GlobeMethods } from "react-globe.gl";

const GlobeGL = dynamic(() => import("react-globe.gl"), { ssr: false });

interface GlobeUser {
  lat: number | null;
  lng: number | null;
  playerHandle: string;
  country: string | null;
}

export function Globe({ users }: { users: GlobeUser[] }) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = false;
  }, []);

  // Filter out users without coordinates
  const points = users.filter(
    (u): u is GlobeUser & { lat: number; lng: number } =>
      u.lat !== null && u.lng !== null
  );

  return (
    <div className="w-full h-full bg-page">
      <GlobeGL
        ref={globeRef}
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        backgroundColor="#0a0a0a"
        atmosphereColor="#22d3ee"
        atmosphereAltitude={0.15}
        pointsData={points}
        pointLat="lat"
        pointLng="lng"
        pointColor={() => "#22d3ee"}
        pointAltitude={0.01}
        pointRadius={0.5}
        pointLabel={(d: object) => {
          const u = d as GlobeUser;
          return `${u.playerHandle}${u.country ? ` (${u.country})` : ""}`;
        }}
        height={600}
      />
    </div>
  );
}
