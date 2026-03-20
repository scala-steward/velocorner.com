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
import { LuExternalLink, LuMountain, LuRoute } from "react-icons/lu";
import ApiClient from "@/service/ApiClient";
import type { AthleteUnits } from "@/types/athlete";
import { dashboardCardProps } from "./shared";

const LeafletMapContainer = MapContainer as any;
const LeafletTileLayer = TileLayer as any;
const LeafletPolyline = Polyline as any;
const LeafletCircleMarker = CircleMarker as any;

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

type ElevationSample = {
  distance: number;
  elevation: number;
  grade: number;
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

const formatProfileDistance = (distanceMeters: number, units?: AthleteUnits) => {
  if (units?.distanceLabel === "mi") {
    return `${(distanceMeters / 1609.344).toFixed(1)} mi`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
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

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (value: number) => (value * Math.PI) / 180;

const getDistanceBetweenPoints = (start: ActivityRoutePoint, end: ActivityRoutePoint) => {
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(end.lon - start.lon);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getGradeColor = (grade: number) => {
  if (grade >= 10) return "#7f1d1d";
  if (grade >= 7) return "#dc2626";
  if (grade >= 4) return "#f97316";
  if (grade >= 2) return "#f59e0b";
  if (grade > -2) return "#22c55e";
  if (grade > -6) return "#0ea5e9";
  return "#2563eb";
};

const ELEVATION_LEGEND = [
  { label: "Flat", color: "#22c55e" },
  { label: "2-4%", color: "#f59e0b" },
  { label: "4-7%", color: "#f97316" },
  { label: "7%+", color: "#dc2626" },
];

const ElevationProfile = ({
  samples,
  units,
}: {
  samples: ElevationSample[];
  units: AthleteUnits;
}) => {
  const width = 1000;
  const height = 220;
  const paddingX = 24;
  const paddingTop = 18;
  const paddingBottom = 30;
  const chartHeight = height - paddingTop - paddingBottom;
  const maxDistance = samples[samples.length - 1]?.distance ?? 0;
  const elevations = samples.map((sample) => sample.elevation);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const elevationRange = Math.max(maxElevation - minElevation, 1);
  const baselineY = height - paddingBottom;

  const toX = (distance: number) => paddingX + (distance / Math.max(maxDistance, 1)) * (width - paddingX * 2);
  const toY = (elevation: number) => (
    paddingTop + ((maxElevation - elevation) / elevationRange) * chartHeight
  );

  const linePoints = samples.map((sample) => `${toX(sample.distance)},${toY(sample.elevation)}`).join(" ");
  const areaPath = [
    `M ${toX(samples[0]?.distance ?? 0)} ${baselineY}`,
    ...samples.map((sample) => `L ${toX(sample.distance)} ${toY(sample.elevation)}`),
    `L ${toX(samples[samples.length - 1]?.distance ?? 0)} ${baselineY}`,
    "Z",
  ].join(" ");

  const horizontalGuides = [0, 0.5, 1].map((step) => {
    const elevation = maxElevation - elevationRange * step;
    return {
      y: toY(elevation),
      label: formatElevation(elevation, units),
    };
  });

  const gradeSegments = samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    return {
      x1: toX(previous.distance),
      y1: toY(previous.elevation),
      x2: toX(sample.distance),
      y2: toY(sample.elevation),
      color: getGradeColor(sample.grade),
    };
  });

  const peakSample = samples.reduce((highest, sample) => sample.elevation > highest.elevation ? sample : highest, samples[0]);
  const maxGrade = samples.reduce((steepest, sample) => Math.max(steepest, sample.grade), Number.NEGATIVE_INFINITY);

  return (
    <Box
      borderRadius="24px"
      p={{ base: 4, md: 5 }}
      bg="linear-gradient(180deg, rgba(232,241,248,0.96), rgba(216,231,242,0.92))"
      color="gray.900"
      boxShadow="inset 0 1px 0 rgba(255,255,255,0.6)"
    >
      <HStack justify="space-between" align="start" gap={3} mb={3} flexWrap="wrap">
        <Box>
          <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="gray.900" fontWeight="bold">
            Elevation Profile
          </Text>
        </Box>
        <HStack gap={2} flexWrap="wrap">
          {ELEVATION_LEGEND.map((entry) => (
            <HStack key={entry.label} gap={2}>
              <Box w="10px" h="10px" borderRadius="full" bg={entry.color} />
              <Text fontSize="xs" color="slate.700">{entry.label}</Text>
            </HStack>
          ))}
        </HStack>
      </HStack>

      <Box borderRadius="18px" overflow="hidden" bg="rgba(255,255,255,0.52)" border="1px solid rgba(148,163,184,0.2)">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="220" role="img" aria-label="Elevation profile for the latest activity">
          <defs>
            <linearGradient id="elevation-area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(59,130,246,0.22)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.04)" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width={width} height={height} fill="transparent" />

          {horizontalGuides.map((guide) => (
            <g key={guide.label}>
              <line
                x1={paddingX}
                y1={guide.y}
                x2={width - paddingX}
                y2={guide.y}
                stroke="rgba(71,85,105,0.18)"
                strokeDasharray="6 8"
              />
              <text x={paddingX} y={guide.y - 6} fill="rgba(51,65,85,0.72)" fontSize="18">
                {guide.label}
              </text>
            </g>
          ))}

          <path d={areaPath} fill="url(#elevation-area-fill)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke="rgba(255,255,255,0.72)"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {gradeSegments.map((segment, index) => (
            <line
              key={`${segment.x1}-${segment.x2}-${index}`}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={segment.color}
              strokeWidth="8"
              strokeLinecap="round"
            />
          ))}

          <circle cx={toX(peakSample.distance)} cy={toY(peakSample.elevation)} r="7" fill="#ffffff" />
          <text
            x={Math.min(toX(peakSample.distance) + 12, width - 150)}
            y={Math.max(toY(peakSample.elevation) - 12, 20)}
            fill="#0f172a"
            fontSize="20"
            fontWeight="700"
          >
            Peak {formatElevation(peakSample.elevation, units)}
          </text>

          <text x={paddingX} y={height - 8} fill="rgba(51,65,85,0.76)" fontSize="18">
            Start
          </text>
          <text x={width / 2} y={height - 8} fill="rgba(51,65,85,0.76)" fontSize="18" textAnchor="middle">
            {formatProfileDistance(maxDistance / 2, units)}
          </text>
          <text x={width - paddingX} y={height - 8} fill="rgba(51,65,85,0.76)" fontSize="18" textAnchor="end">
            {formatProfileDistance(maxDistance, units)}
          </text>
        </svg>
      </Box>

      <HStack mt={3} justify="space-between" gap={3} flexWrap="wrap">
        <Text fontSize="sm" color="slate.700">
          Highest gradient: {Number.isFinite(maxGrade) ? `${maxGrade.toFixed(1)}%` : "n/a"}
        </Text>
        <Text fontSize="sm" color="slate.700">
          Elevation range: {formatElevation(maxElevation - minElevation, units)}
        </Text>
      </HStack>
    </Box>
  );
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

  const elevationProfile = useMemo<ElevationSample[]>(() => {
    if (!route?.points?.length) return [];

    const firstPoint = route.points[0];
    if (firstPoint?.ele == null || Number.isNaN(firstPoint.ele)) {
      return [];
    }

    const samples: ElevationSample[] = [{
      distance: 0,
      elevation: firstPoint.ele,
      grade: 0,
    }];

    let cumulativeDistance = 0;
    let previousPoint = firstPoint;

    for (let index = 1; index < route.points.length; index += 1) {
      const currentPoint = route.points[index];
      if (currentPoint.ele == null || Number.isNaN(currentPoint.ele)) {
        continue;
      }

      const segmentDistance = getDistanceBetweenPoints(previousPoint, currentPoint);
      cumulativeDistance += segmentDistance;

      const elevationDelta = currentPoint.ele - (previousPoint.ele ?? currentPoint.ele);
      const grade = segmentDistance >= 8 ? (elevationDelta / segmentDistance) * 100 : 0;

      samples.push({
        distance: cumulativeDistance,
        elevation: currentPoint.ele,
        grade,
      });

      previousPoint = currentPoint;
    }

    return samples.length > 1 ? samples : [];
  }, [route]);

  const hasRoute = positions.length > 1;
  const startPoint = hasRoute ? positions[0] : null;
  const endPoint = hasRoute ? positions[positions.length - 1] : null;
  const hasElevationProfile = elevationProfile.length > 1;

  return (
    <Card.Root {...dashboardCardProps} overflow="hidden">
      <Card.Body p={{ base: 5, md: 6 }}>
        <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1.08fr) minmax(0, 1.08fr) minmax(220px, 0.56fr)" }} gap={{ base: 5, md: 6 }} alignItems="stretch">
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
              >
                <style>
                  {`
                    .last-activity-map .leaflet-container {
                      height: 100%;
                      width: 100%;
                      background: #d9e7ef;
                      font-family: inherit;
                    }
                    .last-activity-map .leaflet-control-attribution {
                      background: rgba(255,255,255,0.78);
                      font-size: 10px;
                    }
                    .last-activity-map .leaflet-pane.leaflet-tile-pane {
                      filter: saturate(0.95) contrast(1.02);
                    }
                  `}
                </style>
                <LeafletMapContainer
                  className="last-activity-map"
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
                  <LeafletTileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RouteBounds positions={positions} />
                  <LeafletPolyline
                    positions={positions}
                    pathOptions={{
                      color: "#ffffff",
                      weight: 10,
                      opacity: 0.7,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                  />
                  <LeafletPolyline
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
                    <LeafletCircleMarker
                      center={startPoint}
                      radius={7}
                      pathOptions={{ color: "#1f9d55", fillColor: "#ffffff", fillOpacity: 1, weight: 4 }}
                    />
                  )}
                  {endPoint && (
                    <LeafletCircleMarker
                      center={endPoint}
                      radius={8}
                      pathOptions={{ color: "#ffffff", fillColor: "#e53e3e", fillOpacity: 1, weight: 4 }}
                    />
                  )}
                </LeafletMapContainer>
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

          {hasElevationProfile ? (
            <ElevationProfile samples={elevationProfile} units={units} />
          ) : (
            <Box borderRadius="24px" p={{ base: 4, md: 5 }} bg="rgba(18, 38, 63, 0.04)" minH={{ base: "220px", md: "340px" }}>
              <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="slate.500" fontWeight="semibold" mb={2}>
                Elevation Profile
              </Text>
              <Text color="slate.600">Elevation data is unavailable for this activity.</Text>
            </Box>
          )}

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

                  <Grid templateColumns="1fr" gap={3}>
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
                  </Grid>
                </>
              ) : (
                <Box borderRadius="20px" p={4} bg="rgba(18, 38, 63, 0.04)">
                  <Text color="slate.600">{error || "No latest activity available."}</Text>
                </Box>
              )}
            </VStack>

            <VStack align="stretch" gap={4}>
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
