import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Tietosuojaseloste – Ruokapäiväkirja',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/" className="mb-6 inline-block text-sm text-blue-600 hover:underline">
          &larr; Takaisin
        </Link>

        <h1 className="mb-6 text-2xl font-bold text-gray-900">Tietosuojaseloste</h1>
        <p className="mb-4 text-sm text-gray-500">Päivitetty 15.2.2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-gray-700">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">1. Rekisterinpitäjä</h2>
            <p>
              Ruokapäiväkirja-sovelluksen ylläpitäjä toimii henkilötietojen rekisterinpitäjänä.
              Yhteystiedot löydät sovelluksen GitHub-sivulta.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">2. Kerättävät tiedot</h2>
            <p>Keräämme ja käsittelemme seuraavia henkilötietoja:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Sähköpostiosoite</strong> — kirjautumista varten (magic link)</li>
              <li><strong>Ruokapäiväkirjamerkinnät</strong> — ateriat, ruoka-aineet, ravintoarvot</li>
              <li><strong>Keskusteluhistoria</strong> — AI-avustajan kanssa käydyt keskustelut ruoista</li>
              <li><strong>Tekniset tiedot</strong> — istuntoevästeet (fineli_session), aikaleimat</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">3. Käsittelyn peruste ja tarkoitus</h2>
            <p>
              Henkilötietojen käsittely perustuu käyttäjän suostumukseen (kirjautuminen) ja
              palvelun tarjoamiseen. Tietoja käytetään ainoastaan:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Käyttäjän tunnistamiseen ja kirjautumiseen</li>
              <li>Ruokapäiväkirjan toiminnallisuuden tarjoamiseen</li>
              <li>Ravintoarvojen laskemiseen ja näyttämiseen</li>
            </ul>
            <p className="mt-2">
              Tietoja <strong>ei</strong> käytetä mainontaan, profilointiin tai markkinointiin.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">4. Tietojen säilytys</h2>
            <p>
              Henkilötiedot säilytetään niin kauan kuin käyttäjätili on aktiivinen.
              Istuntoevästeet vanhenevat 7 päivän jälkeen. Kirjautumislinkit vanhenevat
              15 minuutissa ja käytetyt/vanhentuneet linkit poistetaan automaattisesti 24 tunnin kuluessa.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">5. Tietojen luovutus ja siirto</h2>
            <p>Tietoja käsittelevät seuraavat kolmannet osapuolet:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Render</strong> (palvelininfrastruktuuri ja tietokanta) — USA, EU:n vakiosopimuslausekkeet</li>
              <li><strong>Resend</strong> (sähköpostin lähetys kirjautumislinkeille) — USA, EU:n vakiosopimuslausekkeet</li>
              <li><strong>Fineli / THL</strong> (elintarvikkeiden ravintoarvotietokanta) — Suomi, julkinen rajapinta</li>
            </ul>
            <p className="mt-2">
              Tietoja ei myydä tai luovuteta kolmansille osapuolille markkinointitarkoituksiin.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">6. Evästeet</h2>
            <p>
              Sovellus käyttää yhtä välttämätöntä istuntoevästettä (<code className="rounded bg-gray-100 px-1">fineli_session</code>),
              joka on tarpeen kirjautumisen toiminnalle. Eväste on:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>HttpOnly (ei JavaScriptin saatavilla)</li>
              <li>Secure (lähetetään vain HTTPS-yhteydellä tuotannossa)</li>
              <li>SameSite: Lax (ei lähetetä kolmannen osapuolen pyynnöissä)</li>
              <li>Voimassaoloaika: 7 päivää</li>
            </ul>
            <p className="mt-2">
              Sovellus ei käytä analytiikka-, seuranta- tai mainosevästeitä.
              Välttämättömät evästeet eivät vaadi erillistä suostumusta (ePrivacy-direktiivi, artikla 5.3).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">7. Rekisteröidyn oikeudet</h2>
            <p>EU:n yleisen tietosuoja-asetuksen (GDPR) mukaisesti sinulla on oikeus:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>Pääsy tietoihin</strong> — voit viedä ruokapäiväkirjasi Excel-muodossa sovelluksen vientiominaisuudella</li>
              <li><strong>Tietojen poistaminen</strong> — voit poistaa tilisi ja kaikki siihen liittyvät tiedot asetusvalikosta</li>
              <li><strong>Tietojen oikaiseminen</strong> — voit muokata ruokapäiväkirjamerkintöjäsi suoraan sovelluksessa</li>
              <li><strong>Käsittelyn rajoittaminen</strong> — voit lopettaa sovelluksen käytön milloin tahansa</li>
              <li><strong>Valitus valvontaviranomaiselle</strong> — voit tehdä valituksen tietosuojavaltuutetun toimistolle (<a href="https://tietosuoja.fi" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">tietosuoja.fi</a>)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">8. Tietoturva</h2>
            <p>Henkilötietojen suojaamiseksi käytämme seuraavia toimenpiteitä:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Salasanattoman kirjautumisen (magic link) ja allekirjoitetut JWT-istunnot</li>
              <li>HTTPS-yhteys tuotannossa</li>
              <li>Tietokantayhteyksien salaus</li>
              <li>Palvelinpuolen virheviestien peittäminen tuotannossa</li>
              <li>Pyyntökohtainen rajoitus (rate limiting) väärinkäytösten estämiseksi</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-gray-900">9. Muutokset tietosuojaselosteeseen</h2>
            <p>
              Pidätämme oikeuden päivittää tätä tietosuojaselostetta. Olennaisista muutoksista
              ilmoitetaan sovelluksessa.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
