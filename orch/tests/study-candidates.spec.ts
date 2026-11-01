// study-candidates.ts 가 공부 후보 표의 행만 고치고, 상태 전이를 지키는지 본다. 임시 폴더(git 밖)를 저장소로 준다.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse, statusOf } from '../scripts/lib/study.ts'

const SCRIPT = fileURLToPath(new URL('../scripts/study-candidates.ts', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./fixtures/study/candidates.md', import.meta.url))

let repo: string
let file: string

beforeEach(() => {
  repo = realpathSync(mkdtempSync(join(tmpdir(), 'study-candidates-')))
  file = join(repo, '.orch', 'study', 'candidates.md')
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

function run(...args: string[]) {
  const env = { ...process.env }
  delete env.ORCH_DIR
  const done = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args, '--repo', repo], { encoding: 'utf8', env })
  return { code: done.status, stdout: done.stdout, stderr: done.stderr }
}

function seed(text: string): void {
  mkdirSync(join(repo, '.orch', 'study'), { recursive: true })
  writeFileSync(file, text)
}

describe('표 읽기', () => {
  test('칸 첫머리의 낱말이 상태다', () => {
    assert.equal(statusOf('후보'), '후보')
    assert.equal(statusOf('리뷰함: 다시 나온다'), '리뷰함')
    assert.equal(statusOf('글 씀: study/a.md'), '글 씀')
    assert.equal(statusOf('뺌 (이미 있다)'), '뺌')
    assert.equal(statusOf('후보군'), null)
    assert.equal(statusOf(''), null)
  })

  test('직접 만들어 쓰기 시작한 저장소의 파일을 읽는다', () => {
    const table = parse(readFileSync(FIXTURE, 'utf8'))
    assert.equal(table.rows.length, 8)
    assert.ok(table.rows.every((row) => row.cells.length === 5 && row.status === '후보'))
  })
})

describe('add', () => {
  test('파일이 없으면 머리와 표를 만들고 후보로 더한다. 칸의 | 와 줄바꿈은 표를 깨지 않는다', () => {
    const r = run('add', '--topic', 'a|b', '--question', '첫 줄\n둘째 줄', '--origin', '곳')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, `ADDED 1 ${file}\n`)
    const text = readFileSync(file, 'utf8')
    assert.match(text, /^# 공부 후보\n/)
    assert.match(text, /\| a\\\|b \| 첫 줄 둘째 줄 \| 곳 \|  \| 후보 \|\n$/)
    const listed = run('list')
    assert.equal(listed.stdout, '1\t후보\ta|b\n')
  })

  test('표 앞의 머리 글과 표 뒤의 글은 그대로 두고 표 끝에 더한다', () => {
    const before = readFileSync(FIXTURE, 'utf8')
    seed(`${before}\n뒤에 둔 메모\n`)
    const r = run('add', '--topic', '새 주제', '--question', '질문', '--origin', '곳', '--ref', '공식 문서')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, `ADDED 9 ${file}\n`)
    const after = readFileSync(file, 'utf8')
    assert.equal(after, `${before.trimEnd()}\n| 새 주제 | 질문 | 곳 | 공식 문서 | 후보 |\n\n뒤에 둔 메모\n`)
  })

  test('같은 주제가 있으면 더하지 않고 1 이다', () => {
    run('add', '--topic', 'a', '--question', 'q', '--origin', 'o')
    const r = run('add', '--topic', 'a', '--question', 'q2', '--origin', 'o2')
    assert.equal(r.code, 1, r.stdout)
    assert.match(r.stderr, /같은 주제가 이미 있다/)
    assert.equal(run('list').stdout, '1\t후보\ta\n')
  })

  test('파일은 있는데 표가 없으면 끝에 표를 만든다', () => {
    seed('# 공부 후보\n\n규칙 글\n\n')
    const r = run('add', '--topic', 'a', '--question', 'q', '--origin', 'o')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(
      readFileSync(file, 'utf8'),
      '# 공부 후보\n\n규칙 글\n\n| 주제 | 질문 | 생긴 곳 | 참고 | 상태 |\n| --- | --- | --- | --- | --- |\n| a | q | o |  | 후보 |\n',
    )
  })

  test('주제, 질문, 생긴 곳이 없으면 사용법 오류다', () => {
    const r = run('add', '--topic', 'a', '--question', 'q')
    assert.equal(r.code, 2)
    assert.match(r.stderr, /--origin 를 준다/)
  })
})

describe('set', () => {
  beforeEach(() => {
    run('add', '--topic', 'a', '--question', 'q', '--origin', 'o')
    run('add', '--topic', 'b', '--question', 'q', '--origin', 'o')
  })

  test('후보를 리뷰함으로, 리뷰함을 글 씀으로 바꾸고 다른 행은 그대로 둔다', () => {
    let r = run('set', '--row', '1', '--status', '리뷰함', '--note', '다음 일에서 다시 나온다')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout, 'SET 1 리뷰함: 다음 일에서 다시 나온다\n')
    r = run('set', '--row', '1', '--status', '글 씀', '--note', 'study/a.md')
    assert.equal(r.code, 0, r.stderr)
    assert.equal(run('list').stdout, '1\t글 씀: study/a.md\ta\n2\t후보\tb\n')
    assert.equal(run('list', '--open').stdout, '2\t후보\tb\n')
  })

  test('후보에서 바로 글 씀으로, 뺌에서 다른 상태로는 바꾸지 않고 1 이다', () => {
    let r = run('set', '--row', '1', '--status', '글 씀', '--note', 'x.md')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /후보 에서 글 씀 로 바꿀 수 없다. 바꿀 수 있는 상태: 리뷰함, 뺌/)
    run('set', '--row', '2', '--status', '뺌', '--note', '이미 글이 있다')
    r = run('set', '--row', '2', '--status', '리뷰함', '--note', 'x')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /바꿀 수 있는 상태: 없다/)
  })

  test('없는 번호는 1, 모르는 상태와 메모 없음은 사용법 오류다', () => {
    assert.equal(run('set', '--row', '9', '--status', '뺌', '--note', 'x').code, 1)
    assert.equal(run('set', '--row', '1', '--status', '후보', '--note', 'x').code, 2)
    assert.equal(run('set', '--row', '1', '--status', '뺌').code, 2)
    assert.equal(run('set', '--row', '0', '--status', '뺌', '--note', 'x').code, 2)
  })
})

describe('list', () => {
  test('파일이 없으면 1 이다', () => {
    const r = run('list')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /후보 파일이 없다/)
  })
})
