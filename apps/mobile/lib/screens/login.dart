import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../config.dart';
import '../push.dart';
import 'home.dart';

/// Login: choose coaching → mobile → OTP (SMS or email).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final mobile = TextEditingController(), otp = TextEditingController(), search = TextEditingController();
  List centres = []; String? centreId, centreName; String channel = 'sms'; int step = 0; bool busy = false; String? error, hint;

  @override void initState() { super.initState(); loadCentres(); }
  Future<void> loadCentres() async { try { centres = await Api.get('/auth/centres'); } catch (e) { error = 'Could not reach the server. Pull down to retry.'; } if (mounted) setState(() {}); }

  Future<void> send() async {
    setState(() { busy = true; error = null; });
    try { final r = await Api.post('/auth/send-otp', {'mobile': mobile.text, 'centreId': centreId, 'channel': channel}, auth: false);
      setState(() { step = 2; hint = r['devHint'] != null ? 'Dev OTP: ${r['devHint']}' : r['via'] == 'email' ? 'OTP sent to ${r['to']}' : 'OTP sent by SMS'; }); }
    catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); } finally { setState(() => busy = false); }
  }

  Future<void> verify() async {
    setState(() { busy = true; error = null; });
    try {
      var r = await Api.post('/auth/verify-otp', {'mobile': mobile.text, 'otp': otp.text, 'centreId': centreId}, auth: false);
      if (r['choose'] == true && mounted) {
        final opts = r['options'] as List;
        final picked = await showDialog<String>(context: context, builder: (_) => SimpleDialog(title: const Text('Which centre?'), children: opts.map((o) => SimpleDialogOption(onPressed: () => Navigator.pop(context, o['userId'] as String), child: ListTile(title: Text(o['centreName']), subtitle: Text('${o['name']} · ${(o['role'] as String).toLowerCase()}')))).toList()));
        if (picked == null) { setState(() => busy = false); return; }
        r = await Api.post('/auth/choose', {'choiceToken': r['choiceToken'], 'userId': picked}, auth: false);
      }
      final p = await SharedPreferences.getInstance();
      await p.setString('token', r['token']); await p.setString('name', r['user']['name']); await p.setString('role', r['user']['role']); await p.setString('userId', r['user']['id']);
      registerPush();
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
    } catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); } finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) {
    final q = search.text.toLowerCase(); final shown = centres.where((c) => (c['name'] as String).toLowerCase().contains(q)).toList();
    return Scaffold(
      appBar: AppBar(title: Text(AppConfig.appName)),
      body: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (step == 0) ...[
          const Text('First, choose your coaching', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(controller: search, decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search coaching name', border: OutlineInputBorder()), onChanged: (_) => setState(() {})),
          const SizedBox(height: 8),
          Expanded(child: RefreshIndicator(onRefresh: loadCentres, child: ListView(children: [
            for (final c in shown) Card(child: ListTile(title: Text(c['name']), subtitle: c['city'] != null ? Text(c['city']) : null, trailing: const Icon(Icons.chevron_right), onTap: () => setState(() { centreId = c['id']; centreName = c['name']; step = 1; }))),
            if (shown.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text(centres.isEmpty ? 'Loading…' : 'No coaching matches.')),
          ]))),
          TextButton(onPressed: () => setState(() { centreId = 'platform'; centreName = 'Platform admin'; step = 1; }), child: const Text('Platform admin login', style: TextStyle(fontSize: 12))),
        ],
        if (step == 1) ...[
          Row(children: [Expanded(child: Text(centreName ?? '', style: const TextStyle(fontWeight: FontWeight.w600))), TextButton(onPressed: () => setState(() => step = 0), child: const Text('change'))]),
          TextField(controller: mobile, keyboardType: TextInputType.phone, maxLength: 10, decoration: const InputDecoration(labelText: 'Mobile number', border: OutlineInputBorder()), autofocus: true),
          Row(children: [Expanded(child: RadioListTile<String>(dense: true, value: 'sms', groupValue: channel, title: const Text('OTP by SMS'), onChanged: (v) => setState(() => channel = v!))), Expanded(child: RadioListTile<String>(dense: true, value: 'email', groupValue: channel, title: const Text('OTP by email'), onChanged: (v) => setState(() => channel = v!)))]),
          const SizedBox(height: 8),
          FilledButton(onPressed: busy || mobile.text.length != 10 ? null : send, child: const Text('Send OTP')),
        ],
        if (step == 2) ...[
          Text('$centreName · ${mobile.text}', style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: 'Enter OTP', helperText: hint, border: const OutlineInputBorder()), autofocus: true, onChanged: (_) => setState(() {})),
          FilledButton(onPressed: busy || otp.text.length != 6 ? null : verify, child: const Text('Sign in')),
          TextButton(onPressed: () => setState(() => step = 1), child: const Text('Resend / change number')),
        ],
        if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
      ])),
    );
  }
}
