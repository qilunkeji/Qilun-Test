#!/usr/bin/env bash
# One-time frontend-only release. No API/env/database/service changes.
set -euo pipefail
umask 077
release=/opt/qilun-talent/releases/20261008-external-agent-v3
live=$release/dist/admin-web
archive=/opt/qilun-talent/staging/20261008-invitation-share.tgz
backup=/opt/qilun-talent/backups/frontend-before-invitation-share-20261008.tgz
test "$(readlink -f /opt/qilun-talent/current)" = "$release"
test ! -e "$backup"
test "$(sha256sum "$live/index.html" | cut -d ' ' -f1)" = ed77a51c5f52681b14c6841a501bb5f0f2608366f61245717671251b38df1645
test "$(sha256sum "$archive" | cut -d ' ' -f1)" = "$1"
python3 - "$archive" <<'PY'
import sys,tarfile,pathlib
with tarfile.open(sys.argv[1]) as tar:
 for m in tar.getmembers():
  p=pathlib.PurePosixPath(m.name)
  assert not p.is_absolute() and '..' not in p.parts
  assert m.isfile() or m.isdir()
  assert not any(part in ('.local','.env','production.env') for part in p.parts)
PY
stage=$(mktemp -d /opt/qilun-talent/staging/invitation-share.XXXXXX)
tar -xzf "$archive" -C "$stage"
test "$(sha256sum "$stage/index.html" | cut -d ' ' -f1)" = 5857694a968747780628c4fc43ca1d336e5a523eee1b3bb20a7acd121802c606
cmp "$live/brand/qilun-logo-light.png" "$stage/brand/qilun-logo-light.png"
cmp "$live/brand/qilun-ribbon-dark.jpg" "$stage/brand/qilun-ribbon-dark.jpg"
pid_before=$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)
env_before=$(sha256sum /opt/qilun-talent/shared/production.env)
test "$pid_before" -gt 0
tar -czf "$backup" -C "$release" dist/admin-web
chmod 600 "$backup"
cp "$live/index.html" "$stage/index.before.html"
promoted=0
rollback(){ status=$?; if test "$status" -ne 0 && test "$promoted" = 1; then install -m 644 "$stage/index.before.html" "$live/.index.invitation-rollback.html"; mv -f "$live/.index.invitation-rollback.html" "$live/index.html"; echo 'Previous frontend restored.' >&2; fi; }
trap rollback EXIT
for file in "$stage"/assets/*; do
 name=$(basename "$file")
 if test -e "$live/assets/$name"; then cmp "$file" "$live/assets/$name"; else install -m 644 "$file" "$live/assets/$name"; fi
done
install -m 644 "$stage/index.html" "$live/.index.invitation-new.html"
promoted=1
mv -f "$live/.index.invitation-new.html" "$live/index.html"
docker exec qilun-talent-rc node deploy/verify-qilun-public.mjs
test "$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)" = "$pid_before"
test "$(sha256sum /opt/qilun-talent/shared/production.env)" = "$env_before"
systemctl is-active --quiet qilun-talent.service
echo 'Invitation frontend published; service process and production configuration unchanged.'
