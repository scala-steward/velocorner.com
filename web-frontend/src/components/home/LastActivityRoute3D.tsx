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
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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

const RouteBounds = ({ positions }: { positions: [number, number][] }) => {
  const map = useMap();

  useEffect(() => {
    if (positions.length < 2) return;
    map.fitBounds(positions, { padding: [32, 32] });
  }, [map, positions]);

  return null;
};

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

  const positions = useMemo<[number, number][]>(() => {
    if (!route?.points?.length) return [];
    return route.points.map((point) => [point.lat, point.lon]);
  }, [route]);

  const hasRoute = positions.length > 1;
  const startPoint = hasRoute ? positions[0] : null;
  const endPoint = hasRoute ? positions[positions.length - 1] : null;

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
            {hasRoute ? (
              <Box
                position="absolute"
                inset={0}
                sx={{
                  ".leaflet-container": {
                    height: "100%",
                    width: "100%",
                    background: "#d9e7ef",
                    fontFamily: "inherit",
                  },
                  ".leaflet-control-attribution": {
                    background: "rgba(255,255,255,0.78)",
                    fontSize: "10px",
                  },
                  ".leaflet-pane.leaflet-tile-pane": {
                    filter: "saturate(0.95) contrast(1.02)",
                  },
                }}
              >
                <MapContainer
                  center={positions[Math.floor(positions.length / 2)]}
                  zoom={13}
                  scrollWheelZoom={false}
                  dragging={false}
                  doubleClickZoom={false}
                  touchZoom={false}
                  boxZoom={false}
                  keyboard={false}
                  zoomControl={false}
                  attributionControl
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RouteBounds positions={positions} />
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 10,
                      opacity: 0.7,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: "#e53e3e",
                      weight: 5,
                      opacity: 0.95,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                  {startPoint && (
                    <CircleMarker
                      center={startPoint}
                      radius={7}
                      pathOptions={{ color: "#1f9d55", fillColor: "#ffffff", fillOpacity: 1, weight: 4 }}
                    />
                  )}
                  {endPoint && (
                    <CircleMarker
                      center={endPoint}
                      radius={8}
                      pathOptions={{ color: "#ffffff", fillColor: "#e53e3e", fillOpacity: 1, weight: 4 }}
                    />
                  )}
                </MapContainer>
              </Box>
            ) : null}

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
