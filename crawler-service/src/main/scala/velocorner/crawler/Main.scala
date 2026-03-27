package velocorner.crawler

import cats.effect.{IO, IOApp, Resource}
import cats.implicits._
import fs2.io.net.tls.TLSContext
import org.http4s.HttpApp
import org.http4s.ember.client.EmberClientBuilder
import org.http4s.ember.server.EmberServerBuilder
import org.http4s.implicits._
import org.http4s.server.Server
import org.http4s.server.middleware.{ErrorHandling, RequestLogger}
import org.typelevel.log4cats.Logger
import org.typelevel.log4cats.slf4j.Slf4jLogger
import velocorner.api.brand.Marketplace
import velocorner.crawler.build.BuildInfo
import cats.effect.unsafe.IORuntimeConfig
import scala.concurrent.duration.DurationInt

object Main extends IOApp.Simple {

  // relax threshold to 500 milliseconds, on poorer AWS EC2 t4g.small can kick in on bigger uploads
  override def runtimeConfig: IORuntimeConfig = super.runtimeConfig.copy(
    cpuStarvationCheckInterval = 5.seconds, // 1 sec the default
    cpuStarvationCheckThreshold = 0.2d // 0.1d the default
  )

  override def run: IO[Unit] = {
    val server: Resource[IO, Server] = Resource.eval(Slf4jLogger.create[IO]).flatMap { logger =>
      given Logger[IO] = logger

      for {
        tlsContext <- TLSContext.Builder.forAsync[IO].insecureResource
        client <- EmberClientBuilder.default[IO].withTLSContext(tlsContext).build
        crawlers = List(
          new CrawlerBikeComponents[IO](client),
          // new CrawlerGalaxus[IO](client),
          // new CrawlerChainReactionCycles[IO](client), don't accept orders outside UK anymore
          new CrawlerBikeImport[IO](client),
          new CrawlerBikester[IO](client),
          new CrawlerVeloFactory[IO](client),
          // new CrawlerAmazon[IO](client)
          new CrawlerBike24[IO](client),
          new CrawlerBikeDiscount[IO](client)
        )
        _ <- info(s"possible marketplaces: ${Marketplace.values.map(_.name).mkString("\n", "\n", "\n")} ...")
        _ <- info(s"using crawlers: ${crawlers.map(_.market().name).mkString("\n", "\n", "\n")} ...")
        router = new Router[IO](crawlers)
        defaultServer = EmberServerBuilder.default[IO]
        server <- defaultServer
          .withHost(com.comcast.ip4s.Host.fromString("0.0.0.0").get)
          .withPort(com.comcast.ip4s.Port.fromInt(9011).get)
          .withLogger(logger)
          .withHttpApp(
            httpLogger(logger)(ErrorHandling(router.routes.orNotFound))
          )
          .build
        _ <- info("starting crawler service ...")
        _ <- info(s"built time: ${BuildInfo.buildTime}")
      } yield server
    }
    server.useForever
  }

  def httpLogger(logger: Logger[IO]): HttpApp[IO] => HttpApp[IO] = {
    val logAction = (s: String) => logger.info(s)
    RequestLogger.httpApp(logHeaders = true, logBody = false, logAction = logAction.some)
  }

  def info[F[_]: Logger](s: String): Resource[F, Unit] = Resource.eval(Logger[F].info(s))
}
