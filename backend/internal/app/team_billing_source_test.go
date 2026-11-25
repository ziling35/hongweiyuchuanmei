package app

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

// 个人空间的任务可以用团长划给本人的团队额度付款：扣费落在成员团队账户，
// 个人钱包和公共池都不动，任务与产物仍属于个人空间。
func TestPersonalSpaceTaskCanBillAllocatedTeamQuota(t *testing.T) {
	svc, db := newTeamTextTestService(t)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"镜头二。"}}],"usage":{"prompt_tokens":4,"completion_tokens":3}}`))
	}))
	defer upstream.Close()
	key, err := svc.encryptSettingSecret(newID())
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.ModelChannel{}).Where("id = ?", "channel").Updates(map[string]any{"base_url": upstream.URL, "api_key": key}).Error; err != nil {
		t.Fatal(err)
	}
	req := creationTextRequest()
	req.Operation = "text"
	req.Input["textOptions"] = map[string]any{"stream": false}
	req.IdempotencyKey = "member-space"
	req.BillingMembershipID = "worker-member"
	task, err := svc.CreateTask("worker", req)
	if err != nil {
		t.Fatal(err)
	}
	if task.UserID != "worker" {
		t.Fatalf("产物归属 = %q，应留在个人空间", task.UserID)
	}
	order, err := svc.repo.BillingOrder(task.BillingOrderID)
	if err != nil {
		t.Fatal(err)
	}
	if order.TeamID != "team" || order.MembershipID != "worker-member" || order.BillingAccountID != model.TeamMemberCreditAccountID("worker-member") {
		t.Fatalf("扣费账户错误: %+v", order)
	}
	personal, err := svc.repo.CreditAccount("worker")
	if err != nil || personal.AvailableMicrocredits != 1234 || personal.ReservedMicrocredits != 0 {
		t.Fatalf("个人钱包被动用: %+v %v", personal, err)
	}
	account, err := svc.repo.CreditAccountByID(order.BillingAccountID)
	if err != nil || account.AvailableMicrocredits != 1950 || account.ReservedMicrocredits != 50 {
		t.Fatalf("团队额度冻结错误: %+v %v", account, err)
	}
	claimed, err := svc.repo.ClaimNextTask("worker-1", time.Minute)
	if err != nil || claimed == nil || claimed.ID != task.ID {
		t.Fatal("任务未入队", err)
	}
	if err := svc.taskWorker().processClaimedTask(claimed, nil); err != nil {
		t.Fatal(err)
	}
	settled, err := svc.repo.BillingOrder(order.ID)
	if err != nil || settled.Status != model.BillingStatusSettled {
		t.Fatalf("订单未结算: %+v %v", settled, err)
	}
	account, err = svc.repo.CreditAccountByID(order.BillingAccountID)
	if err != nil || account.AvailableMicrocredits != 1950 || account.ReservedMicrocredits != 0 {
		t.Fatalf("结算后团队额度错误: %+v %v", account, err)
	}
	if calls.Load() != 1 {
		t.Fatalf("上游调用次数 = %d", calls.Load())
	}
	// 别人的成员额度不能拿来付款。
	stolen := creationTextRequest()
	stolen.Operation = "text"
	stolen.IdempotencyKey = "member-space-stolen"
	stolen.BillingMembershipID = "owner-member"
	if _, err := svc.CreateTask("worker", stolen); err == nil {
		t.Fatal("跨成员扣费被接受")
	}
}
