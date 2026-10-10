#!/usr/bin/env bash
# One-time frontend/source patch. No restart or database access.
set -euo pipefail
umask 077
[[ "${1:-}" =~ ^[a-f0-9]{64}$ ]]
root=/opt/qilun-talent
release=$root/releases/20261011-assessment-page-focus-v2
live=$release/dist/admin-web
archive=$root/staging/20261011-report-mobile-controls.tgz
backup=$root/backups/frontend-before-report-mobile-controls-20261011.tgz
test "$(readlink -f "$root/current")" = "$release"
test "$(sha256sum "$live/index.html" | cut -d ' ' -f1)" = 1bb715b70b600913e3646b79a907ed21a90631dc60fa1a943ea3aa84a018ffd4
test "$(sha256sum "$archive" | cut -d ' ' -f1)" = "$1"
test ! -e "$backup"
tar -tzf "$archive" | awk '/(^\/|(^|\/)\.\.(\/|$)|(^|\/)\.env|(^|\/)\.local\/)/{bad=1} !/^(dist\/admin-web\/?|apps\/admin-web\/src\/original-report\.(tsx|css)$)/{bad=1} END{exit bad}'
test -z "$(tar -tvzf "$archive" | awk 'substr($1,1,1)!="-" && substr($1,1,1)!="d" {print "invalid"}')"
systemctl is-active --quiet qilun-talent.service
pid=$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)
env_hash=$(sha256sum "$root/shared/production.env")
stage=$(mktemp -d "$root/staging/report-mobile-controls.XXXXXX")
tar -xzf "$archive" -C "$stage"
tar -czf "$backup" -C "$release" dist/admin-web apps/admin-web/src/original-report.tsx apps/admin-web/src/original-report.css
chmod 600 "$backup"
cp "$live/index.html" "$stage/index.before.html"
cp "$release/apps/admin-web/src/original-report.tsx" "$stage/report.before.tsx"
cp "$release/apps/admin-web/src/original-report.css" "$stage/report.before.css"
promoted=0
rollback(){
 status=$?;trap - EXIT
 if test "$status" -ne 0 && test "$promoted" = 1; then
  install -m 644 "$stage/index.before.html" "$live/.index.rollback.html";mv -f "$live/.index.rollback.html" "$live/index.html"
  install -m 644 "$stage/report.before.tsx" "$release/apps/admin-web/src/original-report.tsx"
  install -m 644 "$stage/report.before.css" "$release/apps/admin-web/src/original-report.css"
 fi
 exit "$status"
}
trap rollback EXIT
for asset in "$stage"/dist/admin-web/assets/*; do
 name=$(basename "$asset")
 if test -e "$live/assets/$name"; then cmp "$asset" "$live/assets/$name";else install -m 644 "$asset" "$live/assets/$name";fi
done
install -m 644 "$stage/dist/admin-web/index.html" "$live/.index.new.html"
promoted=1;mv -f "$live/.index.new.html" "$live/index.html"
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
test "$env_hash" = "$(sha256sum "$root/shared/production.env")"
test "$pid" = "$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)"
install -m 644 "$stage/apps/admin-web/src/original-report.tsx" "$release/apps/admin-web/src/original-report.tsx"
install -m 644 "$stage/apps/admin-web/src/original-report.css" "$release/apps/admin-web/src/original-report.css"
trap - EXIT
echo 'Mobile report controls verified; service/configuration preserved; no database access.'
