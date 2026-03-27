package velocorner.manual.storage

import com.typesafe.scalalogging.LazyLogging
import velocorner.manual.{AggregateActivities, AwaitSupport, MyLocalConfig}
import velocorner.model.DailyProgress
import velocorner.storage.Storage
import velocorner.util.Metrics

object AggregateAthleteActivitiesFromStorageApp extends Metrics with LazyLogging with AggregateActivities with AwaitSupport with MyLocalConfig {

  def main(args: Array[String]): Unit = {
    val storage = Storage.create("or")
    storage.initialize()
    val progress = timed("aggregation")(awaitOn(storage.listAllActivities(432909, "Ride")).map(DailyProgress.from))
    printAllProgress(progress)

    logger.info("done...")
    storage.destroy()
  }
}
