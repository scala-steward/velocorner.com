package velocorner.model.weather

import play.api.libs.json.{Format, Json}

object Location {
  implicit val locFormat: Format[Location] = Format[Location](Json.reads[Location], Json.writes[Location])
}

case class Location(
    city: String,
    country: String
)
