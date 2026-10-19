import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';

class Api {
  static Future<String?> token() async => (await SharedPreferences.getInstance()).getString('token');

  static Future<Map<String, dynamic>> post(String path, Map body, {bool auth = true}) async {
    final t = auth ? await token() : null;
    final r = await http.post(Uri.parse('${AppConfig.apiBase}$path'),
        headers: {'Content-Type': 'application/json', if (t != null) 'Authorization': 'Bearer $t'}, body: jsonEncode(body));
    final data = jsonDecode(r.body);
    if (r.statusCode >= 400) throw Exception(data['message'] ?? 'Request failed');
    return data;
  }

  static Future<dynamic> get(String path) async {
    final t = await token();
    final r = await http.get(Uri.parse('${AppConfig.apiBase}$path'), headers: {if (t != null) 'Authorization': 'Bearer $t'});
    final data = jsonDecode(r.body);
    if (r.statusCode >= 400) throw Exception(data['message'] ?? 'Request failed');
    return data;
  }
}
