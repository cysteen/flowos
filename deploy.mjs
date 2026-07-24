// 可靠的 GitHub Pages 部署：把 dist/ 强制推到 gh-pages 分支。
// 替代 gh-pages CLI（其在部分 Windows 环境 spawn git 时报 ENAMETOOLONG）。
// 依赖：dist/ 已由 `vite build` 产出，且含 public/.nojekyll（停用 Jekyll）。
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
// 本环境 SSH 不通，须走 HTTPS
const REPO = 'https://github.com/cysteen/flowos.git';
const BRANCH = 'gh-pages';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html 不存在，请先 npm run build');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { cwd: dist, stdio: 'inherit' });
const gitDir = join(dist, '.git');

rmSync(gitDir, { recursive: true, force: true });
// core.autocrlf=false：避免上万 dist 文件的 LF→CRLF 警告刷屏，进而干扰 execSync 判定
run('git -c core.autocrlf=false init -q');
run('git -c core.autocrlf=false add -A');
run('git -c core.autocrlf=false -c user.email=deploy@flowos -c user.name=flowos-deploy commit -q -m "deploy"');
run(`git push -q -f ${REPO} HEAD:${BRANCH}`);
rmSync(gitDir, { recursive: true, force: true });
console.log(`Published → ${BRANCH}`);
