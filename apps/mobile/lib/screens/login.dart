import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../config.dart';
import '../push.dart';
import 'home.dart';

/// Login: type coaching name + email → Login → OTP arrives by email.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final coaching = TextEditingController(), email = TextEditingController(), otp = TextEditingController();
  int step = 0; bool busy = false; String? error, hint; Map? mode; String channel = '';
  bool get isMobile => RegExp(r'^\d{10}$').hasMatch(email.text.trim().replaceAll(' ', ''));
  bool get valid => (AppConfig.whiteLabel || coaching.text.trim().length > 1) && (isMobile || RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email.text.trim()));
  bool get otpOn => mode?['otpEnabled'] == true;
  List<String> get channels { final c = (mode?['channels'] as Map?) ?? {}; return ['email', if (c['sms'] == true) 'sms', if (c['whatsapp'] == true) 'whatsapp']; }
  String get chosen => channel.isNotEmpty ? channel : (isMobile && channels.contains('sms') ? 'sms' : isMobile && channels.contains('whatsapp') ? 'whatsapp' : 'email');
  String _label(String c) => c == 'sms' ? 'SMS' : c == 'whatsapp' ? 'WhatsApp' : 'Email';
  Map<String, dynamic> who() => isMobile ? {'mobile': email.text.trim().replaceAll(' ', '')} : {'email': email.text.trim().toLowerCase()};

  @override void initState() { super.initState(); SharedPreferences.getInstance().then((p) { coaching.text = p.getString('coaching') ?? ''; email.text = p.getString('email') ?? ''; if (mounted) setState(() {}); });
    Api.get('/auth/mode').then((m) { if (mounted && m is Map) setState(() => mode = m); }).catchError((_) {}); }

  Future<void> send([String? ch]) async {
    final use = ch ?? chosen;
    setState(() { busy = true; error = null; });
    try { final r = await Api.post('/auth/send-otp', {if (AppConfig.whiteLabel) 'centreId': AppConfig.centreId else 'centreName': coaching.text.trim(), ...who(), if (otpOn) 'channel': use}, auth: false);
      if (r['token'] != null) { await _finish(r); return; }
      setState(() { step = 1; hint = r['devHint'] != null ? 'Dev OTP: ${r['devHint']}' : 'OTP sent by ${_label((r['via'] ?? use).toString())} to ${r['to'] ?? email.text}.${(r['via'] ?? use) == 'email' ? ' Check spam too.' : ''}'; }); }
    catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); } finally { setState(() => busy = false); }
  }

  Future<void> verify() async {
    setState(() { busy = true; error = null; });
    try {
      var r = await Api.post('/auth/verify-otp', {if (AppConfig.whiteLabel) 'centreId': AppConfig.centreId else 'centreName': coaching.text.trim(), ...who(), 'otp': otp.text}, auth: false);
      if (r['choose'] == true && mounted) {
        final opts = r['options'] as List;
        final picked = await showDialog<String>(context: context, builder: (_) => SimpleDialog(title: const Text('Which account?'), children: opts.map((o) => SimpleDialogOption(onPressed: () => Navigator.pop(context, o['userId'] as String), child: ListTile(title: Text(o['centreName']), subtitle: Text('${o['name']} · ${(o['role'] as String).toLowerCase()}')))).toList()));
        if (picked == null) { setState(() => busy = false); return; }
        r = await Api.post('/auth/choose', {'choiceToken': r['choiceToken'], 'userId': picked}, auth: false);
      }
      await _finish(r);
    } catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); } finally { if (mounted) setState(() => busy = false); }
  }

  Future<void> _finish(Map r) async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString('token', r['token']); await p.setString('name', r['user']['name']); await p.setString('role', r['user']['role']); await p.setString('userId', r['user']['id']);
      await p.setString('coaching', coaching.text.trim()); await p.setString('email', email.text.trim().toLowerCase());
      registerPush();
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
    } catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); } finally { if (mounted) setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppConfig.appName)),
        body: Padding(padding: const EdgeInsets.all(20), child: ListView(children: [
          Center(child: Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Image.asset(AppConfig.whiteLabel ? 'assets/brand-logo.png' : 'assets/nextedge-logo.png', height: 64, errorBuilder: (_, __, ___) => Image.asset('assets/nextedge-logo.png', height: 64)))),
          if (step == 0) ...[
            const Text('Sign in with the email or mobile registered at your coaching or school', style: TextStyle(fontSize: 15)),
            const SizedBox(height: 16),
            if (!AppConfig.whiteLabel) ...[TextField(controller: coaching, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Coaching / school name', hintText: 'e.g. Sharma Classes', border: OutlineInputBorder()), onChanged: (_) => setState(() {})), const SizedBox(height: 12)],
            TextField(controller: email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email or mobile', border: OutlineInputBorder()), onChanged: (_) => setState(() {}), onSubmitted: (_) { if (valid) send(); }),
            if (otpOn && channels.length > 1) ...[const SizedBox(height: 12), const Text('Send my OTP by'), const SizedBox(height: 6), Wrap(spacing: 8, children: channels.map((c) => ChoiceChip(label: Text(_label(c)), selected: chosen == c, onSelected: (_) => setState(() => channel = c))).toList())],
            const SizedBox(height: 16),
            FilledButton(onPressed: busy || !valid ? null : () => send(), child: Text(busy ? 'Sending…' : 'Login')),
            const SizedBox(height: 8),
            if (!AppConfig.whiteLabel) const Text('Platform admin? Type "Platform" as the coaching name.', style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
          if (step == 1) ...[
            Text('${AppConfig.whiteLabel ? AppConfig.centreName : coaching.text.trim()} · ${email.text.trim()}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: 'Enter the 6-digit OTP', helperText: hint, helperMaxLines: 3, border: const OutlineInputBorder()), autofocus: true, onChanged: (_) => setState(() {}), onSubmitted: (_) => otp.text.length == 6 ? verify() : null),
            FilledButton(onPressed: busy || otp.text.length != 6 ? null : verify, child: const Text('Verify & sign in')),
            if (channels.length > 1) Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [const Text('Send again by '), ...channels.map((c) => TextButton(onPressed: busy ? null : () { otp.clear(); send(c); }, child: Text(_label(c))))]),
            TextButton(onPressed: () => setState(() { step = 0; otp.clear(); }), child: const Text('Change email / mobile')),
          ],
          if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
        ])),
      );
}
