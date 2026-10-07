#!/usr/bin/env bash
# Additive nullable migration009; old code remains schema-compatible on rollback.
set -euo pipefail
umask 077
root=/opt/qilun-talent
old=$root/releases/20261008-ui-unification-v1
new=$root/releases/20261008-report-profile-v2
archive=$root/staging/20261008-report-profile.tgz
backup=$root/backups/before-report-profile-20261008.tgz
test "$(readlink -f "$root/current")" = "$old"
test ! -e "$new"
test ! -e "$backup"
test "$(sha256sum "$old/dist/admin-web/index.html" | cut -d ' ' -f1)" = af2e155907c0455187a7d6fdb3be5d6706f93ed50acab8709e0b346775e10efd
test "$(sha256sum "$archive" | cut -d ' ' -f1)" = "$1"
systemctl is-active --quiet qilun-talent.service
cp -a "$old" "$new"
tar -xzf "$archive" -C "$new"
chmod -R a+rX "$new/apps" "$new/dist"
cmp "$old/package.json" "$new/package.json"
cmp "$old/package-lock.json" "$new/package-lock.json"
cmp "$old/packages/iam/client.mjs" "$new/packages/iam/client.mjs"
for file in "$old"/infra/migrations/*.sql; do cmp "$file" "$new/infra/migrations/$(basename "$file")"; done
for file in "$old"/packages/assessment-engine/data/*.json; do cmp "$file" "$new/packages/assessment-engine/data/$(basename "$file")"; done
test -f "$new/dist/admin-web/assets/index-CxzX-G4K.js"
test -d "$new/.local"
mkdir -p "$new/.local/gh-inference-v1"
# Synthetic computation only, no API/main import and no database mount.
docker run --rm --network none --user 1000:1000 --read-only --cap-drop ALL --memory 512m --tmpfs /tmp:rw,noexec,nosuid,size=32m --mount "type=bind,src=$new,dst=/app,readonly" --mount "type=bind,src=$root/shared/gh-inference-v1,dst=/app/.local/gh-inference-v1,readonly" --workdir /app node:24.19.0-bookworm-slim node --experimental-strip-types deploy/verify-qilun-standard.mjs
config_hash=$(sha256sum "$root/shared/production.env" | cut -d ' ' -f1)
model_hash=$(sha256sum "$root/shared/gh-inference-v1/model.json" | cut -d ' ' -f1)
stopped=0
switched=0
rollback(){
 status=$?
 trap - EXIT
 if test "$status" -ne 0 && test "$stopped" = 1; then
  systemctl stop qilun-talent.service || true
  if docker inspect qilun-talent-rc >/dev/null 2>&1; then echo 'Container still running; manual check required.' >&2; exit 1; fi
  if test "$switched" = 1; then ln -sfn "$old" "$root/current"; fi
  systemctl start qilun-talent.service
  echo 'Previous code restored; latest shared data retained.' >&2
 fi
 exit "$status"
}
trap rollback EXIT
stopped=1
systemctl stop qilun-talent.service
if docker inspect qilun-talent-rc >/dev/null 2>&1; then echo 'Container did not stop; no backup or switch.' >&2; exit 1; fi
tar -czf "$backup" -C "$root" shared
chmod 600 "$backup"
ln -sfn "$new" "$root/current"
switched=1
systemctl start qilun-talent.service
ready=0
for attempt in {1..30}; do
 if curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/health | grep -q '"assessment":{"version":"qilun-internal-assessment/1.0.0","ready":true}'; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
test "$config_hash" = "$(sha256sum "$root/shared/production.env" | cut -d ' ' -f1)"
test "$model_hash" = "$(sha256sum "$root/shared/gh-inference-v1/model.json" | cut -d ' ' -f1)"
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
systemctl is-active --quiet qilun-talent.service
systemctl is-enabled --quiet qilun-talent.service
trap - EXIT
echo 'Report/profile release verified; accounts, data, configuration and model preserved.'
