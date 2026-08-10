// 构建前清空 dist/ 内容。
//
// 为什么需要它：deploy.mjs 会在 dist/ 里建临时 .git 做 gh-pages 推送，Vite 清空
// outDir 时会跳过 .git —— 实测下来整个 dist 都不再被清理，产物逐次累积。到 0810
// 已涨到 8154 个 chunk / 329MB（干净构建只有 141 个 / 3.4MB），gh-pages 强推因此超时。
//
// 只删内容、不删 dist 目录本身：Windows 上目录常被索引/杀软占用，删整个目录会报
// EBUSY，逐项删除则不受影响。
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { forceRm } from './force-rm.mjs';

const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), 'dist');

if (!existsSync(dist)) {
  mkdirSync(dist, { recursive: true });
} else {
  for (const name of readdirSync(dist)) forceRm(join(dist, name));
}
