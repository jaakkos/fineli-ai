/**
 * Parser tests — focused on structured answer parsing and minimal fallback.
 *
 * NOTE: Finnish food text parsing is handled by AI (ai-parser.ts).
 * parseMealText is a minimal fallback that only does basic splitting.
 */
import { describe, it, expect } from 'vitest';
import { parseMealText, parseAnswer, classifyIntent } from '../parser';
import type { PendingQuestion } from '@/types';

function makePQ(type: PendingQuestion['type']): PendingQuestion {
  return {
    id: 'test-q',
    itemId: 'test-item',
    type,
    templateKey: type,
    templateParams: {},
    retryCount: 0,
    askedAt: Date.now(),
  };
}

// =========================================================================
// parseMealText — minimal fallback (no Finnish normalization)
// =========================================================================

describe('parseMealText (minimal fallback)', () => {
  describe('single items', () => {
    it('parses plain text item', () => {
      const result = parseMealText('kaurapuuro');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('kaurapuuro');
    });

    it('parses item with prefix amount (120g kanaa)', () => {
      const result = parseMealText('120g kanaa');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('kanaa');
      expect(result[0].amount).toBe(120);
      expect(result[0].unit).toBe('g');
    });

    it('parses item with prefix amount and space (2 dl maitoa)', () => {
      const result = parseMealText('2 dl maitoa');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('maitoa');
      expect(result[0].amount).toBe(2);
      expect(result[0].unit).toBe('dl');
    });

    it('parses suffix amount (kanaa 120 g)', () => {
      const result = parseMealText('kanaa 120 g');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('kanaa');
      expect(result[0].amount).toBe(120);
      expect(result[0].unit).toBe('g');
    });

    it('parses decimal amount with dot (1.5 dl maitoa)', () => {
      const result = parseMealText('1.5 dl maitoa');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('maitoa');
      expect(result[0].amount).toBe(1.5);
      expect(result[0].unit).toBe('dl');
    });

    it('parses "kpl" unit (2 kpl kananmuna)', () => {
      const result = parseMealText('2 kpl kananmuna');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('kananmuna');
      expect(result[0].amount).toBe(2);
      expect(result[0].unit).toBe('kpl');
    });

    it('parses "viipale" unit', () => {
      const result = parseMealText('2 viipale leipää');
      expect(result).toHaveLength(1);
      expect(result[0].unit).toBe('viipale');
    });
  });

  describe('multiple items', () => {
    it('splits on comma', () => {
      const result = parseMealText('kaurapuuro, maito');
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('kaurapuuro');
      expect(result[1].text).toBe('maito');
    });

    it('splits on "ja"', () => {
      const result = parseMealText('kahvi ja maito');
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('kahvi');
      expect(result[1].text).toBe('maito');
    });

    it('splits on "sekä"', () => {
      const result = parseMealText('leipä sekä voi');
      expect(result).toHaveLength(2);
    });

    it('splits on "+"', () => {
      const result = parseMealText('puuro + maito');
      expect(result).toHaveLength(2);
    });

    it('splits on "and"', () => {
      const result = parseMealText('rice and chicken');
      expect(result).toHaveLength(2);
    });

    it('splits on "with"', () => {
      const result = parseMealText('porridge with milk');
      expect(result).toHaveLength(2);
    });

    it('handles mixed amounts and plain items', () => {
      const result = parseMealText('120g kanaa, riisi ja salaatti');
      expect(result).toHaveLength(3);
      expect(result[0].amount).toBe(120);
      expect(result[1].text).toBe('riisi');
      expect(result[2].text).toBe('salaatti');
    });
  });

  describe('no Finnish normalization (that is the AI\'s job)', () => {
    it('passes Finnish partitive forms through as-is', () => {
      const result = parseMealText('kaurapuuroa');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('kaurapuuroa');
    });

    it('does NOT split compound Finnish descriptions (AI does this)', () => {
      // "kaurapuuroa maidolla" is one segment — no "ja" or comma to split on
      const result = parseMealText('kaurapuuroa maidolla');
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('kaurapuuroa maidolla');
    });

    it('splits on "ja" but does not normalize word forms', () => {
      const result = parseMealText('kaurapuuroa maidolla ja hillolla');
      expect(result).toHaveLength(2);
      expect(result[0].text).toBe('kaurapuuroa maidolla');
      expect(result[1].text).toBe('hillolla');
    });
  });

  describe('edge cases', () => {
    it('returns empty for empty input', () => {
      expect(parseMealText('')).toHaveLength(0);
    });

    it('returns empty for whitespace-only', () => {
      expect(parseMealText('   ')).toHaveLength(0);
    });

    it('filters out empty segments after splitting', () => {
      expect(parseMealText(',,,').length).toBe(0);
    });
  });
});

// =========================================================================
// parseAnswer — structured answer parsing (regex is perfect for these)
// =========================================================================

describe('parseAnswer', () => {
  describe('disambiguation answers', () => {
    it('parses numeric selection "1"', () => {
      expect(parseAnswer('1', 'disambiguation')).toEqual({ type: 'selection', index: 0 });
    });

    it('parses numeric selection "3"', () => {
      expect(parseAnswer('3', 'disambiguation')).toEqual({ type: 'selection', index: 2 });
    });

    it('parses ordinal "eka"', () => {
      expect(parseAnswer('eka', 'disambiguation')).toEqual({ type: 'selection', index: 0 });
    });

    it('parses ordinal "toinen"', () => {
      expect(parseAnswer('toinen', 'disambiguation')).toEqual({ type: 'selection', index: 1 });
    });

    it('parses ordinal "kolmas"', () => {
      expect(parseAnswer('kolmas', 'disambiguation')).toEqual({ type: 'selection', index: 2 });
    });

    it('parses reject "ei mikään näistä"', () => {
      expect(parseAnswer('ei mikään näistä', 'disambiguation')).toEqual({ type: 'reject' });
    });

    it('parses reject "none"', () => {
      expect(parseAnswer('none', 'disambiguation')).toEqual({ type: 'reject' });
    });

    it('falls back to clarification for unknown text', () => {
      expect(parseAnswer('rasvaton maito', 'disambiguation')).toEqual({ type: 'clarification', text: 'rasvaton maito' });
    });

    it('returns null for empty text', () => {
      expect(parseAnswer('', 'disambiguation')).toBeNull();
    });
  });

  describe('portion answers', () => {
    it('parses weight "120g"', () => {
      expect(parseAnswer('120g', 'portion')).toEqual({ type: 'weight', grams: 120 });
    });

    it('parses weight "120 g"', () => {
      expect(parseAnswer('120 g', 'portion')).toEqual({ type: 'weight', grams: 120 });
    });

    it('parses weight "120 grammaa"', () => {
      expect(parseAnswer('120 grammaa', 'portion')).toEqual({ type: 'weight', grams: 120 });
    });

    it('parses decimal weight "2,5g"', () => {
      expect(parseAnswer('2,5g', 'portion')).toEqual({ type: 'weight', grams: 2.5 });
    });

    it('parses volume "2 dl"', () => {
      expect(parseAnswer('2 dl', 'portion')).toEqual({ type: 'volume', value: 2, unit: 'dl' });
    });

    it('parses volume "100ml"', () => {
      expect(parseAnswer('100ml', 'portion')).toEqual({ type: 'volume', value: 100, unit: 'ml' });
    });

    it('parses portion size "pieni"', () => {
      expect(parseAnswer('pieni', 'portion')).toEqual({ type: 'portion_size', key: 'PORTS' });
    });

    it('parses portion size "keskikokoinen"', () => {
      expect(parseAnswer('keskikokoinen', 'portion')).toEqual({ type: 'portion_size', key: 'PORTM' });
    });

    it('parses portion size "iso"', () => {
      expect(parseAnswer('iso', 'portion')).toEqual({ type: 'portion_size', key: 'PORTL' });
    });

    it('parses fraction "puolikas"', () => {
      expect(parseAnswer('puolikas', 'portion')).toEqual({ type: 'fraction', value: 0.5 });
    });

    it('parses fraction "neljännes"', () => {
      expect(parseAnswer('neljännes', 'portion')).toEqual({ type: 'fraction', value: 0.25 });
    });

    it('parses fraction "kolmasosa"', () => {
      expect(parseAnswer('kolmasosa', 'portion')).toEqual({ type: 'fraction', value: 0.333 });
    });

    it('parses count "2 kpl"', () => {
      expect(parseAnswer('2 kpl', 'portion')).toEqual({ type: 'count', value: 2, unit: 'kpl' });
    });

    it('parses count "1.5 kappaletta"', () => {
      expect(parseAnswer('1.5 kappaletta', 'portion')).toEqual({ type: 'count', value: 1.5, unit: 'kpl' });
    });

    it('returns null for unrecognized portion', () => {
      expect(parseAnswer('jotain', 'portion')).toBeNull();
    });
  });

  describe('companion answers', () => {
    it.each([
      ['kyllä', true], ['joo', true], ['jep', true], ['ok', true],
      ['ei', false], ['no', false], ['nope', false], ['en', false],
    ])('parses "%s" as %s', (input, expected) => {
      expect(parseAnswer(input, 'companion')).toEqual({ type: 'companion', value: expected });
    });

    it('returns null for unrecognized companion answer', () => {
      expect(parseAnswer('ehkä', 'companion')).toBeNull();
    });
  });
});

// =========================================================================
// classifyIntent — lightweight regex fallback
// =========================================================================

describe('classifyIntent (regex fallback)', () => {
  describe('with pending question', () => {
    it('classifies numeric answer to disambiguation', () => {
      const pq = makePQ('disambiguation');
      const result = classifyIntent('2', pq);
      expect(result.type).toBe('answer');
      expect(result.data).toEqual({ type: 'selection', index: 1 });
    });

    it('classifies weight answer to portion question', () => {
      const pq = makePQ('portion');
      const result = classifyIntent('120g', pq);
      expect(result.type).toBe('answer');
      expect(result.data).toEqual({ type: 'weight', grams: 120 });
    });

    it('classifies yes/no to companion question', () => {
      const pq = makePQ('companion');
      const result = classifyIntent('kyllä', pq);
      expect(result.type).toBe('answer');
      expect(result.data).toEqual({ type: 'companion', value: true });
    });

    it('answer takes priority when pending question matches', () => {
      const pq = makePQ('portion');
      const result = classifyIntent('pieni', pq);
      expect(result.type).toBe('answer');
    });
  });

  describe('without pending question', () => {
    it('classifies food text as add_items', () => {
      const result = classifyIntent('kaurapuuro ja maito', null);
      expect(result.type).toBe('add_items');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('classifies "valmis" as done', () => {
      expect(classifyIntent('valmis', null).type).toBe('done');
    });

    it('classifies "siinä kaikki" as done', () => {
      expect(classifyIntent('siinä kaikki', null).type).toBe('done');
    });

    it('classifies "ei muuta" as done', () => {
      expect(classifyIntent('ei muuta', null).type).toBe('done');
    });

    it('classifies "siinäpä se" as done', () => {
      expect(classifyIntent('siinäpä se', null).type).toBe('done');
    });

    it('classifies "seis" as done', () => {
      expect(classifyIntent('seis', null).type).toBe('done');
    });

    it('classifies "poista kanaa" as removal', () => {
      const result = classifyIntent('poista kanaa', null);
      expect(result.type).toBe('removal');
      expect(result.data).toEqual({ type: 'removal', targetText: 'kanaa' });
    });

    it('classifies "ei, tarkoitin lohta" as correction', () => {
      const result = classifyIntent('ei, tarkoitin lohta', null);
      expect(result.type).toBe('correction');
      expect(result.data).toEqual({ type: 'correction', newText: 'lohta' });
    });

    it('classifies "vaihda 150g" as correction (update_portion)', () => {
      const result = classifyIntent('vaihda 150g', null);
      expect(result.type).toBe('correction');
      expect(result.data).toEqual({ type: 'update_portion', grams: 150 });
    });

    it('classifies empty message without pending question as unclear', () => {
      expect(classifyIntent('', null).type).toBe('unclear');
    });

    it('classifies empty message with pending question as answer', () => {
      const pq = makePQ('portion');
      const result = classifyIntent('', pq);
      expect(result.type).toBe('answer');
      expect(result.data).toBeNull();
    });
  });

  describe('priority ordering', () => {
    it('done takes priority over food-like text', () => {
      expect(classifyIntent('valmis', null).type).toBe('done');
    });

    it('removal takes priority over add_items', () => {
      expect(classifyIntent('poista kaurapuuro', null).type).toBe('removal');
    });
  });
});
