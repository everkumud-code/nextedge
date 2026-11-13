import sys, types; sys.modules.setdefault("fcntl", types.ModuleType("fcntl"))  # fcntl exists only on Linux; the tests never lock
"""Tests for nsw-sync.py without nginx, certbot or the network:  python -I test_nsw_sync.py"""
import importlib.util, json, os, tempfile, unittest
spec = importlib.util.spec_from_file_location("nsw", os.path.join(os.path.dirname(__file__), "nsw-sync.py")); nsw = importlib.util.module_from_spec(spec); spec.loader.exec_module(nsw)

class Sync(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp(); self.env = os.path.join(self.d, "env"); open(self.env, "w").write("NEXTSOFT_INTERNAL_KEY=k\nDOMAIN=nextsoftwares.in\nSERVER_IP=1.2.3.4\nCERT_EMAIL=a@b.c\n")
        nsw.ENV_FILE = self.env; nsw.STATE_DIR = os.path.join(self.d, "state"); nsw.HOSTS_FILE = os.path.join(self.d, "hosts.conf"); nsw.LIVE_DIR = os.path.join(self.d, "live")
        self.calls = []; self.nginx_ok = True; self.certbot_ok = True; self.answers = {}; self.dns = "1.2.3.4"
        def fake_fetch(url, key):
            a = self.answers[url]
            if isinstance(a, Exception): raise a
            return a
        nsw.fetch = fake_fetch
        def fake_run(cmd, **kw):
            self.calls.append(cmd); rc = 0
            if cmd[0] == "nginx": rc = 0 if self.nginx_ok else 1
            if cmd[0] == "certbot":
                rc = 0 if self.certbot_ok else 1
                if rc == 0: self.make_cert(cmd[cmd.index("-d") + 1])
            return types.SimpleNamespace(returncode=rc, stdout="", stderr="bad config" if rc else "")
        nsw.run = fake_run; nsw.socket.gethostbyname = lambda h: self.dns
        self.E, self.B = nsw.PRODUCTS[0][1], nsw.PRODUCTS[1][1]
    def make_cert(self, host):
        os.makedirs(os.path.join(nsw.LIVE_DIR, host), exist_ok=True)
        for f in ("fullchain.pem", "privkey.pem"): open(os.path.join(nsw.LIVE_DIR, host, f), "w").write("x")
    def hosts(self): return open(nsw.HOSTS_FILE).read() if os.path.exists(nsw.HOSTS_FILE) else ""
    def reloads(self): return [c for c in self.calls if c == ["systemctl", "reload", "nginx"]]

    def test_certificate_then_block_in_the_same_run_pointing_at_the_right_product(self):
        self.answers = {self.E: ["sharma"], self.B: ["irongym"]}; self.assertEqual(nsw.main(), 0); h = self.hosts()
        self.assertIn("server_name sharma.nextsoftwares.in;", h); self.assertIn("set $nsw_root http://127.0.0.1:3013; set $nsw_api http://127.0.0.1:3012;", h)   # NextEdge: web 3013, api 3012
        self.assertIn("server_name irongym.nextsoftwares.in;", h); self.assertIn("set $nsw_root http://127.0.0.1:4000; set $nsw_api http://127.0.0.1:4000;", h)   # brands app
        for brand in ("fit", "glow", "care"): self.assertIn(f"server_name {brand}.nextsoftwares.in;", h)
        self.assertEqual(len(self.reloads()), 1)
    def test_no_block_without_a_certificate(self):
        self.certbot_ok = False; self.answers = {self.E: ["sharma"], self.B: []}; nsw.main()
        self.assertNotIn("sharma", self.hosts())                                  # a block without a certificate would stop nginx from starting
    def test_nothing_changed_no_reload(self):
        self.answers = {self.E: ["sharma"], self.B: []}; nsw.main(); self.calls.clear(); nsw.main()
        self.assertEqual(self.reloads(), []); self.assertFalse([c for c in self.calls if c[0] == "certbot"])
    def test_a_product_that_is_down_keeps_its_last_addresses(self):
        self.answers = {self.E: ["sharma"], self.B: ["irongym"]}; nsw.main()
        self.answers = {self.E: OSError("down"), self.B: ["irongym", "glamstudio"]}; nsw.main(); h = self.hosts()
        self.assertIn("sharma.nextsoftwares.in", h); self.assertIn("glamstudio.nextsoftwares.in", h)   # NextEdge is down: its client must stay reachable
    def test_nothing_known_and_down_does_not_crash(self):
        self.answers = {self.E: OSError("down"), self.B: OSError("down")}; self.assertEqual(nsw.main(), 0); self.assertIn("fit.nextsoftwares.in", self.hosts())
    def test_conflict_first_product_keeps_it_and_brand_names_are_reserved(self):
        self.answers = {self.E: ["same", "fit"], self.B: ["same", "other"]}; nsw.main(); h = self.hosts()
        self.assertEqual(h.count("server_name same.nextsoftwares.in;"), 1); self.assertIn("# edge", h.split("server_name same.nextsoftwares.in;")[1].splitlines()[0])
        fit = [l for l in h.splitlines() if "server_name fit.nextsoftwares.in;" in l][0]; self.assertTrue(fit.endswith("# brands"))
    def test_bad_names_never_reach_the_config(self):
        self.answers = {self.E: ["ok-one", "Bad_One", "../etc", "x y", "-lead", "a" * 64, "a;b", "a{b}"], self.B: []}; nsw.main(); h = self.hosts()
        self.assertIn("ok-one.nextsoftwares.in", h)
        for bad in ["Bad_One", "../etc", "x y", "-lead", "a;b", "a{b}", "a" * 64]: self.assertNotIn(bad, h)
    def test_failed_nginx_test_rolls_back(self):
        self.answers = {self.E: ["sharma"], self.B: []}; nsw.main(); good = self.hosts(); self.nginx_ok = False
        self.answers = {self.E: ["sharma", "new-one"], self.B: []}; self.assertEqual(nsw.main(), 1); self.assertEqual(self.hosts(), good)
    def test_certificates_wait_for_dns_and_stop_at_five_per_run(self):
        self.answers = {self.E: ["a1x", "a2x", "a3x", "a4x", "a5x", "a6x", "a7x"], self.B: []}; self.dns = "9.9.9.9"; nsw.main()
        self.assertFalse([c for c in self.calls if c[0] == "certbot"])             # DNS is not ready: no attempt
        self.dns = "1.2.3.4"; os.remove(os.path.join(nsw.STATE_DIR, "cert-fails.json")); self.calls.clear(); nsw.main()
        self.assertEqual(len([c for c in self.calls if c[0] == "certbot"]), 5)
        self.calls.clear(); nsw.main(); self.assertEqual(len([c for c in self.calls if c[0] == "certbot"]), 5)   # the next run does the next five (3 old ones are done)
    def test_failed_certificate_is_retried_after_half_an_hour(self):
        self.certbot_ok = False; self.answers = {self.E: ["sharma"], self.B: []}; nsw.main(); n = len([c for c in self.calls if c[0] == "certbot"])
        self.calls.clear(); nsw.main(); self.assertEqual(len([c for c in self.calls if c[0] == "certbot"]), 0)       # too soon
        f = os.path.join(nsw.STATE_DIR, "cert-fails.json"); d = json.load(open(f)); d = {k: v - 1900 for k, v in d.items()}; json.dump(d, open(f, "w"))
        self.calls.clear(); nsw.main(); self.assertGreater(len([c for c in self.calls if c[0] == "certbot"]), 0)

if __name__ == "__main__": unittest.main(verbosity=1)
