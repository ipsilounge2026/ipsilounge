import 'dart:async';
import 'package:flutter/material.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../services/payment_service.dart';

/// Google Play 인앱결제 화면
/// 현재 무료 서비스 기간에는 안내 메시지 표시.
/// 유료 전환 시 상수 IS_FREE_SERVICE를 false로 변경.
const bool IS_FREE_SERVICE = true;

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  List<ProductDetails> _products = [];
  bool _isAvailable = false;
  bool _isLoading = true;
  bool _isPurchasing = false;
  String? _message;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSubscription;

  @override
  void initState() {
    super.initState();
    if (!IS_FREE_SERVICE) {
      _initIAP();
    } else {
      setState(() => _isLoading = false);
    }
  }

  @override
  void dispose() {
    _purchaseSubscription?.cancel();
    super.dispose();
  }

  Future<void> _initIAP() async {
    _isAvailable = await PaymentService.isAvailable();
    if (!_isAvailable) {
      setState(() => _isLoading = false);
      return;
    }

    // 구매 스트림 리스닝
    _purchaseSubscription = InAppPurchase.instance.purchaseStream.listen(
      _onPurchaseUpdate,
      onError: (error) {
        setState(() => _message = '결제 오류: $error');
      },
    );

    // 완료되지 않은 구매 처리
    await InAppPurchase.instance.restorePurchases();

    final products = await PaymentService.getProducts();
    setState(() {
      _products = products;
      _isLoading = false;
    });
  }

  Future<void> _onPurchaseUpdate(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      switch (purchase.status) {
        case PurchaseStatus.pending:
          setState(() => _isPurchasing = true);
          break;
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          try {
            await PaymentService.verifyAndComplete(purchase);
            setState(() {
              _isPurchasing = false;
              _message = '결제가 완료되었습니다!';
            });
          } catch (e) {
            setState(() {
              _isPurchasing = false;
              _message = '결제 검증 실패: $e';
            });
          }
          break;
        case PurchaseStatus.error:
          await PaymentService.verifyAndComplete(purchase);
          setState(() {
            _isPurchasing = false;
            _message = '결제 오류: ${purchase.error?.message}';
          });
          break;
        case PurchaseStatus.canceled:
          setState(() => _isPurchasing = false);
          break;
      }
    }
  }

  Future<void> _buyProduct(ProductDetails product) async {
    setState(() { _isPurchasing = true; _message = null; });
    try {
      await PaymentService.buyProduct(product);
    } catch (e) {
      setState(() { _isPurchasing = false; _message = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('결제')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (IS_FREE_SERVICE) _buildFreeServiceCard(),
                if (!IS_FREE_SERVICE) ..._buildPaymentContent(),
                if (_message != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: _message!.contains('완료')
                          ? const Color(0xFFD1FAE5)
                          : const Color(0xFFFEE2E2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _message!,
                      style: TextStyle(
                        color: _message!.contains('완료')
                            ? const Color(0xFF065F46)
                            : const Color(0xFF991B1B),
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ],
            ),
    );
  }

  Widget _buildFreeServiceCard() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: const Color(0xFFEFF6FF),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.card_giftcard, color: Color(0xFF3B82F6), size: 36),
          ),
          const SizedBox(height: 16),
          const Text(
            '현재 무료 서비스 운영 중',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text(
            '지금은 모든 서비스를 무료로 이용하실 수 있습니다.\n유료 전환 시 앱을 통해 안내드리겠습니다.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 14, color: Color(0xFF6B7280), height: 1.6),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: () => Navigator.pushNamed(context, '/analysis/upload'),
              child: const Text('학생부 분석 신청하기'),
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildPaymentContent() {
    if (!_isAvailable) {
      return [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Center(
            child: Text(
              'Google Play 결제를 사용할 수 없습니다.\n기기 설정을 확인해주세요.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xFF6B7280)),
            ),
          ),
        ),
      ];
    }

    if (_products.isEmpty) {
      return [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Center(
            child: Text(
              '상품 정보를 불러오는 중입니다...',
              style: TextStyle(color: Color(0xFF6B7280)),
            ),
          ),
        ),
      ];
    }

    return [
      const Text(
        '서비스 선택',
        style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: 12),
      ..._products.map((product) => Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: const Border(
                top: BorderSide(color: Color(0xFF3B82F6), width: 3),
              ),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, 2)),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.title,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                Text(
                  product.description,
                  style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      product.price,
                      style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF3B82F6)),
                    ),
                    SizedBox(
                      height: 40,
                      child: ElevatedButton(
                        onPressed: _isPurchasing ? null : () => _buyProduct(product),
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size(100, 40),
                        ),
                        child: _isPurchasing
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                    color: Colors.white, strokeWidth: 2))
                            : const Text('결제하기'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          )),
      const SizedBox(height: 16),
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: const Text(
          '• Google Play를 통한 안전한 결제\n'
          '• 결제 후 분석/상담 서비스가 활성화됩니다\n'
          '• 환불은 Google Play 환불 정책에 따릅니다',
          style: TextStyle(fontSize: 12, color: Color(0xFF6B7280), height: 1.7),
        ),
      ),
    ];
  }
}
