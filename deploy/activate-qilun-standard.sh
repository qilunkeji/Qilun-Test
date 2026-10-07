#!/bin/sh
# One-time V1 activation. No schema changes; rollback changes code only.
set -eu
umask 077
project_root=/opt/qilun-talent
old_release=/opt/qilun-talent/releases/20261006-assessment-admin-h5-v3
new_release=/opt/qilun-talent/releases/20261006-qilun-standard-v1
backup_file=/opt/qilun-talent/backups/before-qilun-standard-v1-20261006.tgz
switched=0
test "$(readlink -f "$project_root/current")" = "$old_release"
systemctl is-active --quiet qilun-talent.service
test -d "$new_release/.local"
test -f "$new_release/dist/admin-web/assets/index-EBs1NfCM.js"
test -f "$new_release/dist/admin-web/assets/assessment-admin-CRkl7K0c.js"
test -f "$new_release/packages/assessment-engine/data/qilun-standard-v1.json"
test ! -e "$backup_file"
cmp "$old_release/package-lock.json" "$new_release/package-lock.json"
cmp "$old_release/packages/iam/client.mjs" "$new_release/packages/iam/client.mjs"
cmp "$old_release/packages/iam/vendor/iam-client.mjs" "$new_release/packages/iam/vendor/iam-client.mjs"
for migration in "$old_release"/infra/migrations/*.sql; do
 cmp "$migration" "$new_release/infra/migrations/$(basename "$migration")"
done
test "$(find "$old_release/infra/migrations" -name '*.sql' | wc -l)" = "$(find "$new_release/infra/migrations" -name '*.sql' | wc -l)"
config_hash=$(sha256sum "$project_root/shared/production.env" | cut -d ' ' -f 1)
model_hash=$(sha256sum "$project_root/shared/gh-inference-v1/model.json" | cut -d ' ' -f 1)
test "$model_hash" = b1488c9922c0ae85cf29c6227f20c9d1aba495c14cc32e41a4c4cbcd6395e19d
rollback() {
 trap - EXIT
 systemctl stop qilun-talent.service || true
 if docker inspect qilun-talent-rc >/dev/null 2>&1; then
  echo 'Rollback paused: talent container did not stop. Private snapshot retained.' >&2
  exit 1
 fi
 if [ "$switched" -eq 1 ]; then
  ln -sfn "$old_release" "$project_root/current"
 fi
 # No migrations in this release: preserve the latest shared data, including
 # any writes received during the verification window. Never restore over it.
 systemctl start qilun-talent.service
 echo 'Previous talent code restored; latest production data and private backup retained.' >&2
 exit 1
}
trap rollback EXIT
systemctl stop qilun-talent.service
if docker inspect qilun-talent-rc >/dev/null 2>&1; then
 echo 'Talent container is still present; no database snapshot or switch performed.' >&2
 exit 1
fi
tar -czf "$backup_file" -C "$project_root" shared
chmod 600 "$backup_file"
ln -sfn "$new_release" "$project_root/current"
switched=1
systemctl start qilun-talent.service
attempt=0
while [ "$attempt" -lt 20 ]; do
 if curl -fsS --max-time 2 https://rc.iqilun.cn/api/v1/health | grep -q '"assessment":{"version":"qilun-internal-assessment/1.0.0","ready":true}'; then
  if curl -fsS --max-time 2 https://rc.iqilun.cn/api/v1/auth/options | grep -q '"unified_login":true,"local_password_login":false'; then
   test "$config_hash" = "$(sha256sum "$project_root/shared/production.env" | cut -d ' ' -f 1)"
   test "$model_hash" = "$(sha256sum "$project_root/shared/gh-inference-v1/model.json" | cut -d ' ' -f 1)"
   trap - EXIT
   systemctl is-active qilun-talent.service
   echo 'Qilun V1 ready; production accounts, answers, keys and unified login preserved.'
   exit 0
  fi
 fi
 attempt=$((attempt+1))
 sleep 1
done
echo 'Talent V1 health check failed; rolling back this project only.' >&2
exit 1
