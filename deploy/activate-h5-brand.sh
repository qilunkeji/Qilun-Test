#!/usr/bin/env bash
# Frontend-only update: no service restart, database access or secret changes.
set -euo pipefail
umask 077
release=/opt/qilun-talent/releases/20261006-assessment-admin-h5-v3
live="$release/dist/admin-web"
archive=/opt/qilun-talent/staging/20261006-h5-brand.tgz
backup=/opt/qilun-talent/backups/frontend-before-h5-brand-20261006.tgz
test "$(readlink -f /opt/qilun-talent/current)" = "$release"
systemctl is-active --quiet qilun-talent.service
test "$(sha256sum "$live/index.html" | cut -d ' ' -f 1)" = f756ace330fdc5aa81450815447483322d09d380a340fca90042e05a483cd59c
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = b4f4dc033933624cac4e134ce9c092fc3034a9cf97214bdf6307fc1db3048cad
test ! -e "$backup"
stage=$(mktemp -d /opt/qilun-talent/staging/h5-brand-static-20261006.XXXXXX)
tar -xzf "$archive" -C "$stage"
test "$(sha256sum "$stage/index.html" | cut -d ' ' -f 1)" = ad0b4bf2e7459bc7bae1b20e5a6e25192d0c9816be1c8d06a14137ce9a436610
test "$(sha256sum "$stage/assets/index-gJX9fJLs.css" | cut -d ' ' -f 1)" = f70d651f156de3246baf700d63f8664fef6e0d572b41ec7b3c33f4768bcee4d2
test "$(sha256sum "$stage/assets/index-Cfw8Ogev.js" | cut -d ' ' -f 1)" = 0aaff45cadc6e0a7fd0186c5f7049faa454020d4839eb18b5707150d496a3a63
pid_before=$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)
test "$pid_before" -gt 0
tar -czf "$backup" -C "$release" dist/admin-web
chmod 600 "$backup"
cp "$live/index.html" "$stage/index.before.html"
promoted=0
rollback(){
  status=$?
  if test "$status" -ne 0 && test "$promoted" = 1; then
    install -m 644 "$stage/index.before.html" "$live/.index.brand-rollback.html"
    mv -f "$live/.index.brand-rollback.html" "$live/index.html"
    printf 'Verification failed; restored the previous frontend index.\n' >&2
  fi
}
trap rollback EXIT
# Content-addressed assets must exist before the new index is made visible.
# Keep all older assets so already-open assessment pages continue working.
for asset in "$stage"/assets/*; do
  name=$(basename "$asset")
  if test -e "$live/assets/$name"; then
    cmp "$asset" "$live/assets/$name"
  else
    install -m 644 "$asset" "$live/assets/$name"
  fi
done
install -m 644 "$stage/index.html" "$live/.index.brand-new.html"
promoted=1
mv -f "$live/.index.brand-new.html" "$live/index.html"
curl --fail --silent --show-error --max-time 15 https://rc.iqilun.cn/ -o "$stage/index.public.html"
cmp "$stage/index.html" "$stage/index.public.html"
curl --fail --silent --show-error --max-time 15 https://rc.iqilun.cn/assets/index-gJX9fJLs.css -o "$stage/style.public.css"
cmp "$stage/assets/index-gJX9fJLs.css" "$stage/style.public.css"
curl --fail --silent --show-error --max-time 15 https://rc.iqilun.cn/api/v1/health -o /dev/null
test "$(docker inspect --format '{{.State.Pid}}' qilun-talent-rc)" = "$pid_before"
systemctl is-active --quiet qilun-talent.service
printf 'Frontend verified; service process unchanged; backup retained: %s\n' "$backup"
