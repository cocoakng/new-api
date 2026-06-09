package billing_setting

import (
	"fmt"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/samber/lo"
)

const (
	BillingModeRatio      = "ratio"
	BillingModeTieredExpr = "tiered_expr"
	BillingModePerSecond  = "per_second"
	BillingModeField      = "billing_mode"
	BillingExprField      = "billing_expr"
	PerSecondPriceField   = "per_second_price"
	PerSecondExprField    = "per_second_expr"
)

// BillingSetting is managed by config.GlobalConfig.Register.
// DB keys: billing_setting.billing_mode, billing_setting.billing_expr
type BillingSetting struct {
	BillingMode    map[string]string  `json:"billing_mode"`
	BillingExpr    map[string]string  `json:"billing_expr"`
	PerSecondPrice map[string]float64 `json:"per_second_price"`
	PerSecondExpr  map[string]string  `json:"per_second_expr"`
}

var billingSetting = BillingSetting{
	BillingMode:    make(map[string]string),
	BillingExpr:    make(map[string]string),
	PerSecondPrice: make(map[string]float64),
	PerSecondExpr:  make(map[string]string),
}

func init() {
	config.GlobalConfig.Register("billing_setting", &billingSetting)
}

// ---------------------------------------------------------------------------
// Read accessors (hot path, must be fast)
// ---------------------------------------------------------------------------

func GetBillingMode(model string) string {
	if mode, ok := billingSetting.BillingMode[model]; ok {
		return mode
	}
	return BillingModeRatio
}

func GetBillingExpr(model string) (string, bool) {
	expr, ok := billingSetting.BillingExpr[model]
	return expr, ok
}

func GetPerSecondPrice(model string) (float64, bool) {
	p, ok := billingSetting.PerSecondPrice[model]
	return p, ok
}

func GetPerSecondExpr(model string) (string, bool) {
	expr, ok := billingSetting.PerSecondExpr[model]
	return expr, ok
}

func GetBillingModeCopy() map[string]string {
	return lo.Assign(billingSetting.BillingMode)
}

func GetBillingExprCopy() map[string]string {
	return lo.Assign(billingSetting.BillingExpr)
}

func GetPricingSyncData(base map[string]any) map[string]any {
	extra := make(map[string]any, 4)
	if modes := GetBillingModeCopy(); len(modes) > 0 {
		extra[BillingModeField] = modes
	}
	if exprs := GetBillingExprCopy(); len(exprs) > 0 {
		extra[BillingExprField] = exprs
	}
	if prices := billingSetting.PerSecondPrice; len(prices) > 0 {
		extra[PerSecondPriceField] = lo.Assign(prices)
	}
	if exprs := billingSetting.PerSecondExpr; len(exprs) > 0 {
		extra[PerSecondExprField] = lo.Assign(exprs)
	}
	return lo.Assign(base, extra)
}

// ---------------------------------------------------------------------------
// Smoke test (called externally for validation before save)
// ---------------------------------------------------------------------------

func SmokeTestExpr(exprStr string) error {
	return smokeTestExpr(exprStr)
}

func smokeTestExpr(exprStr string) error {
	vectors := []billingexpr.TokenParams{
		{P: 0, C: 0, Len: 0},
		{P: 1000, C: 1000, Len: 1000},
		{P: 100000, C: 100000, Len: 100000},
		{P: 1000000, C: 1000000, Len: 1000000},
	}
	requests := []billingexpr.RequestInput{
		{},
		{
			Headers: map[string]string{
				"anthropic-beta": "fast-mode-2026-02-01",
			},
			Body: []byte(`{"service_tier":"fast","stream_options":{"include_usage":true},"messages":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]}`),
		},
		// per_second expressions use duration; test with various values
		{Body: []byte(`{"duration":0}`)},
		{Body: []byte(`{"duration":5,"width":1280,"height":720}`)},
		{Body: []byte(`{"duration":60,"width":3840,"height":2160}`)},
	}

	for _, v := range vectors {
		for _, request := range requests {
			result, _, err := billingexpr.RunExprWithRequest(exprStr, v, request)
			if err != nil {
				return fmt.Errorf("vector {p=%g, c=%g}: run failed: %w", v.P, v.C, err)
			}
			if result < 0 {
				return fmt.Errorf("vector {p=%g, c=%g}: result %f < 0", v.P, v.C, result)
			}
		}
	}
	return nil
}
