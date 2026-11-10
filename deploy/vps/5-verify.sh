#!/usr/bin/env bash
DOMAIN="${DOMAIN:-nextedge.nextresource.in}"
echo "health:"; curl -s -m 10 "https://$DOMAIN/api/health"; echo
echo "admin page:"; curl -s -o /dev/null -m 10 -w '%{http_code}\n' "https://$DOMAIN/"
echo "spa fallback:"; curl -s -o /dev/null -m 10 -w '%{http_code}\n' "https://$DOMAIN/students"
echo "iclock reachable (any non-502/404 is fine):"; curl -s -o /dev/null -m 10 -w '%{http_code}\n' "https://$DOMAIN/iclock/getrequest?SN=test"
echo "Compare the other sites with the numbers in /root/nextedge-inspect.txt."
