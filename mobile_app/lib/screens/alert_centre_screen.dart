import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;

class AlertCentreScreen extends StatefulWidget {
  const AlertCentreScreen({super.key});

  @override
  State<AlertCentreScreen> createState() => _AlertCentreScreenState();
}

class _AlertCentreScreenState extends State<AlertCentreScreen> {
  late socket_io.Socket _socket;
  final List<AlertEvent> _alerts = [];

  @override
  void initState() {
    super.initState();
    _initializeSocket();
  }

  void _initializeSocket() {
    _socket = socket_io.io(
      'http://localhost:3001',
      socket_io.OptionBuilder().setTransports(['websocket']).setReconnectionDelay(1000).build(),
    );

    _socket.on('connect', (_) {
      debugPrint('Connected to event stream');
    });

    _socket.on('event', (data) {
      if (data is Map<String, dynamic>) {
        final event = data['event_type'] as String?;
        if (event == 'flow_failed' || event == 'anomaly') {
          setState(() {
            _alerts.insert(
              0,
              AlertEvent(
                id: data['id'] as String? ?? '',
                flowName: data['flow_name'] as String? ?? 'Unknown Flow',
                eventType: event ?? '',
                severity: _calculateSeverity(data['error'] as String?),
                message: data['error'] as String? ?? 'Unknown error',
                timestamp: DateTime.now(),
              ),
            );
          });
        }
      }
    });

    _socket.on('disconnect', (_) {
      debugPrint('Disconnected from event stream');
    });

    _socket.connect();
  }

  String _calculateSeverity(String? error) {
    if (error == null) return 'medium';
    if (error.contains('critical') || error.contains('fatal')) return 'critical';
    if (error.contains('error') || error.contains('failed')) return 'high';
    return 'medium';
  }

  Color _getSeverityColor(String severity) {
    switch (severity) {
      case 'critical':
        return Colors.red;
      case 'high':
        return Colors.orange;
      default:
        return Colors.yellow;
    }
  }

  @override
  void dispose() {
    _socket.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Alert Centre'),
        actions: [
          IconButton(
            icon: const Icon(Icons.clear_all),
            tooltip: 'Clear all alerts',
            onPressed: () => setState(() => _alerts.clear()),
          ),
        ],
      ),
      body: _alerts.isEmpty
          ? const Center(
              child: Text('No alerts'),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _alerts.length,
              itemBuilder: (context, index) {
                final alert = _alerts[index];
                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: _getSeverityColor(alert.severity).withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                alert.severity.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: _getSeverityColor(alert.severity),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.blue.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                alert.eventType,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.blue,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          alert.flowName,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          alert.message,
                          style: TextStyle(color: Colors.grey[600]),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Just now',
                          style: TextStyle(fontSize: 12, color: Colors.grey[400]),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}

class AlertEvent {
  final String id;
  final String flowName;
  final String eventType;
  final String severity;
  final String message;
  final DateTime timestamp;

  AlertEvent({
    required this.id,
    required this.flowName,
    required this.eventType,
    required this.severity,
    required this.message,
    required this.timestamp,
  });
}
