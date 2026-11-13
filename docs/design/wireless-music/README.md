# 无线音乐运营商自建单交付

- [产品需求说明](PRD.md)
- [技术设计](technical-design.md)
- [验收走查链路](acceptance.md)
- [评审与验证记录](review.md)
- [通用融合方案及竞品参考](design.md)

实际 Vue 交互稿：[工单工作台](http://127.0.0.1:3011/flowos/tickets?template=wireless-operator)、[新建登记](http://127.0.0.1:3011/flowos/unified-create?template=wireless-operator)。演示账号 `13857985858`，密码 `123`。

修改位于分支 `feat/wireless-music-self-service`。业务通过咨询工单的独立表单承载，复用统一建单、工作台、查询和后台字典／产品管理；不计入通用咨询工单量，不自动分派。

`preview.html` 为早期独立示意，最终功能验收以实际 Vue 交互稿和 PRD 为准。本地交互使用浏览器缓存，外呼、短信及材料邀请为演示，生产对接边界见技术设计。
