package velocorner.util

// Move this to weather service
object CountryUtils {

  // CH -> CHF
  lazy val code2Currency: Map[String, String] = readCurrencies()

  def readCurrencies(): Map[String, String] =
    JsonIo.readReadFromResource[Map[String, String]]("/currencies.json")
}
