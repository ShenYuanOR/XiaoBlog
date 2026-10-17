import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yml = readFileSync(path.join(root, 'apps/studio/electron-builder.yml'), 'utf8');
const required = ['asarUnpack', 'runAsNode: true', 'guides', '**/*.node'];
const missing = required.filter((item) => !yml.includes(item));
if (missing.length > 0) {
  console.error(`打包配置缺少 ${missing.join('、')}`);
  process.exit(1);
}
console.log('PACK_CONFIG_OK');
if (!process.argv.includes('--fetch')) {
  console.log('未执行 pnpm fetch。需要生成离线仓库时再加 --fetch。');
  process.exit(0);
}
console.error('这次不下载离线仓库，避免在没有确认时访问网络。');
process.exit(2);
