import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const mainScript = readFileSync(join(ROOT, 'src/scripts/main.js'), 'utf8');
const mainCss = readFileSync(join(ROOT, 'src/styles/main.css'), 'utf8');

test('ui performance: social feed uses exactly two loop sets and optimized media', () => {
  assert.equal((html.match(/class="social-gallery__set/g) || []).length, 2);
  const sources = [...html.matchAll(/data-src="(\/social\/[^\"]+)"/g)].map((match) => match[1]);
  assert.equal(sources.length, 10);
  assert.equal(new Set(sources).size, 5);
  assert.ok(sources.every((source) => source.endsWith('-mobile.mp4')));
  sources.forEach((source) => assert.ok(existsSync(join(ROOT, 'public', source))));
});

test('ui performance: optimized videos stay within the mobile transfer budget', () => {
  const directory = join(ROOT, 'public/social');
  const videos = readdirSync(directory).filter((file) => /-mobile\.mp4$/.test(file));
  assert.equal(videos.length, 5);
  const sizes = videos.map((file) => statSync(join(directory, file)).size);
  assert.ok(sizes.every((size) => size <= 6 * 1024 * 1024));
  assert.ok(sizes.reduce((sum, size) => sum + size, 0) <= 15 * 1024 * 1024);
});

test('ui performance: offscreen work and decoder count remain bounded', () => {
  assert.match(mainScript, /slice\(0, 3\)/);
  assert.match(mainScript, /socialSectionObserver/);
  assert.match(mainScript, /classList\.toggle\('is-covered'/);
  assert.doesNotMatch(mainScript, /cloneNode\(true\)/);
});

test('ui performance: mobile viewport is stable and mobile story has no parallax', () => {
  assert.doesNotMatch(mainCss, /\bdvh\b/);
  assert.match(mainCss, /height:\s*100svh/);
  assert.match(mainCss, /@media \(max-width: 600px\)[\s\S]*?\.thread__frame img \{[\s\S]*?transform:\s*none/);
  assert.match(mainCss, /\.thread__frame\.is-parallax-active img\s*\{\s*will-change:\s*transform/);
});

test('ui interaction: the first mobile swipe lands at the story instead of overshooting it', () => {
  assert.match(mainScript, /STORY_ENTRY_SWIPE_THRESHOLD_PX = 96/);
  assert.match(mainScript, /STORY_ENTRY_HOLD_MS = 50/);
  assert.match(mainScript, /storyEntryDirection = absoluteX > absoluteY \? 'horizontal' : 'vertical'/);
  assert.match(mainScript, /if \(event\.cancelable\) event\.preventDefault\(\)/);
  assert.match(mainScript, /storyFirstChapter = storyThread\?\.querySelector\('\.thread__chapter'\)/);
  assert.match(mainScript, /const dividerPageY = window\.scrollY \+ storyFirstChapter\.getBoundingClientRect\(\)\.top/);
  assert.match(mainScript, /const targetY = Math\.max\(0, dividerPageY - entryViewportBottom\)/);
  assert.doesNotMatch(mainScript, /lockedTargetY|getDividerTargetY/);
  assert.match(mainScript, /window\.scrollTo\(0, targetY\)/);
  assert.match(mainScript, /storyEntryHoldUntil = performance\.now\(\) \+ STORY_ENTRY_HOLD_MS/);
  assert.doesNotMatch(mainScript, /enforceStoryEntryLock/);
  assert.doesNotMatch(mainScript, /document\.body\.style\.position = 'fixed'/);
  assert.match(mainScript, /if \(restoreY !== null\) window\.scrollTo\(0, restoreY\)/);
  assert.match(mainScript, /storyEntryAnimationFrame \|\| isStoryEntryHolding\(\)/);
  assert.match(mainScript, /classList\.toggle\('story-entry-armed', storyEntryPhase === 'armed'\)/);
  assert.match(mainScript, /storyEntryPhase === 'armed' && window\.scrollY > 4/);
  assert.match(mainScript, /remainingMs > 0 \|\| storyEntryActiveTouches > 0/);
  assert.match(mainCss, /html\.story-entry-armed \.page\s*\{\s*touch-action:\s*pan-x/);
  assert.match(mainCss, /html\.story-entry-holding body[\s\S]*?touch-action:\s*none/);
  assert.doesNotMatch(html, /thread__entry-cue/);
});

test('ui interaction: home effects pause only after the story covers most of the viewport', () => {
  assert.match(mainScript, /STORY_COVER_TRIGGER_VIEWPORT_RATIO = 0\.18/);
  assert.match(mainScript, /const coverTrigger = window\.innerHeight \* STORY_COVER_TRIGGER_VIEWPORT_RATIO/);
  assert.match(mainScript, /classList\.toggle\('is-covered', storyTop <= coverTrigger\)/);
  assert.doesNotMatch(mainScript, /storyCoverObserver/);
});
