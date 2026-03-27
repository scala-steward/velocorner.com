package controllers

import org.apache.pekko.util.Timeout
import org.mockito.Mockito.mock
import org.scalatestplus.play.PlaySpec
import play.api.http.Status
import play.api.test.{FakeRequest, Helpers, StubControllerComponentsFactory}
import play.api.{Environment, Mode}
import velocorner.api.StatusInfo

import scala.concurrent.duration._
import scala.language.postfixOps

class StatusControllerSpec extends PlaySpec with StubControllerComponentsFactory {

  "rest controller for club activity series" should {

    implicit val timeout: Timeout = new Timeout(10 seconds)

    "return system status" in {
      val settingsMock = mock(classOf[ConnectivitySettings])
      val controller = new StatusController(Environment.simple(), settingsMock, stubControllerComponents())
      val result = controller.status.apply(FakeRequest())
      Helpers.status(result).mustBe(Status.OK)
      val statusInfo = Helpers.contentAsJson(result).as[StatusInfo]
      statusInfo.applicationMode.mustBe(Mode.Test.toString)
    }
  }
}
