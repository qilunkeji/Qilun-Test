#!/bin/sh
# Additive display-cursor migration only; no scoring or environment changes.
set -eu
umask 077
project_root=/opt/qilun-talent
old_release=/opt/qilun-talent/releases/20261006-iam-refresh-fix-v2
new_release=/opt/qilun-talent/releases/20261006-assessment-admin-h5-v3
backup_file=/opt/qilun-talent/backups/before-assessment-admin-h5-v3-20261006.tgz
failed_shared=/opt/qilun-talent/shared.failed-assessment-admin-h5-v3-20261006
switched=0
test "$(readlink -f "$project_root/current")" = "$old_release"
test -f "$new_release/packages/security/assessment-access.ts"
test -f "$new_release/dist/admin-web/assets/index-C95VhZgv.js"
test -f "$new_release/dist/admin-web/assets/assessment-admin-VEZYebKY.js"
test -f "$new_release/infra/migrations/008_assessment_ui_progress.sql"
test -d "$new_release/.local" # Empty mountpoint required below the read-only app bind.
test ! -e "$backup_file"
test ! -e "$failed_shared"
# Ensure this UI/permission update includes the exact deployed SSO fix.
cmp "$old_release/packages/iam/client.mjs" "$new_release/packages/iam/client.mjs"
cmp "$old_release/packages/iam/vendor/iam-client.mjs" "$new_release/packages/iam/vendor/iam-client.mjs"
config_hash=$(sha256sum "$project_root/shared/production.env" | cut -d ' ' -f 1)
rollback() {
 trap - EXIT
 systemctl stop qilun-talent.service || true
 if docker inspect qilun-talent-rc >/dev/null 2>&1; then
  echo 'Rollback paused: talent container did not stop. Private backup retained.' >&2
  exit 1
 fi
 if [ "$switched" -eq 1 ]; then
  # Keep failed-upgrade data for recovery; restore the exact stopped snapshot.
  mv "$project_root/shared" "$failed_shared"
  tar -xzf "$backup_file" -C "$project_root"
 fi
 ln -sfn "$old_release" "$project_root/current"
 systemctl start qilun-talent.service
 echo 'Previous talent code and stopped private snapshot restored; failed-upgrade data retained.' >&2
 exit 1
}
trap rollback EXIT
systemctl stop qilun-talent.service
if docker inspect qilun-talent-rc >/dev/null 2>&1; then
 echo 'Talent container is still present; no database backup or switch performed.' >&2
 exit 1
fi
# Snapshot only after the sole database process and IAM SQLite owner have stopped.
tar -czf "$backup_file" -C "$project_root" shared
chmod 600 "$backup_file"
ln -sfn "$new_release" "$project_root/current"
switched=1
systemctl start qilun-talent.service
attempt=0
while [ "$attempt" -lt 20 ]; do
 if curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/health >/dev/null && curl -fsS --max-time 3 https://rc.iqilun.cn/api/v1/auth/options | grep -q '"unified_login":true'; then
  test "$config_hash" = "$(sha256sum "$project_root/shared/production.env" | cut -d ' ' -f 1)"
  trap - EXIT
  systemctl is-active qilun-talent.service
  echo 'Talent assessment admin release healthy; production accounts, data, keys and SSO preserved.'
  exit 0
 fi
 attempt=$((attempt+1))
 sleep 1
done
echo 'Talent health check failed; rolling back this project only.' >&2
exit 1
