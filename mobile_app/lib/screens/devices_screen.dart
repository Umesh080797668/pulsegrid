import 'dart:async';
import 'dart:io';

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
  String? _monitoringDeviceId;
  final Map<String, List<int>> _characteristicValues = {};
  final Map<String, String> _deviceBondStates = {}; // device_id -> bond_state
  final Map<String, StreamSubscription> _connectionSubscriptions = {};

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
    _checkExistingBonds();
    _startScan();
  }

  Future<void> _checkExistingBonds() async {
    try {
      // Get all bonded devices from the system
      final bondedDevices = await FlutterBluePlus.bondedDevices;
      if (mounted) {
        setState(() {
          for (final device in bondedDevices) {
            _deviceBondStates[device.remoteId.str] = 'bonded';
          }
        });
      }
    } catch (e) {
      debugPrint('Failed to check existing bonds: $e');
    }
  }

  Future<void> _startScan() async {
    try {
      final supported = await FlutterBluePlus.isSupported;
      if (!supported) {
        _showSnackBar('Bluetooth LE is not supported on this device.');
        return;
      }

      setState(() {
        _isScanning = true;
      });
      await FlutterBluePlus.startScan(
        timeout: const Duration(seconds: 6),
        androidUsesFineLocation: Platform.isAndroid,
      );
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
      _showSnackBar('Connecting to ${_deviceLabel(result)}...');
      
      // Connect to device with timeout
      await result.device.connect(timeout: const Duration(seconds: 12));
      
      // On Android, also create a bond
      if (Platform.isAndroid) {
        try {
          await result.device.createBond();
        } catch (e) {
          debugPrint('Failed to create bond: $e');
          // Continue even if bonding fails - connection can proceed
        }
      }
      
      // Update pairing state
      if (mounted) {
        setState(() {
          _pairedDeviceId = result.device.remoteId.str;
          _deviceBondStates[result.device.remoteId.str] = 'bonded';
        });
      }
      
      _showSnackBar('Paired with ${_deviceLabel(result)}');
      
      // Start monitoring characteristics after successful pair
      _startMonitoringCharacteristics(result.device);
    } catch (e) {
      _showSnackBar('Could not pair: $e');
      if (mounted) {
        setState(() {
          _deviceBondStates[result.device.remoteId.str] = 'failed';
        });
      }
    }
  }

  Future<void> _startMonitoringCharacteristics(BluetoothDevice device) async {
    try {
      // Cancel any existing subscription for this device
      _connectionSubscriptions[device.remoteId.str]?.cancel();
      
      // Subscribe to connection state changes
      _connectionSubscriptions[device.remoteId.str] =
          device.connectionState.listen((state) {
        if (mounted) {
          setState(() {
            // connectionState returns int: 0=disconnected, 1=connecting, 2=connected, 3=disconnecting
            if (state.index == 2) { // BlueConnectionState.connected
              _monitoringDeviceId = device.remoteId.str;
            } else {
              if (_monitoringDeviceId == device.remoteId.str) {
                _monitoringDeviceId = null;
              }
            }
          });
        }
      });

      // Discover services and characteristics
      final services = await device.discoverServices();
      
      for (final service in services) {
        for (final characteristic in service.characteristics) {
          // Read current value
          if (characteristic.properties.read) {
            try {
              final value = await characteristic.read();
              if (mounted) {
                setState(() {
                  _characteristicValues['${device.remoteId.str}:${characteristic.uuid}'] = value;
                });
              }
            } catch (e) {
              debugPrint('Failed to read characteristic: $e');
            }
          }

          // Subscribe to notifications if supported
          if (characteristic.properties.notify) {
            try {
              await characteristic.setNotifyValue(true);
              
              // Listen to value changes
              characteristic.lastValueStream.listen((value) {
                if (mounted) {
                  setState(() {
                    _characteristicValues['${device.remoteId.str}:${characteristic.uuid}'] = value;
                  });
                }
                // Log characteristic change
                debugPrint(
                  'Characteristic changed: ${characteristic.uuid} = ${String.fromCharCodes(value)}',
                );
              });
            } catch (e) {
              debugPrint('Failed to enable notifications: $e');
            }
          }
        }
      }

      if (mounted) {
        _showSnackBar('Monitoring ${device.remoteId.str}');
      }
    } catch (e) {
      _showSnackBar('Failed to monitor characteristics: $e');
    }
  }

  String _deviceLabel(ScanResult result) {
    final name = result.advertisementData.advName.trim();
    return name.isNotEmpty ? name : result.device.remoteId.str;
  }

  Future<void> _unpairDevice(BluetoothDevice device) async {
    try {
      // Cancel monitoring subscription
      _connectionSubscriptions[device.remoteId.str]?.cancel();
      _connectionSubscriptions.remove(device.remoteId.str);
      
      await device.disconnect();
      if (Platform.isAndroid) {
        try {
          await device.removeBond();
        } catch (e) {
          debugPrint('Failed to remove bond: $e');
        }
      }
      
      if (mounted) {
        setState(() {
          if (_pairedDeviceId == device.remoteId.str) {
            _pairedDeviceId = null;
          }
          if (_monitoringDeviceId == device.remoteId.str) {
            _monitoringDeviceId = null;
          }
          _deviceBondStates.remove(device.remoteId.str);
          _characteristicValues.removeWhere(
            (key, _) => key.startsWith(device.remoteId.str),
          );
        });
      }
      
      _showSnackBar('Unpaired from ${device.remoteId.str}');
    } catch (e) {
      _showSnackBar('Failed to unpair: $e');
    }
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    _scanResultsSubscription?.cancel();
    for (final subscription in _connectionSubscriptions.values) {
      subscription.cancel();
    }
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
          // Status Card
          Card(
            color: Colors.blue.shade50,
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
          
          // Active Connections Section
          if (_pairedDeviceId != null) ...[
            const Text(
              'Active Connections',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            ..._results
                .where((r) => r.device.remoteId.str == _pairedDeviceId)
                .map((result) {
              final isMonitoring = _monitoringDeviceId == result.device.remoteId.str;
              final charCount = _characteristicValues.keys
                  .where((k) => k.startsWith(result.device.remoteId.str))
                  .length;
              
              return Card(
                color: Colors.green.shade50,
                child: ListTile(
                  leading: Icon(
                    isMonitoring ? Icons.bluetooth_connected : Icons.bluetooth,
                    color: isMonitoring ? Colors.green : Colors.orange,
                  ),
                  title: Text(_deviceLabel(result)),
                  subtitle: Text(
                    'Status: ${isMonitoring ? 'Monitoring' : 'Connected'} • '
                    'Characteristics: $charCount • '
                    'RSSI: ${result.rssi}',
                  ),
                  trailing: PopupMenuButton<String>(
                    onSelected: (value) {
                      if (value == 'unpair') {
                        _unpairDevice(result.device);
                      }
                    },
                    itemBuilder: (BuildContext context) => [
                      const PopupMenuItem<String>(
                        value: 'unpair',
                        child: Text('Unpair'),
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 16),
          ],
          
          // Scanned Devices Section
          if (_results.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 48),
              child: Center(
                child: Text('No BLE devices discovered yet.'),
              ),
            )
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Available Devices',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                ..._results.map(
                  (result) {
                    final isPaired = _pairedDeviceId == result.device.remoteId.str;
                    final bondState = _deviceBondStates[result.device.remoteId.str];
                    
                    return Card(
                      child: ListTile(
                        leading: const Icon(Icons.devices_other),
                        title: Text(_deviceLabel(result)),
                        subtitle: Text(
                          'RSSI: ${result.rssi} • ID: ${result.device.remoteId.str}\n'
                          'Bond: ${bondState ?? 'None'}',
                        ),
                        isThreeLine: true,
                        trailing: TextButton(
                          onPressed: isPaired
                              ? null
                              : () => _pairWithDevice(result),
                          child: Text(
                            isPaired
                                ? 'Paired'
                                : 'Pair',
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
        ],
      ),
    );
  }
}
