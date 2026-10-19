import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../api.dart';
import '../config.dart';
import 'home.dart';
import '../push.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final mobile = TextEditingController(), otp = TextEditingController();
  bool otpSent = false, busy = false;
  String? error, hint;

  Future<void> send() async {
    setState(() { busy = true; error = null; });
    try {
      final r = await Api.post('/auth/send-otp', {'mobile': mobile.text}, auth: false);
      setState(() { otpSent = true; hint = r['devHint'] != null ? 'Dev OTP: ${r['devHint']}' : 'OTP sent by SMS'; });
    } catch (e) { setState(() => error = e.toString()); } finally { setState(() => busy = false); }
  }

  Future<void> verify() async {
    setState(() { busy = true; error = null; });
    try {
      final r = await Api.post('/auth/verify-otp', {'mobile': mobile.text, 'otp': otp.text}, auth: false);
      final p = await SharedPreferences.getInstance();
      await p.setString('token', r['token']); await p.setString('name', r['user']['name']); await p.setString('role', r['user']['role']); await p.setString('userId', r['user']['id']);
      registerPush();
      if (mounted) Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
    } catch (e) { setState(() => error = e.toString()); } finally { setState(() => busy = false); }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(AppConfig.appName, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: 24),
            TextField(controller: mobile, keyboardType: TextInputType.phone, maxLength: 10, enabled: !otpSent, decoration: const InputDecoration(labelText: 'Mobile number')),
            if (otpSent) TextField(controller: otp, keyboardType: TextInputType.number, maxLength: 6, decoration: InputDecoration(labelText: 'OTP', helperText: hint)),
            const SizedBox(height: 12),
            FilledButton(onPressed: busy ? null : (otpSent ? verify : send), child: Text(otpSent ? 'Sign in' : 'Send OTP')),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Colors.red))),
          ]),
        ),
      );
}
