package controller

import (
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

// XunhuPayRequest 支付请求
type XunhuPayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

// XunhuAmountRequest 金额计算请求
type XunhuAmountRequest struct {
	Amount int64 `json:"amount"`
}

// XunhuAdaptor 虎皮椒支付适配器
var xunhuAdaptor = &XunhuAdaptor{}

type XunhuAdaptor struct{}

// RequestPay 发起支付
func (*XunhuAdaptor) RequestPay(c *gin.Context, req *XunhuPayRequest) {
	if req.PaymentMethod != model.PaymentMethodXunhu {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "不支持的支付渠道"})
		return
	}

	id := c.GetInt("id")

	if req.Amount < getXunhuMinTopUp() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getXunhuMinTopUp())})
		return
	}

	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getXunhuPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	// 生成唯一订单号
	tradeNo := fmt.Sprintf("XUNHU%d%s", id, randstr.Hex(16))

	// 先创建本地订单
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          req.Amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodXunhu,
		PaymentProvider: model.PaymentProviderXunhu,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("虎皮椒 创建充值订单失败 user_id=%d trade_no=%s amount=%d error=%q", id, tradeNo, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	// 调用虎皮椒支付接口
	payURL, err := genXunhuPayLink(c.Request.Context(), tradeNo, payMoney, fmt.Sprintf("账户充值 - %d", req.Amount))
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("虎皮椒 拉起支付失败 user_id=%d trade_no=%s error=%q", id, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 充值订单创建成功 user_id=%d trade_no=%s amount=%d money=%.2f pay_url=%q", id, tradeNo, req.Amount, payMoney, payURL))

	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"pay_url": payURL,
		},
	})
}

// RequestXunhuPay 虎皮椒支付请求入口
func RequestXunhuPay(c *gin.Context) {
	var req XunhuPayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	xunhuAdaptor.RequestPay(c, &req)
}

// RequestXunhuAmount 计算支付金额
func RequestXunhuAmount(c *gin.Context) {
	var req XunhuAmountRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	if req.Amount < getXunhuMinTopUp() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getXunhuMinTopUp())})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getXunhuPayMoney(req.Amount, group)
	if payMoney <= 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

// getXunhuPayMoney 计算虎皮椒支付金额
func getXunhuPayMoney(amount int64, group string) float64 {
	dAmount := decimal.NewFromInt(amount)
	// 充值金额以"展示类型"为准
	displayType := operation_setting.GetQuotaDisplayType()
	if displayType == operation_setting.QuotaDisplayTypeTokens {
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		dAmount = dAmount.Div(dQuotaPerUnit)
	}

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}

	dTopupGroupRatio := decimal.NewFromFloat(topupGroupRatio)
	// apply optional preset discount
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok {
		if ds > 0 {
			discount = ds
		}
	}
	dDiscount := decimal.NewFromFloat(discount)

	// 计算支付金额：根据展示类型决定是否使用汇率换算
	// CNY: 用户输入的是人民币，直接以人民币支付
	// USD: 用户输入的是美元，需要乘以 XunhuUnitPrice 换算为人民币
	// TOKENS: 上面已换算为美元，同样乘以 XunhuUnitPrice 换算为人民币
	if displayType == operation_setting.QuotaDisplayTypeCNY {
		payMoney := dAmount.Mul(dTopupGroupRatio).Mul(dDiscount)
		return payMoney.InexactFloat64()
	}

	dPrice := decimal.NewFromFloat(setting.XunhuUnitPrice)
	payMoney := dAmount.Mul(dPrice).Mul(dTopupGroupRatio).Mul(dDiscount)

	return payMoney.InexactFloat64()
}

func getXunhuMinTopUp() int64 {
	minTopup := setting.XunhuMinTopUp
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dMinTopup := decimal.NewFromInt(int64(minTopup))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		minTopup = int(dMinTopup.Mul(dQuotaPerUnit).IntPart())
	}
	return int64(minTopup)
}

// genXunhuPayLink 生成虎皮椒支付链接
func genXunhuPayLink(ctx context.Context, tradeNo string, payMoney float64, title string) (string, error) {
	if setting.XunhuAppId == "" || setting.XunhuAppSecret == "" || setting.XunhuApiHost == "" {
		return "", fmt.Errorf("未配置虎皮椒支付信息")
	}

	callBackAddress := service.GetCallbackAddress()
	notifyURL, _ := url.Parse(callBackAddress + "/api/xunhu/webhook")
	returnURL := paymentReturnPath("/console/log")

	// 构建支付参数
	now := time.Now().Unix()
	nonceStr := randstr.Hex(16)
	params := map[string]string{
		"version":        "1.1",
		"appid":          setting.XunhuAppId,
		"trade_order_id": tradeNo,
		"total_fee":      strconv.FormatFloat(payMoney, 'f', 2, 64),
		"title":          title,
		"time":           strconv.FormatInt(now, 10),
		"notify_url":     notifyURL.String(),
		"return_url":     returnURL,
		"nonce_str":      nonceStr,
	}

	// 签名
	sign := xunhuSign(params)
	params["hash"] = sign

	// 虎皮椒要求发送 POST form 请求
	formData := url.Values{}
	for k, v := range params {
		formData.Set(k, v)
	}

	resp, err := http.PostForm(setting.XunhuApiHost, formData)
	if err != nil {
		return "", fmt.Errorf("请求虎皮椒支付接口失败: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取虎皮椒响应失败: %v", err)
	}

	logger.LogInfo(ctx, fmt.Sprintf("虎皮椒支付接口响应 trade_no=%s body=%q", tradeNo, string(body)))

	// 解析响应
	var result struct {
		OrderID   string `json:"orderid"`
		URL       string `json:"url"`
		URLQrCode string `json:"url_qrcode"`
		ErrCode   int    `json:"errcode"`
		ErrMsg    string `json:"errmsg"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("解析虎皮椒响应失败: %v, body: %s", err, string(body))
	}

	// 检查错误码
	if result.ErrCode != 0 || (result.URL == "" && result.URLQrCode == "") {
		return "", fmt.Errorf("虎皮椒返回错误: errcode=%d, errmsg=%s", result.ErrCode, result.ErrMsg)
	}

	// 返回支付链接（优先使用 URL）
	payURL := result.URL
	if payURL == "" && result.URLQrCode != "" {
		payURL = result.URLQrCode
	}

	return payURL, nil
}

// xunhuSign 虎皮椒签名算法
// 1. 将参数按字母排序
// 2. 拼接为 key1=value1&key2=value2&appSecret
// 3. MD5
func xunhuSign(params map[string]string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		if params[k] == "" {
			continue
		}
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var data strings.Builder
	for _, k := range keys {
		data.WriteString(k)
		data.WriteString("=")
		data.WriteString(params[k])
		data.WriteString("&")
	}
	// 去掉末尾多余的 &
	signStr := strings.TrimSuffix(data.String(), "&")
	signStr += setting.XunhuAppSecret

	m := md5.New()
	m.Write([]byte(signStr))
	return fmt.Sprintf("%x", m.Sum(nil))
}

// XunhuWebhook 虎皮椒回调通知
func XunhuWebhook(c *gin.Context) {
	if !isXunhuWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.JSON(http.StatusOK, gin.H{"errmsg": "webhook disabled"})
		return
	}

	// 解析回调参数
	params := make(map[string]string)
	if c.Request.Method == "POST" {
		if err := c.Request.ParseForm(); err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook POST 表单解析失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
			c.JSON(http.StatusOK, gin.H{"errmsg": "parse error"})
			return
		}
		for k := range c.Request.PostForm {
			params[k] = c.Request.PostForm.Get(k)
		}
	} else {
		for k := range c.Request.URL.Query() {
			params[k] = c.Request.URL.Query().Get(k)
		}
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 收到请求 path=%q client_ip=%s method=%s params=%q", c.Request.RequestURI, c.ClientIP(), c.Request.Method, common.GetJsonString(params)))

	if len(params) == 0 {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 参数为空 path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		c.JSON(http.StatusOK, gin.H{"errmsg": "empty params"})
		return
	}

	// 验签：去除 hash 字段，重新签名对比
	receivedSign := params["hash"]
	delete(params, "hash")
	expectedSign := xunhuSign(params)

	if receivedSign != expectedSign {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 验签失败 path=%q client_ip=%s received=%q expected=%q", c.Request.RequestURI, c.ClientIP(), receivedSign, expectedSign))
		c.JSON(http.StatusOK, gin.H{"errmsg": "sign verify failed"})
		return
	}

	// 虎皮椒使用 status 字段，兼容 trade_status
	tradeStatus := params["trade_status"]
	if tradeStatus == "" {
		tradeStatus = params["status"]
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 验签成功 trade_order_id=%s trade_status=%s", params["trade_order_id"], tradeStatus))

	// 处理支付成功回调
	if tradeStatus == "OD" { // OD = 支付成功
		tradeNo := params["trade_order_id"]
		if tradeNo == "" {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 缺少 trade_order_id path=%q", c.Request.RequestURI))
			c.JSON(http.StatusOK, gin.H{"errmsg": "missing trade_order_id"})
			return
		}

		LockOrder(tradeNo)
		defer UnlockOrder(tradeNo)

		// 先尝试处理订阅订单
		if err := model.CompleteSubscriptionOrder(tradeNo, common.GetJsonString(params), model.PaymentProviderXunhu, ""); err == nil {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 订阅订单处理成功 trade_no=%s", tradeNo))
			c.JSON(http.StatusOK, gin.H{"errmsg": "ok"})
			return
		}

		// 处理普通充值订单
		topUp := model.GetTopUpByTradeNo(tradeNo)
		if topUp == nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("虎皮椒 回调订单不存在 trade_no=%s", tradeNo))
			c.JSON(http.StatusOK, gin.H{"errmsg": "order not found"})
			return
		}

		if topUp.PaymentProvider != model.PaymentProviderXunhu {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("虎皮椒 订单支付网关不匹配 trade_no=%s order_provider=%s", tradeNo, topUp.PaymentProvider))
			c.JSON(http.StatusOK, gin.H{"errmsg": "provider mismatch"})
			return
		}

		if topUp.Status != common.TopUpStatusPending {
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 订单状态非 pending，忽略 trade_no=%s status=%s", tradeNo, topUp.Status))
			c.JSON(http.StatusOK, gin.H{"errmsg": "ok"}) // 已处理过
			return
		}

		err := model.RechargeXunhu(tradeNo, c.ClientIP())
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("虎皮椒 充值处理失败 trade_no=%s user_id=%d error=%q", tradeNo, topUp.UserId, err.Error()))
			c.JSON(http.StatusOK, gin.H{"errmsg": "recharge failed"})
			return
		}

		logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 充值成功 trade_no=%s user_id=%d amount=%d money=%.2f", tradeNo, topUp.UserId, topUp.Amount, topUp.Money))
	} else {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("虎皮椒 webhook 忽略事件 trade_order_id=%s trade_status=%s", params["trade_order_id"], tradeStatus))
	}

	c.JSON(http.StatusOK, gin.H{"errmsg": "ok"})
}
