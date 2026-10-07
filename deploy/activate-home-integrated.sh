#!/usr/bin/env bash
# One-time frontend publication; preserves the running API and shared data.
set -euo pipefail
umask 077
release=/opt/qilun-talent/releases/20261008-report-profile-v2
live=$release/dist/admin-web
archive=/opt/qilun-talent/staging/20261008-home-integrated.tgz
backup=/opt/qilun-talent/backups/frontend-before-home-integrated-20261008.tgz
test "$(readlink -f /opt/qilun-talent/current)" = "$release"
test ! -e "$backup"
test "$(sha256sum "$live/index.html" | cut -d ' ' -f1)" = 6cd357a79577886415781318dcb9cc2e01ad48ec8f32f876853d042750ef9d17
test "$(sha256sum "$archive" | cut -d ' ' -f1)" = "$1"
stage=$(mktemp -d /opt/qilun-talent/staging/home-integrated.XXXXXX)
tar -xzf "$archive" -C "$stage"
test "$(sha256sum "$stage/index.html" | cut -d ' ' -f1)" = 6389e3e2a9a01bcc0a7a3d16437eafcbcd3ba65a849982cb97e7e22d3a9ff9de
cmp "$live/brand/qilun-ribbon-dark.jpg" "$stage/brand/qilun-ribbon-dark.jpg"
cmp "$live/brand/qilun-logo-light.png" "$stage/brand/qilun-logo-light.png"
pid_before=$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)
test "$pid_before" -gt 0
tar -czf "$backup" -C "$release" dist/admin-web
chmod 600 "$backup"
cp "$live/index.html" "$stage/index.before.html"
promoted=0
rollback(){ status=$?; if test "$status" -ne 0 && test "$promoted" = 1; then install -m 644 "$stage/index.before.html" "$live/.index.integrated-rollback.html"; mv -f "$live/.index.integrated-rollback.html" "$live/index.html"; echo 'Previous frontend restored.' >&2; fi; }
trap rollback EXIT
for file in "$stage"/assets/*; do name=$(basename "$file"); if test -e "$live/assets/$name"; then cmp "$file" "$live/assets/$name"; else install -m 644 "$file" "$live/assets/$name"; fi; done
install -m 644 "$stage/index.html" "$live/.index.integrated-new.html"
promoted=1
mv -f "$live/.index.integrated-new.html" "$live/index.html"
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
test "$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)" = "$pid_before"
systemctl is-active --quiet qilun-talent.service
echo 'Integrated home and report image export verified; service and shared data unchanged.'
