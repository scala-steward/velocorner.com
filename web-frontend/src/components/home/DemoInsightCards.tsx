import { Badge, Box, Card, Grid, Heading, HStack, Text, VStack } from "@chakra-ui/react";
import { LuGauge, LuMap, LuMountain, LuRoute, LuSparkles, LuTarget } from "react-icons/lu";
import { dashboardCardProps } from "./shared";

type DemoInsightCardsProps = {
  distanceLabel: string;
  elevationLabel: string;
};

type DemoPoint = {
  x: number;
  y: number;
};

type ProfileSegment = {
  d: string;
  fill: string;
  stroke: string;
};

const DEMO_PROFILE_LEGEND = [
  { label: "Descent", color: "rgba(8, 145, 178, 0.75)" },
  { label: "Flat", color: "rgba(5, 150, 105, 0.75)" },
  { label: "Climb", color: "rgba(217, 119, 6, 0.75)" },
  { label: "Steep", color: "rgba(220, 38, 38, 0.75)" },
] as const;

const getProfileGradientBand = (grade: number) => {
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

const DEMO_TERRAIN_CONTROL_ROWS: DemoPoint[][] = [
  [
    { x: 82, y: 382 },
    { x: 166, y: 366 },
    { x: 248, y: 324 },
    { x: 332, y: 210 },
    { x: 422, y: 142 },
    { x: 514, y: 224 },
    { x: 610, y: 152 },
    { x: 704, y: 236 },
  ],
  [
    { x: 114, y: 408 },
    { x: 198, y: 390 },
    { x: 282, y: 346 },
    { x: 370, y: 234 },
    { x: 462, y: 164 },
    { x: 556, y: 246 },
    { x: 648, y: 174 },
    { x: 736, y: 258 },
  ],
  [
    { x: 148, y: 434 },
    { x: 234, y: 414 },
    { x: 322, y: 370 },
    { x: 412, y: 262 },
    { x: 506, y: 192 },
    { x: 600, y: 270 },
    { x: 688, y: 198 },
    { x: 772, y: 282 },
  ],
  [
    { x: 186, y: 460 },
    { x: 274, y: 440 },
    { x: 364, y: 396 },
    { x: 456, y: 294 },
    { x: 550, y: 226 },
    { x: 642, y: 294 },
    { x: 726, y: 220 },
    { x: 806, y: 308 },
  ],
  [
    { x: 224, y: 486 },
    { x: 316, y: 466 },
    { x: 408, y: 422 },
    { x: 502, y: 332 },
    { x: 596, y: 270 },
    { x: 686, y: 326 },
    { x: 768, y: 250 },
    { x: 846, y: 336 },
  ],
  [
    { x: 258, y: 512 },
    { x: 352, y: 494 },
    { x: 446, y: 454 },
    { x: 540, y: 376 },
    { x: 634, y: 320 },
    { x: 722, y: 366 },
    { x: 804, y: 288 },
    { x: 860, y: 370 },
  ],
];

const DEMO_ROUTE_CONTROL_POINTS: DemoPoint[] = [
  { x: 122, y: 416 },
  { x: 168, y: 408 },
  { x: 214, y: 398 },
  { x: 262, y: 382 },
  { x: 310, y: 346 },
  { x: 350, y: 286 },
  { x: 390, y: 226 },
  { x: 430, y: 186 },
  { x: 470, y: 206 },
  { x: 506, y: 252 },
  { x: 540, y: 282 },
  { x: 574, y: 244 },
  { x: 612, y: 200 },
  { x: 650, y: 184 },
  { x: 688, y: 206 },
  { x: 724, y: 244 },
  { x: 758, y: 286 },
];

const DEMO_PROFILE_CONTROL_POINTS: DemoPoint[] = [
  { x: 16, y: 84 },
  { x: 74, y: 83 },
  { x: 128, y: 81 },
  { x: 182, y: 77 },
  { x: 236, y: 70 },
  { x: 290, y: 56 },
  { x: 344, y: 39 },
  { x: 398, y: 25 },
  { x: 456, y: 34 },
  { x: 516, y: 58 },
  { x: 574, y: 64 },
  { x: 632, y: 42 },
  { x: 690, y: 28 },
  { x: 746, y: 40 },
  { x: 800, y: 60 },
  { x: 844, y: 74 },
];

const toPointString = (points: DemoPoint[]) => points.map((point) => `${point.x},${point.y}`).join(" ");

const interpolatePoint = (start: DemoPoint, end: DemoPoint, ratio: number): DemoPoint => ({
  x: start.x + (end.x - start.x) * ratio,
  y: start.y + (end.y - start.y) * ratio,
});

const densifyPolyline = (points: DemoPoint[], segmentsPerStep: number) => {
  if (points.length < 2) return points;

  const dense: DemoPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    for (let segment = 0; segment < segmentsPerStep; segment += 1) {
      dense.push(interpolatePoint(start, end, segment / segmentsPerStep));
    }
  }
  dense.push(points[points.length - 1]);
  return dense;
};

const densifyTerrainRows = (rows: DemoPoint[][], horizontalSegments: number, verticalSegments: number) => {
  const denseBaseRows = rows.map((row) => densifyPolyline(row, horizontalSegments));
  const denseRows: DemoPoint[][] = [];

  for (let rowIndex = 0; rowIndex < denseBaseRows.length - 1; rowIndex += 1) {
    const currentRow = denseBaseRows[rowIndex];
    const nextRow = denseBaseRows[rowIndex + 1];
    for (let segment = 0; segment < verticalSegments; segment += 1) {
      const ratio = segment / verticalSegments;
      denseRows.push(currentRow.map((point, pointIndex) => interpolatePoint(point, nextRow[pointIndex], ratio)));
    }
  }

  denseRows.push(denseBaseRows[denseBaseRows.length - 1]);
  return denseRows;
};

const DEMO_TERRAIN_ROWS = densifyTerrainRows(DEMO_TERRAIN_CONTROL_ROWS, 4, 3);
const DEMO_ROUTE_POINTS = densifyPolyline(DEMO_ROUTE_CONTROL_POINTS, 3);
const DEMO_PROFILE_POINTS = densifyPolyline(DEMO_PROFILE_CONTROL_POINTS, 3);

const demoTerrainCells = DEMO_TERRAIN_ROWS.slice(0, -1).flatMap((row, rowIndex) => {
  const nextRow = DEMO_TERRAIN_ROWS[rowIndex + 1];

  return row.slice(0, -1).map((point, colIndex) => {
    const topLeft = point;
    const topRight = row[colIndex + 1];
    const bottomLeft = nextRow[colIndex];
    const bottomRight = nextRow[colIndex + 1];
    const rowRatio = rowIndex / Math.max(DEMO_TERRAIN_ROWS.length - 2, 1);
    const colRatio = colIndex / Math.max(row.length - 2, 1);
    const ridgeBias = 1 - Math.min(Math.abs(colRatio - 0.58) / 0.58, 1);
    const summitBias = Math.max(0, 1 - Math.abs(rowRatio - 0.18) / 0.2) * Math.max(0, 1 - Math.abs(colRatio - 0.62) / 0.18);
    const hue = 142 - rowRatio * 58 - colRatio * 18;
    const saturation = 18 + ridgeBias * 12 + (1 - rowRatio) * 8 - summitBias * 6;
    const lightness = 24 + (1 - rowRatio) * 18 + ridgeBias * 12 + summitBias * 12;

    return {
      key: `${rowIndex}-${colIndex}`,
      points: toPointString([topLeft, topRight, bottomRight, bottomLeft]),
      fill: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.96)`,
      stroke: `hsla(${hue - 8}, ${Math.max(18, saturation - 8)}%, ${Math.max(14, lightness - 16)}%, 0.28)`,
    };
  });
});

const demoContourLines = DEMO_TERRAIN_ROWS.map((row) => toPointString(row));
const demoVerticalContourLines = DEMO_TERRAIN_ROWS[0].map((_, colIndex) => toPointString(DEMO_TERRAIN_ROWS.map((row) => row[colIndex])));
const demoSnowCaps = demoTerrainCells.filter((cell) => {
  const [rowIndex, colIndex] = cell.key.split("-").map(Number);
  return rowIndex < 6 && ((colIndex > 10 && colIndex < 15) || (colIndex > 18 && colIndex < 23));
});
const demoRoutePath = toPointString(DEMO_ROUTE_POINTS);
const demoProfileLinePath = DEMO_PROFILE_POINTS.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
const demoProfileBaselineY = 90;
const demoProfileSegments: ProfileSegment[] = DEMO_PROFILE_POINTS.slice(0, -1).map((point, index) => {
  const nextPoint = DEMO_PROFILE_POINTS[index + 1];
  const grade = ((point.y - nextPoint.y) / Math.max(nextPoint.x - point.x, 1)) * 10;

  return {
    d: `M ${point.x} ${demoProfileBaselineY} L ${point.x} ${point.y} L ${nextPoint.x} ${nextPoint.y} L ${nextPoint.x} ${demoProfileBaselineY} Z`,
    ...getProfileGradientBand(grade),
  };
});

const terrainStats = [
  { label: "Distance", valueMetric: "42.6 km", valueImperial: "26.5 mi", icon: LuRoute },
  { label: "Climbing", valueMetric: "1,180 m", valueImperial: "3,871 ft", icon: LuMountain },
  { label: "Relief", valueMetric: "684 m", valueImperial: "2,244 ft", icon: LuMap },
];

const DemoTerrainModelCard = ({ distanceLabel, elevationLabel }: DemoInsightCardsProps) => {
  const distanceValue = distanceLabel === "mi" ? terrainStats[0].valueImperial : terrainStats[0].valueMetric;
  const climbingValue = elevationLabel === "ft" ? terrainStats[1].valueImperial : terrainStats[1].valueMetric;
  const reliefValue = elevationLabel === "ft" ? terrainStats[2].valueImperial : terrainStats[2].valueMetric;
  const highPointValue = elevationLabel === "ft" ? "7,037 ft" : "2,145 m";
  const lowPointValue = elevationLabel === "ft" ? "4,793 ft" : "1,461 m";
  const stats = [
    { ...terrainStats[0], value: distanceValue },
    { ...terrainStats[1], value: climbingValue },
    { ...terrainStats[2], value: reliefValue },
  ];

  return (
    <Card.Root {...dashboardCardProps} overflow="hidden" h="100%">
      <Card.Body p={{ base: 4, md: 4.5 }}>
        <Grid templateColumns={{ base: "1fr", xl: "minmax(0, 1.28fr) minmax(250px, 0.72fr)" }} gap={{ base: 3, md: 4 }} alignItems="stretch">
          <VStack align="stretch" gap={2}>
            <Box
              borderRadius="24px"
              overflow="hidden"
              minH={{ base: "190px", md: "210px" }}
              bg="linear-gradient(180deg, #76a8c8 0%, #d8ebf5 28%, #6f9168 100%)"
              position="relative"
            >
              <Box
                position="absolute"
                inset={0}
                bg="radial-gradient(circle at 18% 12%, rgba(255,255,255,0.42), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.1), transparent 40%)"
              />
              <VStack position="absolute" top={{ base: 3, md: 4 }} left={{ base: 3, md: 4 }} align="start" gap={2} zIndex={2}>
                <Badge colorPalette="green" borderRadius="full" px={2.5} py={0.5} fontSize="0.68rem">
                  Terrain model
                </Badge>
              </VStack>
              <Box position="absolute" inset={0}>
                <svg viewBox="0 0 860 520" width="100%" height="100%" role="img" aria-label="Sample 3D terrain model and route preview">
                  <defs>
                    <filter id="demo-route-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="rgba(255,255,255,0.45)" />
                    </filter>
                    <filter id="demo-terrain-shadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="14" stdDeviation="12" floodColor="rgba(15, 23, 42, 0.24)" />
                    </filter>
                  </defs>
                  <g filter="url(#demo-terrain-shadow)">
                    {demoTerrainCells.map((cell) => (
                      <polygon key={cell.key} points={cell.points} fill={cell.fill} stroke={cell.stroke} strokeWidth="0.55" />
                    ))}
                  </g>

                  {demoSnowCaps.map((cell) => (
                    <polygon key={`snow-${cell.key}`} points={cell.points} fill="rgba(255,255,255,0.18)" stroke="none" />
                  ))}

                  {demoContourLines.filter((_, index) => index % 2 === 0).map((points) => (
                    <polyline key={points} points={points} fill="none" stroke="rgba(30, 41, 59, 0.12)" strokeWidth="0.8" strokeDasharray="4 7" />
                  ))}
                  {demoVerticalContourLines.filter((_, index) => index % 3 === 0).map((points) => (
                    <polyline key={`vertical-${points}`} points={points} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.7" />
                  ))}

                  <polyline points={demoRoutePath} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" filter="url(#demo-route-glow)" />
                  <polyline points={demoRoutePath} fill="none" stroke="#b91c1c" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={demoRoutePath} fill="none" stroke="#fde68a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx={DEMO_ROUTE_POINTS[0].x} cy={DEMO_ROUTE_POINTS[0].y} r="9" fill="#22c55e" stroke="#f8fafc" strokeWidth="4" />
                  <circle cx={DEMO_ROUTE_POINTS[DEMO_ROUTE_POINTS.length - 1].x} cy={DEMO_ROUTE_POINTS[DEMO_ROUTE_POINTS.length - 1].y} r="10" fill="#f97316" stroke="#ffffff" strokeWidth="4" />
                  <text x={DEMO_ROUTE_POINTS[0].x - 16} y={DEMO_ROUTE_POINTS[0].y - 25} fill="rgba(248,250,252,0.98)" fontSize="20" fontWeight="700">Start</text>
                  <text x={DEMO_ROUTE_POINTS[DEMO_ROUTE_POINTS.length - 1].x + 18} y={DEMO_ROUTE_POINTS[DEMO_ROUTE_POINTS.length - 1].y - 22} fill="rgba(255,247,237,0.98)" fontSize="20" fontWeight="700">Finish</text>
                </svg>
              </Box>
            </Box>

            <Box borderRadius="18px" p={2} bg="linear-gradient(180deg, rgba(12, 31, 46, 0.06), rgba(12, 31, 46, 0.02))" border="1px solid rgba(18, 38, 63, 0.06)">
              <HStack justify="space-between" mb={1.25}>
                <Text textTransform="uppercase" letterSpacing="0.16em" fontSize="xs" color="slate.500" fontWeight="semibold">
                  Elevation profile
                </Text>
                <Text fontSize="xs" color="slate.500">
                  {reliefValue} relief
                </Text>
              </HStack>
              <Box borderRadius="14px" overflow="hidden" bg="linear-gradient(180deg, rgba(186, 230, 253, 0.28), rgba(255,255,255,0.76))">
                <svg viewBox="0 0 860 110" width="100%" height="88" role="img" aria-label="Sample elevation profile">
                  {[31.5, 55, 78.5].map((y) => (
                    <line key={y} x1="16" x2="844" y1={y} y2={y} stroke="rgba(71,85,105,0.12)" strokeDasharray="5 7" />
                  ))}
                  {demoProfileSegments.map((segment, index) => (
                    <path key={`${DEMO_PROFILE_POINTS[index].x}-${DEMO_PROFILE_POINTS[index + 1].x}`} d={segment.d} fill={segment.fill} stroke={segment.stroke} strokeWidth="1" />
                  ))}
                  <path d={demoProfileLinePath} fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d={demoProfileLinePath} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  <text x="16" y="104" fill="rgba(51,65,85,0.72)" fontSize="14">0</text>
                  <text x="844" y="104" textAnchor="end" fill="rgba(51,65,85,0.72)" fontSize="14">{distanceValue}</text>
                </svg>
              </Box>
              <HStack gap={3} mt={1.5} flexWrap="wrap">
                {DEMO_PROFILE_LEGEND.map((item) => (
                  <HStack key={item.label} gap={1.5} color="slate.500">
                    <Box boxSize="8px" borderRadius="full" bg={item.color} boxShadow={`0 0 0 1px ${item.color}`} />
                    <Text fontSize="10px" textTransform="uppercase" letterSpacing="0.12em">
                      {item.label}
                    </Text>
                  </HStack>
                ))}
              </HStack>
            </Box>
          </VStack>

          <VStack align="stretch" gap={2.5} justify="space-between">
            <VStack align="stretch" gap={2}>
              <Text textTransform="uppercase" letterSpacing="0.18em" fontSize="xs" color="slate.500" fontWeight="semibold">
                Last Activity
              </Text>
              <Heading size="md" color="gray.900" lineHeight="1.2">
                Alpine ridge loop
              </Heading>
              <Text color="slate.600" fontSize="sm">Sat, 21 Mar 2026, 08:12</Text>

              <Grid mt='2rem' templateColumns={{ base: "1fr", sm: "repeat(2, minmax(0, 1fr))" }} gap={2}>
                {stats.slice(0, 2).map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <Box key={stat.label} borderRadius="18px" p={2.5} bg="rgba(18, 38, 63, 0.04)">
                      <HStack mb={1} color="slate.500">
                        <Icon />
                        <Text fontSize="sm">{stat.label}</Text>
                      </HStack>
                      <Text fontSize="md" fontWeight="bold" color="gray.900">
                        {stat.value}
                      </Text>
                    </Box>
                  );
                })}
              </Grid>

              <Box borderRadius="18px" p={2.5} bg="rgba(18, 38, 63, 0.04)" border="1px solid rgba(18, 38, 63, 0.06)">
                <Text fontSize="sm" color="slate.500" mb={1}>Terrain span</Text>
                <HStack justify="space-between" gap={4} flexWrap="wrap">
                  <Box>
                    <Text fontSize="xs" color="slate.500">High point</Text>
                    <Text fontSize="sm" fontWeight="bold" color="gray.900">{highPointValue}</Text>
                  </Box>
                  <Box>
                    <Text fontSize="xs" color="slate.500">Low point</Text>
                    <Text fontSize="sm" fontWeight="bold" color="gray.900">{lowPointValue}</Text>
                  </Box>
                </HStack>
              </Box>
            </VStack>

            {/* <VStack align="stretch" gap={3}>
              <Text fontSize="xs" color="slate.600">DEM resolution: 384 x 512</Text>
              <Text color="blue.600" fontWeight="semibold" fontSize="sm">
                Connect Strava to open sample routes like this one
              </Text>
            </VStack> */}
          </VStack>
        </Grid>
      </Card.Body>
    </Card.Root>
  );
};

const DemoPerformancePulseCard = () => {
  const facts = [
    { label: "Trend", value: "Improving", tone: "green.700" },
    { label: "Scope", value: "Last 6 weeks", tone: "slate.700" },
    { label: "Updated", value: "Sample snapshot", tone: "slate.700" },
  ];
  const strengths = ["Sustained climbing is getting steadier.", "Weekend volume is stacking without extra fatigue."];
  const nextMoves = ["Keep one mid-week threshold session.", "Protect recovery before the next long climb block."];

  return (
    <Card.Root
      borderRadius="28px"
      border="1px solid"
      borderColor="rgba(15, 23, 42, 0.07)"
      bg="linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92))"
      boxShadow="0 20px 50px rgba(15, 23, 42, 0.08)"
      overflow="hidden"
      h="100%"
    >
      <Card.Body p={{ base: 3.5, md: 3.5 }}>
        <VStack align="stretch" gap={2} h="100%">
          <HStack justify="space-between" align="start" gap={2} flexWrap="wrap">
            <HStack gap={3} color="slate.800" align="center" flex="1 1 220px" minW={0}>
              <Box
                p={2}
                borderRadius="2xl"
                bg="linear-gradient(135deg, rgba(251,191,36,0.2), rgba(249,115,22,0.1))"
                color="orange.700"
                boxShadow="inset 0 0 0 1px rgba(249,115,22,0.12)"
                flexShrink={0}
              >
                <LuSparkles />
              </Box>
              <VStack align="stretch" gap={0.5} minW={0}>
                <Heading size="sm">Performance Pulse</Heading>
                <Text fontSize="xs" color="slate.500" lineClamp={2}>
                  Demo coaching insight with trend and next steps.
                </Text>
              </VStack>
            </HStack>
            <Grid templateColumns={{ base: "1fr", sm: "repeat(3, minmax(0, 1fr))" }} gap={2} flex="999 1 420px" minW={{ base: "100%", md: "380px" }}>
              {facts.map((fact) => (
                <Box key={fact.label} p={2} borderRadius="xl" bg="rgba(255,255,255,0.88)" border="1px solid" borderColor="rgba(15, 23, 42, 0.07)">
                  <VStack align="stretch" gap={1}>
                    <Text fontSize="10px" fontWeight="bold" letterSpacing="0.08em" textTransform="uppercase" color="slate.500">
                      {fact.label}
                    </Text>
                    <Text fontSize="xs" fontWeight="semibold" color={fact.tone} lineHeight="1.35">
                      {fact.value}
                    </Text>
                  </VStack>
                </Box>
              ))}
            </Grid>
          </HStack>

          <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={2}>
            <Box p={2.5} borderRadius="2xl" bg="linear-gradient(135deg, rgba(34,197,94,0.16), rgba(16,185,129,0.08))" border="1px solid" borderColor="rgba(34,197,94,0.18)">
              <VStack align="stretch" gap={1.5}>
                <HStack gap={2} color="green.700">
                  <LuGauge/>
                  <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em">
                    What changed
                  </Text>
                </HStack>
                <Text color="slate.700" lineHeight="1.4" fontSize="xs">
                  Climbing power is trending up while recovery stays stable.
                </Text>
              </VStack>
            </Box>

            <Box p={2.5} borderRadius="2xl" bg="rgba(255,255,255,0.9)" border="1px solid" borderColor="rgba(15, 23, 42, 0.07)">
              <VStack align="stretch" gap={1.5}>
                <HStack gap={2} color="slate.600">
                  <LuTarget />
                  <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em">
                    Keep leaning in
                  </Text>
                </HStack>
                <VStack align="stretch" gap={1.25}>
                  {strengths.map((strength) => (
                    <Box key={strength} px={2.25} py={1.5} borderRadius="xl" bg="rgba(15, 23, 42, 0.03)">
                      <Text color="slate.700" fontSize="xs" lineHeight="1.35">{strength}</Text>
                    </Box>
                  ))}
                </VStack>
              </VStack>
            </Box>
          </Grid>

          <Box p={2.5} borderRadius="2xl" bg="linear-gradient(180deg, rgba(236,253,245,0.9), rgba(240,253,250,0.72))" border="1px solid" borderColor="rgba(16, 185, 129, 0.14)">
            <VStack align="stretch" gap={1.5}>
              <HStack gap={2} color="green.700">
                <LuTarget />
                <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em">
                  Next best move
                </Text>
              </HStack>
              <VStack align="stretch" gap={1.25}>
                {nextMoves.map((move) => (
                  <Box key={move} px={2.25} py={1.5} borderRadius="xl" bg="rgba(255,255,255,0.72)">
                    <Text color="slate.700" fontSize="xs" lineHeight="1.35">{move}</Text>
                  </Box>
                ))}
              </VStack>
            </VStack>
          </Box>
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};

const DemoInsightCards = ({ distanceLabel, elevationLabel }: DemoInsightCardsProps) => (
  <Grid templateColumns={{ base: "1fr", xl: "1.05fr 0.95fr" }} gap={4} alignItems="stretch">
    <DemoTerrainModelCard distanceLabel={distanceLabel} elevationLabel={elevationLabel} />
    <DemoPerformancePulseCard />
  </Grid>
);

export default DemoInsightCards;
