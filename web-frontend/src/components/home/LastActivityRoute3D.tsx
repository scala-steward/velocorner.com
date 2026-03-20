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
import { LuExternalLink, LuMapPinned, LuMountain, LuRoute, LuTimer } from "react-icons/lu";
import ApiClient from "@/service/ApiClient";
import type { AthleteUnits } from "@/types/athlete";
import { dashboardCardProps } from "./shared";

type LastActivity = {
  id: number;
  name: string;
  distance?: number;
  total_elevation_gain?: number;
  moving_time?: number;
  elapsed_time?: number;
  start_date_local?: string;
  start_latitude?: number;
  start_longitude?: number;
};

type ActivityRoutePoint = {
  lat: number;
  lon: number;
  ele?: number;
  ts?: number;
};

type ActivityRoute = {
  activityId: number;
  source: "gpx" | "polyline" | "streams";
  points: ActivityRoutePoint[];
};

type Tile = {
  key: string;
  x: number;
  y: number;
  left: number;
  top: number;
  url: string;
};

type MapPoint = {
  x: number;
  y: number;
};

type MapProjection = {
  points: MapPoint[];
  tiles: Tile[];
};

const TILE_SIZE = 256;
const MAP_WIDTH = 960;
const MAP_HEIGHT = 640;
const MAP_PADDING = 72;
const MIN_ZOOM = 8;
const MAX_ZOOM = 15;

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

const formatDuration = (seconds?: number) => {
  const safe = Math.max(0, seconds ?? 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lonToTileX = (lon: number, zoom: number) => ((lon + 180) / 360) * 2 ** zoom;

const latToTileY = (lat: number, zoom: number) => {
  const safeLat = clamp(lat, -85.05112878, 85.05112878);
  const radians = (safeLat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom;
};

const fitZoom = (route: ActivityRoutePoint[]) => {
  const lons = route.map((point) => point.lon);
  const lats = route.map((point) => point.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const width = (lonToTileX(maxLon, zoom) - lonToTileX(minLon, zoom)) * TILE_SIZE;
    const height = (latToTileY(minLat, zoom) - latToTileY(maxLat, zoom)) * TILE_SIZE;
    if (width <= MAP_WIDTH - MAP_PADDING * 2 && height <= MAP_HEIGHT - MAP_PADDING * 2) {
      return zoom;
    }
  }

  return MIN_ZOOM;
};

const projectRoute = (route: ActivityRoutePoint[]): MapProjection | null => {
  if (route.length < 2) return null;

  const zoom = fitZoom(route);
  const projected = route.map((point) => ({
    point,
    tileX: lonToTileX(point.lon, zoom),
    tileY: latToTileY(point.lat, zoom),
  }));

  const minTileX = Math.min(...projected.map((entry) => entry.tileX));
  const maxTileX = Math.max(...projected.map((entry) => entry.tileX));
  const minTileY = Math.min(...projected.map((entry) => entry.tileY));
  const maxTileY = Math.max(...projected.map((entry) => entry.tileY));

  const routePixelWidth = Math.max((maxTileX - minTileX) * TILE_SIZE, 1);
  const routePixelHeight = Math.max((maxTileY - minTileY) * TILE_SIZE, 1);
  const offsetX = (MAP_WIDTH - routePixelWidth) / 2 - minTileX * TILE_SIZE;
  const offsetY = (MAP_HEIGHT - routePixelHeight) / 2 - minTileY * TILE_SIZE;

  const points = projected.map(({ tileX, tileY }) => ({
    x: tileX * TILE_SIZE + offsetX,
    y: tileY * TILE_SIZE + offsetY,
  }));

  const tileMinX = Math.floor(Math.min(...points.map((point) => point.x)) / TILE_SIZE) - 1;
  const tileMaxX = Math.floor(Math.max(...points.map((point) => point.x)) / TILE_SIZE) + 1;
  const tileMinY = Math.floor(Math.min(...points.map((point) => point.y)) / TILE_SIZE) - 1;
  const tileMaxY = Math.floor(Math.max(...points.map((point) => point.y)) / TILE_SIZE) + 1;
  const worldTiles = 2 ** zoom;
  const tiles: Tile[] = [];

  for (let tileScreenX = tileMinX; tileScreenX <= tileMaxX; tileScreenX += 1) {
    for (let tileScreenY = tileMinY; tileScreenY <= tileMaxY; tileScreenY += 1) {
      const x = ((tileScreenX % worldTiles) + worldTiles) % worldTiles;
      const y = clamp(tileScreenY, 0, worldTiles - 1);
      tiles.push({
        key: `${zoom}-${x}-${y}-${tileScreenX}-${tileScreenY}`,
        x,
        y,
        left: tileScreenX * TILE_SIZE,
        top: tileScreenY * TILE_SIZE,
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
      });
    }
  }

  return { points, tiles };
};

const toPath = (points: MapPoint[]) =>
  points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");

interface LastActivityRoute3DProps {
  units: AthleteUnits;
}

const LastActivityRoute3D = ({ units }: LastActivityRoute3DProps) => {
  const [activity, setActivity] = useState<LastActivity | null>(null);
  const [route, setRoute] = useState<ActivityRoute | null>(null);
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
            setError(null);
          } catch (routeError) {
            console.error("Error fetching activity route:", routeError);
            if (!active) return;
            setRoute(null);
            setError("Route unavailable for this activity.");
          }
        } else {
          setRoute(null);
          setError("No latest activity available.");
        }
      } catch (fetchError) {
        console.error("Error fetching last activity:", fetchError);
        if (!active) return;
        setActivity(null);
        setRoute(null);
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

  const projection = useMemo(() => {
    if (!route?.points?.length) return null;
    return projectRoute(route.points);
  }, [route]);

  const routePoints = projection?.points ?? [];
  const mapTiles = projection?.tiles ?? [];
  const hasRoute = routePoints.length > 1;
  const path = hasRoute ? toPath(routePoints) : "";
  const startPoint = hasRoute ? routePoints[0] : null;
  const endPoint = hasRoute ? routePoints[routePoints.length - 1] : null;

  return (
    <Card.Root {...dashboardCardProps} overflow="hidden">
      <Card.Body p={{ base: 5, md: 6 }}>
        <Grid templateColumns={{ base: "1fr", lg: "1.15fr 0.85fr" }} gap={{ base: 5, md: 6 }} alignItems="stretch">
          <Box
            position="relative"
            minH={{ base: "280px", md: "340px" }}
            borderRadius="24px"
            overflow="hidden"
            bg="#d9e7ef"
          >
            <Box
              position="absolute"
              inset={0}
              bg="linear-gradient(180deg, rgba(7,17,29,0.04), rgba(7,17,29,0.16))"
              zIndex={1}
              pointerEvents="none"
            />

            <Box position="absolute" inset={0} p={{ base: 4, md: 5 }} zIndex={2}>
              <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="routeGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#1f9d55" />
                    <stop offset="50%" stopColor="#ecc94b" />
                    <stop offset="100%" stopColor="#e53e3e" />
                  </linearGradient>
                </defs>

                {hasRoute && (
                  <>
                    {mapTiles.map((tile) => (
                      <image
                        key={tile.key}
                        href={tile.url}
                        x={tile.left}
                        y={tile.top}
                        width={TILE_SIZE}
                        height={TILE_SIZE}
                        preserveAspectRatio="none"
                      />
                    ))}

                    <path d={path} fill="none" stroke="rgba(8, 15, 26, 0.35)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={path} fill="none" stroke="rgba(255,255,255,0.68)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={path} fill="none" stroke="url(#routeGlow)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />

                    {startPoint && (
                      <>
                        <circle cx={startPoint.x} cy={startPoint.y} r="15" fill="rgba(255,255,255,0.55)" />
                        <circle cx={startPoint.x} cy={startPoint.y} r="8" fill="#ffffff" stroke="#1f9d55" strokeWidth="4" />
                      </>
                    )}

                    {endPoint && (
                      <>
                        <circle cx={endPoint.x} cy={endPoint.y} r="18" fill="rgba(255,255,255,0.48)" />
                        <circle cx={endPoint.x} cy={endPoint.y} r="9" fill="#e53e3e" stroke="#ffffff" strokeWidth="4" />
                      </>
                    )}
                  </>
                )}
              </svg>
            </Box>

            <VStack position="absolute" top={{ base: 4, md: 5 }} left={{ base: 4, md: 5 }} align="start" gap={2} zIndex={3}>
              <Badge colorPalette={hasRoute ? "green" : "orange"} borderRadius="full" px={3} py={1}>
                {hasRoute ? "Route" : "Route unavailable"}
              </Badge>
              <Heading size={{ base: "md", md: "lg" }} color="white" maxW="320px">
                3D view of your latest activity
              </Heading>
              <Text color="whiteAlpha.800" maxW="360px" fontSize="sm">
                {hasRoute
                  ? "Rendered from normalized route geometry returned by the backend."
                  : "This activity does not currently expose route geometry from Strava."}
              </Text>
            </VStack>
          </Box>

          <VStack align="stretch" gap={4} justify="space-between">
            <VStack align="stretch" gap={3}>
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
                  <Heading size="lg" color="gray.900">
                    {activity.name}
                  </Heading>
                  <Text color="slate.600">{formatDate(activity.start_date_local)}</Text>

                  <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
                    <Box borderRadius="20px" p={4} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={2} color="slate.500">
                        <LuRoute />
                        <Text fontSize="sm">Distance</Text>
                      </HStack>
                      <Text fontSize="xl" fontWeight="bold" color="gray.900">
                        {formatDistance(activity.distance, units)}
                      </Text>
                    </Box>

                    <Box borderRadius="20px" p={4} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={2} color="slate.500">
                        <LuMountain />
                        <Text fontSize="sm">Elevation</Text>
                      </HStack>
                      <Text fontSize="xl" fontWeight="bold" color="gray.900">
                        {formatElevation(activity.total_elevation_gain, units)}
                      </Text>
                    </Box>

                    <Box borderRadius="20px" p={4} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={2} color="slate.500">
                        <LuTimer />
                        <Text fontSize="sm">Moving time</Text>
                      </HStack>
                      <Text fontSize="xl" fontWeight="bold" color="gray.900">
                        {formatDuration(activity.moving_time)}
                      </Text>
                    </Box>

                    <Box borderRadius="20px" p={4} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={2} color="slate.500">
                        <LuMapPinned />
                        <Text fontSize="sm">Start point</Text>
                      </HStack>
                      <Text fontSize="sm" fontWeight="semibold" color="gray.900">
                        {activity.start_latitude != null && activity.start_longitude != null
                          ? `${activity.start_latitude.toFixed(4)}, ${activity.start_longitude.toFixed(4)}`
                          : "Unavailable"}
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
        </Grid>
      </Card.Body>
    </Card.Root>
  );
};

export default LastActivityRoute3D;
