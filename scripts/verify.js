// 仅在验收脚本中使用样例断言。浏览器和整理接口均不导入本文件。
import { createServer } from 'node:http'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import organize from '../api/organize.js'

const example = new URL('../fixtures/meeting.txt', import.meta.url)
const pendingLaunch = '有人建议 4 月 18 日正式上线。上线日期今天没有定，等技术组给出容量评估后再确认。'
const confirmedLaunch = '技术组已完成容量评估。今天最终确定，深圳门店将于 5 月 12 日正式上线。'
const unknown = '待确认'
const sections = ['summary', 'confirmed_decisions', 'action_items', 'open_questions']
const fields = {
  confirmed_decisions: ['item', 'evidence'],
  action_items: ['task', 'owner', 'deadline', 'note', 'evidence'],
  open_questions: ['question', 'owner_or_party', 'evidence'],
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function keysMatch(record, keys) {
  return record && typeof record === 'object' && !Array.isArray(record)
    && Object.keys(record).length === keys.length && keys.every(key => Object.hasOwn(record, key))
}

function checkStructure(output, transcript) {
  expect(keysMatch(output, sections), '顶层字段与协议不符')
  expect(typeof output.summary === 'string' && output.summary.trim(), '摘要为空或格式不正确')
  expect([...output.summary].length <= 150, '摘要超过 150 字')
  for (const [section, keys] of Object.entries(fields)) {
    expect(Array.isArray(output[section]), section + ' 应为数组')
    for (const [i, row] of output[section].entries()) {
      const label = section + '[' + i + ']'
      expect(keysMatch(row, keys), label + ' 字段与协议不符')
      for (const key of keys) {
        expect(typeof row[key] === 'string' && (key === 'note' || row[key].trim()), label + '.' + key + ' 缺失或类型有误')
      }
      expect(transcript.includes(row.evidence), label + ' 的引文无法在本轮原文中定位')
    }
  }
}

// 日期可保留原文，也可由模型转成短横线、斜杠等常见月日格式。
function dateMatches(value, month, day) {
  const date = new RegExp('(?:^|[^0-9])0?' + month + '(?:月|[-/.])0?' + day + '(?:[^0-9]|$)')
  return date.test(value.replaceAll(/\s/g, ''))
}

function checkSemantics(result, variant) {
  const decisions = result.confirmed_decisions.map(row => row.item)
  const actions = result.action_items
  const questions = result.open_questions
  const launch = /上线|发布日|投产日/
  const cityScope = result.confirmed_decisions.some(({ item, evidence }) =>
    /深圳/.test(item) && /试点|试行/.test(item) && /深圳/.test(evidence) && /只在|拍板/.test(evidence))
  expect(cityScope, '漏掉最终确认的深圳试点范围')
  expect(!decisions.some(item => /预算|财务|采购|展示屏|评审会/.test(item)), '待审批的预算、采购或评审会混入决定')
  const nationalApproval = /(?:决定|批准|确认|同意|启动|将|进行)(?:在|向)?全国(?:门店)?(?:全面)?(?:铺开|试点|推广|实施)/
  expect(!decisions.some(item => nationalApproval.test(item) && !/不(?:同意|批准|进行|在全国)|否决|拒绝|不采纳/.test(item)), '被否决的全国铺开方案混入决定')

  const launchDecisions = decisions.filter(item => launch.test(item))
  if (variant) {
    const approved = result.confirmed_decisions.some(({ item, evidence }) => launch.test(item)
      && dateMatches(item, 5, 12) && dateMatches(evidence, 5, 12) && !/未定|未确定|待确认|拟定|建议/.test(item))
    expect(approved, '改写后的 5 月 12 日上线决定或其拍板依据缺失')
    expect(!questions.some(row => launch.test(row.question)), '已拍板的上线安排仍被列作待确认')
  } else {
    expect(launchDecisions.length === 0, '尚未确定的上线日混入决定')
    expect(questions.some(row => launch.test(row.question)), '漏掉待确认的上线日期')
  }

  const owner = variant ? '林妍' : '王敏'
  const storeTasks = actions.filter(row => /门店/.test(row.task) && /对接|联系|沟通|联络|协调/.test(row.task))
  expect(storeTasks.length > 0 && storeTasks.every(row => row.owner === owner), '联系门店应全部由' + owner + '负责')
  const correctDate = value => dateMatches(value, variant ? 5 : 4, variant ? 9 : 15)
  expect(storeTasks.every(row => correctDate(row.deadline)), '门店对接期限没有跟随当前原文')
  expect(storeTasks.every(row => row.evidence.includes(owner)), '联系门店的依据没有指向最终负责人')
  const drafts = actions.filter(row => /说明|文案/.test(row.task) && /草稿|初稿|起草|草拟|拟稿/.test(row.task + row.note))
  expect(drafts.length > 0 && drafts.every(row => row.owner === '陈浩' && row.deadline === unknown), '陈浩的说明草稿缺失、被改派或被借用了截止日期')
  expect(actions.filter(row => row.owner === '陈浩').every(row => row.deadline === unknown), '陈浩名下误填其他任务的期限')
  expect(drafts.some(row => /审|批/.test(row.note) && /对外|发布|外发|公开|外用/.test(row.note)
    && /不可|不得|不能|禁止|须|需|通过后|仅|方可|暂不|勿|不对外|不能外发|才可|才能|审核后/.test(row.note)), '说明草稿的审核及对外使用限制没有保留在备注中')
  const feedback = actions.filter(row => /反馈/.test(row.task) && /清单|列表|整理|汇总/.test(row.task))
  expect(feedback.length > 0 && feedback.every(row => row.owner === unknown && row.deadline === unknown), '反馈清单需要保留，负责人及期限均应为待确认')

  for (const [topic, involved, label] of [
    [/预算|推广费/, /财务/, '推广预算'],
    [/采购|展示屏/, /采购/, '展示屏采购'],
    [/评审/, /产品|运营/, '评审会日期'],
  ]) {
    expect(questions.some(row => topic.test(row.question) && involved.test(row.owner_or_party)), label + ' 或其涉及方缺失')
  }
  expect(questions.some(row => /匿名/.test(row.question) && row.owner_or_party === unknown), '反馈表是否匿名及其未知涉及方缺失')
}

function makeVariant(text) {
  for (const anchor of ['王敏', '4 月 15 日', pendingLaunch]) {
    expect(text.includes(anchor), '验收样例已变动，请同步修改替换锚点：' + anchor)
  }
  return text.replaceAll('王敏', '林妍').replaceAll('4 月 15 日', '5 月 9 日').replace(pendingLaunch, confirmedLaunch)
}

async function submit(url, transcript) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: transcript }),
    signal: AbortSignal.timeout(180_000),
  })
  const output = await response.json()
  expect(response.ok, 'HTTP ' + response.status + ' · ' + (output.error?.message || '接口请求失败'))
  return output
}

async function verify() {
  expect(process.env.LLM_API_KEY?.trim(), '请先在项目 .env 中填写 LLM_API_KEY，再运行 npm run verify。')
  const source = await readFile(example, 'utf8')
  const runs = [
    { label: '原始纪要', transcript: source, variant: false },
    { label: '修改负责人、期限和上线结论', transcript: makeVariant(source), variant: true },
  ]
  const server = createServer((request, response) => {
    if (request.url === '/api/organize') {
      organize(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: '接口执行异常' } }))
      })
      return
    }
    response.writeHead(404).end()
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = 'http://127.0.0.1:' + server.address().port + '/api/organize'
  try {
    for (const run of runs) {
      console.log('正在验收 · ' + run.label)
      const output = await submit(url, run.transcript)
      try {
        checkStructure(output, run.transcript)
        checkSemantics(output, run.variant)
        console.log('通过 · 摘要 ' + [...output.summary].length + ' 字，决定 ' + output.confirmed_decisions.length
          + ' 项，待办 ' + output.action_items.length + ' 项，待确认 ' + output.open_questions.length + ' 项')
      } catch (error) {
        process.exitCode = 1
        console.error('未通过 · ' + error.message)
        // 样例是仓库内的虚构文本，保留实际结果，便于人工复核同义表达。
        console.error(JSON.stringify(output, null, 2))
      }
    }
  } finally {
    server.close()
    server.closeAllConnections()
  }
}

verify().catch(error => {
  console.error('验收中止 · ' + error.message)
  process.exitCode = 1
})
