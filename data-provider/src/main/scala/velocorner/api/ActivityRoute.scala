package velocorner.api

import play.api.libs.json.{Json, OFormat}

object ActivityRoute {
  implicit val pointFormat: OFormat[ActivityRoutePoint] = Json.format[ActivityRoutePoint]
  implicit val routeFormat: OFormat[ActivityRoute] = Json.format[ActivityRoute]

  def fromPoints(activityId: Long, source: String, points: List[ActivityRoutePoint]): ActivityRoute =
    ActivityRoute(
      activityId = activityId,
      source = source,
      points = points
    )
}

case class ActivityRoutePoint(
    lat: Double,
    lon: Double,
    ele: Option[Double],
    ts: Option[Int]
)

case class ActivityRoute(
    activityId: Long,
    source: String,
    points: List[ActivityRoutePoint]
)
