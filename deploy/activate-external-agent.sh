#!/usr/bin/env bash
# PREPARED ONLY. Run once, only after the user's fresh explicit “上线”.
# Usage: activate-external-agent.sh --authorized上线 <archive SHA256> <release id>
# stdin: JSON allowlisted AGENT settings; token SHA256 only, never the plaintext.
set -euo pipefail
umask 077
test "${1:-}" = --authorized上线
test "${2:-}" != '' && test "${3:-}" != ''
[[ "$2" =~ ^[a-f0-9]{64}$ ]]
[[ "$3" =~ ^[0-9]{8}-external-agent-v[0-9]+$ ]]
root=/opt/qilun-talent
old=$root/releases/20261008-report-profile-v2
new=$root/releases/$3
archive=$root/staging/$3.tgz
backup=$root/backups/before-$3.tgz
envbackup=$root/backups/production-env-before-$3
countfile=/app/.local/agent-counts-$3.json
test "$(readlink -f "$root/current")" = "$old"
test ! -e "$new" && test ! -e "$backup" && test ! -e "$envbackup"
test ! -e "$root/current.external-agent-next" && test ! -L "$root/current.external-agent-next"
test "$(sha256sum "$old/dist/admin-web/index.html" | cut -d ' ' -f1)" = 6389e3e2a9a01bcc0a7a3d16437eafcbcd3ba65a849982cb97e7e22d3a9ff9de
test "$(sha256sum "$archive" | cut -d ' ' -f1)" = "$2"
# Reject paths outside approved source/build areas; no private payloads/symlinks.
tar -tzf "$archive" | awk '/(^\/|(^|\/)\.\.(\/|$)|(^|\/)\.env($|\.)|^\.local\/|^node_modules\/)/{bad=1} !/^(apps\/|packages\/|infra\/|dist\/|deploy\/|tests\/helpers\/|tests\/project-assessments.test.ts$|package.json$|package-lock.json$)/{bad=1} END{exit bad}'
test -z "$(tar -tvzf "$archive" | awk 'substr($1,1,1)!="-" && substr($1,1,1)!="d" {print "invalid"}')"
systemctl is-active --quiet qilun-talent.service
cp -a "$old" "$new"
tar -xzf "$archive" -C "$new"
cmp "$old/package.json" "$new/package.json"
cmp "$old/package-lock.json" "$new/package-lock.json"
cmp "$old/packages/iam/client.mjs" "$new/packages/iam/client.mjs"
cmp "$old/apps/api/iam.ts" "$new/apps/api/iam.ts"
for file in "$old"/infra/migrations/00*.sql; do cmp "$file" "$new/infra/migrations/$(basename "$file")"; done
for file in "$old"/packages/assessment-engine/data/*.json; do cmp "$file" "$new/packages/assessment-engine/data/$(basename "$file")"; done
chmod -R a+rX "$new/apps" "$new/packages" "$new/infra" "$new/dist" "$new/deploy" "$new/tests"
mkdir -p "$new/.local/gh-inference-v1"
isolated(){ docker run --rm --network none --user 1000:1000 --read-only --cap-drop ALL --security-opt no-new-privileges --memory 768m --tmpfs /tmp:rw,noexec,nosuid,size=64m --mount "type=bind,src=$new,dst=/app,readonly" --mount "type=bind,src=$root/shared/gh-inference-v1,dst=/app/.local/gh-inference-v1,readonly" --workdir /app node:24.19.0-bookworm-slim node --experimental-strip-types "$1"; }
isolated deploy/verify-agent-baseline.mjs
isolated deploy/verify-agent-startup.mjs
isolated deploy/verify-external-agent-candidate.mjs
isolated tests/project-assessments.test.ts
model_hash=$(sha256sum "$root/shared/gh-inference-v1/model.json" | cut -d ' ' -f1)
env_mode=$(stat -c %a "$root/shared/production.env")
env_owner=$(stat -c %u:%g "$root/shared/production.env")
stopped=0; switched=0; envchanged=0
link_current(){ ln -sfn "$1" "$root/current.external-agent-next"; mv -Tf "$root/current.external-agent-next" "$root/current"; }
rollback(){
 status=$?; trap - EXIT
 if test "$status" -ne 0 && test "$stopped" = 1; then
  systemctl stop qilun-talent.service || true
  if docker inspect qilun-talent-rc >/dev/null 2>&1; then echo 'Container still present; manual recovery required, data untouched.' >&2; exit 1; fi
  if test "$switched" = 1; then link_current "$old"; fi
  if test "$envchanged" = 1; then cp -p "$envbackup" "$root/shared/production.env"; chmod "$env_mode" "$root/shared/production.env"; chown "$env_owner" "$root/shared/production.env"; fi
  systemctl start qilun-talent.service
  echo 'Previous code/config restored; latest shared database retained.' >&2
 fi
 exit "$status"
}
trap rollback EXIT
stopped=1
systemctl stop qilun-talent.service
if docker inspect qilun-talent-rc >/dev/null 2>&1; then echo 'Container has not exited; no database copy.' >&2; exit 1; fi
tar -czf "$backup" -C "$root" shared; chmod 600 "$backup"
cp -p "$root/shared/production.env" "$envbackup"; chmod 600 "$envbackup"
counts(){ docker run --rm --network none --user 1000:1000 --read-only --cap-drop ALL --memory 512m --tmpfs /tmp:rw,noexec,nosuid,size=32m --mount "type=bind,src=$new,dst=/app,readonly" --mount "type=bind,src=$root/shared,dst=/app/.local" --workdir /app node:24.19.0-bookworm-slim node deploy/verify-agent-data.mjs "$1" "$countfile"; }
counts before
envchanged=1
# Credentials come only from stdin. This utility emits no values.
docker run --rm -i --network none --user 0:0 --read-only --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --tmpfs /tmp:rw,noexec,nosuid,size=8m --mount "type=bind,src=$new,dst=/app,readonly" --mount "type=bind,src=$root/shared,dst=/opt/qilun-talent/shared" --workdir /app node:24.19.0-bookworm-slim node deploy/agent-env.mjs
switched=1; link_current "$new"
systemctl start qilun-talent.service
ready=0
for attempt in {1..30}; do
 if curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/health | grep -q '"ready":true'; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
# Stop before opening a second PGlite reader. Nothing writes to production during this check.
systemctl stop qilun-talent.service
if docker inspect qilun-talent-rc >/dev/null 2>&1; then
 echo 'Container has not exited; no second database reader.' >&2
 exit 1
fi
counts after
test "$model_hash" = "$(sha256sum "$root/shared/gh-inference-v1/model.json" | cut -d ' ' -f1)"
isolated deploy/verify-agent-baseline.mjs
systemctl start qilun-talent.service
systemctl is-active --quiet qilun-talent.service
systemctl is-enabled --quiet qilun-talent.service
ready=0
for attempt in {1..30}; do
 if curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/health | grep -q '"ready":true'; then ready=1; break; fi
 sleep 1
done
test "$ready" = 1
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
trap - EXIT
echo 'External-agent release activated; production accounts/data and assessment model preserved.'
