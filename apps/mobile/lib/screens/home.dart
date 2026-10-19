import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'login.dart';
import 'student_home.dart';
import 'parent_home.dart';
import 'faculty_home.dart';

/// Routes to the right home by role after login.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) => FutureBuilder<SharedPreferences>(
        future: SharedPreferences.getInstance(),
        builder: (_, s) {
          if (!s.hasData) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          final role = s.data!.getString('role') ?? '';
          switch (role) {
            case 'STUDENT': return const StudentHome();
            case 'PARENT': return const ParentHome();
            case 'FACULTY': case 'ADMIN': case 'SUPER_ADMIN': return const FacultyHome();
            default: return const LoginScreen();
          }
        },
      );
}

Future<void> logout(BuildContext context) async {
  (await SharedPreferences.getInstance()).clear();
  if (context.mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
}
