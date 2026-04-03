const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== 中间件 ==========
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ========== 数据库 ==========
// Render 等平台的文件系统是临时的，重启会丢失
// 使用 NODE_ENV=production 判断：生产环境用内存数据库 + 自动初始化默认数据
// 本地开发仍可持久化到文件
const isProduction = process.env.NODE_ENV === 'production';
const DB_DIR = isProduction
  ? path.join(os.tmpdir(), 'gym-cs')
  : (process.env.DB_PATH ? path.dirname(process.env.DB_PATH) : path.join(__dirname, 'data'));
const DB_FILE = isProduction
  ? path.join(DB_DIR, 'knowledge.db')
  : (process.env.DB_PATH || path.join(DB_DIR, 'knowledge.db'));

let db;

async function initDB() {
  const SQL = await initSqlJs();

  // 创建数据目录
  if (!isProduction) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!isProduction && fs.existsSync(DB_FILE)) {
    const buf = fs.readFileSync(DB_FILE);
    db = new SQL.Database(buf);
    console.log('✅ 已加载现有数据库');
  } else {
    db = new SQL.Database();
    console.log(isProduction ? '✅ 生产模式：使用内存数据库' : '✅ 已创建新数据库');
  }

  // 建表
  db.run(`
    CREATE TABLE IF NOT EXISTS qa (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      keywords TEXT DEFAULT '[]',
      category TEXT DEFAULT '其他',
      priority TEXT DEFAULT 'normal',
      hit_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 初始化默认数据（仅当表为空时）
  const result = db.exec('SELECT COUNT(*) as cnt FROM qa');
  const count = result[0] ? result[0].values[0][0] : 0;

  if (count === 0) {
    for (const item of DEFAULT_QA) {
      db.run(
        `INSERT INTO qa (id, question, answer, keywords, category, priority) VALUES (?, ?, ?, ?, ?, ?)`,
        [item.id, item.question, item.answer, item.keywords, item.category, item.priority]
      );
    }
    console.log(`✅ 已初始化 ${DEFAULT_QA.length} 条默认知识库数据`);
    saveDB();
  }
}

function saveDB() {
  if (isProduction) {
    // 生产环境：尝试写入临时文件，即使失败也不影响运行（内存中仍有数据）
    try {
      fs.mkdirSync(DB_DIR, { recursive: true });
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_FILE, buffer);
    } catch (e) {
      // 静默处理，不中断服务
    }
  } else {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  }
}

function getRows(stmt) {
  const cols = stmt.getColumnNames();
  const rows = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    rows.push(row);
  }
  stmt.free();
  return rows;
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  for (let i = 0; i < params.length; i++) stmt.bind(params[i], i + 1);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  for (let i = 0; i < params.length; i++) stmt.bind(params[i], i + 1);
  const rows = getRows(stmt);
  return rows;
}

// ========== 默认数据 ==========
const DEFAULT_QA = [
  { id:'g1', question:'如何办理健身会员卡？', answer:'办理会员卡非常简单：\n\n1. 前往前台咨询或通过 APP 在线办理\n2. 选择适合您的会员类型（月卡/季卡/年卡）\n3. 出示身份证件并填写个人信息\n4. 完成付款后即可领取会员卡\n\n💡 **提示**：首次办卡可享新客优惠，年卡用户额外赠送 1 个月。建议带上运动装备当天即可开始锻炼。', keywords:'["办卡","会员卡","办理","新会员","开卡","注册会员","入会"]', category:'会籍办理', priority:'high' },
  { id:'g2', question:'会员卡有哪些类型和价格？', answer:'我们提供多种会员类型，满足不同需求：\n\n**个人卡**：\n- 月卡：¥299/月\n- 季卡：¥799/季（约¥266/月）\n- 半年卡：¥1,499（约¥249/月）\n- 年卡：¥2,599（约¥216/月）🔥 最受欢迎\n\n**情侣卡**：年卡 ¥3,999（双人）\n\n**次卡**：¥49/次（10次起售）\n\n所有年卡含免费体测 1 次，具体价格以门店实际为准。', keywords:'["价格","多少钱","费用","收费标准","套餐","卡种","类型","优惠"]', category:'会籍办理', priority:'high' },
  { id:'g3', question:'会员卡可以转让给别人吗？', answer:'会员卡支持转让，需满足以下条件：\n\n1. 转让时卡片需在有效期内\n2. 需双方本人携带身份证到前台办理\n3. 支付转让手续费 ¥100\n4. 季卡及以上套餐才支持转让（月卡和次卡不支持）\n\n⚠️ **注意**：每张卡仅限转让 1 次，转让后原会员权益同步转移，赠送的课程/私教课不可转让。', keywords:'["转让","过户","转卡","送人","给别人","转给朋友"]', category:'会籍办理', priority:'normal' },
  { id:'g4', question:'会员卡到期了怎么续费？', answer:'续费方式灵活多样：\n\n📱 **APP 续费**：打开 APP → 我的 → 会员续费\n🏦 **前台续费**：到门店前台直接办理\n💳 **自动续费**：开通自动续费享 95 折优惠\n\n🎉 **续费优惠**：\n- 到期前 30 天内续费，赠送 7 天\n- 连续续费年卡，第 2 年享 9 折\n- 老会员推荐新会员，双方各获 1 个月延长', keywords:'["续费","续卡","到期","延长","自动续费","年卡续费"]', category:'会籍办理', priority:'high' },
  { id:'g5', question:'可以暂停会员卡吗？', answer:'支持！会员卡冻结规则如下：\n\n**冻结条件**：\n- 年卡可申请冻结，累计冻结时长不超过 90 天\n- 季卡可申请冻结，累计不超过 30 天\n- 月卡不支持冻结\n\n**操作方式**：\n- APP → 我的 → 卡片管理 → 申请冻结\n- 或到前台填写冻结申请表\n\n⏰ 冻结期间不计入有效期，冻结结束后自动恢复。', keywords:'["暂停","冻结","停卡","休卡","暂停使用","中止"]', category:'会籍办理', priority:'high' },
  { id:'g6', question:'如何补办或更换会员卡？', answer:'会员卡丢失或损坏可以补办：\n\n📌 **补办流程**：\n1. 携带本人身份证到前台\n2. 说明补办原因\n3. 支付补卡工本费 ¥20\n4. 当场即可领取新卡\n\n💡 **温馨提示**：补办后旧卡自动失效，卡片内的剩余天数、课程次数等权益不受影响。建议绑定 APP，刷手机码入场更方便。', keywords:'["补办","换卡","丢卡","丢失","损坏","挂失"]', category:'会籍办理', priority:'normal' },
  { id:'g7', question:'忘带会员卡能进场吗？', answer:'忘带实体卡完全没关系！您可以通过以下方式入场：\n\n📱 **手机扫码**：打开 APP → 点击"入场码"，向闸机出示二维码\n👤 **人脸识别**：已录入人脸信息的会员可直接刷脸入场\n🆔 **身份证**：出示本人身份证由前台核实\n\n建议在日常设置中录入人脸信息，体验更便捷。', keywords:'["忘带卡","没有卡","进场","入场","刷脸","二维码","身份证"]', category:'会籍办理', priority:'high' },
  { id:'g8', question:'可以带朋友一起来健身吗？', answer:'当然可以！我们有多种方式供朋友体验：\n\n🏃 **免费体验**：每张会员卡每月可邀请 1 位朋友免费体验 1 次\n🎫 **体验券**：可在 APP 购买单次体验券 ¥39（会员价）\n👥 **亲友卡**：年卡会员可购买亲友共享卡\n\n👨‍👩‍👧‍👦 **注意**：未满 16 周岁需家长陪同，16-18 周岁需监护人签署知情同意书。', keywords:'["带朋友","朋友","体验","陪同","带人","家人","家属","邀请"]', category:'会籍办理', priority:'normal' },
  { id:'g9', question:'如何预约团课？', answer:'团课预约非常方便：\n\n📱 **APP 预约**：\n1. 打开 APP → 团课预约\n2. 选择日期和课程类型\n3. 查看教练信息和剩余名额\n4. 点击"立即预约"\n\n🏫 **前台预约**：到门店前台由工作人员帮您预约\n📞 **电话预约**：拨打门店电话进行预约\n\n⏰ **预约规则**：\n- 最多提前 7 天预约\n- 课程开始前 2 小时可免费取消\n- 未到场且未取消，扣除 1 次预约机会\n- 每月爽约 3 次将限制预约权限 7 天', keywords:'["预约","团课","约课","报课","课程预约","上课预约","团操"]', category:'课程预约', priority:'high' },
  { id:'g10', question:'有哪些团课可以上？', answer:'我们提供丰富的团课类型：\n\n🔥 **燃脂类**：HIIT 燃脂、动感单车、搏击操、蹦床操\n🧘 **瑜伽类**：流瑜伽、阴瑜伽、空中瑜伽、热瑜伽\n💃 **舞蹈类**：尊巴、有氧舞蹈、街舞、爵士舞\n💪 **力量类**：杠铃操、核心训练、功能性训练\n🧠 **身心类**：普拉提、冥想放松、太极\n🏊 **水中类**：水中有氧、水下搏击（限有泳池门店）\n\n每周更新课表，可在 APP 查看完整时间安排。', keywords:'["课程","团课种类","有什么课","课表","瑜伽","单车","搏击","舞蹈","普拉提"]', category:'课程预约', priority:'high' },
  { id:'g11', question:'预约了课程去不了怎么办？', answer:'如果无法参加已预约的课程，请及时取消：\n\n✅ **免费取消**：课程开始前 2 小时以上可免费取消\n⚠️ **临时取消**：课程开始前 2 小时内取消，记为 1 次爽约\n❌ **未取消未到**：记为 1 次爽约\n\n**取消方式**：\n- APP → 我的预约 → 点击"取消预约"\n- 拨打门店前台电话取消\n\n⚠️ 每月爽约 3 次，将暂停预约权限 7 天。', keywords:'["取消预约","去不了","请假","旷课","爽约","不来","没去"]', category:'课程预约', priority:'high' },
  { id:'g12', question:'瑜伽课需要自己带垫子吗？', answer:'不需要自带！我们为您提供：\n\n🧘 **免费借用**：门店提供瑜伽垫、瑜伽砖、伸展带等辅具\n🚿 **免费使用**：更衣柜、淋浴间、吹风机\n🧴 **洗浴用品**：沐浴露、洗发水均有配备\n\n💡 **建议自备**：\n- 个人水壶（门店有饮水机）\n- 个人毛巾（也可租用，¥2/次）\n- 舒适的运动服装', keywords:'["瑜伽垫","垫子","自带","带什么","需要带","装备","器材","准备"]', category:'课程预约', priority:'normal' },
  { id:'g13', question:'如何购买私教课程？', answer:'购买私教课流程：\n\n1. **预约体验课**（免费）：先预约 1 节免费体测+体验课\n2. **制定训练方案**：教练根据体测结果定制个人训练计划\n3. **选择课包**：\n   - 单节体验：¥299/节\n   - 12节入门包：¥3,199（约¥266/节）\n   - 24节进阶包：¥5,799（约¥241/节）\n   - 48节蜕变包：¥10,399（约¥216/节）🔥 热卖\n4. **正式上课**：通过 APP 预约教练时间', keywords:'["私教","私教课","买私教","私人教练","PT","教练课","训练课"]', category:'私教相关', priority:'high' },
  { id:'g14', question:'私教课可以退款吗？', answer:'私教课退款政策如下：\n\n✅ **7天无理由退款**：购买后 7 天内未上课可全额退款\n📋 **正常退款**：\n- 已上课部分按单节原价扣除\n- 剩余部分按 90% 退款\n- 退款周期 5-10 个工作日\n\n❌ **不可退情况**：\n- 赠送的免费课程不可退\n- 促销活动购买的特价课包不支持退款\n\n📌 **办理方式**：到门店前台填写退款申请表，或联系 APP 在线客服。', keywords:'["退款","退私教","退钱","退课","退费","退掉"]', category:'私教相关', priority:'high' },
  { id:'g15', question:'私教课可以换教练吗？', answer:'可以更换教练！操作方式：\n\n📱 **APP 操作**：我的 → 私教管理 → 更换教练\n🏫 **前台办理**：到门店前台说明需求\n\n📌 **更换规则**：\n- 每个课包可免费更换 1 次教练\n- 第 2 次起每次收取 ¥50 手续费\n- 已预约但未上的课程可免费更换\n- 如果对教练不满意，可以联系店长协调\n\n我们会尽力为您匹配最合适的教练。', keywords:'["换教练","更换教练","不喜欢教练","换私教","换老师"]', category:'私教相关', priority:'normal' },
  { id:'g16', question:'如何预约私教课？', answer:'预约私教课很简单：\n\n📱 **APP 预约**（推荐）：\n1. 打开 APP → 私教预约\n2. 选择您的私教教练\n3. 查看教练的可预约时段\n4. 选择合适的时间并确认\n\n⚠️ **预约须知**：\n- 请至少提前 12 小时预约\n- 取消/改期需提前 6 小时\n- 临时取消（6小时内）扣除 1 节课时\n- 私教课有效期与课包绑定，请在有效期内使用完毕', keywords:'["预约私教","约私教","预约教练","上课时间","排课"]', category:'私教相关', priority:'normal' },
  { id:'g17', question:'新手第一次去健身房应该练什么？', answer:'欢迎来到健身的世界！新手入门建议：\n\n**第 1-2 周：适应期**\n- 每次训练 40-60 分钟\n- 以有氧运动为主（跑步机、椭圆机）\n- 熟悉器械使用方法\n\n**第 3-4 周：基础期**\n- 开始加入固定器械训练\n- 胸/背/腿/肩 分化训练\n- 每个部位 3-4 个动作，每组 12-15 次\n\n💡 **新手必读**：\n- 先做 5-10 分钟热身\n- 从轻重量开始，注重动作标准\n- 训练后拉伸 10 分钟\n- 建议预约 1 节免费私教体验课学习正确姿势', keywords:'["新手","入门","第一次","刚开始","怎么练","初学者","小白"]', category:'运动健身', priority:'high' },
  { id:'g18', question:'健身房有教练指导器械使用吗？', answer:'有的！我们为会员提供多种指导方式：\n\n🆓 **免费服务**：\n- 入会时提供 1 次免费器械使用培训（约 30 分钟）\n- 器械上贴有使用说明和动作示意图\n- 巡场教练会提供基础指导\n\n💰 **付费服务**：\n- 单次指导：¥199/小时\n- 私教课包（详见私教相关）\n- 专项训练营\n\n💡 遇到不会用的器械，随时可以询问穿工作服的巡场教练。', keywords:'["器械","指导","怎么用","不会用","教练教","使用方法"]', category:'运动健身', priority:'normal' },
  { id:'g19', question:'健身多久能看到效果？', answer:'健身效果因人而异，以下是参考时间线：\n\n📊 **常见时间线**：\n- **2-4 周**：感觉体力提升，睡眠质量改善\n- **4-8 周**：明显感觉肌肉紧实，体重可能有变化\n- **8-12 周**：体型开始有肉眼可见的变化\n- **3-6 个月**：显著减脂/增肌效果\n- **6-12 个月**：达到阶段性目标，需要调整计划\n\n⚡ **加速效果的秘诀**：\n- 每周至少训练 3-4 次\n- 饮食占 70%，训练占 30%\n- 保证充足睡眠（7-8 小时）\n- 坚持记录训练和饮食', keywords:'["效果","多久见效","变化","多久","减肥效果","增肌效果","见效"]', category:'运动健身', priority:'high' },
  { id:'g20', question:'健身房有体测服务吗？', answer:'提供专业的体测服务！\n\n📋 **体测项目**：\n- 身体成分分析（体脂率、骨骼肌量、BMI）\n- 基础代谢率测定\n- 体态评估\n- 柔韧性测试\n- 心肺功能测试（高级套餐）\n\n💰 **费用**：\n- 年卡会员：**免费** 1 次/年\n- 非会员/额外体测：¥99/次\n- 体测+私教方案定制：¥299/次\n\n📱 体测报告会同步到 APP，方便追踪身体变化。', keywords:'["体测","测试","身体成分","体脂","检测","评估","体质测试"]', category:'运动健身', priority:'normal' },
  { id:'g21', question:'健身房的营业时间是什么？', answer:'我们的营业时间如下：\n\n🕐 **标准营业时间**：\n- 周一至周五：6:00 - 23:00\n- 周六日及节假日：7:00 - 22:00\n\n🔑 **24 小时门店**（部分门店）：\n- 全天 24 小时开放\n- 22:00 后需刷会员码入场\n- 夜间有值班人员\n\n📍 具体营业时间请以 APP 中您所在门店信息为准。节假日期间可能有临时调整，请关注 APP 通知。', keywords:'["营业时间","几点开门","几点关门","开放时间","几点","什么时候","夜场"]', category:'场地设施', priority:'high' },
  { id:'g22', question:'健身房有哪些区域和设施？', answer:'我们门店配备完善的运动设施：\n\n💪 **有氧训练区**：跑步机、椭圆机、划船机、楼梯机、动感单车\n🏋️ **力量训练区**：固定器械区、自由力量区、史密斯机\n🧘 **瑜伽/操房**：专业木地板、镜面墙、音响系统\n🥊 **搏击区**：沙袋、擂台、拳套\n🏊 **泳池**（部分门店）：恒温泳池、儿童池\n🧖 **淋浴更衣区**：独立更衣柜、淋浴间、桑拿房\n☕ **休息区**：水吧、休息沙发、充电站\n\n具体设施以门店实际情况为准，可在 APP 查看您门店的设施介绍。', keywords:'["设施","区域","有什么","器械","场地","泳池","淋浴","更衣室"]', category:'场地设施', priority:'normal' },
  { id:'g23', question:'更衣柜怎么使用？', answer:'更衣柜使用说明：\n\n🔐 **使用方式**：\n- 日用柜：使用当天到场扫码/刷卡分配，当日闭店前取走物品\n- 长租柜：年卡会员可申请，¥50/月，专属使用\n\n📌 **注意事项**：\n- 营业结束后日用柜会自动清柜，遗留物品移至失物招领处\n- 请勿将贵重物品放入更衣柜（手机、钱包等建议带入场内）\n- 长租柜到期未续将保留 7 天，超期清柜\n- 如遇柜门故障请联系前台处理\n\n🔒 门店安装了监控系统，但贵重物品请随身携带。', keywords:'["更衣柜","柜子","储物柜","存放","放东西"]', category:'场地设施', priority:'normal' },
  { id:'g24', question:'健身房有停车场吗？', answer:'停车信息如下：\n\n🅿️ **停车方案**：\n- **地下停车场**：部分门店配备，前 2 小时免费\n- **合作停车场**：门店周边合作停车场，会员享折扣\n- **共享车位**：通过 APP 查看附近可用停车位\n\n💰 **费用**：\n- 年卡会员：每日免费停车 3 小时\n- 月卡会员：每日免费停车 2 小时\n- 超出部分按停车场标准收费\n\n📱 在 APP → 我的门店 → 便民信息 中可查看具体停车指引。', keywords:'["停车","停车场","车位","停车费","开车","怎么去","交通"]', category:'场地设施', priority:'normal' },
  { id:'g25', question:'健身房提供饮水和毛巾吗？', answer:'当然提供！\n\n💧 **饮水服务**：\n- 各楼层设有直饮水机（冷/热水）\n- APP 水吧可购买运动饮料、蛋白粉冲剂\n- 建议自带水壶，环保又方便\n\n🧴 **毛巾服务**：\n- 免费提供一次性纸巾\n- 运动毛巾租用：¥2/次\n- 也可以自带毛巾\n\n🚿 **淋浴用品**：\n- 免费提供沐浴露、洗发水\n- 吹风机免费使用\n- 护肤品需自带', keywords:'["饮水","水","毛巾","沐浴","洗浴","吹风机","补给","水吧"]', category:'场地设施', priority:'normal' },
  { id:'g26', question:'健身卡可以退款吗？', answer:'健身卡退款政策如下：\n\n✅ **可退情况**：\n- 购买后 7 天内（未使用）：**全额退款**\n- 购买 7 天后：按剩余天数计算退款\n\n📋 **退款计算**：\n- 退款金额 = 剩余天数 × (实付金额 ÷ 总天数) × 80%\n- 扣除 20% 手续费\n- 退款周期 5-15 个工作日，原路退回\n\n❌ **不退情况**：\n- 赠送时长不参与退款计算\n- 促销卡/特价卡不支持退款\n\n📌 **办理**：携带本人身份证和付款凭证到前台申请。', keywords:'["退款","退卡","退钱","退费","退健身卡","注销","不练了"]', category:'缴费退费', priority:'high' },
  { id:'g27', question:'支持哪些付款方式？', answer:'我们支持多种付款方式：\n\n💳 **线上支付**（APP/小程序）：\n- 微信支付\n- 支付宝\n- 银联云闪付\n\n💰 **线下支付**（前台）：\n- 微信/支付宝扫码\n- 银行卡刷卡\n- 现金支付\n- 银行转账（¥5000 以上）\n\n📋 **分期付款**（年卡）：\n- 支持花呗 3/6/12 期免息\n- 支持信用卡分期\n\n如需开具发票，请在付款后 30 天内到前台或通过 APP 申请。', keywords:'["付款","支付","怎么付","刷卡","微信","支付宝","缴费","发票"]', category:'缴费退费', priority:'normal' },
  { id:'g28', question:'有体验课或免费试练吗？', answer:'有！我们提供多种免费体验方式：\n\n🆓 **新客体验**：\n- 免费体验 1 天（含团课）\n- 免费体测 1 次\n- 免费私教体验课 1 节\n\n🎫 **获取方式**：\n- APP 注册后自动发放体验券\n- 老会员推荐链接领取\n- 关注公众号回复"体验"获取\n- 门店前台领取\n\n⏰ 体验券有效期 30 天，请在有效期内使用。每人限体验 1 次。', keywords:'["体验","免费","试练","试用","体验券","免费体验","参观"]', category:'缴费退费', priority:'high' },
  { id:'g29', question:'APP 怎么下载和注册？', answer:'下载和注册非常简单：\n\n📱 **下载方式**：\n- App Store / 各大安卓应用商店搜索"健身房名称"下载\n- 微信小程序搜索"健身房名称"直接使用\n- 扫描门店前台二维码下载\n\n📝 **注册流程**：\n1. 打开 APP → 点击"注册"\n2. 输入手机号 → 获取验证码\n3. 设置密码 → 完善个人信息\n4. 绑定会员卡（已有卡）或直接体验\n\n💡 注册即送新人大礼包：3 天体验卡 + 免费体测券。', keywords:'["下载","APP","安装","注册","小程序","手机应用"]', category:'APP使用', priority:'high' },
  { id:'g30', question:'忘记APP登录密码怎么办？', answer:'密码找回方法：\n\n📱 **手机验证码登录**（推荐）：\n1. 登录页点击"验证码登录"\n2. 输入注册手机号\n3. 获取并输入短信验证码\n4. 直接登录\n\n🔑 **重置密码**：\n1. 登录页点击"忘记密码"\n2. 输入注册手机号\n3. 通过短信验证身份\n4. 设置新密码（需 8-20 位，含字母和数字）\n\n⚠️ 如果手机号已更换，请联系前台提供身份信息进行人工验证。', keywords:'["密码","忘记密码","登录不了","密码找回","重置密码","账号"]', category:'APP使用', priority:'high' },
  { id:'g31', question:'APP 上有哪些功能？', answer:'APP 功能丰富，满足您的健身需求：\n\n📅 **课程预约**：团课预约、私教预约、取消改期\n📊 **训练记录**：运动数据追踪、训练日志、成就徽章\n💪 **训练计划**：AI 定制训练计划、动作教学视频\n🎯 **身体数据**：体测报告、体重趋势、体脂变化\n🏆 **运动社区**：打卡分享、健身排行、好友互动\n📍 **门店信息**：营业时间、场地导航、实时人流\n💳 **在线消费**：续费、购课、商城购物\n🔔 **消息通知**：课程提醒、活动推送、优惠信息\n\n持续更新中，欢迎体验！', keywords:'["功能","APP功能","能做什么","有什么功能","特色功能"]', category:'APP使用', priority:'normal' },
  { id:'g32', question:'如何查看训练记录和数据？', answer:'查看训练数据方式：\n\n📱 **APP 查看**：\n1. 打开 APP → "我的" → "训练记录"\n2. 可查看：运动时长、消耗卡路里、训练频次\n3. 支持按日/周/月切换查看趋势图\n\n📊 **数据同步**：\n- 支持绑定 Apple Health / 华为运动\n- 支持连接智能手环/手表（小米手环、华为手环等）\n- 连接后运动数据自动同步\n\n🎯 **体测数据**：\n- 我的 → 体测报告，查看历史体测对比\n- 体脂、肌肉量等指标变化趋势一目了然', keywords:'["训练记录","数据","运动记录","卡路里","统计","历史","运动数据"]', category:'APP使用', priority:'normal' },
  { id:'g33', question:'APP 支持连接智能手环吗？', answer:'支持多种智能设备连接！\n\n⌚ **支持设备**：\n- Apple Watch\n- 华为手环/手表\n- 小米手环\n- OPPO 手环\n- Keep 手环\n\n🔗 **连接方式**：\n1. APP → 我的 → 设备管理\n2. 选择设备品牌并按提示绑定\n3. 允许数据同步权限\n\n📊 **同步内容**：\n- 心率数据\n- 步数\n- 睡眠数据\n- 运动时长和卡路里\n\n数据实时同步，帮您更全面地了解运动状态。', keywords:'["手环","手表","智能设备","连接","绑定","Apple Watch","同步","小米手环"]', category:'APP使用', priority:'normal' },
  { id:'g34', question:'如何联系客服或投诉？', answer:'我们重视每一位会员的反馈：\n\n📞 **客服热线**：400-XXX-XXXX（9:00-21:00）\n💬 **APP 在线客服**：APP → 我的 → 在线客服（响应最快）\n📧 **邮箱**：service@example.com\n🏫 **门店反馈**：直接找店长或前台反映\n📝 **意见箱**：各楼层设有意见箱\n\n🐛 **投诉处理**：\n- 一般问题：24 小时内回复\n- 投诉建议：48 小时内给出处理方案\n- 紧急问题：立即处理\n\n您的满意是我们最大的追求，任何问题都欢迎反馈！', keywords:'["客服","投诉","联系","反馈","意见","电话","人工客服","店长"]', category:'APP使用', priority:'high' },
  { id:'g35', question:'健身房有年龄限制吗？', answer:'有相关年龄规定：\n\n👤 **成人**：18 周岁以上可独立办理会员卡\n🧑 **青少年**：16-18 周岁需监护人签署知情同意书\n👨‍👩‍👧 **儿童**：\n- 12 岁以下不允许进入器械区\n- 部分门店设有儿童运动区（需家长陪同）\n- 游泳池儿童需穿防水纸尿裤（3 岁以下）\n\n👴 **老年会员**：60 周岁以上需提供健康证明，建议在教练指导下运动\n\n📌 所有会员首次入会建议完成健康问卷，有心脏病、高血压等情况请提前告知。', keywords:'["年龄","限制","小孩","儿童","老人","未成年","多大","几岁"]', category:'其他', priority:'normal' },
  { id:'g36', question:'健身受伤了怎么办？', answer:'如在健身过程中感到不适或受伤：\n\n🚨 **紧急处理**：\n1. 立即停止运动\n2. 通知附近的工作人员或巡场教练\n3. 门店配备急救箱，工作人员会第一时间协助\n4. 严重情况立即拨打 120\n\n🏥 **医疗保障**：\n- 年卡会员含基础意外险（保额详见保险条款）\n- 如需就医请保留好相关票据\n\n📋 **后续处理**：\n- 在 APP 或前台登记事故记录\n- 联系客服提交保险理赔材料\n- 如因器械故障导致受伤，门店承担相应责任\n\n⚠️ **预防建议**：充分热身、循序渐进、动作规范、不适即停。', keywords:'["受伤","意外","扭伤","拉伤","急救","保险","安全"]', category:'其他', priority:'normal' },
  { id:'g37', question:'健身房有WiFi吗？', answer:'有的！免费 WiFi 覆盖全场：\n\n📶 **WiFi 信息**：\n- 网络名称：XXX-Fitness-Free\n- 连接方式：打开手机 WiFi → 选择网络 → 自动跳转认证页\n- 输入手机号和会员验证码即可连接\n\n📱 **网络服务**：\n- 全场覆盖，信号稳定\n- 适合看视频教程、听音乐\n- 建议运动时使用耳机，避免打扰他人\n\n🔒 请勿在更衣室等私密区域使用摄像头功能。', keywords:'["WiFi","无线网","网络","上网","wifi"]', category:'其他', priority:'normal' },
  { id:'g38', question:'可以带自己的训练装备来吗？', answer:'欢迎自带装备！但请注意以下规定：\n\n✅ **允许自带**：\n- 水壶/运动水杯\n- 毛巾\n- 护腕/护膝/腰带等护具\n- 阻力带/跳绳等小器械\n- 运动手套\n- 耳机\n\n❌ **禁止使用**：\n- 自带的杠铃片/哑铃（避免与门店器械混淆）\n- 碎纸粉（镁粉）（部分器械区禁止使用）\n- 占用过多公共空间的装备\n\n💡 建议使用门店提供的器械，种类齐全且定期维护。', keywords:'["自带","装备","带器械","护具","腰带","手套","带什么"]', category:'其他', priority:'normal' }
];

// ========== API 路由 ==========

// 获取所有知识库条目
app.get('/api/qa', (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT * FROM qa';
  let conditions = [];
  let params = [];

  if (category && category !== '全部') {
    conditions.push('category = ?');
    params.push(category);
  }
  if (search) {
    conditions.push('(question LIKE ? OR answer LIKE ? OR keywords LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY priority DESC, hit_count DESC, updated_at DESC';

  const items = getAll(sql, params);
  res.json({ success: true, data: items, total: items.length });
});

// 获取单个条目
app.get('/api/qa/:id', (req, res) => {
  const item = getOne('SELECT * FROM qa WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ success: false, message: '未找到该条目' });
  res.json({ success: true, data: item });
});

// 新增条目
app.post('/api/qa', (req, res) => {
  const { question, answer, keywords, category, priority } = req.body;
  if (!question || !answer) {
    return res.status(400).json({ success: false, message: '问题和答案不能为空' });
  }
  const id = 'qa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  const kw = typeof keywords === 'string' ? keywords : JSON.stringify(keywords || []);
  db.run(
    `INSERT INTO qa (id, question, answer, keywords, category, priority) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, question, answer, kw, category || '其他', priority || 'normal']
  );
  saveDB();
  const item = getOne('SELECT * FROM qa WHERE id = ?', [id]);
  res.json({ success: true, data: item, message: '添加成功' });
});

// 更新条目
app.put('/api/qa/:id', (req, res) => {
  const { question, answer, keywords, category, priority } = req.body;
  const existing = getOne('SELECT * FROM qa WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ success: false, message: '未找到该条目' });

  const kw = keywords !== undefined ? (typeof keywords === 'string' ? keywords : JSON.stringify(keywords)) : existing.keywords;
  db.run(
    `UPDATE qa SET question = ?, answer = ?, keywords = ?, category = ?, priority = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
    [question || existing.question, answer || existing.answer, kw, category || existing.category, priority || existing.priority, req.params.id]
  );
  saveDB();
  const item = getOne('SELECT * FROM qa WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: item, message: '更新成功' });
});

// 删除条目
app.delete('/api/qa/:id', (req, res) => {
  const existing = getOne('SELECT * FROM qa WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ success: false, message: '未找到该条目' });
  db.run('DELETE FROM qa WHERE id = ?', [req.params.id]);
  saveDB();
  res.json({ success: true, message: '删除成功' });
});

// 批量导入
app.post('/api/qa/import', (req, res) => {
  const items = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ success: false, message: '数据格式错误' });

  let added = 0;
  for (const item of items) {
    if (!item.id) item.id = 'qa_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    item.keywords = typeof item.keywords === 'string' ? item.keywords : JSON.stringify(item.keywords || []);
    item.category = item.category || '其他';
    item.priority = item.priority || 'normal';
    try {
      db.run(
        `INSERT OR IGNORE INTO qa (id, question, answer, keywords, category, priority) VALUES (?, ?, ?, ?, ?, ?)`,
        [item.id, item.question, item.answer, item.keywords, item.category, item.priority]
      );
      added++;
    } catch (e) { /* skip duplicates */ }
  }
  saveDB();
  const total = getOne('SELECT COUNT(*) as cnt FROM qa').cnt;
  res.json({ success: true, message: `成功导入 ${added} 条，当前共 ${total} 条` });
});

// 智能问答匹配
app.post('/api/match', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ success: false, message: '请输入问题' });

  const allItems = getAll('SELECT * FROM qa');
  const queryLower = query.toLowerCase();

  let allScores = [];
  for (const item of allItems) {
    let score = 0;
    const qText = item.question.toLowerCase();
    const aText = item.answer.toLowerCase();
    const keywords = JSON.parse(item.keywords || '[]');

    // 精确匹配
    if (queryLower === qText) score += 100;
    else if (qText.includes(queryLower) || queryLower.includes(qText)) score += 60;

    // 关键词匹配
    for (const kw of keywords) {
      const kwL = kw.toLowerCase();
      if (queryLower.includes(kwL)) {
        score += 30 + kwL.length * 2;
      }
    }

    // 答案关键词
    const aWords = aText.split(/[\s,，。、：:；;]+/).filter(w => w.length >= 2);
    for (const word of aWords) {
      if (queryLower.includes(word) && word.length >= 2) score += 5;
    }

    if (item.priority === 'high') score += 5;
    allScores.push({ item, score });
  }

  allScores.sort((a, b) => b.score - a.score);
  const best = allScores[0];
  const related = allScores.filter(s => s.item.id !== best?.id && s.score > 10).slice(0, 3).map(s => s.item);

  if (best && best.score > 15) {
    db.run('UPDATE qa SET hit_count = hit_count + 1 WHERE id = ?', [best.item.id]);
    saveDB();
    res.json({
      success: true,
      answer: best.item.answer,
      question: best.item.question,
      related,
      score: best.score
    });
  } else {
    res.json({
      success: true,
      answer: '抱歉，我暂时没有找到匹配的答案。您可以尝试换一种描述方式，或联系人工客服获取帮助。',
      related: allScores.filter(s => s.score > 5).slice(0, 2).map(s => s.item),
      score: 0
    });
  }
});

// 统计信息
app.get('/api/stats', (req, res) => {
  const total = getOne('SELECT COUNT(*) as cnt FROM qa').cnt;
  const hitsRow = getOne('SELECT COALESCE(SUM(hit_count), 0) as total_hits FROM qa');
  const categories = getAll('SELECT category, COUNT(*) as cnt FROM qa GROUP BY category ORDER BY cnt DESC');
  res.json({ success: true, data: { total, hits: hitsRow.total_hits, categories } });
});

// 导出所有数据
app.get('/api/qa/export', (req, res) => {
  const items = getAll('SELECT * FROM qa ORDER BY category, id');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="knowledge_base_${new Date().toISOString().slice(0,10)}.json"`);
  res.json(items);
});

// 根路由 → 返回前端页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'customer-service-ai.html'));
});

// 静态文件服务
app.use(express.static(path.join(__dirname, '..', 'public')));

// ========== 启动 ==========
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 健身房客服知识库服务已启动`);
    console.log(`📍 地址: http://localhost:${PORT}`);
    console.log(`📚 API: http://localhost:${PORT}/api/qa`);
    console.log(`🌍 模式: ${isProduction ? '生产环境（内存数据库）' : '开发环境（文件持久化）'}`);
    console.log(`💾 数据库: ${isProduction ? '内存' : DB_FILE}`);
  });
}).catch(err => {
  console.error('❌ 数据库初始化失败:', err);
  process.exit(1);
});

// 进程退出时保存数据库
process.on('SIGINT', () => { saveDB(); process.exit(0); });
process.on('SIGTERM', () => { saveDB(); process.exit(0); });
