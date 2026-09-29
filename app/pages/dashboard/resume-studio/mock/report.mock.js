/**
 * 假数据只给报告页三种图（雷达 / 横向条形 / 仪表盘）使用，不要写入 t_job。
 * 后续由能力画像、岗位匹配等节替换成真数据。
 */

export const DIMENSION_NAMES = [
  '技术深度',
  '工程能力',
  '业务理解',
  '项目影响力',
  '协作沟通',
  '成长性',
];

export const mockReport = {
  resume: {
    fileName: 'sample-resume-frontend.pdf',
    uploadedAt: '2026-09-21 10:30:00',
    status: '已上传',
  },
  progressSteps: ['解析简历', '能力画像', '岗位匹配', '生成报告'],
  profile: {
    dimensions: [
      {
        name: '技术深度',
        score: 78,
        level: 'L4',
        rubricRef: 'rubric-tech-depth-L4',
        rubricExcerpt: '（占位）能在复杂业务场景下独立设计模块边界，并解释关键 trade-off。',
        evidence: '（占位）简历原文：负责前端架构拆分，主导 Vite 迁移与构建优化。',
      },
      {
        name: '工程能力',
        score: 82,
        level: 'L4',
        rubricRef: 'rubric-engineering-L4',
        rubricExcerpt: '（占位）具备完整工程化实践，含测试、CI 与可观测性意识。',
        evidence: '（占位）简历原文：搭建 lint / 单测流水线，落地错误监控与日志规范。',
      },
      {
        name: '业务理解',
        score: 71,
        level: 'L3',
        rubricRef: 'rubric-business-L3',
        rubricExcerpt: '（占位）能把需求翻译为可交付方案，并识别主要风险点。',
        evidence: '（占位）简历原文：参与电商促销链路改造，输出 PRD 评审与排期建议。',
      },
      {
        name: '项目影响力',
        score: 69,
        level: 'L3',
        rubricRef: 'rubric-impact-L3',
        rubricExcerpt: '（占位）在团队内推动过可复用的技术方案或规范。',
        evidence: '（占位）简历原文：沉淀组件库规范，被 3 个业务线复用。',
      },
      {
        name: '协作沟通',
        score: 75,
        level: 'L4',
        rubricRef: 'rubric-collaboration-L4',
        rubricExcerpt: '（占位）跨角色沟通顺畅，能推动问题闭环。',
        evidence: '（占位）简历原文：协调前后端与测试联调，按期交付 2 个版本迭代。',
      },
      {
        name: '成长性',
        score: 80,
        level: 'L4',
        rubricRef: 'rubric-growth-L4',
        rubricExcerpt: '（占位）持续学习新技术并能快速应用到项目中。',
        evidence: '（占位）简历原文：自学 Agent / RAG 并完成内部 demo 验证。',
      },
    ],
    strengths: [
      '工程化与前端架构经验突出，适合中后台与平台型岗位。',
      '沟通协作稳定，具备跨团队推进落地的案例。',
    ],
    weaknesses: [
      '业务理解仍偏执行层，缺少独立负责整条业务线的描述。',
      '项目影响力案例规模偏小，缺少量化结果。',
    ],
    skills: [
      { name: 'TypeScript', count: 8 },
      { name: 'Vue3', count: 7 },
      { name: 'Node.js', count: 6 },
      { name: 'Vite', count: 5 },
      { name: 'MySQL', count: 4 },
      { name: 'ECharts', count: 3 },
      { name: 'Agent', count: 2 },
      { name: 'RAG', count: 2 },
    ],
  },
  match: {
    jobs: [
      { id: 'job-01', title: '高级前端工程师', company: '星河科技', score: 86 },
      { id: 'job-02', title: '全栈工程师', company: '云帆网络', score: 82 },
      { id: 'job-03', title: '前端架构师', company: '北辰互动', score: 79 },
      { id: 'job-04', title: 'Web 平台工程师', company: '启明数据', score: 76 },
      { id: 'job-05', title: '中后台前端', company: '蓝海电商', score: 74 },
      { id: 'job-06', title: '前端技术专家', company: '光合智能', score: 72 },
      { id: 'job-07', title: 'Node 后端工程师', company: '微澜 SaaS', score: 68 },
      { id: 'job-08', title: 'AI 应用工程师', company: '智行 Lab', score: 65 },
      { id: 'job-09', title: '小程序工程师', company: '快购科技', score: 62 },
      { id: 'job-10', title: '初级前端', company: '初创团队', score: 58 },
    ],
    selectedJobId: 'job-01',
    compositeScore: 86,
    gaps: [
      {
        requirement: '3 年以上 Web 开发经验',
        verdict: '命中',
        evidence: '（占位）简历写明 4 年前端经验。',
      },
      {
        requirement: '熟悉 Vue3 与 TypeScript',
        verdict: '命中',
        evidence: '（占位）技能栈与项目描述多次出现 Vue3 / TS。',
      },
      {
        requirement: '有中大型项目架构经验',
        verdict: '部分命中',
        evidence: '（占位）有架构迁移案例，但缺少团队规模与 QPS 等指标。',
      },
      {
        requirement: '具备带教或技术分享经验',
        verdict: '未命中',
        evidence: '（占位）简历未提及正式带教或对外分享。',
      },
    ],
  },
};
