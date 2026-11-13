#!/usr/bin/env python3
"""Keeps nginx and the HTTPS certificates in step with the clients that exist.

Run every minute (systemd timer). It asks each product for the addresses it has, issues a Let's Encrypt certificate for every address that does not have one yet
(HTTP-01, so no DNS access is needed beyond the wildcard A record), then writes /etc/nginx/nextsoftwares-hosts.conf with one server
block per address that has a certificate, and reloads nginx only when that file changed and the new config passes `nginx -t`.
(nginx can only read private keys as root at start/reload, so the certificate cannot be chosen per request: hence one block each.)

Safety rules: a product that does not answer keeps its LAST KNOWN addresses (a restart must never take clients offline);
a bad config is rolled back; at most 5 certificates per run; a failed certificate is retried after 30 minutes.
"""
import fcntl, json, os, re, socket, subprocess, sys, time, urllib.request

ENV_FILE = os.environ.get("NSW_ENV", "/etc/nextsoftwares.env")
STATE_DIR = "/var/lib/nextsoftwares"; HOSTS_FILE = "/etc/nginx/nextsoftwares-hosts.conf"; LIVE_DIR = "/etc/letsencrypt/live"; WEBROOT = "/var/www/letsencrypt-nextsoftwares"
FIXED = {"fit": "brands", "glow": "brands", "care": "brands"}        # the three separate brand logins
UPSTREAM = {"edge": ("http://127.0.0.1:3013", "http://127.0.0.1:3012"), "brands": ("http://127.0.0.1:4000", "http://127.0.0.1:4000")}   # (web app, api)
PRODUCTS = [("edge", "http://127.0.0.1:3012/api/workspace/internal/list"), ("brands", "http://127.0.0.1:4000/internal/workspaces")]
SLUG = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")

def env():
    out = {}
    for line in open(ENV_FILE, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line: k, v = line.split("=", 1); out[k.strip()] = v.strip().strip('"')
    return out

def log(msg): print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)

def fetch(url, key):
    req = urllib.request.Request(url, headers={"X-Internal-Key": key, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as r: data = json.load(r)
    if not isinstance(data, list): raise ValueError("not a list")
    return [d["slug"] for d in data if isinstance(d, dict) and isinstance(d.get("slug"), str) and SLUG.match(d["slug"])]

def run(cmd, **kw): return subprocess.run(cmd, capture_output=True, text=True, **kw)

def main():
    E = env(); key = E["NEXTSOFT_INTERNAL_KEY"]; domain = E.get("DOMAIN", "nextsoftwares.in"); server_ip = E.get("SERVER_IP", ""); email = E.get("CERT_EMAIL", "")
    os.makedirs(STATE_DIR, exist_ok=True)
    mapping = dict(FIXED); seen = {}
    for product, url in PRODUCTS:
        state = f"{STATE_DIR}/{product}.json"
        try:
            slugs = fetch(url, key); json.dump(slugs, open(state, "w"))
        except Exception as e:
            try: slugs = json.load(open(state)); log(f"{product}: not answering ({e}); keeping the last {len(slugs)} known addresses")
            except Exception: slugs = []; log(f"{product}: not answering and nothing known yet ({e})")
        for s in slugs:
            if not isinstance(s, str) or not SLUG.match(s): log(f"ignored a bad address from {product}: {str(s)[:40]!r}"); continue   # never let a strange name into the nginx config
            if s in FIXED: log(f"ignored {s} from {product}: reserved for a brand login"); continue
            if s in mapping and mapping[s] != product: log(f"CONFLICT: {s} exists in {mapping[s]} and {product}; {mapping[s]} keeps it"); continue
            mapping[s] = product
    # certificates first (a block is only written for an address whose certificate exists)
    fails_file = f"{STATE_DIR}/cert-fails.json"; fails = json.load(open(fails_file)) if os.path.exists(fails_file) else {}; issued = 0
    cert = lambda host: os.path.exists(f"{LIVE_DIR}/{host}/fullchain.pem") and os.path.exists(f"{LIVE_DIR}/{host}/privkey.pem")
    for s in sorted(mapping):
        host = f"{s}.{domain}"
        if cert(host): continue
        if issued >= 5: break
        if time.time() - fails.get(host, 0) < 1800: continue
        try: ip = socket.gethostbyname(host)
        except OSError: ip = ""
        if server_ip and ip != server_ip: log(f"{host}: DNS points to '{ip or 'nothing'}', not this server yet; waiting"); fails[host] = time.time() - 1500; continue
        r = run(["certbot", "certonly", "--webroot", "-w", WEBROOT, "-d", host, "--cert-name", host, "--non-interactive", "--agree-tos", "-m", email, "--keep-until-expiring"])
        issued += 1
        if r.returncode == 0: log(f"certificate issued for {host}"); fails.pop(host, None)
        else: log(f"certificate for {host} failed: {(r.stdout + r.stderr).strip()[-300:]}"); fails[host] = time.time()
    json.dump(fails, open(fails_file, "w"))
    # one server block per address that has a certificate
    blocks = ["# written by nsw-sync.py - do not edit\n"]
    for s in sorted(mapping):
        host = f"{s}.{domain}"
        if not cert(host): continue
        web, api = UPSTREAM[mapping[s]]
        blocks.append(f"server {{ listen 443 ssl; listen [::]:443 ssl; http2 on; server_name {host}; ssl_certificate {LIVE_DIR}/{host}/fullchain.pem; ssl_certificate_key {LIVE_DIR}/{host}/privkey.pem; set $nsw_root {web}; set $nsw_api {api}; include /etc/nginx/snippets/nsw-workspace.conf; }}  # {mapping[s]}\n")
    text = "".join(blocks); old = open(HOSTS_FILE, encoding="utf-8").read() if os.path.exists(HOSTS_FILE) else ""
    if text != old:
        open(HOSTS_FILE + ".new", "w", encoding="utf-8").write(text); os.replace(HOSTS_FILE + ".new", HOSTS_FILE)
        t = run(["nginx", "-t"])
        if t.returncode != 0:
            open(HOSTS_FILE, "w", encoding="utf-8").write(old); log("nginx -t failed with the new hosts file; rolled back: " + t.stderr.strip()[-300:]); return 1
        run(["systemctl", "reload", "nginx"]); log(f"nginx reloaded: {len(blocks) - 1} addresses live of {len(mapping)} known")
    return 0

if __name__ == "__main__":
    os.makedirs(STATE_DIR, exist_ok=True); lock = open(f"{STATE_DIR}/lock", "w")
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError: sys.exit(0)           # the previous run is still going
    sys.exit(main())
