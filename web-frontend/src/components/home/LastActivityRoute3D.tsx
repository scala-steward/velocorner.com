import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Card,
  Grid,
  Heading,
  HStack,
  Link,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { LuExternalLink, LuMountain, LuRoute } from "react-icons/lu";
import ApiClient from "@/service/ApiClient";
import type { AthleteUnits } from "@/types/athlete";
import { dashboardCardProps } from "./shared";

type LastActivity = {
  id: number;
  name: string;
  distance?: number;
  total_elevation_gain?: number;
  start_date_local?: string;
};

type ActivityRoutePoint = {
  lat: number;
  lon: number;
  ele?: number;
};

type ActivityRoute = {
  activityId: number;
  source: "gpx" | "polyline" | "streams";
  points: ActivityRoutePoint[];
};

type TerrainBounds = {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
};

type TerrainPoint = {
  lat: number;
  lon: number;
  ele?: number;
};

type ActivityTerrain = {
  activityId: number;
  source: string;
  rows: number;
  cols: number;
  bounds: TerrainBounds;
  points: TerrainPoint[];
};

type ProjectedPoint = {
  x: number;
  y: number;
  elevation: number;
};

type TerrainCell = {
  key: string;
  polygon: string;
  color: string;
  stroke: string;
  opacity: number;
};

type ElevationSample = {
  distance: number;
  elevation: number;
};

type ElevationBand = {
  fill: string;
  stroke: string;
};

const ELEVATION_PROFILE_LEGEND = [
  { label: "Descent", color: "rgba(8, 145, 178, 0.75)" },
  { label: "Flat", color: "rgba(5, 150, 105, 0.75)" },
  { label: "Climb", color: "rgba(217, 119, 6, 0.75)" },
  { label: "Steep", color: "rgba(220, 38, 38, 0.75)" },
] as const;

const getElevationBand = (grade: number): ElevationBand => {
  if (grade <= -3) {
    return {
      fill: "rgba(14, 116, 144, 0.24)",
      stroke: "rgba(8, 145, 178, 0.5)",
    };
  }

  if (grade < 2) {
    return {
      fill: "rgba(16, 185, 129, 0.22)",
      stroke: "rgba(5, 150, 105, 0.42)",
    };
  }

  if (grade < 6) {
    return {
      fill: "rgba(245, 158, 11, 0.22)",
      stroke: "rgba(217, 119, 6, 0.42)",
    };
  }

  return {
    fill: "rgba(239, 68, 68, 0.2)",
    stroke: "rgba(220, 38, 38, 0.42)",
  };
};

const SCENE_WIDTH = 860;
const SCENE_HEIGHT = 520;
const MAX_RENDER_POINTS = 180;

const formatDistance = (distanceMeters?: number, units?: AthleteUnits) => {
  const value = distanceMeters ?? 0;
  if (units?.distanceLabel === "mi") {
    return `${(value / 1609.344).toFixed(1)} mi`;
  }
  return `${(value / 1000).toFixed(1)} km`;
};

const formatElevation = (elevationMeters?: number, units?: AthleteUnits) => {
  const value = elevationMeters ?? 0;
  if (units?.elevationLabel === "ft") {
    return `${Math.round(value * 3.28084)} ft`;
  }
  return `${Math.round(value)} m`;
};

const formatDate = (dateValue?: string) => {
  if (!dateValue) return "Latest activity";

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Latest activity";

  return new Intl.DateTimeFormat("en-CH", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const toRadians = (value: number) => (value * Math.PI) / 180;

const getDistanceBetweenPoints = (start: ActivityRoutePoint, end: ActivityRoutePoint) => {
  const earthRadius = 6371000;
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(end.lon - start.lon);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const downsampleRoute = (points: ActivityRoutePoint[]) => {
  if (points.length <= MAX_RENDER_POINTS) return points;

  const step = (points.length - 1) / (MAX_RENDER_POINTS - 1);
  return Array.from({ length: MAX_RENDER_POINTS }, (_, index) => points[Math.round(index * step)]);
};

const deriveBoundsFromRoute = (points: ActivityRoutePoint[]): TerrainBounds => {
  const latitudes = points.map((point) => point.lat);
  const longitudes = points.map((point) => point.lon);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const latPadding = Math.max((maxLat - minLat) * 0.18, 0.0035);
  const lonPadding = Math.max((maxLon - minLon) * 0.18, 0.0035);

  return {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLon: minLon - lonPadding,
    maxLon: maxLon + lonPadding,
  };
};

const buildProjector = (bounds: TerrainBounds, minElevation: number, maxElevation: number) => {
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0001);
  const elevationSpan = Math.max(maxElevation - minElevation, 1);
  const yaw = -Math.PI / 4.7;
  const pitch = Math.PI / 5.2;
  const scaleX = 380;
  const scaleZ = 280;
  const scaleY = 190;
  const centerX = SCENE_WIDTH / 2;
  const centerY = SCENE_HEIGHT * 0.64;

  return (lat: number, lon: number, elevation?: number): ProjectedPoint => {
    const xRatio = (lon - bounds.minLon) / lonSpan;
    const zRatio = (lat - bounds.minLat) / latSpan;
    const normalizedElevation = clamp(((elevation ?? minElevation) - minElevation) / elevationSpan, 0, 1);
    const worldX = (xRatio - 0.5) * 2 * scaleX;
    const worldZ = (zRatio - 0.5) * 2 * scaleZ;
    const worldY = normalizedElevation * scaleY;
    const rotatedX = worldX * Math.cos(yaw) - worldZ * Math.sin(yaw);
    const rotatedZ = worldX * Math.sin(yaw) + worldZ * Math.cos(yaw);
    const tiltedY = worldY * Math.cos(pitch) - rotatedZ * Math.sin(pitch);
    const depth = worldY * Math.sin(pitch) + rotatedZ * Math.cos(pitch);
    const perspective = 1 + depth / 1100;

    return {
      x: centerX + rotatedX * perspective,
      y: centerY - tiltedY * perspective,
      elevation: elevation ?? minElevation,
    };
  };
};

const getTerrainShade = (elevationRatio: number, slopeRatio: number) => {
  const hue = 145 - elevationRatio * 112;
  const saturation = 30 + elevationRatio * 20 + slopeRatio * 10;
  const lightness = 31 + elevationRatio * 32 - slopeRatio * 12;

  return {
    fill: `hsl(${hue} ${saturation}% ${lightness}%)`,
    stroke: `hsla(${hue - 8} ${Math.max(saturation - 6, 18)}% ${Math.max(lightness - 16, 16)}% / 0.62)`,
    opacity: 0.82 + slopeRatio * 0.16,
  };
};

const buildTerrainCells = (terrain: ActivityTerrain, projector: ReturnType<typeof buildProjector>, minElevation: number, maxElevation: number) => {
  if (terrain.points.length !== terrain.rows * terrain.cols) return [] as TerrainCell[];

  const projected = terrain.points.map((point) => projector(point.lat, point.lon, point.ele));
  const cells: TerrainCell[] = [];
  const elevationSpan = Math.max(maxElevation - minElevation, 1);

  for (let row = 0; row < terrain.rows - 1; row += 1) {
    for (let col = 0; col < terrain.cols - 1; col += 1) {
      const topLeft = projected[row * terrain.cols + col];
      const topRight = projected[row * terrain.cols + col + 1];
      const bottomLeft = projected[(row + 1) * terrain.cols + col];
      const bottomRight = projected[(row + 1) * terrain.cols + col + 1];
      const averageElevation = (topLeft.elevation + topRight.elevation + bottomLeft.elevation + bottomRight.elevation) / 4;
      const elevationRatio = clamp((averageElevation - minElevation) / elevationSpan, 0, 1);
      const slopeRatio = clamp(
        (
          Math.abs(topLeft.elevation - topRight.elevation)
          + Math.abs(topLeft.elevation - bottomLeft.elevation)
          + Math.abs(bottomRight.elevation - bottomLeft.elevation)
          + Math.abs(bottomRight.elevation - topRight.elevation)
        ) / (elevationSpan * 1.35),
        0,
        1,
      );
      const shade = getTerrainShade(elevationRatio, slopeRatio);

      cells.push({
        key: `${row}-${col}`,
        polygon: [
          `${topLeft.x},${topLeft.y}`,
          `${topRight.x},${topRight.y}`,
          `${bottomRight.x},${bottomRight.y}`,
          `${bottomLeft.x},${bottomLeft.y}`,
        ].join(" "),
        color: shade.fill,
        stroke: shade.stroke,
        opacity: shade.opacity,
      });
    }
  }

  return cells;
};

const buildRouteProjection = (route: ActivityRoute, projector: ReturnType<typeof buildProjector>) => {
  const sampled = downsampleRoute(route.points);

  return sampled.map((point) => projector(point.lat, point.lon, point.ele));
};

const buildElevationSamples = (points: ActivityRoutePoint[]) => {
  const elevatedPoints = points.filter((point): point is ActivityRoutePoint & { ele: number } => typeof point.ele === "number");
  if (elevatedPoints.length < 2) return [] as ElevationSample[];

  let totalDistance = 0;
  const samples: ElevationSample[] = [{ distance: 0, elevation: elevatedPoints[0].ele }];

  for (let index = 1; index < elevatedPoints.length; index += 1) {
    totalDistance += getDistanceBetweenPoints(elevatedPoints[index - 1], elevatedPoints[index]);
    samples.push({ distance: totalDistance, elevation: elevatedPoints[index].ele });
  }

  return samples;
};

const getRouteDistance = (points: ActivityRoutePoint[]) => {
  if (points.length < 2) return 0;

  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += getDistanceBetweenPoints(points[index - 1], points[index]);
  }
  return total;
};

const ElevationProfile = ({ samples, units }: { samples: ElevationSample[]; units: AthleteUnits }) => {
  const width = 860;
  const height = 110;
  const paddingX = 16;
  const paddingTop = 12;
  const paddingBottom = 20;
  const elevations = samples.map((sample) => sample.elevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationSpan = Math.max(maxElevation - minElevation, 1);
  const maxDistance = samples[samples.length - 1]?.distance ?? 1;
  const baselineY = height - paddingBottom;
  const toX = (distance: number) => paddingX + (distance / maxDistance) * (width - paddingX * 2);
  const toY = (elevation: number) => paddingTop + ((maxElevation - elevation) / elevationSpan) * (height - paddingTop - paddingBottom);
  const areaSegments = samples.slice(0, -1).map((sample, index) => {
    const nextSample = samples[index + 1];
    const x1 = toX(sample.distance);
    const y1 = toY(sample.elevation);
    const x2 = toX(nextSample.distance);
    const y2 = toY(nextSample.elevation);
    const grade = ((nextSample.elevation - sample.elevation) / Math.max(nextSample.distance - sample.distance, 1)) * 100;

    return {
      d: `M ${x1} ${baselineY} L ${x1} ${y1} L ${x2} ${y2} L ${x2} ${baselineY} Z`,
      ...getElevationBand(grade),
    };
  });
  const line = samples.map((sample, index) => `${index === 0 ? "M" : "L"} ${toX(sample.distance)} ${toY(sample.elevation)}`).join(" ");

  return (
    <Box borderRadius="18px" p={2.5} bg="linear-gradient(180deg, rgba(12, 31, 46, 0.06), rgba(12, 31, 46, 0.02))" border="1px solid rgba(18, 38, 63, 0.06)">
      <HStack justify="space-between" mb={1.5}>
        <Text textTransform="uppercase" letterSpacing="0.16em" fontSize="xs" color="slate.500" fontWeight="semibold">
          Elevation profile
        </Text>
        <Text fontSize="xs" color="slate.500">
          {formatElevation(maxElevation - minElevation, units)} relief
        </Text>
      </HStack>
      <Box borderRadius="14px" overflow="hidden" bg="linear-gradient(180deg, rgba(186, 230, 253, 0.28), rgba(255,255,255,0.76))">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="110" role="img" aria-label="Elevation profile of the latest activity">
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingTop + ratio * (height - paddingTop - paddingBottom)}
              y2={paddingTop + ratio * (height - paddingTop - paddingBottom)}
              stroke="rgba(71,85,105,0.12)"
              strokeDasharray="5 7"
            />
          ))}
          {areaSegments.map((segment, index) => (
            <path key={`${samples[index].distance}-${samples[index + 1].distance}`} d={segment.d} fill={segment.fill} stroke={segment.stroke} strokeWidth="1" />
          ))}
          <path d={line} fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d={line} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <text x={paddingX} y={height - 6} fill="rgba(51,65,85,0.72)" fontSize="14">0</text>
          <text x={width - paddingX} y={height - 6} textAnchor="end" fill="rgba(51,65,85,0.72)" fontSize="14">
            {formatDistance(maxDistance, units)}
          </text>
        </svg>
      </Box>
      <HStack gap={3} mt={1.5} flexWrap="wrap">
        {ELEVATION_PROFILE_LEGEND.map((item) => (
          <HStack key={item.label} gap={1.5} color="slate.500">
            <Box boxSize="8px" borderRadius="full" bg={item.color} boxShadow={`0 0 0 1px ${item.color}`} />
            <Text fontSize="10px" textTransform="uppercase" letterSpacing="0.12em">
              {item.label}
            </Text>
          </HStack>
        ))}
      </HStack>
    </Box>
  );
};

const TerrainScene = ({
  route,
  terrain,
  units,
  elevationSummary,
}: {
  route: ActivityRoute;
  terrain: ActivityTerrain | null;
  units: AthleteUnits;
  elevationSummary: { high: number; low: number } | null;
}) => {
  const bounds = terrain?.bounds ?? deriveBoundsFromRoute(route.points);
  const routeElevations = route.points.map((point) => point.ele).filter((value): value is number => typeof value === "number");
  const terrainElevations = terrain?.points.map((point) => point.ele).filter((value): value is number => typeof value === "number") ?? [];
  const elevations = [...routeElevations, ...terrainElevations];
  const minElevation = elevations.length ? Math.min(...elevations) : 0;
  const maxElevation = elevations.length ? Math.max(...elevations) : 1;
  const projector = buildProjector(bounds, minElevation, maxElevation);
  const terrainCells = terrain ? buildTerrainCells(terrain, projector, minElevation, maxElevation) : [];
  const routeProjection = buildRouteProjection(route, projector);
  const elevationSamples = buildElevationSamples(route.points);
  const routePath = routeProjection.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const start = routeProjection[0];
  const finish = routeProjection[routeProjection.length - 1];
  const contourLevels = Array.from({ length: 6 }, (_, index) => minElevation + ((index + 1) / 7) * (maxElevation - minElevation || 1));

  return (
    <Grid templateColumns={{ base: "1fr", md: "minmax(0, 0.95fr) minmax(220px, 0.7fr)" }} gap={2.5} alignItems="stretch">
      <Box
        borderRadius="24px"
        overflow="hidden"
        position="relative"
        minH={{ base: "220px", md: "248px" }}
        bg="linear-gradient(180deg, #7cb0d0 0%, #dcecf3 28%, #6e8f6b 100%)"
        boxShadow="inset 0 1px 0 rgba(255,255,255,0.18)"
      >
        <Box
          position="absolute"
          inset={0}
          bg="radial-gradient(circle at 18% 14%, rgba(255,255,255,0.42), transparent 26%), linear-gradient(180deg, rgba(255,255,255,0.08), transparent 42%)"
        />

        <VStack position="absolute" top={{ base: 3, md: 4 }} left={{ base: 3, md: 4 }} align="start" gap={2} zIndex={2}>
          <Badge colorPalette={terrain ? "green" : "orange"} borderRadius="full" px={2.5} py={0.5} fontSize="0.68rem">
            Terrain model
          </Badge>
        </VStack>

        <Box position="absolute" inset={0} pt={{ base: 16, md: 13 }}>
          <svg viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`} width="100%" height="100%" role="img" aria-label="3D terrain and route for the latest activity">
            <defs>
              <filter id="terrain-surface-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="15" stdDeviation="12" floodColor="rgba(15, 23, 42, 0.28)" />
              </filter>
              <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="rgba(255,255,255,0.55)" />
              </filter>
            </defs>

            {terrainCells.map((cell) => (
              <polygon
                key={cell.key}
                points={cell.polygon}
                fill={cell.color}
                fillOpacity={cell.opacity}
                stroke={cell.stroke}
                strokeWidth="1"
                filter="url(#terrain-surface-shadow)"
              />
            ))}

            {terrainCells.map((cell, index) => contourLevels.length > 0 && index % Math.max(Math.floor(terrainCells.length / 180), 3) === 0 ? (
              <polyline
                key={`contour-${cell.key}`}
                points={cell.polygon}
                fill="none"
                stroke="rgba(30, 41, 59, 0.12)"
                strokeWidth="0.8"
              />
            ) : null)}

            <path d={routePath} fill="none" stroke="rgba(255,255,255,0.46)" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" filter="url(#route-glow)" />
            <path d={routePath} fill="none" stroke="#b91c1c" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={routePath} fill="none" stroke="#fde68a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />

            {start && <circle cx={start.x} cy={start.y} r="7" fill="#22c55e" stroke="#ecfeff" strokeWidth="3.5" />}
            {finish && <circle cx={finish.x} cy={finish.y} r="8" fill="#f97316" stroke="#ffffff" strokeWidth="3.5" />}

            {start && (
              <text x={start.x - 8} y={start.y - 16} fill="rgba(248,250,252,0.96)" fontSize="15" fontWeight="700" textAnchor="end">
                Start
              </text>
            )}
            {finish && (
              <text x={finish.x + 10} y={finish.y - 16} fill="rgba(255,247,237,0.98)" fontSize="15" fontWeight="700">
                Finish
              </text>
            )}
          </svg>
        </Box>
      </Box>

      <VStack align="stretch" gap={2.5}>
        {elevationSamples.length > 1 && <ElevationProfile samples={elevationSamples} units={units} />}

        {elevationSummary && (
          <Box borderRadius="18px" p={3} bg="rgba(18, 38, 63, 0.04)" border="1px solid rgba(18, 38, 63, 0.06)">
            <Text fontSize="sm" color="slate.500" mb={1.5}>Terrain span</Text>
            <HStack justify="space-between" gap={4} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" color="slate.500">High point</Text>
                <Text fontSize="md" fontWeight="bold" color="gray.900">
                  {formatElevation(elevationSummary.high, units)}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="slate.500">Low point</Text>
                <Text fontSize="md" fontWeight="bold" color="gray.900">
                  {formatElevation(elevationSummary.low, units)}
                </Text>
              </Box>
            </HStack>
          </Box>
        )}
      </VStack>
    </Grid>
  );
};

interface LastActivityRoute3DProps {
  units: AthleteUnits;
}

const LastActivityRoute3D = ({ units }: LastActivityRoute3DProps) => {
  const [activity, setActivity] = useState<LastActivity | null>(null);
  const [route, setRoute] = useState<ActivityRoute | null>(null);
  const [terrain, setTerrain] = useState<ActivityTerrain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchLastActivity = async () => {
      try {
        setLoading(true);
        const data = await ApiClient.lastActivity();
        if (!active) return;
        setActivity(data ?? null);

        if (data?.id) {
          try {
            const routeData = await ApiClient.activityRoute(data.id);
            if (!active) return;
            setRoute(routeData ?? null);
            setError(routeData?.points?.length ? null : "Route unavailable for this activity.");
          } catch (routeError) {
            console.error("Error fetching activity route:", routeError);
            if (!active) return;
            setRoute(null);
            setError("Route unavailable for this activity.");
          }

          try {
            const terrainData = await ApiClient.activityTerrain(data.id);
            if (!active) return;
            setTerrain(terrainData ?? null);
          } catch (terrainError) {
            console.error("Error fetching activity terrain:", terrainError);
            if (!active) return;
            setTerrain(null);
          }
        } else {
          setRoute(null);
          setTerrain(null);
          setError("No latest activity available.");
        }
      } catch (fetchError) {
        console.error("Error fetching last activity:", fetchError);
        if (!active) return;
        setActivity(null);
        setRoute(null);
        setTerrain(null);
        setError("Latest activity route is currently unavailable.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchLastActivity();

    return () => {
      active = false;
    };
  }, []);

  const elevationSummary = useMemo(() => {
    const terrainElevations = terrain?.points.map((point) => point.ele).filter((value): value is number => typeof value === "number") ?? [];
    const routeElevations = route?.points.map((point) => point.ele).filter((value): value is number => typeof value === "number") ?? [];
    const elevations = terrainElevations.length ? terrainElevations : routeElevations;

    if (elevations.length < 2) return null;

    return {
      high: Math.max(...elevations),
      low: Math.min(...elevations),
    };
  }, [route, terrain]);

  const routeDistance = useMemo(() => (route ? getRouteDistance(route.points) : 0), [route]);
  const hasRoute = Boolean(route?.points?.length && route.points.length > 1);

  return (
    <Card.Root {...dashboardCardProps} overflow="hidden">
      <Card.Body p={{ base: 4, md: 5 }}>
        <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1.28fr) minmax(260px, 0.72fr)" }} gap={{ base: 4, md: 5 }} alignItems="stretch">
          {loading ? (
            <HStack gap={3} minH="220px" justify="center" borderRadius="24px" bg="rgba(18, 38, 63, 0.04)">
              <Spinner size="sm" />
              <Text color="slate.600">Building the terrain view of your latest activity...</Text>
            </HStack>
          ) : hasRoute && route ? (
            <TerrainScene route={route} terrain={terrain} units={units} elevationSummary={elevationSummary} />
          ) : (
            <Box borderRadius="24px" p={{ base: 4, md: 5 }} bg="rgba(18, 38, 63, 0.04)" minH="220px">
              <Badge colorPalette="orange" borderRadius="full" px={3} py={1} mb={4}>
                Terrain unavailable
              </Badge>
              <Heading size="md" color="gray.900" mb={3}>
                We could not build a terrain scene for your latest activity.
              </Heading>
              <Text color="slate.600">
                {error || "No route geometry was returned for the latest activity."}
              </Text>
            </Box>
          )}

          <VStack align="stretch" gap={3} justify="space-between">
            <VStack align="stretch" gap={2.5}>
              <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="slate.500" fontWeight="semibold">
                Last Activity
              </Text>

              {loading ? (
                <HStack gap={3} minH="140px">
                  <Spinner size="sm" />
                  <Text color="slate.600">Loading latest activity...</Text>
                </HStack>
              ) : activity ? (
                <>
                  <Heading size="md" color="gray.900" lineHeight="1.2">
                    {activity.name}
                  </Heading>
                  <Text color="slate.600" fontSize="sm">{formatDate(activity.start_date_local)}</Text>

                  <Grid templateColumns={{ base: "1fr", sm: "repeat(2, minmax(0, 1fr))" }} gap={2.5}>
                    <Box borderRadius="18px" p={3} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={1.5} color="slate.500">
                        <LuRoute />
                        <Text fontSize="sm">Distance</Text>
                      </HStack>
                      <Text fontSize="lg" fontWeight="bold" color="gray.900">
                        {formatDistance(activity.distance ?? routeDistance, units)}
                      </Text>
                    </Box>

                    <Box borderRadius="18px" p={3} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={1.5} color="slate.500">
                        <LuMountain />
                        <Text fontSize="sm">Elevation gain</Text>
                      </HStack>
                      <Text fontSize="lg" fontWeight="bold" color="gray.900">
                        {formatElevation(activity.total_elevation_gain, units)}
                      </Text>
                    </Box>

                  </Grid>
                </>
              ) : (
                <Box borderRadius="20px" p={4} bg="rgba(18, 38, 63, 0.04)">
                  <Text color="slate.600">{error || "No latest activity available."}</Text>
                </Box>
              )}
            </VStack>

            <VStack align="stretch" gap={4}>
              {terrain && (
                <Text fontSize="xs" color="slate.600">
                  DEM resolution: {terrain.rows} x {terrain.cols}
                </Text>
              )}

              {activity && (
                <Link
                  href={`https://www.strava.com/activities/${activity.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="blue.600"
                  fontWeight="semibold"
                >
                  <HStack gap={2}>
                    <Text>Open on Strava</Text>
                    <LuExternalLink />
                  </HStack>
                </Link>
              )}
            </VStack>
          </VStack>
        </Grid>
      </Card.Body>
    </Card.Root>
  );
};

export default LastActivityRoute3D;
