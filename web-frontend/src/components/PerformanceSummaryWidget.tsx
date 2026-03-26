import { useEffect, useState } from "react";
import { Badge, Box, Card, Grid, Heading, HStack, Spinner, Text, VStack } from "@chakra-ui/react";
import { LuCircleCheckBig, LuClock3, LuGauge, LuSparkles, LuTarget, LuTrendingUp } from "react-icons/lu";
import ApiClient from "@/service/ApiClient";
import type { AthletePerformanceSummary } from "@/types/athlete";

interface PerformanceSummaryWidgetProps {
  isAuthenticated: boolean;
}

type ParsedPerformanceSummary = {
  trend?: {
    label?: string;
    evidence?: string;
  };
  strengths: string[];
  recommendations: string[];
  message?: string;
  fallbackText?: string;
};

const normalizeSummaryText = (summary?: string): string | undefined => {
  const trimmed = summary?.trim();
  if (!trimmed) return undefined;

  const lines = trimmed.split("\n");
  const firstLine = lines[0]?.trim().toLowerCase();
  const lastLine = lines[lines.length - 1]?.trim();

  if (firstLine === "```json" && lastLine === "```") {
    return lines.slice(1, -1).join("\n").trim();
  }

  return trimmed;
};

const parsePerformanceSummary = (summary?: string): ParsedPerformanceSummary | null => {
  const trimmed = normalizeSummaryText(summary);
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as {
      trend?: { label?: unknown; evidence?: unknown };
      strengths?: unknown;
      recommendations?: unknown;
      message?: unknown;
    };

    const asStringList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map(entry => entry.trim())
        : [];

    return {
      trend: parsed.trend && (typeof parsed.trend.label === "string" || typeof parsed.trend.evidence === "string")
        ? {
            label: typeof parsed.trend.label === "string" ? parsed.trend.label.trim() : undefined,
            evidence: typeof parsed.trend.evidence === "string" ? parsed.trend.evidence.trim() : undefined
          }
        : undefined,
      strengths: asStringList(parsed.strengths),
      recommendations: asStringList(parsed.recommendations),
      message: typeof parsed.message === "string" && parsed.message.trim() ? parsed.message.trim() : undefined,
      fallbackText: trimmed
    };
  } catch {
    return {
      strengths: [],
      recommendations: [],
      message: trimmed,
      fallbackText: trimmed
    };
  }
};

const trendColorPalette = (label?: string) => {
  switch ((label || "").toLowerCase()) {
    case "improving":
      return "green";
    case "stable":
      return "orange";
    case "declining":
      return "red";
    case "inconclusive":
      return "orange";
    default:
      return "gray";
  }
};

const trendAccent = (label?: string) => {
  switch ((label || "").toLowerCase()) {
    case "improving":
      return {
        bg: "linear-gradient(135deg, rgba(34,197,94,0.16), rgba(16,185,129,0.08))",
        borderColor: "rgba(34,197,94,0.18)",
        textColor: "green.700"
      };
    case "stable":
      return {
        bg: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(249,115,22,0.08))",
        borderColor: "rgba(249,115,22,0.18)",
        textColor: "orange.700"
      };
    case "declining":
      return {
        bg: "linear-gradient(135deg, rgba(239,68,68,0.14), rgba(249,115,22,0.06))",
        borderColor: "rgba(239,68,68,0.18)",
        textColor: "red.700"
      };
    case "inconclusive":
      return {
        bg: "linear-gradient(135deg, rgba(245,158,11,0.14), rgba(251,191,36,0.06))",
        borderColor: "rgba(245,158,11,0.18)",
        textColor: "orange.700"
      };
    default:
      return {
        bg: "linear-gradient(135deg, rgba(212,163,115,0.14), rgba(245,222,179,0.1))",
        borderColor: "rgba(180,83,9,0.14)",
        textColor: "orange.700"
      };
  }
};

const conciseItems = (items: string[], limit = 3) => items.slice(0, limit);

const formatUpdatedLabel = (value?: string) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const PerformanceSummaryWidget = ({ isAuthenticated }: PerformanceSummaryWidgetProps) => {
  const [data, setData] = useState<AthletePerformanceSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setData(null);
      setLoading(false);
      return;
    }

    let isActive = true;
    setLoading(true);
    ApiClient.performanceSummary()
      .then((resp) => {
        if (isActive) {
          setData(resp || null);
        }
      })
      .catch((error) => {
        console.error("Error fetching performance summary:", error);
        if (isActive) setData(null);
      })
      .finally(() => {
        if (isActive) setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [isAuthenticated]);

  const parsedSummary = parsePerformanceSummary(data?.summary);
  const summaryText = parsedSummary?.message || parsedSummary?.fallbackText;
  const updatedLabel = formatUpdatedLabel(data?.createdAt);
  const trendStyle = trendAccent(parsedSummary?.trend?.label);
  const strengths = conciseItems(parsedSummary?.strengths || []);
  const recommendations = conciseItems(parsedSummary?.recommendations || []);
  const facts = [
    parsedSummary?.trend?.label
      ? {
          label: "Trend",
          value: parsedSummary.trend.label,
          icon: LuTrendingUp,
          tone: trendStyle.textColor
        }
      : null,
    data?.basedOn
      ? {
          label: "Scope",
          value: data.basedOn,
          icon: LuCircleCheckBig,
          tone: "slate.700"
        }
      : null,
    updatedLabel
      ? {
          label: "Updated",
          value: updatedLabel,
          icon: LuClock3,
          tone: "slate.700"
        }
      : null
  ].filter(Boolean) as Array<{ label: string; value: string; icon: typeof LuGauge; tone: string }>;

  return (
    <Card.Root
      h="100%"
      borderRadius="28px"
      border="1px solid"
      borderColor="rgba(15, 23, 42, 0.07)"
      bg="linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92))"
      boxShadow="0 20px 50px rgba(15, 23, 42, 0.08)"
      overflow="hidden"
    >
      <Card.Body p={{ base: 3.5, md: 4 }} h="100%">
        <VStack align="stretch" gap={3} h="100%">
          <HStack justify="space-between" align="start" gap={4} flexWrap="wrap">
            <HStack gap={3} color="slate.800" align="center" flex="1 1 220px" minW={0}>
              <Box
                p={2}
                borderRadius="2xl"
                bg="linear-gradient(135deg, rgba(64, 210, 24, 0.2), rgba(115, 119, 116, 0.02))"
                color="green.700"
                boxShadow="inset 0 0 0 1px rgba(94, 22, 249, 0.2)"
                flexShrink={0}
              >
                <LuSparkles />
              </Box>
              <VStack align="stretch" gap={0.5} minW={0}>
                <Heading size="sm">Performance Pulse</Heading>
              </VStack>
            </HStack>
            {facts.length > 0 && (
              <Grid
                templateColumns={{ base: "1fr", sm: `repeat(${Math.min(facts.length, 3)}, minmax(0, 1fr))` }}
                gap={2}
                flex="999 1 420px"
                minW={{ base: "100%", md: "380px" }}
              >
                {facts.map((fact) => {
                  const FactIcon = fact.icon;

                  return (
                    <Box
                      key={fact.label}
                      p={2.5}
                      borderRadius="xl"
                      bg="rgba(255,255,255,0.88)"
                      border="1px solid"
                      borderColor="rgba(15, 23, 42, 0.07)"
                    >
                      <VStack align="stretch" gap={1}>
                        <HStack gap={1.5} color="slate.500">
                          <FactIcon />
                          <Text fontSize="10px" fontWeight="bold" letterSpacing="0.08em" textTransform="uppercase">
                            {fact.label}
                          </Text>
                        </HStack>
                        <Text fontSize="xs" fontWeight="semibold" color={fact.tone} lineHeight="1.35">
                          {fact.value}
                        </Text>
                      </VStack>
                    </Box>
                  );
                })}
              </Grid>
            )}
            {data?.evaluating ? (
              <Badge colorPalette="orange" variant="subtle" borderRadius="full" px={3} py={1}>
                Refreshing
              </Badge>
            ) : null}
          </HStack>

          {loading ? (
            <HStack gap={2}>
              <Spinner size="sm" />
              <Text fontSize="sm" color="slate.600">Loading pulse...</Text>
            </HStack>
          ) : (
            <VStack align="stretch" gap={3} fontSize="sm">
              {(parsedSummary?.trend?.evidence || strengths.length > 0 || recommendations.length > 0) && (
                <Grid
                  templateColumns={{
                    base: "1fr",
                    md: `repeat(${Math.min(
                      [parsedSummary?.trend?.evidence, strengths.length > 0, recommendations.length > 0].filter(Boolean).length,
                      3
                    )}, minmax(0, 1fr))`
                  }}
                  gap={2.5}
                >
                  {parsedSummary?.trend?.label && parsedSummary?.trend.evidence ? (
                    <Box
                      p={3}
                      borderRadius="2xl"
                      bg={trendStyle.bg}
                      border="1px solid"
                      borderColor={trendStyle.borderColor}
                    >
                      <VStack align="stretch" gap={2}>
                        <HStack gap={2} color={trendStyle.textColor} justify="space-between" align="center">
                          <HStack gap={2} minW={0}>
                            <LuGauge />
                            <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em">
                              Trend
                            </Text>
                          </HStack>
                          <Badge
                            alignSelf="start"
                            colorPalette={trendColorPalette(parsedSummary.trend.label)}
                            variant="solid"
                            borderRadius="full"
                            px={3}
                            py={1}
                            flexShrink={0}
                          >
                            {parsedSummary.trend.label}
                          </Badge>
                        </HStack>
                        <Text color="slate.700" lineHeight="1.55" lineClamp={3}>
                          {parsedSummary.trend.evidence}
                        </Text>
                      </VStack>
                    </Box>
                  ) : null}

                  {strengths.length > 0 ? (
                    <Box p={3} borderRadius="2xl" bg="rgba(255,255,255,0.9)" border="1px solid" borderColor="rgba(15, 23, 42, 0.07)">
                      <VStack align="stretch" gap={2}>
                        <HStack gap={2} color="slate.600">
                          <LuCircleCheckBig />
                          <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em">
                            Strengths
                          </Text>
                        </HStack>
                        <VStack align="stretch" gap={1.5}>
                          {strengths.map((strength) => (
                            <Box key={strength} px={3} py={2} borderRadius="xl" bg="rgba(15, 23, 42, 0.03)">
                              <Text color="slate.700" lineClamp={2}>{strength}</Text>
                            </Box>
                          ))}
                        </VStack>
                      </VStack>
                    </Box>
                  ) : null}

                  {recommendations.length > 0 ? (
                    <Box
                      p={3}
                      borderRadius="2xl"
                      bg="linear-gradient(180deg, rgba(236, 253, 245, 0.9), rgba(240, 253, 250, 0.72))"
                      border="1px solid"
                      borderColor="rgba(16, 185, 129, 0.14)"
                    >
                      <VStack align="stretch" gap={2}>
                        <HStack gap={2} color="green.700">
                          <LuTarget />
                          <Text fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.08em">
                            Recommendations
                          </Text>
                        </HStack>
                        <VStack align="stretch" gap={1.5}>
                          {recommendations.map((recommendation) => (
                            <Box key={recommendation} px={3} py={2} borderRadius="xl" bg="rgba(255,255,255,0.7)">
                              <Text color="slate.700" lineClamp={2}>{recommendation}</Text>
                            </Box>
                          ))}
                        </VStack>
                      </VStack>
                    </Box>
                  ) : null}
                </Grid>
              )}

              <Box px={3.5} py={3} borderRadius="2xl" bg="linear-gradient(180deg, rgba(250,245,255,0.9), rgba(243,232,255,0.72))">
                <VStack align="stretch" gap={2}>
                  <Text fontSize="xs" fontWeight="bold" color="purple.700" textTransform="uppercase" letterSpacing="0.08em">
                    Takeaway
                  </Text>
                  <Text color={summaryText ? "purple.900" : "purple.700"} lineHeight="1.6" lineClamp={4}>
                    {summaryText || "Your latest activities are still being analyzed."}
                  </Text>
                </VStack>
              </Box>

              {data?.evaluating && (
                <HStack
                  gap={2}
                  px={3.5}
                  py={3}
                  borderRadius="xl"
                  bg="rgba(251, 191, 36, 0.12)"
                  color="orange.800"
                  align="start"
                >
                  <Box mt="1px">
                    <LuSparkles />
                  </Box>
                  <Text fontSize="xs" lineHeight="1.6">
                    Fresh analysis is running. This card shows the latest finished snapshot.
                  </Text>
                </HStack>
              )}

            </VStack>
          )}
        </VStack>
      </Card.Body>
    </Card.Root>
  );
};

export default PerformanceSummaryWidget;
