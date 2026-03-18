package velocorner.crawler

import cats.Parallel
import cats.effect.implicits.concurrentParTraverseOps
import cats.effect.kernel.Async
import cats.implicits._
import io.circe.Codec
import org.http4s.HttpRoutes
import org.typelevel.log4cats.Logger
import sttp.tapir._
import sttp.tapir.generic.auto._
import sttp.tapir.json.circe._
import sttp.tapir.server.http4s.Http4sServerInterpreter
import sttp.tapir.swagger.bundle.SwaggerInterpreter
import velocorner.api.Money
import velocorner.api.brand.{Brand, Marketplace, ProductDetails}
import velocorner.crawler.cache.InMemoryCache

class Router[F[_]: Async: Parallel: Logger](crawlers: List[Crawler[F]]) {

  private implicit val marketplaceCodec: Codec[Marketplace] = velocorner.crawler.model.codecMarket
  private implicit val moneyCodec: Codec[Money] = velocorner.crawler.model.codecMoney
  private implicit val brandCodec: Codec[Brand] = velocorner.crawler.model.codecBrand
  private implicit val productDetailsCodec: Codec[ProductDetails] = velocorner.crawler.model.codec

  private val cache = new InMemoryCache[F, List[ProductDetails]]()

  private val searchEndpoint =
    endpoint.get
      .in("search" / path[String]("term").description("Search term"))
      .errorOut(stringBody)
      .out(jsonBody[List[ProductDetails]])
      .summary("Search products across supported marketplaces")

  private val supportedEndpoint =
    endpoint.get
      .in("supported")
      .out(jsonBody[List[Marketplace]])
      .summary("List supported marketplaces")

  private val openApiEndpoints = List(searchEndpoint, supportedEndpoint)

  private def search(term: String): F[List[ProductDetails]] = for {
    _ <- Logger[F].info(s"searching for [$term]...")
    suggestions <- crawlers
      .parTraverseN(4) { c =>
        c.products(term, 5).handleErrorWith { e =>
          Logger[F].error(e)(s"unable to crawl ${c.market().name}") *> List.empty[ProductDetails].pure[F]
        }
      }
      .map(_.flatten)
    _ <- Logger[F].info(s"found ${suggestions.size} results in ${suggestions.groupMapReduce(_.market.name)(_ => 1)(_ + _)}")
  } yield suggestions

  private val apiRoutes: HttpRoutes[F] = Http4sServerInterpreter[F]().toRoutes(
    List(
      searchEndpoint.serverLogic { term =>
        term.trim match {
          case searchTerm if searchTerm.isEmpty =>
            "empty search term".asLeft[List[ProductDetails]].pure[F]
          case searchTerm =>
            cache.cacheF(searchTerm, search(searchTerm)).map(_.asRight[String])
        }
      },
      supportedEndpoint.serverLogicSuccess { _ =>
        crawlers.map(_.market()).pure[F]
      }
    )
  )

  private val docsRoutes: HttpRoutes[F] = Http4sServerInterpreter[F]().toRoutes(
    SwaggerInterpreter().fromEndpoints[F](
      openApiEndpoints,
      "crawler service",
      "1.0.0"
    )
  )

  val routes: HttpRoutes[F] = apiRoutes <+> docsRoutes
}
