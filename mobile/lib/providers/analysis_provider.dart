import 'package:flutter/material.dart';
import '../models/analysis_order.dart';
import '../services/analysis_service.dart';

class AnalysisProvider extends ChangeNotifier {
  List<AnalysisOrder> _orders = [];
  bool _isLoading = false;

  List<AnalysisOrder> get orders => _orders;
  bool get isLoading => _isLoading;

  Future<void> loadOrders() async {
    _isLoading = true;
    notifyListeners();
    try {
      _orders = await AnalysisService.getList();
    } catch (_) {
      _orders = [];
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
