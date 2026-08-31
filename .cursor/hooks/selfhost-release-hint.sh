#!/usr/bin/env bash
# After edits under packages/selfhost or bootstrap: remind about npm release path.
# stdin: Cursor hook JSON (best-effort parse with node).
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
payload="$(cat || true)"
matched="$(node -e '
const fs = require("fs");
let raw = "";
try { raw = fs.readFileSync(0, "utf8"); } catch { raw = process.argv[1] || ""; }
let j = {};
try { j = JSON.parse(raw || process.argv[1] || "{}"); } catch { j = {}; }
const paths = [];
for (const k of ["file_path", "path", "filePath"]) {
  if (typeof j[k] === "string") paths.push(j[k]);
}
if (Array.isArray(j.edits)) {
  for (const e of j.edits) {
    if (e && typeof e.path === "string") paths.push(e.path);
    if (e && typeof e.file_path === "string") paths.push(e.file_path);
  }
}
if (j.tool_input && typeof j.tool_input.path === "string") paths.push(j.tool_input.path);
const hit = paths.some((p) =>
  /packages\/selfhost\//.test(p)
  || /scripts\/bootstrap\//.test(p)
  || /scripts\/release-selfhost\.mjs$/.test(p)
  || /publish-selfhost\.yml$/.test(p)
);
process.stdout.write(hit ? "1" : "0");
' -- "$payload" <<<"$payload" 2>/dev/null || echo 0)"

if [ "$matched" = 1 ]; then
  node -e 'console.log(JSON.stringify({
    followup_message: "检测到自托管 CLI / bootstrap 相关改动。发布 @opptrix/selfhost：npm run release:selfhost → 提交后 push main + tag selfhost-v*（双远程），CI 会用 NPM_TOKEN 发 npm。"
  }))'
else
  echo '{}'
fi
