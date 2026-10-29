import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'config.dart';

/// One look: colours plus the shape of the buttons. Classic is the original NextEdge blue and the default.
class ThemeChoice {
  final String id, name, note;
  final Color primary, bar, scaffold, surface, accent;
  final double radius; // button corner radius
  final bool pill, dark;
  final double elevation;
  final int glow; // ARGB of the button shadow
  const ThemeChoice(this.id, this.name, this.note, {this.primary = const Color(AppConfig.primaryColour), this.bar = const Color(0xFF11343C), this.scaffold = const Color(0xFFF3F5F8), this.surface = Colors.white, this.accent = const Color(0xFFFDF1DC), this.radius = 6, this.pill = false, this.dark = false, this.elevation = 0, this.glow = 0x00000000});
}

const kThemes = <ThemeChoice>[
  ThemeChoice('classic', 'Classic', 'The usual NextEdge blue'),
  ThemeChoice('crimson', 'Crimson', 'Soft cards, round buttons', primary: Color(0xFFD81B5C), bar: Color(0xFF8B0B3A), scaffold: Color(0xFFFCF4F7), accent: Color(0xFFFBE3EC), pill: true, elevation: 4, glow: 0x73D81B5C),
  ThemeChoice('forest', 'Forest', 'Calm green, tile buttons', primary: Color(0xFF4C7C4A), bar: Color(0xFF264A2A), scaffold: Color(0xFFF1F5EF), accent: Color(0xFFF7F3D6), radius: 14),
  ThemeChoice('midnight', 'Midnight', 'Dark, glowing blue', primary: Color(0xFF2C70EC), bar: Color(0xFF0A0D12), scaffold: Color(0xFF0F1218), surface: Color(0xFF181C24), accent: Color(0xFF1A284A), radius: 12, dark: true, elevation: 6, glow: 0xA02C70EC),
];

/// Five fonts. Poppins, Noto Sans and Mukta also draw Hindi well.
const kFonts = <String, String>{
  'Poppins': 'Round and friendly',
  'Montserrat': 'Wide and modern',
  'Outfit': 'Clean, geometric',
  'Noto Sans': 'Neutral, very readable',
  'Mukta': 'Made for Hindi and English',
};

class AppTheme {
  static final ValueNotifier<String> themeId = ValueNotifier<String>('classic');
  static final ValueNotifier<String?> fontId = ValueNotifier<String?>(null);

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      final t = p.getString('ne.theme');
      if (t != null && kThemes.any((x) => x.id == t)) themeId.value = t;
      final f = p.getString('ne.font');
      if (f != null && kFonts.containsKey(f)) fontId.value = f;
    } catch (_) {}
  }

  /// Writes the current choice. Called again after logout, which clears everything else.
  static Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    if (themeId.value == 'classic') {
      await p.remove('ne.theme');
    } else {
      await p.setString('ne.theme', themeId.value);
    }
    final f = fontId.value;
    if (f == null) {
      await p.remove('ne.font');
    } else {
      await p.setString('ne.font', f);
    }
  }

  static Future<void> setTheme(String id) async {
    themeId.value = id;
    await save();
  }

  static Future<void> setFont(String? id) async {
    fontId.value = id;
    await save();
  }
}

ThemeData buildTheme(String themeId, String? fontId) {
  final c = kThemes.firstWhere((t) => t.id == themeId, orElse: () => kThemes.first);
  ThemeData base;
  if (c.id == 'classic') {
    base = ThemeData(colorSchemeSeed: const Color(AppConfig.primaryColour), useMaterial3: true);
  } else {
    final scheme = ColorScheme.fromSeed(seedColor: c.primary, brightness: c.dark ? Brightness.dark : Brightness.light).copyWith(
      primary: c.primary,
      onPrimary: Colors.white,
      surface: c.surface,
      secondaryContainer: c.accent,
      onSecondaryContainer: c.dark ? Colors.white : c.bar,
    );
    final OutlinedBorder shape = c.pill ? const StadiumBorder() : RoundedRectangleBorder(borderRadius: BorderRadius.circular(c.radius));
    const pad = EdgeInsets.symmetric(horizontal: 20, vertical: 12);
    base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: c.scaffold,
      appBarTheme: AppBarTheme(backgroundColor: c.bar, foregroundColor: Colors.white, elevation: 0),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(shape: shape, padding: pad, elevation: c.elevation, shadowColor: Color(c.glow))),
      elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(shape: shape, padding: pad, elevation: c.elevation, shadowColor: Color(c.glow))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(shape: shape, padding: pad, side: BorderSide(color: c.primary, width: 1.2))),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: shape)),
      floatingActionButtonTheme: FloatingActionButtonThemeData(shape: c.pill ? const StadiumBorder() : RoundedRectangleBorder(borderRadius: BorderRadius.circular(c.radius + 4))),
    );
  }
  if (fontId == null || !kFonts.containsKey(fontId)) return base;
  return base.copyWith(textTheme: GoogleFonts.getTextTheme(fontId, base.textTheme), primaryTextTheme: GoogleFonts.getTextTheme(fontId, base.primaryTextTheme));
}

/// The palette button for every app bar.
class ThemeAction extends StatelessWidget {
  const ThemeAction({super.key});
  @override
  Widget build(BuildContext context) => IconButton(icon: const Icon(Icons.palette_outlined), tooltip: 'Colours and font', onPressed: () => showThemeSheet(context));
}

void showThemeSheet(BuildContext context) {
  showModalBottomSheet<void>(context: context, isScrollControlled: true, showDragHandle: true, builder: (_) => const _ThemeSheet());
}

class _ThemeSheet extends StatelessWidget {
  const _ThemeSheet();

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: Listenable.merge([AppTheme.themeId, AppTheme.fontId]),
        builder: (ctx, _) {
          final tid = AppTheme.themeId.value;
          final fid = AppTheme.fontId.value;
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Colours and buttons', style: Theme.of(ctx).textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(spacing: 10, runSpacing: 10, children: kThemes.map((t) => _ThemeTile(t, tid == t.id)).toList()),
                const SizedBox(height: 16),
                Text('Font', style: Theme.of(ctx).textTheme.titleMedium),
                ...kFonts.entries.map((f) => ListTile(
                      contentPadding: EdgeInsets.zero,
                      selected: fid == f.key,
                      title: Text('${f.key}  अआइ', style: GoogleFonts.getFont(f.key, fontSize: 17)),
                      subtitle: Text(f.value),
                      trailing: fid == f.key ? const Icon(Icons.check_circle) : null,
                      onTap: () => AppTheme.setFont(f.key),
                    )),
                TextButton(
                  onPressed: () {
                    AppTheme.setTheme('classic');
                    AppTheme.setFont(null);
                  },
                  child: const Text('Back to the original look'),
                ),
              ]),
            ),
          );
        },
      );
}

class _ThemeTile extends StatelessWidget {
  final ThemeChoice t;
  final bool selected;
  const _ThemeTile(this.t, this.selected);

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: '${t.name}: ${t.note}',
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => AppTheme.setTheme(t.id),
          child: Container(
            width: 150,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: selected ? t.primary : Colors.grey.shade400, width: selected ? 2.5 : 1),
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(height: 22, decoration: BoxDecoration(color: t.bar, borderRadius: BorderRadius.circular(6))),
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(color: t.primary, borderRadius: BorderRadius.circular(t.pill ? 99 : t.radius)),
                child: const Text('Button', style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 6),
              Text(t.name, style: const TextStyle(fontWeight: FontWeight.bold)),
              Text(t.note, style: const TextStyle(fontSize: 11)),
            ]),
          ),
        ),
      );
}
