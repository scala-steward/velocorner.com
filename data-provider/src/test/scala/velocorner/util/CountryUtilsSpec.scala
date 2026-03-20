package velocorner.util

import cats.implicits.catsSyntaxOptionId
import org.scalatest.matchers.should.Matchers
import org.scalatest.wordspec.AnyWordSpec

class CountryUtilsSpec extends AnyWordSpec with Matchers {

  "country code utils" should {

    "read the currencies from json" in {
      val code2Currency = CountryUtils.readCurrencies()
      code2Currency.get("CH") shouldBe "CHF".some
      code2Currency.get("HU") shouldBe "HUF".some
    }
  }
}
