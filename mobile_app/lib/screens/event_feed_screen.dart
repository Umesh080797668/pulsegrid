import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/realtime_service.dart';

final realtimeServiceProvider = Provider((ref) {
  return RealtimeService();
});

class EventFeedScreen extends ConsumerStatefulWidget {
  final String flowId;

  const EventFeedScreen({super.key, required this.flowId});

  @override
  ConsumerState<EventFeedScreen> createState() => _EventFeedScreenState();
}

class _EventFeedScreenState extends ConsumerState<EventFeedScreen> {
  late RealtimeService _realtimeService;
  final List<Map<String, dynamic>> _events = [];

  @override
  void initState() {
    super.initState();
    _realtimeService = ref.read(realtimeServiceProvider);
    _realtimeService.connect();
    _realtimeService.subscribeToFlow(widget.flowId);

    _realtimeService.eventStream.listen((event) {
      setState(() {
        _events.insert(0, event);
        if (_events.length > 100) {
          _events.removeLast();
        }
      });
    });
  }

  @override
  void dispose() {
    _realtimeService.unsubscribeFromFlow(widget.flowId);
    _realtimeService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Event Feed'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete),
            onPressed: () {
              setState(() {
                _events.clear();
              });
            },
          ),
        ],
      ),
      body: _events.isEmpty
          ? const Center(child: Text('No events yet'))
          : ListView.builder(
              itemCount: _events.length,
              itemBuilder: (context, index) {
                final event = _events[index];
                return ListTile(
                  title: Text(event['type'] ?? 'Event'),
                  subtitle: Text(event['timestamp'] ?? ''),
                  trailing: Chip(
                    label: Text(event['status'] ?? 'pending'),
                    backgroundColor: _getStatusColor(event['status']),
                  ),
                  onTap: () {
                    showDialog(
                      context: context,
                      builder: (context) {
                        return AlertDialog(
                          title: const Text('Event Details'),
                          content: SingleChildScrollView(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text('Type: ${event['type']}'),
                                Text('Status: ${event['status']}'),
                                Text('Timestamp: ${event['timestamp']}'),
                                if (event['data'] != null)
                                  Text('Data: ${event['data']}'),
                              ],
                            ),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(context),
                              child: const Text('Close'),
                            ),
                          ],
                        );
                      },
                    );
                  },
                );
              },
            ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'success':
        return Colors.green;
      case 'failed':
        return Colors.red;
      case 'pending':
        return Colors.orange;
      default:
        return Colors.grey;
    }
  }
}
