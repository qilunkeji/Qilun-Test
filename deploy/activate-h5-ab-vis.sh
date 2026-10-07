#!/usr/bin/env bash
# One-time frontend-only update. No backend restart or shared-data access.
set -euo pipefail
umask 077
release=/opt/qilun-talent/releases/20261006-qilun-standard-v1
live="$release/dist/admin-web"
archive=/opt/qilun-talent/staging/20261006-h5-ab-vis.tgz
backup=/opt/qilun-talent/backups/frontend-before-h5-ab-vis-20261006.tgz
test "$(readlink -f /opt/qilun-talent/current)" = "$release"
systemctl is-active --quiet qilun-talent.service
test "$(sha256sum "$live/index.html" | cut -d ' ' -f 1)" = 1c3d445f396e78c2a4c71dead48c076611c6a7c3c3e1c5fa30e69eab7ab0f8cc
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = 130a394492f137246a8cbb456e65c2d944e460c6f4913a377e1ebede73128838
test ! -e "$backup"
stage=$(mktemp -d /opt/qilun-talent/staging/h5-ab-vis-20261006.XXXXXX)
tar -xzf "$archive" -C "$stage"
test "$(sha256sum "$stage/index.html" | cut -d ' ' -f 1)" = d1c760ca70642a03078609a221d2b6c51d954513d43e982b6a62ba01a381687c
test "$(sha256sum "$stage/assets/index-DB3Q57Fn.js" | cut -d ' ' -f 1)" = f4f11ba13421ce304c17f36112e7ca2ee8cbc98c8d6cf4b99ef4a21d30ab30bb
test "$(sha256sum "$stage/assets/index-CUSnrmph.css" | cut -d ' ' -f 1)" = cb5de95157d6ffb4ebc4ad276ae6a1823ca32a55b116c1b5c16ff00a141f7d6b
cmp "$stage/brand/qilun-logo-light.png" "$live/brand/qilun-logo-light.png"
cmp "$stage/brand/qilun-ribbon-dark.jpg" "$live/brand/qilun-ribbon-dark.jpg"
pid_before=$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)
test "$pid_before" -gt 0
tar -czf "$backup" -C "$release" dist/admin-web
chmod 600 "$backup"
cp "$live/index.html" "$stage/index.before.html"
promoted=0
rollback(){
 status=$?
 if test "$status" -ne 0 && test "$promoted" = 1; then
  install -m 644 "$stage/index.before.html" "$live/.index.ab-vis-rollback.html"
  mv -f "$live/.index.ab-vis-rollback.html" "$live/index.html"
  printf 'Verification failed; previous frontend index restored.\n' >&2
 fi
}
trap rollback EXIT
# Keep every older content-addressed asset for already-open pages.
for asset in "$stage"/assets/*; do
 name=$(basename "$asset")
 if test -e "$live/assets/$name"; then cmp "$asset" "$live/assets/$name";
 else install -m 644 "$asset" "$live/assets/$name";fi
done
install -m 644 "$stage/index.html" "$live/.index.ab-vis-new.html"
promoted=1
mv -f "$live/.index.ab-vis-new.html" "$live/index.html"
curl -fsS --max-time 15 https://rc.iqilun.cn/ -o "$stage/index.public.html"
cmp "$stage/index.html" "$stage/index.public.html"
for file in index-CUSnrmph.css index-DB3Q57Fn.js; do
 curl -fsS --max-time 15 "https://rc.iqilun.cn/assets/$file" -o "$stage/$file.public"
 cmp "$stage/assets/$file" "$stage/$file.public"
done
curl -fsS --max-time 10 https://rc.iqilun.cn/api/v1/health | grep -q '"assessment":{"version":"qilun-internal-assessment/1.0.0","ready":true}'
test "$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)" = "$pid_before"
systemctl is-active --quiet qilun-talent.service
printf 'H5 AB/VIS frontend verified; service unchanged; private backup retained.\n'
