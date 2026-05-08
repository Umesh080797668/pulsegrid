import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import 'dart:async';
import '../config/app_config.dart';

class RealtimeService {
  late socket_io.Socket _socket;
  late String socketUrl;
  final StreamController<Map<String, dynamic>> _eventStreamController =
      StreamController.broadcast();

  RealtimeService({String? socketUrl}) {
    this.socketUrl = socketUrl ?? AppConfig.socketUrl;
  }

  Stream<Map<String, dynamic>> get eventStream => _eventStreamController.stream;

  void connect() {
    _socket = socket_io.io(
      socketUrl,
      socket_io.OptionBuilder().disableAutoConnect().build(),
    );

    _socket.on('connect', (_) {
      // Connection established
    });

    _socket.on('flowEvent', (data) {
      _eventStreamController.add(data as Map<String, dynamic>);
    });

    _socket.on('disconnect', (_) {
      // Connection closed
    });

    _socket.connect();
  }

  void subscribeToFlow(String flowId) {
    _socket.emit('subscribe', {'flowId': flowId});
  }

  void unsubscribeFromFlow(String flowId) {
    _socket.emit('unsubscribe', {'flowId': flowId});
  }

  void disconnect() {
    _socket.disconnect();
    _eventStreamController.close();
  }
}
