#!/bin/sh
set -eu
site=/opt/1panel/www/sites/rc.iqilun.cn/ssl
live=/opt/qilun-talent/shared/letsencrypt/live/rc.iqilun.cn
backup=/opt/qilun-talent/backups/tls-$(date -u +%Y%m%dT%H%M%SZ)
test -f "$live/fullchain.pem"
test -f "$live/privkey.pem"
mkdir -p "$backup"
cp -a "$site/fullchain.pem" "$site/privkey.pem" "$backup/"
install -m 644 "$live/fullchain.pem" "$site/fullchain.pem"
install -m 600 "$live/privkey.pem" "$site/privkey.pem"
if docker exec 1Panel-openresty-6AKl nginx -t && docker exec 1Panel-openresty-6AKl nginx -s reload; then
    echo 'rc.iqilun.cn certificate installed; gateway validation passed'
else
    cp -a "$backup/fullchain.pem" "$backup/privkey.pem" "$site/"
    docker exec 1Panel-openresty-6AKl nginx -t
    docker exec 1Panel-openresty-6AKl nginx -s reload
    exit 1
fi
