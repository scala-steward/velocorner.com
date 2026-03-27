package velocorner.api

import org.joda.time.LocalDate
import play.api.libs.json.{Format, Json}
import squants.Meters
import squants.motion.KilometersPerHour
import squants.space.Kilometers
import velocorner.api.strava.Activity

object ClimbingInsights {
  private val VisibleWeeks = 12
  private val RecentWeeks = 4

  implicit val climbingWindowFormat: Format[ClimbingWindow] = Json.format[ClimbingWindow]
  implicit val climbingInsightsFormat: Format[ClimbingInsights] = Json.format[ClimbingInsights]

  def empty: ClimbingInsights = ClimbingInsights(
    rolling4Weeks = ClimbingWindow.zero,
    baseline4Weeks = ClimbingWindow.zero,
    recentClimbingDeltaPct = 0,
    recentClimbingRateDeltaPct = 0,
    recentDensityDeltaPct = 0
  )

  def from(activities: Iterable[Activity], now: LocalDate, unit: Units.Entry): ClimbingInsights = {
    val filtered = activities.filter(activity => !activity.getStartDateLocal.toLocalDate.isAfter(now)).toSeq
    if (filtered.isEmpty) return empty.to(unit)

    val currentWeekStart = weekStart(now)
    val weekStarts = (VisibleWeeks - 1 to 0 by -1).map(offset => currentWeekStart.minusWeeks(offset))
    val byWeek = filtered.groupBy(activity => weekStart(activity.getStartDateLocal.toLocalDate))
    val weekly = weekStarts.map(start => ClimbingWindow.from(byWeek.getOrElse(start, Seq.empty)))
    val recent = weekly.takeRight(RecentWeeks).foldLeft(ClimbingWindow.zero)(_ + _)
    val baselineWeekly = weekly.dropRight(RecentWeeks)
    val baseline =
      if (baselineWeekly.isEmpty) ClimbingWindow.zero
      else baselineWeekly.foldLeft(ClimbingWindow.zero)(_ + _).scale(RecentWeeks.toDouble / baselineWeekly.size.toDouble)

    ClimbingInsights(
      rolling4Weeks = recent,
      baseline4Weeks = baseline,
      recentClimbingDeltaPct = percentDelta(recent.elevation, baseline.elevation),
      recentClimbingRateDeltaPct = percentDelta(recent.elevationPerHour, baseline.elevationPerHour),
      recentDensityDeltaPct = percentDelta(recent.elevationPer100Km, baseline.elevationPer100Km)
    ).to(unit)
  }

  private def percentDelta(current: Double, baseline: Double): Int = {
    if (baseline == 0d) {
      if (current > 0d) 100 else 0
    } else {
      ((current - baseline) / baseline * 100d).round.toInt
    }
  }

  private def weekStart(day: LocalDate): LocalDate = day.minusDays(day.getDayOfWeek - 1)
}

case class ClimbingWindow(
    rides: Int,
    distance: Double,
    elevation: Double,
    movingTime: Long,
    elevationPerHour: Double,
    elevationPer100Km: Double,
    climbinessScore: Int
) {
  def +(that: ClimbingWindow): ClimbingWindow = ClimbingWindow.fromTotals(
    rides = rides + that.rides,
    distance = distance + that.distance,
    elevation = elevation + that.elevation,
    movingTime = movingTime + that.movingTime
  )

  def scale(factor: Double): ClimbingWindow = ClimbingWindow.fromTotals(
    rides = (rides.toDouble * factor).round.toInt,
    distance = distance * factor,
    elevation = elevation * factor,
    movingTime = (movingTime * factor).round
  )

  def to(unit: Units.Entry): ClimbingWindow = unit match {
    case Units.Imperial =>
      ClimbingWindow.fromTotals(
        rides = rides,
        distance = Kilometers(distance).toInternationalMiles,
        elevation = Meters(elevation).toFeet,
        movingTime = movingTime
      ).copy(climbinessScore = climbinessScore)
    case Units.Metric => this
  }
}

object ClimbingWindow {
  val zero: ClimbingWindow = fromTotals(0, 0d, 0d, 0L)

  def from(activities: Iterable[Activity]): ClimbingWindow = fromTotals(
    rides = activities.size,
    distance = activities.map(_.distance.toDouble / 1000d).sum,
    elevation = activities.map(_.total_elevation_gain.toDouble).sum,
    movingTime = activities.map(_.moving_time.toLong).sum
  )

  def fromTotals(rides: Int, distance: Double, elevation: Double, movingTime: Long): ClimbingWindow = {
    val movingHours = movingTime.toDouble / 3600d
    val elevationPerHour = if (movingHours > 0d) elevation / movingHours else 0d
    val elevationPer100Km = if (distance > 0d) elevation / (distance / 100d) else 0d
    ClimbingWindow(
      rides = rides,
      distance = round(distance),
      elevation = round(elevation),
      movingTime = movingTime,
      elevationPerHour = round(elevationPerHour),
      elevationPer100Km = round(elevationPer100Km),
      climbinessScore = climbinessScore(elevation, elevationPerHour, elevationPer100Km)
    )
  }

  private def climbinessScore(elevation: Double, elevationPerHour: Double, elevationPer100Km: Double): Int = {
    val totalScore = (elevation / 5000d).min(1d) * 20d
    val hourlyScore = (elevationPerHour / 900d).min(1d) * 45d
    val densityScore = (elevationPer100Km / 1600d).min(1d) * 35d
    (totalScore + hourlyScore + densityScore).round.toInt.max(0).min(100)
  }

  private def round(value: Double): Double = BigDecimal(value).setScale(1, BigDecimal.RoundingMode.HALF_UP).toDouble
}

case class ClimbingInsights(
    rolling4Weeks: ClimbingWindow,
    baseline4Weeks: ClimbingWindow,
    recentClimbingDeltaPct: Int,
    recentClimbingRateDeltaPct: Int,
    recentDensityDeltaPct: Int
) {
  def to(unit: Units.Entry): ClimbingInsights = copy(
    rolling4Weeks = rolling4Weeks.to(unit),
    baseline4Weeks = baseline4Weeks.to(unit)
  )
}
