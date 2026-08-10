// Windows 上可靠的递归删除。
//
// 起因：本机 Node 的 fs.rmSync(path, { recursive: true, force: true }) 删 `.git`
// 时**返回成功但目录仍在**（force 只吞 ENOENT，重试耗尽后不抛错）。Git 会把 pack
// 文件设成只读，Node 删不掉，而 cmd 的 rmdir /s /q 可以。
//
// 这个静默失败同时造成过两个故障：dist/.git 残留 → Vite 清 outDir 时整个 dist 不
// 再被清理，产物累积到 329MB 把 gh-pages 强推拖到超时；以及连续两次部署时旧仓库
// 还在、内容没变，git commit 报「nothing to commit」直接中断部署。
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';

/** 删除文件或目录；删不掉则抛错，绝不静默放过 */
export function forceRm(target) {
  rmSync(target, { recursive: true, force: true });
  if (!existsSync(target)) return;

  if (process.platform === 'win32') {
    execSync(`rmdir /s /q "${target}" 2>nul || del /f /q "${target}" 2>nul`, {
      shell: 'cmd.exe',
      stdio: 'ignore',
    });
  } else {
    execSync(`rm -rf "${target}"`, { stdio: 'ignore' });
  }

  if (existsSync(target)) throw new Error(`无法删除：${target}`);
}
