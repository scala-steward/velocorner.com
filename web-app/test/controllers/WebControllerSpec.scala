package controllers

import org.apache.pekko.util.Timeout
import org.mockito.Mockito.{mock, when}
import org.scalatestplus.play.PlaySpec
import play.api.cache.SyncCacheApi
import play.api.test.{FakeRequest, Helpers, StubControllerComponentsFactory}
import velocorner.{SecretConfig, ServiceProvider}

import scala.concurrent.duration._
import scala.language.postfixOps

class WebControllerSpec extends PlaySpec with StubControllerComponentsFactory {

  "controller" should {

    implicit val timeout: Timeout = 10 seconds

    given AssetsFinder = new AssetsFinder {
      override def findAssetPath(basePath: String, rawPath: String): String = basePath
      override def assetsUrlPrefix: String = ""
      override def assetsBasePath: String = "public"
    }

    val cacheApiMock = mock(classOf[SyncCacheApi])
    val settingsMock = mock(classOf[ConnectivitySettings])
    val refreshStrategyMock = mock(classOf[RefreshStrategy])
    val secretConfigMock = mock(classOf[SecretConfig])

    when(settingsMock.secretConfig).thenReturn(secretConfigMock)
    when(secretConfigMock.isServiceEnabled(ServiceProvider.Withings)).thenReturn(false)

    "render landing page" in {
      val controller = new WebController(
        stubControllerComponents(),
        cacheApiMock,
        settingsMock,
        refreshStrategyMock
      )
      val result = controller.index.apply(FakeRequest())
      val content = Helpers.contentAsString(result)
      content must include("Welcome")
    }
  }
}
