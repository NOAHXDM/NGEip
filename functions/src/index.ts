import { setGlobalOptions } from "firebase-functions/v2";

/**
 * NGEip Functions 預設與 default Firestore 同區部署。
 *
 * 後續新增 trigger 時優先繼承此設定；若需要其他區域，必須在對應 plan.md
 * 記錄跨區延遲與成本影響。
 */
setGlobalOptions({
  region: "asia-east1",
});

export { getGoogleDocPlainText } from "./jsm-google-doc-description/http";
