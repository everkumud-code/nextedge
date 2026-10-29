import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';
import 'screens/login.dart';
import 'screens/home.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppTheme.load();
  runApp(const CoachingApp());
}

class CoachingApp extends StatelessWidget {
  const CoachingApp({super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([AppTheme.themeId, AppTheme.fontId]),
        builder: (_, __) => MaterialApp(
          title: AppConfig.appName,
          theme: buildTheme(AppTheme.themeId.value, AppTheme.fontId.value),
          debugShowCheckedModeBanner: false,
          home: FutureBuilder<SharedPreferences>(
            future: SharedPreferences.getInstance(),
            builder: (_, s) => !s.hasData ? const SizedBox() : (s.data!.getString('token') == null ? const LoginScreen() : const HomeScreen()),
          ),
        ),
      );
}
