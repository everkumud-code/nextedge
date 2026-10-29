import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'login.dart';
import 'student_home.dart';
import 'parent_home.dart';
import 'faculty_home.dart';
import 'staff_home.dart';

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
            case 'STAFF': return const StaffHome();
            case '': return const LoginScreen();
            default: return UnsupportedRoleScreen(role: role);
          }
        },
      );
}

Future<void> logout(BuildContext context) async {
  (await SharedPreferences.getInstance()).clear();
  if (context.mounted) Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
}

/// A role the phone app has no screens for (for example an expert / counsellor): say so clearly instead of bouncing back to the login screen.
class UnsupportedRoleScreen extends StatelessWidget {
  final String role;
  const UnsupportedRoleScreen({super.key, required this.role});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('NextEdge'), actions: [IconButton(icon: const Icon(Icons.logout), onPressed: () => logout(context))]),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.desktop_windows, size: 48),
              const SizedBox(height: 12),
              const Text('This account is for the website', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('Your login ($role) works on the NextEdge admin panel in a browser. The phone app is for students, parents, teachers and staff.', textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => logout(context), child: const Text('Log out')),
            ]),
          ),
        ),
      );
}
