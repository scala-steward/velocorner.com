package velocorner.crawler

import cats.effect.Async
import cats.implicits._
import io.circe.{Codec, Decoder}
import io.circe.generic.semiauto.deriveCodec
import org.http4s.circe.CirceEntityCodec.circeEntityDecoder
import org.http4s.client.Client
import org.http4s.client.dsl.Http4sClientDsl
import org.http4s.headers.Referer
import org.http4s.{Header, Headers, Method, Request, Status, Uri}
import org.typelevel.ci.CIString
import velocorner.api.Money
import velocorner.api.brand.{Brand, Marketplace, ProductDetails}
import velocorner.api.brand.Marketplace.VeloFactory

object CrawlerVeloFactory {

  final case class Config(zone: String, hashId: String) {
    val baseUri: String = s"https://$zone-search.doofinder.com/5/search"
  }

  object Config {
    def fromEnv: Option[Config] =
      sys.env.get("VELOFACTORY_DOOFINDER_HASHID").map { hashId =>
        Config(
          zone = sys.env.getOrElse("VELOFACTORY_DOOFINDER_ZONE", "eu1").trim,
          hashId = hashId.trim
        )
      }
  }

  case class VeloFactoryProduct(
      title: String,
      brand: String,
      description: Option[String],
      best_price: Option[Double],
      price: Double,
      image_link: String,
      link: String,
      availability: String
  )

  object VeloFactoryProduct {
    implicit val codec: Codec[VeloFactoryProduct] = deriveCodec
  }

  case class SearchResponse(results: List[VeloFactoryProduct]) {
    def toApi(): List[ProductDetails] = results
      .map { p =>
        ProductDetails(
          market = VeloFactory,
          brand = Brand(name = p.brand, logoUrl = none).some,
          name = p.title,
          description = p.description,
          price = Money(BigDecimal(p.best_price.getOrElse(p.price)), "CHF"),
          imageUrl = p.image_link,
          productUrl = p.link,
          reviewStars = 0,
          isNew = false,
          onSales = false,
          onStock = p.availability.equalsIgnoreCase("in stock")
        )
      }
      .sortBy(_.onStock)(Ordering[Boolean].reverse) // products on stock are ranked first
  }

  object SearchResponse {
    implicit val codec: Decoder[SearchResponse] = Decoder[SearchResponse] { res =>
      for {
        // filter "type" : "product" only, otherwise brands and other types will appear in the list
        productsOnly <- res.downField("results").focus match {
          case None          => Right(Nil)
          case Some(results) =>
            results.asArray match {
              case None              => Right(Nil)
              case Some(resultsJson) =>
                Right(
                  resultsJson
                    .filter(json => (json \\ "type").exists(_.asString.exists(_.equalsIgnoreCase("product"))))
                    .map(productJson =>
                      productJson.as[VeloFactoryProduct] match {
                        case Left(failure) => throw new IllegalArgumentException(s"unable to decode $productJson,\nbecause: ${failure.message}")
                        case Right(p)      => p
                      }
                    )
                    .toList
                )
            }
        }
      } yield SearchResponse(productsOnly)
    }
  }

  def searchUri(searchTerm: String, limit: Int, config: Config): Uri =
    Uri
      .unsafeFromString(config.baseUri)
      .withQueryParam("hashid", config.hashId)
      .withQueryParam("page", 1)
      .withQueryParam("rpp", limit)
      .withQueryParam("query", searchTerm)
}

class CrawlerVeloFactory[F[_]: Async](client: Client[F], config: CrawlerVeloFactory.Config) extends Crawler[F] with Http4sClientDsl[F] {

  override def market(): Marketplace = VeloFactory

  override def products(searchTerm: String, limit: Int): F[List[ProductDetails]] = {
    val headers: Headers = Headers(
      Header.Raw(CIString("user-agent"), "Mozilla/5.0"),
      Header.Raw(CIString("accept"), "application/json"),
      Header.Raw(CIString("origin"), "https://www.velofactory.ch"),
      Referer(Uri.unsafeFromString("https://www.velofactory.ch"))
    )
    val req = Request[F](Method.GET, CrawlerVeloFactory.searchUri(searchTerm, limit, config), headers = headers)
    client.run(req).use { res =>
      res.status match {
        case Status.Ok =>
          res.as[CrawlerVeloFactory.SearchResponse].map(_.toApi().take(limit))
        case _ =>
          res.bodyText.compile.string.flatMap { body =>
            Async[F].raiseError(
              new IllegalStateException(s"VeloFactory search failed with ${res.status.code}: ${body.take(300)}")
            )
          }
      }
    }
  }
}
