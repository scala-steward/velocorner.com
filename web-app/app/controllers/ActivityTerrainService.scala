package controllers

import play.Logger
import play.api.cache.SyncCacheApi
import play.api.libs.json.{JsArray, JsNumber, JsValue, Json}
import velocorner.api.{Account, ActivityRoute, ActivityRoutePoint, ActivityTerrain, TerrainBounds, TerrainPoint}

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import javax.inject.{Inject, Singleton}
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.FutureConverters._
import scala.concurrent.duration._
import scala.util.control.NonFatal

@Singleton
class ActivityTerrainService @Inject() (
    connectivity: ConnectivitySettings,
    activityRouteService: ActivityRouteService,
    cache: SyncCacheApi
)(implicit ec: ExecutionContext) {

  private val logger = Logger.of(this.getClass)
  private val httpClient = HttpClient.newBuilder().build()

  private val baseGridSize = 28
  private val mediumGridSize = 36
  private val denseGridSize = 44
  private val maxGridSize = 52
  private val batchSize = 100
  private val minPaddingDegrees = 0.0035
  private val paddingFactor = 0.18
  private val cacheTtl = 12.hours

  private case class GridSpec(rows: Int, cols: Int)

  def terrainFor(account: Account, activityId: Long): Future[Option[ActivityTerrain]] = {
    activityRouteService.routeFor(account, activityId).flatMap {
      case Some(route) if route.points.lengthCompare(1) > 0 =>
        val cacheKey = terrainCacheKey(account.athleteId, activityId, route)
        cache.get[ActivityTerrain](cacheKey) match {
          case some @ Some(_) => Future.successful(some)
          case None =>
            val bounds = expandBounds(route.points)
            val gridSpec = adaptiveGridSpec(route, bounds)
            fetchDem(activityId, bounds, gridSpec)
              .recover { case NonFatal(error) =>
                logger.info(s"DEM retrieval failed for activity $activityId: ${error.getMessage}")
                interpolateTerrain(activityId, route, bounds, gridSpec)
              }
              .map { terrain =>
                cache.set(cacheKey, terrain, cacheTtl)
                Some(terrain)
              }
        }

      case _ => Future.successful(None)
    }
  }

  private def terrainCacheKey(athleteId: Long, activityId: Long, route: ActivityRoute): String = {
    val fingerprint = sha256(
      route.points
        .map(point => f"${point.lat}%.5f:${point.lon}%.5f:${point.ele.getOrElse(-9999d)}%.1f")
        .mkString("|") + s"|${route.source}|${route.points.size}|${routeElevationGain(route)}"
    )

    s"activity-terrain:$athleteId:$activityId:$fingerprint"
  }

  private def expandBounds(points: List[ActivityRoutePoint]): TerrainBounds = {
    val latitudes = points.map(_.lat)
    val longitudes = points.map(_.lon)
    val minLat = latitudes.min
    val maxLat = latitudes.max
    val minLon = longitudes.min
    val maxLon = longitudes.max
    val latPadding = math.max((maxLat - minLat) * paddingFactor, minPaddingDegrees)
    val lonPadding = math.max((maxLon - minLon) * paddingFactor, minPaddingDegrees)

    TerrainBounds(
      minLat = minLat - latPadding,
      maxLat = maxLat + latPadding,
      minLon = minLon - lonPadding,
      maxLon = maxLon + lonPadding
    )
  }

  private def adaptiveGridSpec(route: ActivityRoute, bounds: TerrainBounds): GridSpec = {
    val gain = routeElevationGain(route)
    val distanceKm = routeDistanceMeters(route) / 1000d
    val latSpan = math.max(bounds.maxLat - bounds.minLat, 0.0001)
    val lonSpan = math.max(bounds.maxLon - bounds.minLon, 0.0001)
    val aspectRatio = lonSpan / latSpan
    val densityBase =
      if (gain >= 1800 || distanceKm >= 95) denseGridSize
      else if (gain >= 900 || distanceKm >= 55) mediumGridSize
      else baseGridSize

    val mountainBonus =
      if (gain >= 2600) 6
      else if (gain >= 1800) 4
      else if (gain >= 1200) 2
      else 0

    val target = math.min(densityBase + mountainBonus, maxGridSize)

    if (aspectRatio >= 1.25) {
      GridSpec(rows = math.max((target / aspectRatio).round.toInt, baseGridSize), cols = target)
    } else if (aspectRatio <= 0.8) {
      GridSpec(rows = target, cols = math.max((target * aspectRatio).round.toInt, baseGridSize))
    } else {
      GridSpec(rows = target, cols = target)
    }
  }

  private def fetchDem(activityId: Long, bounds: TerrainBounds, gridSpec: GridSpec): Future[ActivityTerrain] = {
    val samples = gridSamples(bounds, gridSpec)

    Future
      .sequence(samples.grouped(batchSize).toList.map(fetchElevationBatch))
      .map(_.flatten)
      .map { elevations =>
        if (elevations.size != samples.size) {
          throw new IllegalStateException(s"Unexpected DEM sample count for activity $activityId: ${elevations.size}/${samples.size}")
        }

        ActivityTerrain(
          activityId = activityId,
          source = "open-meteo",
          rows = gridSpec.rows,
          cols = gridSpec.cols,
          bounds = bounds,
          points = samples.zip(elevations).map { case ((lat, lon), elevation) =>
            TerrainPoint(lat = lat, lon = lon, ele = elevation)
          }
        )
      }
  }

  private def fetchElevationBatch(samples: List[(Double, Double)]): Future[List[Option[Double]]] = {
    val latitudes = samples.map { case (lat, _) => f"$lat%.6f" }.mkString(",")
    val longitudes = samples.map { case (_, lon) => f"$lon%.6f" }.mkString(",")
    val baseUrl = connectivity.secretConfig.getDemUrl.stripSuffix("/")
    val uri = URI.create(s"$baseUrl?latitude=$latitudes&longitude=$longitudes")
    val request = HttpRequest
      .newBuilder(uri)
      .header("Accept", "application/json")
      .GET()
      .build()

    httpClient
      .sendAsync(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8))
      .asScala
      .map { response =>
        if (response.statusCode() / 100 != 2) {
          throw new IllegalStateException(s"DEM provider returned ${response.statusCode()}")
        }

        parseElevationResponse(Json.parse(response.body()))
      }
  }

  private def parseElevationResponse(json: JsValue): List[Option[Double]] = {
    (json \ "elevation").toOption match {
      case Some(JsArray(values)) =>
        values.toList.map {
          case JsNumber(value) => Some(value.toDouble)
          case _               => None
        }
      case Some(JsNumber(value)) => List(Some(value.toDouble))
      case _                     => throw new IllegalStateException("DEM response does not contain elevation values")
    }
  }

  private def gridSamples(bounds: TerrainBounds, gridSpec: GridSpec): List[(Double, Double)] = {
    val latStep = if (gridSpec.rows <= 1) 0d else (bounds.maxLat - bounds.minLat) / (gridSpec.rows - 1)
    val lonStep = if (gridSpec.cols <= 1) 0d else (bounds.maxLon - bounds.minLon) / (gridSpec.cols - 1)

    (0 until gridSpec.rows).toList.flatMap { row =>
      val lat = bounds.maxLat - row * latStep
      (0 until gridSpec.cols).toList.map { col =>
        val lon = bounds.minLon + col * lonStep
        (lat, lon)
      }
    }
  }

  private def interpolateTerrain(activityId: Long, route: ActivityRoute, bounds: TerrainBounds, gridSpec: GridSpec): ActivityTerrain = {
    val elevatedPoints = route.points.filter(_.ele.isDefined)
    val samples = gridSamples(bounds, gridSpec)
    val points = samples.map { case (lat, lon) =>
      TerrainPoint(lat = lat, lon = lon, ele = interpolateElevation(lat, lon, elevatedPoints))
    }

        ActivityTerrain(
          activityId = activityId,
          source = "route-interpolated",
          rows = gridSpec.rows,
          cols = gridSpec.cols,
          bounds = bounds,
          points = points
        )
  }

  private def routeDistanceMeters(route: ActivityRoute): Double = {
    route.points
      .sliding(2)
      .collect {
        case List(start, end) =>
          val lat1 = math.toRadians(start.lat)
          val lat2 = math.toRadians(end.lat)
          val deltaLat = lat2 - lat1
          val deltaLon = math.toRadians(end.lon - start.lon)
          val a = math.sin(deltaLat / 2) * math.sin(deltaLat / 2) +
            math.cos(lat1) * math.cos(lat2) * math.sin(deltaLon / 2) * math.sin(deltaLon / 2)
          2 * 6371000d * math.atan2(math.sqrt(a), math.sqrt(1 - a))
      }
      .sum
  }

  private def routeElevationGain(route: ActivityRoute): Double = {
    route.points
      .sliding(2)
      .collect {
        case List(start, end) =>
          (for {
            startElevation <- start.ele
            endElevation <- end.ele
          } yield math.max(endElevation - startElevation, 0d)).getOrElse(0d)
      }
      .sum
  }

  private def interpolateElevation(lat: Double, lon: Double, points: List[ActivityRoutePoint]): Option[Double] = {
    if (points.isEmpty) return None

    val nearest = points
      .map { point =>
        val distance = math.sqrt(math.pow(point.lat - lat, 2) + math.pow(point.lon - lon, 2))
        (point, distance)
      }
      .sortBy(_._2)
      .take(6)

    nearest.collectFirst { case (point, distance) if distance < 1e-9 => point.ele }.flatten.orElse {
      val weighted = nearest.flatMap { case (point, distance) =>
        point.ele.map { elevation =>
          val weight = 1d / math.max(distance, 1e-6)
          (elevation, weight)
        }
      }

      Option.when(weighted.nonEmpty) {
        val totalWeight = weighted.map(_._2).sum
        weighted.map { case (elevation, weight) => elevation * weight }.sum / totalWeight
      }
    }
  }

  private def sha256(value: String): String = {
    val digest = MessageDigest.getInstance("SHA-256")
    digest.digest(value.getBytes(StandardCharsets.UTF_8)).map("%02x".format(_)).mkString
  }
}
