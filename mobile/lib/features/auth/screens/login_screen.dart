import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/auth/auth_provider.dart';

// ── Node data ─────────────────────────────────────────────────────────────────
class _Node {
  double x, y, vx, vy, r, pulse;
  _Node(this.x, this.y, this.vx, this.vy, this.r, this.pulse);
}

// ── Animated cyber background ─────────────────────────────────────────────────
class _CyberBg extends StatefulWidget {
  const _CyberBg();
  @override
  State<_CyberBg> createState() => _CyberBgState();
}

class _CyberBgState extends State<_CyberBg> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final _rng = Random();
  final _nodes = <_Node>[];
  final _drops = <double>[];
  int _frame = 0;
  bool _ready = false;
  Size _sz = Size.zero;
  bool _alt = false;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((_) {
      if (!_ready) return;
      _alt = !_alt;
      if (_alt) return; // ~30 fps
      _frame++;
      for (final n in _nodes) {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.04;
        if (n.x < 0 || n.x > _sz.width) n.vx = -n.vx;
        if (n.y < 0 || n.y > _sz.height) n.vy = -n.vy;
      }
      for (int i = 0; i < _drops.length; i++) {
        _drops[i] += 0.5;
        if (_drops[i] * 12 > _sz.height && _rng.nextDouble() > 0.978) _drops[i] = 0;
      }
      if (mounted) setState(() {});
    })..start();
  }

  void _init(Size s) {
    if (_ready && (_sz.width - s.width).abs() < 2) return;
    _sz = s;
    _ready = true;
    _nodes
      ..clear()
      ..addAll(List.generate(40, (_) => _Node(
        _rng.nextDouble() * s.width, _rng.nextDouble() * s.height,
        (_rng.nextDouble() - 0.5) * 0.5, (_rng.nextDouble() - 0.5) * 0.5,
        _rng.nextDouble() * 2 + 1, _rng.nextDouble() * 2 * pi,
      )));
    final cols = (s.width / 12).floor();
    _drops
      ..clear()
      ..addAll(List.generate(cols, (_) => _rng.nextDouble() * -80));
  }

  @override
  void dispose() { _ticker.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (_, c) {
      final s = Size(c.maxWidth, c.maxHeight);
      _init(s);
      return RepaintBoundary(
        child: CustomPaint(
          size: s,
          painter: _BgPainter(_frame, _nodes, _drops, _sz, _rng),
        ),
      );
    });
  }
}

const _kMat = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#\$&%';

class _BgPainter extends CustomPainter {
  final int frame;
  final List<_Node> nodes;
  final List<double> drops;
  final Size sz;
  final Random rng;
  _BgPainter(this.frame, this.nodes, this.drops, this.sz, this.rng);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), Paint()..color = Colors.black);

    // Matrix rain
    const fs = 12.0;
    final tp = TextPainter(textDirection: TextDirection.ltr);
    for (int i = 0; i < drops.length; i++) {
      final y = drops[i] * fs;
      if (y < -fs || y > h) continue;
      tp.text = TextSpan(
        text: _kMat[rng.nextInt(_kMat.length)],
        style: TextStyle(color: Color.fromRGBO(150, 255, 180, rng.nextDouble() * 0.4 + 0.1), fontSize: fs),
      );
      tp.layout();
      tp.paint(canvas, Offset(i * fs, y));
    }

    // Node connections
    for (int i = 0; i < nodes.length; i++) {
      for (int j = i + 1; j < nodes.length; j++) {
        final dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        final d2 = dx * dx + dy * dy;
        if (d2 < 160 * 160) {
          canvas.drawLine(
            Offset(nodes[i].x, nodes[i].y), Offset(nodes[j].x, nodes[j].y),
            Paint()
              ..color = Color.fromRGBO(34, 197, 94, (1 - sqrt(d2) / 160) * 0.28)
              ..strokeWidth = 0.5,
          );
        }
      }
    }

    // Nodes
    for (final n in nodes) {
      final g = sin(n.pulse) * 0.5 + 0.5;
      canvas.drawCircle(Offset(n.x, n.y), n.r + g * 1.5,
        Paint()..color = Color.fromRGBO(34, 197, 94, (0.35 + g * 0.4).clamp(0, 1)));
    }

    // Radar (top-right)
    final rx = w * 0.82, ry = h * 0.22, rr = min(w, h) * 0.13;
    final ra = (frame * 0.012) % (2 * pi);
    final rp = Paint()..color = const Color(0x1A22C55E)..style = PaintingStyle.stroke..strokeWidth = 1;
    for (final s in [0.33, 0.66, 1.0]) { canvas.drawCircle(Offset(rx, ry), rr * s, rp); }
    final cp = Paint()..color = const Color(0x1122C55E)..strokeWidth = 0.6;
    canvas.drawLine(Offset(rx - rr, ry), Offset(rx + rr, ry), cp);
    canvas.drawLine(Offset(rx, ry - rr), Offset(rx, ry + rr), cp);
    canvas.save();
    canvas.translate(rx, ry);
    canvas.rotate(ra);
    canvas.drawArc(Rect.fromCircle(center: Offset.zero, radius: rr), -0.5, 0.9, true,
      Paint()..color = const Color(0x3522C55E));
    canvas.restore();
    final bx = rx + cos(ra * 0.7 + 1.2) * rr * 0.55;
    final by = ry + sin(ra * 0.7 + 1.2) * rr * 0.55;
    canvas.drawCircle(Offset(bx, by), 2.5, Paint()..color = const Color(0xDD22C55E));

    // Scan line
    final sy = (frame * 2.0) % h;
    canvas.drawRect(
      Rect.fromLTWH(0, sy - 60, w, 62),
      Paint()..shader = LinearGradient(
        begin: Alignment.topCenter, end: Alignment.bottomCenter,
        colors: [const Color(0x0022C55E), const Color(0x0822C55E)],
      ).createShader(Rect.fromLTWH(0, sy - 60, w, 62)),
    );
  }

  @override
  bool shouldRepaint(covariant _BgPainter old) => true;
}

// ── Boot-sequence intro splash ────────────────────────────────────────────────
const _kBootLines = [
  'Initializing secure enclave…',
  'Loading biometric modules…',
  'Establishing encrypted channel…',
  'Verifying system integrity…',
  'Mounting classified database…',
  'Authentication gateway ready.',
];

class _IntroSplash extends StatefulWidget {
  final VoidCallback onDone;
  const _IntroSplash({required this.onDone});
  @override
  State<_IntroSplash> createState() => _IntroSplashState();
}

class _IntroSplashState extends State<_IntroSplash> with SingleTickerProviderStateMixin {
  late final AnimationController _bar;
  final _lines = <String>[];
  bool _titleIn = false;
  bool _exiting = false;
  final _timers = <Timer>[];

  @override
  void initState() {
    super.initState();
    _bar = AnimationController(vsync: this, duration: const Duration(milliseconds: 5000))
      ..addListener(() { if (mounted) setState(() {}); })
      ..addStatusListener((s) {
        if (s == AnimationStatus.completed) {
          if (mounted) setState(() => _exiting = true);
          Future.delayed(const Duration(milliseconds: 650), () {
            if (mounted) widget.onDone();
          });
        }
      })
      ..forward();

    _timers.add(Timer(const Duration(milliseconds: 200), () {
      if (mounted) setState(() => _titleIn = true);
    }));
    for (int i = 0; i < _kBootLines.length; i++) {
      _timers.add(Timer(Duration(milliseconds: 400 + i * 680), () {
        if (mounted) setState(() => _lines.add(_kBootLines[i]));
      }));
    }
  }

  @override
  void dispose() {
    _bar.dispose();
    for (final t in _timers) { t.cancel(); }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 650),
      opacity: _exiting ? 0.0 : 1.0,
      child: SizedBox.expand(
        child: Stack(children: [
          // Vignette
          Container(decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment.center, radius: 1.1,
              colors: [Color(0x00000000), Color(0xBF000000), Color(0xF5000000)],
              stops: [0.25, 0.65, 1.0],
            ),
          )),
          // Corner HUD brackets
          ..._corners(),
          // Top status bar
          Positioned(top: 28, left: 48, right: 48,
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              _sm('IMS SECURE TERMINAL'),
              Row(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 5, height: 5, decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle)),
                const SizedBox(width: 5),
                _sm('ENCRYPTED'),
              ]),
              _sm('SESSION: INIT'),
            ]),
          ),
          // Centre content
          Center(child: AnimatedOpacity(
            duration: const Duration(milliseconds: 700),
            opacity: _titleIn ? 1.0 : 0.0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 700),
              offset: _titleIn ? Offset.zero : const Offset(0, 0.06),
              child: _center(),
            ),
          )),
          // Bottom status bar
          Positioned(bottom: 28, left: 48, right: 48,
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              _sm('RWANDA NATIONAL SECURITY'),
              _sm('AES-256 · TLS 1.3'),
              _sm('© ${DateTime.now().year} OPCOM'),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _center() {
    final pct = (_bar.value * 100).round();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        _sm('◆  Republic of Rwanda — Classified  ◆', color: const Color(0xFF166534), size: 10, spacing: 4),
        const SizedBox(height: 18),
        const Text('IMS', textAlign: TextAlign.center, style: TextStyle(
          color: Colors.white, fontSize: 88, fontWeight: FontWeight.w900, letterSpacing: -2,
          shadows: [
            Shadow(color: Color(0x6622C55E), blurRadius: 60),
            Shadow(color: Color(0x2222C55E), blurRadius: 120),
          ],
        )),
        const SizedBox(height: 6),
        _sm('Rwanda Intelligence Management System', color: const Color(0xFFCBD5E1), size: 11, spacing: 3),
        const SizedBox(height: 10),
        Row(mainAxisSize: MainAxisSize.min, children: [
          Container(width: 40, height: 1, color: const Color(0xFF14532D)),
          const SizedBox(width: 10),
          _sm('Confidential · Law Enforcement Use Only', color: const Color(0xFF166534), size: 9),
          const SizedBox(width: 10),
          Container(width: 40, height: 1, color: const Color(0xFF14532D)),
        ]),
        const SizedBox(height: 28),
        // Boot log
        SizedBox(
          height: 76, width: double.infinity,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            ..._lines.map((l) => Padding(
              padding: const EdgeInsets.only(bottom: 2),
              child: Row(children: [
                _sm('›  ', color: const Color(0x9922C55E), size: 10),
                _sm(l, color: const Color(0xBB166534), size: 10),
              ]),
            )),
            if (_lines.length < _kBootLines.length)
              Container(width: 7, height: 11, color: const Color(0xFF22C55E)),
          ]),
        ),
        const SizedBox(height: 14),
        // Progress label
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          _sm('SYSTEM LOAD', color: const Color(0xFF475569)),
          _sm('$pct%', color: const Color(0xFF22C55E)),
        ]),
        const SizedBox(height: 5),
        // Progress bar
        Stack(children: [
          Container(height: 2, color: const Color(0xFF0F172A)),
          FractionallySizedBox(
            widthFactor: _bar.value,
            child: Container(height: 2, decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [Color(0xFF166534), Color(0xFF22C55E), Color(0xFFBBF7D0)]),
              boxShadow: [BoxShadow(color: Color(0x8822C55E), blurRadius: 10)],
            )),
          ),
        ]),
        const SizedBox(height: 8),
        // Segment dots
        Row(children: List.generate(12, (i) {
          final active = _bar.value >= i / 12;
          return Expanded(child: Container(
            height: 2, margin: const EdgeInsets.only(right: 3),
            decoration: BoxDecoration(
              color: active ? const Color(0xFF22C55E) : const Color(0xFF1A2E1A),
              boxShadow: active ? [const BoxShadow(color: Color(0x8822C55E), blurRadius: 4)] : null,
            ),
          ));
        })),
      ]),
    );
  }

  List<Widget> _corners() {
    const side = BorderSide(color: Color(0x9922C55E), width: 2);
    const sz = 24.0;
    return [
      Positioned(top: 18, left: 18, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(top: side, left: side))))),
      Positioned(top: 18, right: 18, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(top: side, right: side))))),
      Positioned(bottom: 18, left: 18, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(bottom: side, left: side))))),
      Positioned(bottom: 18, right: 18, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(bottom: side, right: side))))),
    ];
  }
}

// Shared mono-style label helper
Widget _sm(String t, {Color color = const Color(0xFF166534), double size = 9, double spacing = 2}) =>
    Text(t, style: TextStyle(color: color, fontSize: size, fontFamily: 'monospace', fontWeight: FontWeight.bold, letterSpacing: spacing));

// ── Main login screen ──────────────────────────────────────────────────────────
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _badgeCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _obscure = true;
  bool _loading = false;
  String? _error;
  bool _showForm = false;
  bool _formIn = false;

  @override
  void dispose() {
    _badgeCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  void _onSplashDone() {
    if (!mounted) return;
    setState(() => _showForm = true);
    Future.delayed(const Duration(milliseconds: 80), () {
      if (mounted) setState(() => _formIn = true);
    });
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(authStateProvider.notifier).login(
        badgeNumber: _badgeCtrl.text.trim(),
        password: _passwordCtrl.text,
        deviceId: 'device_${_badgeCtrl.text.trim()}',
      );
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          final m = e.toString();
          if (m.contains('connection') || m.contains('SocketException') || m.contains('Connection refused')) {
            _error = 'Cannot reach server. Check your network connection.';
          } else if (m.contains('timeout') || m.contains('Timeout')) {
            _error = 'Server took too long to respond. Please try again.';
          } else if (m.contains('Invalid credentials') || m.contains('401') || m.contains('Unauthorized')) {
            _error = 'Invalid badge number or password.';
          } else {
            _error = m.replaceFirst('Exception: ', '').replaceFirst('DioException [bad response]: ', '');
          }
        });
      }
    } finally {
      if (mounted && _loading) { setState(() => _loading = false); }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        // Layer 1: Cyber animated background
        const _CyberBg(),
        // Layer 2: Dark overlay
        Container(color: const Color(0x88000000)),
        // Layer 3: Splash or login form
        if (!_showForm)
          _IntroSplash(onDone: _onSplashDone)
        else
          AnimatedOpacity(
            duration: const Duration(milliseconds: 700),
            opacity: _formIn ? 1.0 : 0.0,
            child: AnimatedSlide(
              duration: const Duration(milliseconds: 700),
              offset: _formIn ? Offset.zero : const Offset(0, 0.05),
              child: _form(),
            ),
          ),
      ]),
    );
  }

  Widget _form() {
    return SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Stack(children: [
              Container(
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.82),
                  border: Border.all(color: const Color(0xFF22C55E).withValues(alpha: 0.2)),
                  boxShadow: [BoxShadow(color: const Color(0xFF22C55E).withValues(alpha: 0.05), blurRadius: 60)],
                ),
                padding: const EdgeInsets.all(28),
                child: Form(key: _formKey, child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _sm('◆  Secure Access Terminal  ◆', size: 9, spacing: 3),
                    const SizedBox(height: 10),
                    const Text('IMS', textAlign: TextAlign.center, style: TextStyle(
                      color: Colors.white, fontSize: 40, fontWeight: FontWeight.w900, letterSpacing: -1,
                      shadows: [Shadow(color: Color(0x5522C55E), blurRadius: 24)],
                    )),
                    const SizedBox(height: 2),
                    _sm('Rwanda Intelligence Management System',
                      color: const Color(0xFF475569), size: 9, spacing: 2),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFF7F1D1D).withValues(alpha: 0.2),
                        border: Border.all(color: const Color(0xFF7F1D1D).withValues(alpha: 0.5)),
                      ),
                      child: Row(children: [
                        Container(width: 5, height: 5,
                          decoration: const BoxDecoration(color: Color(0xFFEF4444), shape: BoxShape.circle)),
                        const SizedBox(width: 7),
                        Expanded(child: Text(
                          'RESTRICTED · AUTHORIZED PERSONNEL ONLY',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xFFEF4444), fontSize: 8,
                            fontWeight: FontWeight.bold, letterSpacing: 1,
                            fontFamily: 'monospace',
                          ),
                        )),
                      ]),
                    ),
                    const SizedBox(height: 22),

                    _sm('▸ Badge Number', spacing: 3),
                    const SizedBox(height: 5),
                    _CyberField(
                      controller: _badgeCtrl,
                      hint: 'e.g. NISS-DIR-001',
                      validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null,
                    ),
                    const SizedBox(height: 3),
                    _sm('FORMAT: INST-ROLE-NNN', color: const Color(0xFF334155), size: 9, spacing: 2),
                    const SizedBox(height: 14),

                    _sm('▸ Password', spacing: 3),
                    const SizedBox(height: 5),
                    _CyberField(
                      controller: _passwordCtrl,
                      hint: 'Enter secure password',
                      obscure: _obscure,
                      suffix: IconButton(
                        icon: Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                          size: 18, color: const Color(0xFF475569)),
                        onPressed: () => setState(() => _obscure = !_obscure),
                      ),
                      validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null,
                    ),
                    const SizedBox(height: 14),

                    if (_error != null) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF7F1D1D).withValues(alpha: 0.2),
                          border: Border.all(color: const Color(0xFF7F1D1D).withValues(alpha: 0.5)),
                        ),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('⚠  ', style: TextStyle(color: Color(0xFFEF4444))),
                          Expanded(child: Text(_error!, style: const TextStyle(
                            color: Color(0xFFF87171), fontSize: 11, fontFamily: 'monospace'))),
                        ]),
                      ),
                      const SizedBox(height: 12),
                    ],

                    SizedBox(height: 48, child: ElevatedButton(
                      onPressed: _loading ? null : _login,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _loading ? const Color(0xFF052E16) : const Color(0xFF16A34A),
                        foregroundColor: _loading ? const Color(0xFF166534) : Colors.black,
                        shape: const RoundedRectangleBorder(),
                        elevation: 0,
                        side: BorderSide(
                          color: _loading ? const Color(0xFF14532D) : const Color(0xFF22C55E)),
                      ),
                      child: _loading
                        ? const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            SizedBox(width: 15, height: 15,
                              child: CircularProgressIndicator(color: Color(0xFF22C55E), strokeWidth: 2)),
                            SizedBox(width: 10),
                            Text('AUTHENTICATING…', style: TextStyle(
                              fontSize: 11, letterSpacing: 3, fontFamily: 'monospace', fontWeight: FontWeight.bold)),
                          ])
                        : const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Icon(Icons.fingerprint, size: 18),
                            SizedBox(width: 8),
                            Text('AUTHENTICATE', style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 3)),
                          ]),
                    )),
                    const SizedBox(height: 18),

                    Row(children: [
                      Container(width: 5, height: 5,
                        decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle)),
                      const SizedBox(width: 6),
                      _sm('SYSTEM ONLINE', color: const Color(0xFF334155)),
                      const Spacer(),
                      _sm('AES-256 · TLS 1.3', color: const Color(0xFF1E293B), size: 8),
                    ]),
                  ],
                )),
              ),
              // Corner accents
              ..._formCorners(),
            ]),
          ),
        ),
      ),
    );
  }

  List<Widget> _formCorners() {
    const side = BorderSide(color: Color(0xFF22C55E));
    const sz = 14.0;
    return [
      Positioned(top: 0, left: 0, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(top: side, left: side))))),
      Positioned(top: 0, right: 0, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(top: side, right: side))))),
      Positioned(bottom: 0, left: 0, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(bottom: side, left: side))))),
      Positioned(bottom: 0, right: 0, child: SizedBox(width: sz, height: sz,
        child: const DecoratedBox(decoration: BoxDecoration(border: Border(bottom: side, right: side))))),
    ];
  }
}

class _CyberField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final bool obscure;
  final Widget? suffix;
  final String? Function(String?)? validator;
  const _CyberField({required this.controller, required this.hint,
    this.obscure = false, this.suffix, this.validator});

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      style: const TextStyle(color: Colors.white, fontFamily: 'monospace', letterSpacing: 1.5, fontSize: 13),
      cursorColor: const Color(0xFF22C55E),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFF334155), fontFamily: 'monospace', fontSize: 12),
        suffixIcon: suffix,
        filled: true,
        fillColor: const Color(0xB3000000),
        border: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Color(0xFF1E293B))),
        enabledBorder: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Color(0xFF1E293B))),
        focusedBorder: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Color(0xFF166534))),
        errorBorder: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Color(0xFF7F1D1D))),
        focusedErrorBorder: const OutlineInputBorder(borderRadius: BorderRadius.zero, borderSide: BorderSide(color: Color(0xFF7F1D1D))),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      ),
      validator: validator,
    );
  }
}
