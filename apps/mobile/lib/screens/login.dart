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
  int step = 0; bool busy = false; String? error, hint;
  bool get valid => coaching.text.trim().length > 1 && RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email.text.trim());

  @override void initState() { super.initState(); SharedPreferences.getInstance().then((p) { coaching.text = p.getString('coaching') ?? ''; email.text = p.getString('email') ?? ''; if (mounted) setState(() {}); }); }

  Future<void> send() async {
    setState(() { busy = true; error = null; });
    try { final r = await Api.post('/auth/send-otp', {'centreName': coaching.text.trim(), 'email': email.text.trim().toLowerCase()}, auth: false);
      setState(() { step = 1; hint = r['devHint'] != null ? 'Dev OTP: ${r['devHint']}' : 'OTP sent to ${r['to'] ?? email.text}. Check spam too.'; }); }
    catch (e) { setState(() => error = e.toString().replaceFirst('Exception: ', '')); } finally { setState(() => busy = false); }
  }

  Future<void> verify() async {
    setState(() { busy = true; error = null; });
    try {
      var r = await Api.post('/auth/verify-otp', {'centreName': coaching.text.trim(), 'email': email.text.trim().toLowerCase(), 'otp': otp.text}, auth: false);
      if (r['choose'] == true && mounted) {
        final opts = r['options'] as List;
        final picked = await showDialog<String>(context: context, builder: (_) => SimpleDialog(title: const Text('Which account?'), children: opts.map((o) => SimpleDialogOption(onPressed: () => Navigator.pop(context, o['userId'] as String), child: ListTile(title: Text(o['centreName']), subtitle: Text('${o['name']} · ${(o['role'] as String).toLowerCase()}')))).toList()));
        if (picked == null) { setState(() => busy = false); return; }
        r = await Api.post('/auth/choose', {'choiceToken': r['choiceToken'], 'userId': picked}, auth: false);
      }
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
          if (step == 0) ...[
            const Text('Sign in with the email registered at your coaching', style: TextStyle(fontSize: 15)),
            const SizedBox(height: 16),
            TextField(controller: coaching, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Coaching name', hintText: 'e.g. Sharma Classes', border: OutlineInputBorder()), onChanged: (_) => setState(() {})),
            const SizedBox(height: 12),
            TextField(controller: email, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()), onChanged: (_) => setState(() {}), onSubmitted: (_) => valid ? send() : null),
            const SizedBox(height: 16),
            FilledButton(onPressed: busy || !valid ? null : send, child: Text(busy ? 'Sending…' : 'Login')),
            const SizedBox(height: 8),
            const Text('Platform admin? Type "Platform" as the coaching name.', style: TextStyle(fontSize: 12, color: Colors.grey)),
          ],
          if (step == 1) ...[
            Text('${coaching.text.trim()} · ${email.text.trim()}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: 'Enter the OTP from your email', helperText: hint, helperMaxLines: 3, border: const OutlineInputBorder()), autofocus: true, onChanged: (_) => setState(() {}), onSubmitted: (_) => otp.text.length == 6 ? verify() : null),
            FilledButton(onPressed: busy || otp.text.length != 6 ? null : verify, child: const Text('Verify & sign in')),
            TextButton(onPressed: () => setState(() { step = 0; otp.clear(); }), child: const Text('Resend / change email')),
          ],
          if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
        ])),
      );
}
