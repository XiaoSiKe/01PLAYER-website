import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import OpenCC from 'opencc-js/cn2t';

// Keep the conversion dictionary out of the browser bundle. Phrase-aware
// Traditional Chinese is generated once; both message catalogues ship locally.
const convert = OpenCC.Converter({ from: 'cn', to: 'tw' });
export function buildTraditional(english, previous = {}) {
  return Object.fromEntries(Object.keys(english).map(key =>
    [key, Object.hasOwn(previous, key) ? previous[key] : convert(key)]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const english = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8'));
  const target = new URL('../src/i18n/zh-Hant.json', import.meta.url);
  const previous = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
  const traditional = buildTraditional(english, previous);
  writeFileSync(target, `${JSON.stringify(traditional, null, 2)}\n`);
  console.log(`Generated ${Object.keys(traditional).length} Traditional Chinese messages.`);
}
