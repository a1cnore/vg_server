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

interface GlobePoint {
  lat: number;
  lng: number;
  label: string;
  kind: "user" | "server";
}

const EU_SERVER: GlobePoint = {
  lat: 49.4521,
  lng: 11.0767,
  label: "eu-central-nuremberg",
  kind: "server",
};

export function Globe({ users }: { users: GlobeUser[] }) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointOfView(
      { lat: EU_SERVER.lat, lng: EU_SERVER.lng, altitude: 0.3 },
      0
    );
    const controls = globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableZoom = false;
  }, []);

  const userPoints: GlobePoint[] = users
    .filter(
      (u): u is GlobeUser & { lat: number; lng: number } =>
        u.lat !== null && u.lng !== null
    )
    .map((u) => ({
      lat: u.lat,
      lng: u.lng,
      label: `${u.playerHandle}${u.country ? ` (${u.country})` : ""}`,
      kind: "user",
    }));

  const points: GlobePoint[] = [...userPoints, EU_SERVER];

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
        pointColor={(d: object) =>
          (d as GlobePoint).kind === "server" ? "#f97316" : "#22d3ee"
        }
        pointAltitude={(d: object) =>
          (d as GlobePoint).kind === "server" ? 0.02 : 0.01
        }
        pointRadius={(d: object) =>
          (d as GlobePoint).kind === "server" ? 0.45 : 0.5
        }
        pointLabel={(d: object) => (d as GlobePoint).label}
        labelsData={[EU_SERVER]}
        labelLat="lat"
        labelLng="lng"
        labelText="label"
        labelSize={1.2}
        labelDotRadius={0.4}
        labelColor={() => "#f97316"}
        labelResolution={2}
        labelAltitude={0.01}
        height={600}
      />
    </div>
  );
}
