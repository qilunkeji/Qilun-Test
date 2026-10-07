#!/usr/bin/env bash
# Frontend only, no service restart or shared-data access.
set -euo pipefail
umask 077
release=/opt/qilun-talent/releases/20261008-ui-unification-v1
live=$release/dist/admin-web
archive=/opt/qilun-talent/staging/20261008-home-refinement.tgz
backup=/opt/qilun-talent/backups/frontend-before-home-refinement-20261008.tgz
test "$(readlink -f /opt/qilun-talent/current)" = "$release"
test ! -e "$backup"
test "$(sha256sum "$live/index.html" | cut -d ' ' -f1)" = af2e155907c0455187a7d6fdb3be5d6706f93ed50acab8709e0b346775e10efd
test "$(sha256sum "$archive" | cut -d ' ' -f1)" = "$1"
stage=$(mktemp -d /opt/qilun-talent/staging/home-refinement.XXXXXX)
tar -xzf "$archive" -C "$stage"
test "$(sha256sum "$stage/index.html" | cut -d ' ' -f1)" = 91eb60ef31601074a93eb028fde5de511c3600a489bbd01cf2a8257bd6575eb0
cmp "$live/brand/qilun-ribbon-dark.jpg" "$stage/brand/qilun-ribbon-dark.jpg"
cmp "$live/brand/qilun-logo-light.png" "$stage/brand/qilun-logo-light.png"
pid_before=$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)
test "$pid_before" -gt 0
tar -czf "$backup" -C "$release" dist/admin-web
chmod 600 "$backup"
cp "$live/index.html" "$stage/index.before.html"
promoted=0
rollback(){ status=$?; if test "$status" -ne 0 && test "$promoted" = 1; then install -m 644 "$stage/index.before.html" "$live/.index.home-rollback.html"; mv -f "$live/.index.home-rollback.html" "$live/index.html"; echo 'Previous frontend restored.' >&2; fi; }
trap rollback EXIT
for file in "$stage"/assets/*; do name=$(basename "$file"); if test -e "$live/assets/$name"; then cmp "$file" "$live/assets/$name"; else install -m 644 "$file" "$live/assets/$name"; fi; done
install -m 644 "$stage/index.html" "$live/.index.home-new.html"
promoted=1
mv -f "$live/.index.home-new.html" "$live/index.html"
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
test "$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)" = "$pid_before"
systemctl is-active --quiet qilun-talent.service
echo 'Home refinement verified; service and private data unchanged.'
