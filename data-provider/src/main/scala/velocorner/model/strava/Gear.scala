package velocorner.model.strava

import play.api.libs.json._

object Gear {

  sealed abstract class Entry
  case object Bike extends Entry
  case object Shoe extends Entry

  val writes: Writes[Gear] = (o: Gear) => {
    val baseJs: JsObject = Json.writes[Gear].writes(o).as[JsObject]
    val typeJs: JsString = JsString("Gear")
    JsObject(baseJs.fields :+ ("type" -> typeJs))
  }
  implicit val gearFormat: Format[Gear] = Format[Gear](Json.reads[Gear], writes)
}

case class Gear(id: String, name: String, distance: Float)
