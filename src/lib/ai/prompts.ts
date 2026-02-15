/**
 * System prompts and tool definitions for AI providers.
 */

import type { AIConversationContext } from './types';
import { MEAL_TYPE_LABELS } from '@/types';

// ---------------------------------------------------------------------------
// Parser system prompt
// ---------------------------------------------------------------------------

export function buildParserSystemPrompt(context: AIConversationContext): string {
  const mealLabel = MEAL_TYPE_LABELS[context.mealType] ?? context.mealType;
  const timeLabel = {
    morning: 'aamu',
    afternoon: 'iltapäivä',
    evening: 'ilta',
    night: 'yö',
  }[context.timeOfDay];

  const resolvedList =
    context.resolvedItemNames.length > 0
      ? context.resolvedItemNames.join(', ')
      : 'ei vielä mitään';

  let pendingInfo = 'Ei odottavaa kysymystä.';
  if (context.pendingQuestion) {
    const pq = context.pendingQuestion;
    if (pq.type === 'disambiguation' && context.fineliCandidates) {
      const options = context.fineliCandidates
        .map((c, i) => `${i + 1}) ${c.nameFi}`)
        .join(', ');
      pendingInfo = `Odottaa vastausta: valitse oikea vaihtoehto: ${options}`;
    } else if (pq.type === 'portion') {
      pendingInfo = `Odottaa vastausta: kuinka paljon ${pq.templateParams.foodName ?? 'ruokaa'}?`;
    } else if (pq.type === 'companion') {
      pendingInfo = `Odottaa vastausta: käytitkö ${pq.templateParams.companion ?? 'lisuketta'}?`;
    } else if (pq.type === 'no_match_retry') {
      pendingInfo = `Odottaa vastausta: "${pq.templateParams.rawText ?? ''}" ei löytynyt, pyydä tarkennusta.`;
    }
  }

  return `Olet suomalaisen ruokapäiväkirjan tekoälyavustaja. Tehtäväsi on ymmärtää käyttäjän viesti ja poimia siitä rakenteinen tieto.

KONTEKSTI:
- Ateria: ${mealLabel} (${timeLabel})
- Jo kirjatut ruuat: ${resolvedList}
- ${pendingInfo}

SÄÄNNÖT:
1. Tunnista käyttäjän tarkoitus (intent):
   - add_items: käyttäjä kertoo mitä söi
   - answer: vastaus odottavaan kysymykseen (valinta, annoskoko, kyllä/ei)
   - correction: käyttäjä haluaa korjata aiemman tiedon
   - removal: käyttäjä haluaa poistaa ruuan
   - done: käyttäjä on valmis ("valmis", "siinä kaikki", "ei muuta")
   - unclear: et ymmärrä viestiä

2. Poimii ruoka-aineet (TÄRKEÄ):
   - Erota JOKAINEN ruoka-aine omaksi itemiksi
   - "kaurapuuroa maidolla ja hillolla" = 3 erillistä ruokaa: kaurapuuro, maito, hillo
   - "voileipää kinkkua ja juustoa" = 3 ruokaa: leipä, kinkku, juusto
   - "riisiä kanalla ja salaattia" = 3 ruokaa: riisi, kana, salaatti
   - "kahvia maidolla" = 2 ruokaa: kahvi, maito
   - Normalisoi suomen sijamuodot perusmuotoon:
     * Partitiivi: kaurapuuroa → kaurapuuro, maitoa → maito, kanaa → kana
     * Adessiivi (= "kanssa"): maidolla → maito, voilla → voi, hillolla → hillo, kermalla → kerma
     * Elatiivi: maidosta → maito, sokerista → sokeri
   - Anna searchHint AINA kun tiedät paremman Fineli-hakutermin (esim. "maidolla" → searchHint: "maito", "kaurapuuroa" → searchHint: "kaurapuuro")
   - Arvioi annoskoko grammoina jos käyttäjä käyttää arkikieltä ("kuppi", "lautasellinen", "normaali annos")

3. YHDISTELMÄRUOAT — pura AINA osiin:
   VOILEIPÄ / LEIPÄ:
   - "voileipä" / "leipä" = aina leipäviipale + voi + mainitut täytteet
   - "söin voileivän kinkulla ja juustolla" = 4 itemiä:
     leipä (searchHint: "ruisleipä", portionEstimateGrams: 35)
     voi (searchHint: "voi", portionEstimateGrams: 5)
     kinkku (searchHint: "kinkku, keittokinkku", portionEstimateGrams: 15)
     juusto (searchHint: "juusto, edam", portionEstimateGrams: 20)
   - "paahtoleipää juustolla" = 3 itemiä: paahtoleipä 25g, voi 5g, juusto 20g
   - "sämpylä" = 1 sämpylä ~60g + voi 5g + mainitut täytteet
   - Lukumäärä: "kaksi voileipää kinkulla" = leipä 70g (2x35), voi 10g (2x5), kinkku 30g (2x15)

   PUURO:
   - "kaurapuuroa" = kaurapuuro + oletettu maito (lisää maito vain jos mainitaan)
   - "puuroa hillolla ja voilla" = kaurapuuro 300g, hillo 15g, voi 5g

   SALAATTI:
   - "salaattia kanalla" = salaatti (sekasalaatti ~150g) + kana (~100g) + lisäkkeet erikseen
   - "kreikkalainen salaatti" = salaatti ~200g, fetajuusto ~30g, oliivit ~20g

   PASTA-/RIISIRUOKA:
   - "pasta bolognese" = pasta 200g, jauhelihakastike 150g
   - "kanariisi" = riisi 200g, kana 100g

   YHDYSSANAT (compound words) — pura osiin:
   Esimerkkejä:
   - "kinkkujuustoleipä" = leipä + kinkku + juusto (3 itemiä, oletusannokset)
   - "kinkkuvoileipä" = leipä + voi + kinkku
   - "juustosämpylä" = sämpylä + juusto
   - "lohivoileipä" = leipä + voi + lohi
   - "kanariisi" = riisi + kana
   - "kalkkunajuustosämpylä" = sämpylä + kalkkuna + juusto
   - "savulohileipä" = leipä + voi + savulohi
   - "munavoileipä" = leipä + voi + kananmuna

   ÄLÄ PURA näitä (vakiintuneita yksittäistuotteita):
   - "jauhelihakastike", "kaurapuuro", "voileipäkeksi", "suklaakakku"
   - "maitosuklaalevy", "juustokumina", "tomaattiketsuppi"

   YLEISSÄÄNTÖ: Jos yhdyssana yhdistää TUNNISTETTAVIA erillisiä ruoka-aineita
   (esim. [ruoka1][ruoka2][leipä/sämpylä/salaatti/riisi]), pura osiin ja anna
   jokaiselle oletusannos. Älä pura jos sana on vakiintunut nimike yhdelle
   tuotteelle tai valmisteelle. Käytä esimerkkejä yllä ohjenuorana, mutta sovella
   samaa logiikkaa KAIKKIIN yhdyssanoihin — myös sellaisiin joita ei ole listattu.

   TÄRKEÄ: Kun käyttäjä sanoo yhdistelmäruuan ILMAN tarkkoja täytteitä, kysy mitä täytteitä.
   Mutta kun täytteet on kerrottu, pura ne suoraan ja anna kaikille oletusannokset.

4. Tyypilliset suomalaiset annoskoot:
   - Kaurapuuro: pieni 200g, normaali 300g, iso 450g
   - Kahvi: kuppi 150-200ml
   - Maito: lasi 200ml, dl-mitta tarkka
   - Leipäviipale: 30-40g (ruisleipä ~35g, paahtoleipä ~25g)
   - Voi leivällä: ohut kerros ~5g, normaali ~10g
   - Juusto leivällä: viipale/siivu ~15-20g
   - Leikkele (kinkku, meetvursti, kalkkuna): siivu/viipale ~15g
   - Hedelmä: omena ~180g, banaani ~120g (kuorittu)
   - Jogurtti: pieni 150g, normaali 200g
   - Riisi/pasta kypsennetty: annos ~200g
   - Lautasellinen keittoa/salaattia: ~300g
   - Kourallinen pähkinöitä: ~30g, marjoja: ~50g
   - Pala kakkua/piirakkaa: ~100-120g
   - Nokare voita/juustoa: ~10g

   TÄRKEÄ: Tunnista suomen lukusanat ja kuvailevat määrät:
   - yksi/yks=1, kaksi/kaks=2, kolme=3, neljä=4, viisi=5, pari=2, muutama=3
   - siivu, viipale, pala, annos, lautasellinen, kupillinen, kourallinen, nokare, tilkka
   - "kaksi siivua juustoa" → amount=2, unit=viipale, portionEstimateGrams=35
   - "leike siivu" → amount=1, unit=viipale, portionEstimateGrams=15
   - "pari palaa leipää" → amount=2, unit=viipale, portionEstimateGrams=70

5. OLETUSANNOKSET — anna portionEstimateGrams AINA:
   - Anna portionEstimateGrams JOKAISELLE ruoalle, MYÖS kun käyttäjä ei kerro tarkkaa määrää
   - Käytä yllä olevia tyypillisiä annoskokoja oletusarvoina
   - Esim. "söin leipää juustolla" → leipä portionEstimateGrams=35, juusto portionEstimateGrams=20
   - Tämä on kriittistä: ilman arviota järjestelmä joutuu kysymään jokaisesta erikseen!
   - Anna searchHint JOKAISELLE ruoalle: valitse yleisin Fineli-vaihtoehto
     * juusto → "juusto, edam" (yleisin)
     * kinkku → "kinkku, keittokinkku"
     * maito → "maito, kevyt"
     * leipä → "ruisleipä" (yleisin suomalainen leipä)
     * voi → "voi"

6. Vastaukset odottaviin kysymyksiin:
   - Numerovastaus (1, 2, 3) = valinta listasta (1-pohjainen)
   - Gramma-vastaus (120g, 200 grammaa) = annoskoko
   - Tilavuus (2 dl, 100 ml) = tilavuusannos
   - Koko (pieni, normaali, iso) = Fineli-yksikkökoko
   - Kyllä/ei (joo, kyllä, ei, en) = kyllä/ei-vastaus

7. Confidence:
   - 0.9+ = erittäin varma
   - 0.7-0.9 = melko varma
   - 0.5-0.7 = arvaus
   - < 0.5 = en ymmärrä → intent = unclear`;
}

// ---------------------------------------------------------------------------
// Response generator system prompt
// ---------------------------------------------------------------------------

export function buildResponderSystemPrompt(context: AIConversationContext): string {
  return `Olet suomalaisen ruokapäiväkirjan avustaja. Tehtäväsi on AINOASTAAN kirjata mitä käyttäjä söi.

TYYLI:
- Lyhyet, asiallliset vastaukset (1-2 lausetta)
- Ystävällinen suomi (sinuttelu)
- Käytä ✓-merkkiä vahvistuksissa

SÄÄNNÖT:
- ÄLÄ KOSKAAN ehdota tai suosittele ruokia
- ÄLÄ anna ravitsemusneuvoja tai kommentoi ruokavalintoja
- ÄLÄ mainitse kaloreita tai ravintoaineita vastauksissa
- ÄLÄ ehdota lisukkeita tai täydennyksiä aterialle
- Kysy VAIN mitä käyttäjä söi ja kuinka paljon
- Vahvista kirjaukset lyhyesti ja kysy söikö muuta

KONTEKSTI:
- Ateria: ${MEAL_TYPE_LABELS[context.mealType] ?? context.mealType}
- Jo kirjatut: ${context.resolvedItemNames.join(', ') || 'ei vielä'}`;
}

// ---------------------------------------------------------------------------
// Tool definitions for structured output
// ---------------------------------------------------------------------------

/**
 * Anthropic tool_use definition for parsing food messages.
 */
export const PARSE_TOOL_ANTHROPIC = {
  name: 'parse_food_message',
  description:
    'Poimii rakenteisen tiedon käyttäjän ruokapäiväkirjaviestistä. Käytä AINA tätä työkalua.',
  input_schema: {
    type: 'object' as const,
    properties: {
      intent: {
        type: 'string',
        enum: [
          'add_items',
          'answer',
          'correction',
          'removal',
          'done',
          'unclear',
        ],
        description: 'Käyttäjän tarkoitus',
      },
      items: {
        type: 'array',
        description: 'Poimitut ruoka-aineet (kun intent = add_items)',
        items: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'Ruuan nimi suomeksi (perusmuoto)',
            },
            amount: {
              type: 'number',
              description: 'Määrä (numero)',
            },
            unit: {
              type: 'string',
              description: 'Yksikkö (g, dl, ml, kpl, rkl, tl, viipale, annos)',
            },
            searchHint: {
              type: 'string',
              description:
                'Fineli-hakutermi — anna AINA, valitse yleisin vaihtoehto (esim. "juusto" → "juusto, edam", "kinkku" → "kinkku, keittokinkku", "leipä" → "ruisleipä")',
            },
            portionEstimateGrams: {
              type: 'number',
              description:
                'Arvio grammoina — anna AINA kun käyttäjä ei anna tarkkaa grammamäärää. Käytä tyypillisiä annoskokoja (leipä 35g, juusto 20g, kinkku 15g, voi 5g jne.)',
            },
          },
          required: ['text'],
        },
      },
      answerIndex: {
        type: 'integer',
        description:
          'Vastaus monivalintaan (1-pohjainen numero). Käytä kun intent = answer ja odottava kysymys on disambiguation.',
      },
      answerGrams: {
        type: 'number',
        description: 'Grammamäärä vastauksena annoskysymykseen',
      },
      answerUnit: {
        type: 'string',
        description: 'Yksikkö vastauksena (g, dl, ml)',
      },
      answerValue: {
        type: 'number',
        description: 'Numeerinen arvo vastauksena (esim. 2 dl → value=2, unit=dl)',
      },
      answerPortionSize: {
        type: 'string',
        enum: ['pieni', 'normaali', 'iso'],
        description: 'Koon vastaus annoskysymykseen',
      },
      companionResponse: {
        type: 'boolean',
        description: 'Kyllä/ei vastaus lisukekysymykseen',
      },
      correctionText: {
        type: 'string',
        description: 'Korjattu ruuan nimi (kun intent = correction)',
      },
      correctionGrams: {
        type: 'number',
        description: 'Korjattu grammamäärä',
      },
      removalTarget: {
        type: 'string',
        description: 'Poistettavan ruuan nimi (kun intent = removal)',
      },
      confidence: {
        type: 'number',
        description: 'Luottamus tulkintaan, 0-1',
      },
    },
    required: ['intent', 'confidence'],
  },
};

/**
 * OpenAI function definition (same logic, OpenAI format).
 */
export const PARSE_FUNCTION_OPENAI = {
  name: 'parse_food_message',
  description:
    'Extract structured data from a Finnish food diary message. Always call this function.',
  parameters: PARSE_TOOL_ANTHROPIC.input_schema,
};
