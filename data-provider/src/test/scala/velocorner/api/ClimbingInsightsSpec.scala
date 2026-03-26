package velocorner.api

import org.joda.time.{DateTime, DateTimeZone, LocalDate}
import org.scalatest.matchers.must.Matchers
import org.scalatest.wordspec.AnyWordSpec
import velocorner.api.strava.Activity
import velocorner.model.strava.Athlete
import velocorner.util.JsonIo

class ClimbingInsightsSpec extends AnyWordSpec with Matchers {
  private val athlete = Athlete(1L, 1, None, None, None, None, None, None, None)
  private val now = LocalDate.parse("2026-03-25")

  private def ride(id: Long, day: String, distanceKm: Double, elevationM: Double, movingHours: Double): Activity = {
    val start = DateTime.parse(s"${day}T07:00:00.000Z").withZone(DateTimeZone.UTC)
    Activity(
      id = id,
      resource_state = 2,
      external_id = None,
      upload_id = None,
      athlete = athlete,
      name = s"Ride $id",
      distance = (distanceKm * 1000d).toFloat,
      moving_time = (movingHours * 3600d).toInt,
      elapsed_time = (movingHours * 3800d).toInt,
      total_elevation_gain = elevationM.toFloat,
      `type` = "Ride",
      start_date = start,
      start_date_local = Some(start),
      average_speed = None,
      max_speed = None,
      average_cadence = None,
      average_temp = None,
      average_watts = None,
      max_watts = None,
      average_heartrate = None,
      max_heartrate = None,
      gear_id = None,
      start_latitude = None,
      start_longitude = None,
      commute = Some(false),
      elev_high = None,
      elev_low = None,
      pr_count = None
    )
  }

  private val activities = Seq(
    ride(1, "2026-01-06", 40, 420, 1.7),
    ride(2, "2026-01-20", 44, 500, 1.8),
    ride(3, "2026-02-03", 36, 390, 1.4),
    ride(4, "2026-02-10", 32, 310, 1.2),
    ride(5, "2026-02-24", 52, 680, 2.0),
    ride(6, "2026-03-04", 48, 620, 1.8),
    ride(7, "2026-03-10", 42, 540, 1.5),
    ride(8, "2026-03-18", 58, 860, 2.1),
    ride(9, "2026-03-24", 28, 320, 1.0)
  )

  "climbing insights" should {
    "calculate rolling and baseline climbing metrics" in {
      val insights = ClimbingInsights.from(activities, now, Units.Metric)

      insights.rolling4Weeks.rides mustBe 4
      insights.rolling4Weeks.distance mustBe 176d +- 0.01
      insights.rolling4Weeks.elevation mustBe 2340d +- 0.01
      insights.rolling4Weeks.movingTime mustBe 23040L
      insights.rolling4Weeks.elevationPerHour mustBe 365.6 +- 0.1
      insights.rolling4Weeks.elevationPer100Km mustBe 1329.5 +- 0.1
      insights.rolling4Weeks.climbinessScore must be > 0
      insights.baseline4Weeks.rides mustBe 3
      insights.recentClimbingDeltaPct must be > 0
      insights.recentClimbingRateDeltaPct must be > 0
      insights.recentDensityDeltaPct must be > 0
    }

    "convert windows for imperial users" in {
      val metric = ClimbingInsights.from(activities, now, Units.Metric)
      val imperial = ClimbingInsights.from(activities, now, Units.Imperial)

      imperial.rolling4Weeks.distance mustBe (metric.rolling4Weeks.distance * 0.621371) +- 0.2
      imperial.rolling4Weeks.elevation mustBe (metric.rolling4Weeks.elevation * 3.28084) +- 2.0
      imperial.baseline4Weeks.elevationPerHour mustBe (metric.baseline4Weeks.elevationPerHour * 3.28084) +- 2.0
    }

    "round-trip through json" in {
      val insights = ClimbingInsights.from(activities, now, Units.Metric)
      JsonIo.read[ClimbingInsights](JsonIo.write(insights)) mustBe insights
    }
  }
}
