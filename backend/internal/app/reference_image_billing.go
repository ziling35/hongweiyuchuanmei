package app

// referenceImageCharge 计算参考图计费加项：免费张数以内不计费，超出部分按单价乘销售倍率逐张累加。
// 与输出侧计费方式无关（按次 / 按秒 / Token 都叠加同一笔）；单价为 0 表示该价格档不按参考图计费。
func referenceImageCharge(unitPrice int64, images int64, freeImages int32, multiplierBPS int64) (billed int64, amount int64, err error) {
	if unitPrice <= 0 || images <= 0 {
		return 0, 0, nil
	}
	billed = max(images-int64(freeImages), int64(0))
	if billed == 0 {
		return 0, 0, nil
	}
	if amount, err = creditAmount(unitPrice, billed, multiplierBPS); err != nil {
		return 0, 0, err
	}
	return billed, amount, nil
}
