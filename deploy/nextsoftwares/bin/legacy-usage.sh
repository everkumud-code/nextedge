#!/usr/bin/env bash
# Who still uses the OLD NextEdge address (nextedge.nextresource.in) for the API or the attendance machines?
# Run on the VPS:  bash legacy-usage.sh [days]      (default 1 day). When this shows nothing for two weeks the old address can be retired.
LOG=/var/log/nginx/nextedge-legacy.log; DAYS="${1:-1}"
[ -f "$LOG" ] || { echo "no log yet: $LOG (written once the old address gets a request)"; exit 0; }
SINCE=$(date -d "-${DAYS} day" +%s)
echo "Requests to the old address in the last ${DAYS} day(s), by kind (the VPS itself and web browsers are not counted):"
awk -v since="$SINCE" '
  function ts(s,  m,a,mon){ split(s,a,"[/: ]"); mon=(index("JanFebMarAprMayJunJulAugSepOctNovDec",a[2])+2)/3; return mktime(a[3]" "mon" "a[1]" "a[4]" "a[5]" "a[6]) }
  { if (match($0,/\[[^]]+\]/)) { t=substr($0,RSTART+1,RLENGTH-2); if (ts(t) < since) next }
    split($0,q,"\""); ua=q[6]; ip=$1; req=q[2];
    if (ip=="187.126.116.161") next; if (ua ~ /Mozilla.*(Chrome|Safari|Firefox|Edg)/ && req !~ /iclock/) next;
    kind = (req ~ /\/iclock\//) ? "attendance machine (iclock)" : (ua ~ /Dart|okhttp|Flutter|CFNetwork/) ? "mobile app" : "other API client";
    n[kind" | "ip" | "substr(ua,1,50)]++ }
  END { for (k in n) printf "%6d  %s\n", n[k], k }' "$LOG" | sort -rn | head -20
echo "(empty list = nobody is on the old address)"
