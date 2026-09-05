import { describe, expect, it } from 'vitest';
import { escapeXml, formatCount, renderBadge, textWidth } from './index.js';

describe('count formatting', () => {
  it.each([[1_000, false, '1,000'], [100_000, false, '100,000'], [1_250_000, true, '1.25M'], [12_400, true, '12.4K']])(
    'formats %i', (count, compact, expected) => expect(formatCount(count as number, compact as boolean)).toBe(expected),
  );
});

it('escapes all XML-sensitive characters', () => {
  expect(escapeXml(`<views & "friends" 'now'>`)).toBe('&lt;views &amp; &quot;friends&quot; &apos;now&apos;&gt;');
});

it('grows the badge for longer text', () => {
  expect(textWidth('PROFILE VIEWS', 'flat')).toBeGreaterThan(textWidth('VIEWS', 'flat'));
});

it('renders accessible, escaped SVG', () => {
  const svg = renderBadge({ label: '<views>', count: 42, style: 'flat', color: 'f7b93e', labelColor: '1a1b27', compact: false });
  expect(svg).toContain('<title>&lt;views&gt;: 42</title>');
  expect(svg).toContain('role="img"');
  expect(svg).not.toContain('<views>');
});
