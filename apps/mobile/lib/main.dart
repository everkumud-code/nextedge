import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import 'screens/login.dart';
import 'screens/home.dart';

void main() => runApp(const CoachingApp());

class CoachingApp extends StatelessWidget {
  const CoachingApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        title: AppConfig.appName,
        theme: ThemeData(colorSchemeSeed: const Color(AppConfig.primaryColour), useMaterial3: true),
        debugShowCheckedModeBanner: false,
        home: FutureBuilder<SharedPreferences>(
          future: SharedPreferences.getInstance(),
          builder: (_, s) => !s.hasData ? const SizedBox() : (s.data!.getString('token') == null ? const LoginScreen() : const HomeScreen()),
        ),
      );
}
