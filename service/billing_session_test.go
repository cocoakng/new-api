package service

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// BillingSession core lifecycle tests
// ---------------------------------------------------------------------------

func TestBillingSession_Settle_PositiveDelta(t *testing.T) {
	truncate(t)

	const userID, tokenID = 100, 100
	const initQuota, preConsumed, actualQuota = 10000, 3000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-pos", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-pos",
		RequestId: "req-settle-pos",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	err := session.Settle(actualQuota)
	require.NoError(t, err)

	// User should be charged extra 2000
	assert.Equal(t, initQuota-(actualQuota-preConsumed), getUserQuota(t, userID))
	// Token should be charged extra 2000
	assert.Equal(t, tokenRemain-(actualQuota-preConsumed), getTokenRemainQuota(t, tokenID))
	assert.True(t, session.settled)
}

func TestBillingSession_Settle_NegativeDelta(t *testing.T) {
	truncate(t)

	const userID, tokenID = 101, 101
	const initQuota, preConsumed, actualQuota = 10000, 5000, 2000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-neg", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-neg",
		RequestId: "req-settle-neg",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	err := session.Settle(actualQuota)
	require.NoError(t, err)

	// User should be refunded 3000
	assert.Equal(t, initQuota+(preConsumed-actualQuota), getUserQuota(t, userID))
	// Token should be refunded 3000
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))
	assert.True(t, session.settled)
}

func TestBillingSession_Settle_ZeroDelta(t *testing.T) {
	truncate(t)

	const userID, tokenID = 102, 102
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-zero", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-zero",
		RequestId: "req-settle-zero",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	err := session.Settle(preConsumed)
	require.NoError(t, err)

	// No change
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
	assert.True(t, session.settled)
}

func TestBillingSession_Settle_Idempotent(t *testing.T) {
	truncate(t)

	const userID, tokenID = 103, 103
	const initQuota, preConsumed, actualQuota = 10000, 3000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-idem", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-idem",
		RequestId: "req-settle-idem",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	// First settle
	err := session.Settle(actualQuota)
	require.NoError(t, err)
	userQuotaAfterFirst := getUserQuota(t, userID)

	// Second settle should be no-op
	err = session.Settle(actualQuota)
	require.NoError(t, err)
	assert.Equal(t, userQuotaAfterFirst, getUserQuota(t, userID))
}

func TestBillingSession_Refund_Idempotent(t *testing.T) {
	truncate(t)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	const userID, tokenID = 104, 104
	const initQuota, preConsumed = 10000, 3000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-refund-idem", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-refund-idem",
		RequestId: "req-refund-idem",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	// First refund
	session.Refund(ctx)
	// Wait for async refund
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))

	// Second refund should be no-op
	session.Refund(ctx)
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, initQuota+preConsumed, getUserQuota(t, userID))
}

func TestBillingSession_Refund_AfterSettle(t *testing.T) {
	truncate(t)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	const userID, tokenID = 105, 105
	const initQuota, preConsumed, actualQuota = 10000, 3000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-refund-after", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-refund-after",
		RequestId: "req-refund-after",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	// Settle first
	err := session.Settle(actualQuota)
	require.NoError(t, err)
	userQuotaAfterSettle := getUserQuota(t, userID)

	// Refund after settle should be no-op
	session.Refund(ctx)
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, userQuotaAfterSettle, getUserQuota(t, userID))
}

func TestBillingSession_Reserve(t *testing.T) {
	truncate(t)

	const userID, tokenID = 106, 106
	const initQuota, preConsumed = 10000, 3000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-reserve", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-reserve",
		RequestId: "req-reserve",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	// Reserve additional 2000
	err := session.Reserve(5000)
	require.NoError(t, err)

	assert.Equal(t, 5000, session.preConsumedQuota)
	assert.Equal(t, 5000, session.tokenConsumed)
	assert.Equal(t, 2000, session.extraReserved)
	// Reserve only deducts delta (5000-3000=2000), not full targetQuota
	assert.Equal(t, initQuota-2000, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain-2000, getTokenRemainQuota(t, tokenID))
}

func TestBillingSession_Reserve_NoOp(t *testing.T) {
	truncate(t)

	const userID, tokenID = 107, 107
	const initQuota, preConsumed = 10000, 3000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-reserve-noop", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-reserve-noop",
		RequestId: "req-reserve-noop",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}

	// Reserve less than preConsumedQuota should be no-op
	err := session.Reserve(2000)
	require.NoError(t, err)

	assert.Equal(t, preConsumed, session.preConsumedQuota)
	// Directly-constructed session never actually pre-consumed, so quota unchanged
	assert.Equal(t, initQuota, getUserQuota(t, userID))
}

func TestBillingSession_NeedsRefund(t *testing.T) {
	relayInfo := &relaycommon.RelayInfo{
		UserId:    1,
		TokenId:   1,
		TokenKey:  "sk-needs",
		RequestId: "req-needs",
	}

	// Fresh session with consumed tokens -> needs refund
	s1 := &BillingSession{
		relayInfo:     relayInfo,
		funding:       &WalletFunding{userId: 1, consumed: 100},
		tokenConsumed: 100,
	}
	assert.True(t, s1.NeedsRefund())

	// After settle -> no refund
	s1.settled = true
	assert.False(t, s1.NeedsRefund())

	// After refund -> no refund
	s2 := &BillingSession{
		relayInfo:     relayInfo,
		funding:       &WalletFunding{userId: 1, consumed: 100},
		tokenConsumed: 100,
	}
	s2.refunded = true
	assert.False(t, s2.NeedsRefund())

	// fundingSettled -> no refund
	s3 := &BillingSession{
		relayInfo:     relayInfo,
		funding:       &WalletFunding{userId: 1, consumed: 100},
		tokenConsumed: 100,
	}
	s3.fundingSettled = true
	assert.False(t, s3.NeedsRefund())
}

// ---------------------------------------------------------------------------
// NewBillingSession preference tests
// ---------------------------------------------------------------------------

func TestNewBillingSession_WalletOnly(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 200, 200
	const initQuota = 10000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-wallet-only", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-wallet-only",
		RequestId: "req-wallet-only",
		UserSetting: dto.UserSetting{
			BillingPreference: "wallet_only",
		},
	}

	session, apiErr := NewBillingSession(ctx, relayInfo, 3000)
	require.Nil(t, apiErr)
	require.NotNil(t, session)

	assert.Equal(t, BillingSourceWallet, session.funding.Source())
	assert.Equal(t, 3000, session.preConsumedQuota)
	assert.Equal(t, initQuota-3000, getUserQuota(t, userID))
}

func TestNewBillingSession_WalletOnly_InsufficientQuota(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 201, 201
	const initQuota = 1000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-wallet-insuff", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-wallet-insuff",
		RequestId: "req-wallet-insuff",
		UserSetting: dto.UserSetting{
			BillingPreference: "wallet_only",
		},
	}

	session, apiErr := NewBillingSession(ctx, relayInfo, 3000)
	require.NotNil(t, apiErr)
	assert.Nil(t, session)
	assert.Equal(t, types.ErrorCodeInsufficientUserQuota, apiErr.GetErrorCode())
}

func TestNewBillingSession_SubscriptionFirst_NoActiveSub(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 202, 202
	const initQuota = 10000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-sub-first-no", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-sub-first-no",
		RequestId: "req-sub-first-no",
		UserSetting: dto.UserSetting{
			BillingPreference: "subscription_first",
		},
	}

	// No active subscription exists, should fall back to wallet
	session, apiErr := NewBillingSession(ctx, relayInfo, 3000)
	require.Nil(t, apiErr)
	require.NotNil(t, session)

	assert.Equal(t, BillingSourceWallet, session.funding.Source())
}

func TestNewBillingSession_TrustedUser(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 203, 203
	const initQuota = 1000000 // High quota to trigger trust
	const tokenRemain = 900000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-trusted", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-trusted",
		RequestId: "req-trusted",
		UserSetting: dto.UserSetting{
			BillingPreference: "wallet_only",
		},
	}

	ctx.Set("token_quota", tokenRemain)

	session, apiErr := NewBillingSession(ctx, relayInfo, 3000)
	require.Nil(t, apiErr)
	require.NotNil(t, session)

	// High-quota user may be trusted depending on GetTrustQuota()
	if session.trusted {
		assert.Equal(t, 0, session.preConsumedQuota)
		assert.Equal(t, initQuota, getUserQuota(t, userID))
	} else {
		assert.Equal(t, 3000, session.preConsumedQuota)
	}
}

// ---------------------------------------------------------------------------
// SettleBilling high-level dispatch tests
// ---------------------------------------------------------------------------

func TestSettleBilling_WithSession_PositiveDelta(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 300, 300
	const initQuota, preConsumed, actualQuota = 10000, 3000, 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-billing-pos", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-billing-pos",
		RequestId: "req-settle-billing-pos",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}
	relayInfo.Billing = session

	err := SettleBilling(ctx, relayInfo, actualQuota)
	require.NoError(t, err)

	// User should be charged extra 2000
	assert.Equal(t, initQuota-(actualQuota-preConsumed), getUserQuota(t, userID))
	// Token should be charged extra 2000
	assert.Equal(t, tokenRemain-(actualQuota-preConsumed), getTokenRemainQuota(t, tokenID))
}

func TestSettleBilling_WithSession_NegativeDelta(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 301, 301
	const initQuota, preConsumed, actualQuota = 10000, 5000, 2000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-billing-neg", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-billing-neg",
		RequestId: "req-settle-billing-neg",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}
	relayInfo.Billing = session

	err := SettleBilling(ctx, relayInfo, actualQuota)
	require.NoError(t, err)

	// User should be refunded 3000
	assert.Equal(t, initQuota+(preConsumed-actualQuota), getUserQuota(t, userID))
	// Token should be refunded 3000
	assert.Equal(t, tokenRemain+(preConsumed-actualQuota), getTokenRemainQuota(t, tokenID))
}

func TestSettleBilling_WithSession_ZeroDelta(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 302, 302
	const initQuota, preConsumed = 10000, 4000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-billing-zero", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:    userID,
		TokenId:   tokenID,
		TokenKey:  "sk-settle-billing-zero",
		RequestId: "req-settle-billing-zero",
	}

	session := &BillingSession{
		relayInfo:        relayInfo,
		funding:          &WalletFunding{userId: userID, consumed: preConsumed},
		preConsumedQuota: preConsumed,
		tokenConsumed:    preConsumed,
	}
	relayInfo.Billing = session

	err := SettleBilling(ctx, relayInfo, preConsumed)
	require.NoError(t, err)

	// No change
	assert.Equal(t, initQuota, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain, getTokenRemainQuota(t, tokenID))
}

func TestSettleBilling_Fallback_NoSession(t *testing.T) {
	truncate(t)
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(w)

	const userID, tokenID = 303, 303
	const initQuota = 10000
	const preConsumed = 3000
	const actualQuota = 5000
	const tokenRemain = 8000

	seedUser(t, userID, initQuota)
	seedToken(t, tokenID, userID, "sk-settle-fallback", tokenRemain)

	relayInfo := &relaycommon.RelayInfo{
		UserId:                userID,
		TokenId:               tokenID,
		TokenKey:              "sk-settle-fallback",
		RequestId:             "req-settle-fallback",
		FinalPreConsumedQuota: preConsumed,
	}

	// No BillingSession attached; should fall back to PostConsumeQuota
	err := SettleBilling(ctx, relayInfo, actualQuota)
	require.NoError(t, err)

	// PostConsumeQuota delta = actual - FinalPreConsumedQuota = 2000
	assert.Equal(t, initQuota-2000, getUserQuota(t, userID))
	assert.Equal(t, tokenRemain-2000, getTokenRemainQuota(t, tokenID))
}
