package velocorner.api

import play.api.libs.json.{Json, OFormat}

object ActivityTerrain {
  implicit val boundsFormat: OFormat[TerrainBounds] = Json.format[TerrainBounds]
  implicit val pointFormat: OFormat[TerrainPoint] = Json.format[TerrainPoint]
  implicit val terrainFormat: OFormat[ActivityTerrain] = Json.format[ActivityTerrain]
}

case class TerrainBounds(
    minLat: Double,
    maxLat: Double,
    minLon: Double,
    maxLon: Double
)

case class TerrainPoint(
    lat: Double,
    lon: Double,
    ele: Option[Double]
)

case class ActivityTerrain(
    activityId: Long,
    source: String,
    rows: Int,
    cols: Int,
    bounds: TerrainBounds,
    points: List[TerrainPoint]
)
