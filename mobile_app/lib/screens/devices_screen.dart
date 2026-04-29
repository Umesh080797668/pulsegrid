import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';

class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key});

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  final List<ScanResult> _results = [];
  StreamSubscription<List<ScanResult>>? _scanResultsSubscription;
  bool _isScanning = false;
  String? _pairedDeviceId;

  @override
  void initState() {
    super.initState();
    _scanResultsSubscription = FlutterBluePlus.scanResults.listen((results) {
      setState(() {
        _results
          ..clear()
          ..addAll(results);
        _results.sort((a, b) => b.rssi.compareTo(a.rssi));
      });
    });
    _startScan();
  }

  Future<void> _startScan() async {
    try {
      setState(() {
        _isScanning = true;
      });
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 6));
    } catch (e) {
      _showSnackBar('BLE scan failed: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isScanning = false;
        });
      }
    }
  }

  Future<void> _stopScan() async {
    try {
      await FlutterBluePlus.stopScan();
    } finally {
      if (mounted) {
        setState(() {
          _isScanning = false;
        });
      }
    }
  }

  Future<void> _pairWithDevice(ScanResult result) async {
    try {
      await result.device.connect(timeout: const Duration(seconds: 12));
      setState(() {
        _pairedDeviceId = result.device.remoteId.str;
      });
      _showSnackBar('Paired with ${_deviceLabel(result)}');
    } catch (e) {
      _showSnackBar('Could not pair: $e');
    }
  }

  String _deviceLabel(ScanResult result) {
    final name = result.advertisementData.advName.trim();
    return name.isNotEmpty ? name : result.device.remoteId.str;
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    _scanResultsSubscription?.cancel();
    FlutterBluePlus.stopScan();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Devices'),
        actions: [
          IconButton(
            onPressed: _isScanning ? _stopScan : _startScan,
            icon: Icon(_isScanning ? Icons.stop_circle : Icons.refresh),
            tooltip: _isScanning ? 'Stop scan' : 'Scan again',
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: const Icon(Icons.bluetooth_searching),
              title: const Text('Nearby BLE devices'),
              subtitle: Text(
                _isScanning
                    ? 'Scanning for peripherals right now.'
                    : 'Tap refresh to scan for nearby devices.',
              ),
              trailing: FilledButton(
                onPressed: _isScanning ? _stopScan : _startScan,
                child: Text(_isScanning ? 'Stop' : 'Scan'),
              ),
            ),
          ),
          const SizedBox(height: 16),
          if (_results.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 48),
              child: Center(
                child: Text('No BLE devices discovered yet.'),
              ),
            )
          else
            ..._results.map(
              (result) => Card(
                child: ListTile(
                  leading: const Icon(Icons.devices_other),
                  title: Text(_deviceLabel(result)),
                  subtitle: Text(
                    'RSSI: ${result.rssi} • ID: ${result.device.remoteId.str}',
                  ),
                  trailing: TextButton(
                    onPressed: _pairedDeviceId == result.device.remoteId.str
                        ? null
                        : () => _pairWithDevice(result),
                    child: Text(
                      _pairedDeviceId == result.device.remoteId.str
                          ? 'Paired'
                          : 'Pair',
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
