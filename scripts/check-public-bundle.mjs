import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
const forbidden = ['requiredFacts', 'SHIPWRECK', 'HUMAN_MEAT', '동료들은 이미 죽은 사람의 고기로 음식을 만들었다.', '당신은 한국어 상황추리 게임의 질문 판정기다'];
let checked = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.name.endsWith('.js')) {
      const source = await readFile(path, 'utf8');
      for (const marker of forbidden) if (source.includes(marker)) throw new Error('Private server data found in client asset: ' + path);
      checked++;
    }
  }
}
await scan('apps/web/.next/static');
if (!checked) throw new Error('Build Next.js before checking client assets.');
console.log('Public bundle check passed: ' + checked + ' JavaScript assets contain no private case/prompt markers.');
