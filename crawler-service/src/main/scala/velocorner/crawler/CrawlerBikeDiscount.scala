package velocorner.crawler

import cats.effect.Async
import cats.implicits._
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import io.circe.parser.decode
import org.http4s.client.Client
import org.typelevel.log4cats.Logger
import org.typelevel.log4cats.slf4j.Slf4jLogger
import velocorner.api.Money
import velocorner.api.brand.Marketplace.BikeDiscount
import velocorner.api.brand.{Brand, Marketplace, ProductDetails}

import java.nio.charset.StandardCharsets
import java.nio.file.Paths
import java.util.concurrent.TimeUnit

object CrawlerBikeDiscount {

  case class BrowserProduct(
      name: String,
      brand: Option[String],
      price: String,
      imageUrl: String,
      productUrl: String,
      onSales: Boolean,
      onStock: Boolean
  )

  object BrowserProduct {
    implicit val decoder: Decoder[BrowserProduct] = deriveDecoder
  }

  def extractPrice(s: String): Money = {
    val amountCcy = s.split('>').last.trim
    val normalized = amountCcy
      .replace(".", "")
      .replace(",", ".")
    PriceParser.parse(normalized)
  }

  def parseProducts(content: String, limit: Int): List[ProductDetails] =
    decode[List[BrowserProduct]](content) match {
      case Left(_) => Nil
      case Right(products) =>
        products
          .flatMap { p =>
            Option.when(p.name.trim.nonEmpty && p.price.trim.nonEmpty && p.productUrl.trim.nonEmpty) {
              ProductDetails(
                market = BikeDiscount,
                brand = p.brand.map(name => Brand(name.trim, none)),
                name = p.name.trim,
                description = none,
                price = extractPrice(p.price),
                imageUrl = p.imageUrl.trim,
                productUrl = p.productUrl.trim,
                reviewStars = 0,
                isNew = false,
                onSales = p.onSales,
                onStock = p.onStock
              )
            }
          }
          .groupBy(_.productUrl)
          .values
          .map(_.head)
          .toList
          .take(limit)
    }
}

class CrawlerBikeDiscount[F[_]: Async](_client: Client[F]) extends Crawler[F] {

  private implicit val logger: Logger[F] = Slf4jLogger.getLogger[F]

  private val playwrightDir = Paths.get("crawler-service", "playwright").toAbsolutePath.normalize
  private val playwrightScript = playwrightDir.resolve("bike-discount-fetch.mjs")

  override def market(): Marketplace = BikeDiscount

  private def fetchWithPlaywright(searchTerm: String): F[String] =
    Async[F].blocking {
      val process = new ProcessBuilder("node", playwrightScript.toString, searchTerm)
        .directory(playwrightDir.toFile)
        .start()

      val stdout = process.getInputStream.readAllBytes()
      val stderr = process.getErrorStream.readAllBytes()
      val finished = process.waitFor(90, TimeUnit.SECONDS)

      if (!finished) {
        process.destroyForcibly()
        throw new IllegalStateException(s"Bike-Discount Playwright fetch timed out for [$searchTerm]")
      }

      val exitCode = process.exitValue()
      val body = new String(stdout, StandardCharsets.UTF_8)
      val error = new String(stderr, StandardCharsets.UTF_8).trim

      if (exitCode != 0) {
        val details = if (error.nonEmpty) s": $error" else ""
        throw new IllegalStateException(s"Bike-Discount Playwright fetch failed for [$searchTerm]$details")
      }

      body
    }

  override def products(searchTerm: String, limit: Int): F[List[ProductDetails]] =
    fetchWithPlaywright(searchTerm)
      .map(CrawlerBikeDiscount.parseProducts(_, limit))
      .handleErrorWith { err =>
        logger.warn(err)(s"Bike-Discount crawler failed for [$searchTerm]").as(Nil)
      }
}
