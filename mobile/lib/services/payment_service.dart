import 'dart:async';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'api_service.dart';

/// Google Play 인앱결제 상품 ID
/// - Play Console에서 동일한 ID로 상품을 등록해야 함
class ProductIds {
  static const String analysis = 'analysis_standard';    // 학생부 분석 서비스
  static const String consultation = 'consultation_60min'; // 60분 상담

  static const Set<String> all = {analysis, consultation};
}

class PaymentService {
  static final InAppPurchase _iap = InAppPurchase.instance;

  /// 인앱결제 사용 가능 여부 확인
  static Future<bool> isAvailable() => _iap.isAvailable();

  /// 상품 정보 조회
  static Future<List<ProductDetails>> getProducts() async {
    final response = await _iap.queryProductDetails(ProductIds.all);
    return response.productDetails;
  }

  /// 구매 요청
  /// [productId] : ProductIds.analysis 또는 ProductIds.consultation
  /// 구매 완료는 purchaseStream 리스너에서 처리
  static Future<bool> buyProduct(ProductDetails product) async {
    final purchaseParam = PurchaseParam(productDetails: product);
    return _iap.buyNonConsumable(purchaseParam: purchaseParam);
  }

  /// 구매 완료 후 서버 검증
  static Future<void> verifyAndComplete(PurchaseDetails purchase) async {
    if (purchase.status == PurchaseStatus.purchased) {
      try {
        await ApiService.post('/payment/google/verify', {
          'purchase_token': purchase.verificationData.serverVerificationData,
          'product_id': purchase.productID,
          'order_type': _getOrderType(purchase.productID),
          'order_id': '00000000-0000-0000-0000-000000000000',
        });
        await _iap.completePurchase(purchase);
      } catch (e) {
        // 검증 실패해도 completePurchase는 호출해 큐에서 제거
        await _iap.completePurchase(purchase);
        rethrow;
      }
    } else if (purchase.pendingCompletePurchase) {
      await _iap.completePurchase(purchase);
    }
  }

  static String _getOrderType(String productId) {
    if (productId == ProductIds.consultation) return 'consultation';
    return 'analysis';
  }
}
