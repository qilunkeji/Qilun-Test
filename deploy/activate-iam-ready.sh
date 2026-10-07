#!/bin/sh
set -eu
umask 077
project_root=/opt/qilun-talent
old_release=/opt/qilun-talent/releases/20261006-h5-v1
new_release=/opt/qilun-talent/releases/20261006-iam-ready
backup_file=/opt/qilun-talent/backups/before-iam-ready-20261006.tgz
failed_shared=/opt/qilun-talent/shared.failed-iam-ready-20261006
test "$(readlink -f "$project_root/current")" = "$old_release"
test -f "$new_release/apps/api/iam.ts"
test -f "$new_release/dist/admin-web/assets/index-Da40qayv.js"
test ! -e "$backup_file"
test ! -e "$failed_shared"
systemctl stop qilun-talent.service
if docker inspect qilun-talent-rc >/dev/null 2>&1; then
 echo 'Container is still present; no backup or switch performed.' >&2
 exit 1
fi
tar -czf "$backup_file" -C "$project_root" shared
chmod 600 "$backup_file"
rollback() {
 trap - EXIT
 systemctl stop qilun-talent.service || true
 if docker inspect qilun-talent-rc >/dev/null 2>&1; then
  echo 'Rollback paused: service did not stop. Private backup is preserved.' >&2
  exit 1
 fi
 # Preserve failed-upgrade data. Restore only this project's stopped snapshot.
 mv "$project_root/shared" "$failed_shared"
 tar -xzf "$backup_file" -C "$project_root"
 ln -sfn "$old_release" "$project_root/current"
 systemctl start qilun-talent.service
 echo 'Talent release and stopped private snapshot restored; failed data retained.' >&2
 exit 1
}
trap rollback EXIT
docker run --rm --network none --user 1000:1000 --read-only --mount type=bind,src="$new_release",dst=/app,readonly --mount type=bind,src="$project_root/shared",dst=/app/.local --workdir /app node:24.19.0-bookworm-slim node deploy/pin-login-scope.mjs
ln -sfn "$new_release" "$project_root/current"
systemctl start qilun-talent.service
attempt=0
while [ "$attempt" -lt 20 ]; do
 if curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/health >/dev/null && curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/auth/options >/dev/null; then
  trap - EXIT
  systemctl is-active qilun-talent.service
  echo 'New talent release healthy. Existing accounts, scope and key preserved; IAM remains disabled.'
  exit 0
 fi
 attempt=$((attempt+1))
 sleep 1
done
echo 'Health check failed; rolling back this project only.' >&2
exit 1
