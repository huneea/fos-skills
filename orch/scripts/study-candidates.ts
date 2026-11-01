// 공부 후보 파일(<orch 루트>/study/candidates.md)에 후보를 더하고 상태를 바꾼다.
//
// 후보 목록은 Markdown 표라 칸 안의 `|` 나 줄바꿈 하나로 표가 깨진다. 이 명령은 표의 행만 고치고 파일 머리의 글은 그대로 둔다.
// 파일 형식과 상태 전이는 lib/study.ts 머리 주석이, 적는 시점과 다시 보는 기준은 references/study-candidates.md 가 소유한다.
//
// 사용법:
//     study-candidates.ts list [--open] [--repo DIR]
//     study-candidates.ts add --topic 주제 --question 질문 --origin 생긴곳 [--ref 참고] [--repo DIR]
//     study-candidates.ts set --row N --status 상태 --note 메모 [--repo DIR]
//
//     list      한 줄에 후보 하나를 `<번호>\t<상태 칸>\t<주제>` 로 낸다. --open 이면 후보와 리뷰함만 낸다
//     add       표 끝에 상태 `후보` 로 한 줄 더한다. 파일이나 표가 없으면 만든다. 같은 주제가 있으면 더하지 않는다
//     set       번호의 상태를 바꾼다. --status 는 리뷰함, 뺌, 글 씀 가운데 하나이고 --note 는 이유나 글 경로다
//     --repo    orch 루트를 찾을 저장소. 기본은 작업 디렉터리. 루트는 lib/paths.ts 의 orchDir 이 정한다
//
// 출력:
//     ADDED <번호> <파일>      add 가 더했다
//     SET <번호> <상태 칸>     set 이 바꿨다
//
// 종료 코드:
//     0  했다
//     1  하지 않았다. 같은 주제가 있다, 번호가 없다, 바꿀 수 없는 상태다, 파일이나 표가 없다(list, set)
//     2  사용법 오류
//
// 옵션은 고유 접두로 줄여 쓸 수 있다(lib/args.ts).

import { existsSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { expandArgs } from './lib/args.ts'
import { ensure, pathOf } from './lib/paths.ts'
import { COLUMNS, FILE_NAME, NEW_FILE_HEAD, NEXT, OPEN, STATUSES, type Status, type Table, cell, parse, read, renderRow, unescape } from './lib/study.ts'

const USAGE = [
  '사용법: study-candidates.ts list [--open] [--repo DIR]',
  '        study-candidates.ts add --topic 주제 --question 질문 --origin 생긴곳 [--ref 참고] [--repo DIR]',
  '        study-candidates.ts set --row N --status 상태 --note 메모 [--repo DIR]',
].join('\n')

const OPTIONS = {
  open: { type: 'boolean' },
  topic: { type: 'string' },
  question: { type: 'string' },
  origin: { type: 'string' },
  ref: { type: 'string' },
  row: { type: 'string' },
  status: { type: 'string' },
  note: { type: 'string' },
  repo: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const

class Usage extends Error {}
class Refused extends Error {}

function save(file: string, lines: string[]): void {
  const tmp = `${file}.tmp-${process.pid}`
  writeFileSync(tmp, lines.join('\n'))
  renameSync(tmp, file)
}

function need(value: string | undefined, name: string): string {
  if (value === undefined || value.trim() === '') throw new Usage(`--${name} 를 준다`)
  return value
}

function load(file: string): Table {
  if (!existsSync(file)) throw new Refused(`후보 파일이 없다: ${file}`)
  const table = read(file)
  if (table.head < 0) throw new Refused(`표 머리 \`${renderRow(COLUMNS)}\` 를 찾지 못했다: ${file}`)
  return table
}

function list(file: string, open: boolean): void {
  const table = load(file)
  for (const row of table.rows) {
    if (open && (row.status === null || !OPEN.has(row.status))) continue
    process.stdout.write(`${row.index}\t${unescape(row.cells[4] ?? '')}\t${unescape(row.cells[0] ?? '')}\n`)
  }
}

function add(file: string, repo: string, values: Record<string, string | boolean | undefined>): void {
  const cells = [
    cell(need(values.topic as string | undefined, 'topic')),
    cell(need(values.question as string | undefined, 'question')),
    cell(need(values.origin as string | undefined, 'origin')),
    cell((values.ref as string | undefined) ?? ''),
    '후보',
  ]
  let lines: string[]
  let at: number
  let index: number
  if (existsSync(file)) {
    const table = read(file)
    if (table.rows.some((row) => row.cells[0] === cells[0])) throw new Refused(`같은 주제가 이미 있다: ${unescape(cells[0])}`)
    lines = table.lines
    if (table.head < 0) {
      // 표가 없으면 끝에 만든다. 끝의 빈 줄은 하나만 남긴다
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
      lines.push('', renderRow(COLUMNS), renderRow(COLUMNS.map(() => '---')))
      at = lines.length
      lines.push('')
      index = 1
    } else {
      at = table.end + 1
      index = table.rows.length + 1
    }
  } else {
    ensure('study', repo)
    lines = [...NEW_FILE_HEAD, renderRow(COLUMNS), renderRow(COLUMNS.map(() => '---')), '']
    at = lines.length - 1
    index = 1
  }
  lines.splice(at, 0, renderRow(cells))
  save(file, lines)
  process.stdout.write(`ADDED ${index} ${file}\n`)
}

function set(file: string, values: Record<string, string | boolean | undefined>): void {
  const raw = need(values.row as string | undefined, 'row')
  if (!/^[1-9]\d*$/.test(raw)) throw new Usage(`--row 는 1 이상의 정수다: ${raw}`)
  const status = need(values.status as string | undefined, 'status')
  if (!(STATUSES as readonly string[]).includes(status) || status === '후보') throw new Usage(`--status 는 리뷰함, 뺌, 글 씀 가운데 하나다: ${status}`)
  const note = cell(need(values.note as string | undefined, 'note'))
  const table = load(file)
  const row = table.rows.find((r) => r.index === Number(raw))
  if (!row) throw new Refused(`${raw} 번 후보가 없다. list 로 번호를 본다`)
  if (row.status === null) throw new Refused(`${raw} 번의 상태를 모른다: ${row.cells[4] ?? ''}`)
  if (!NEXT[row.status].includes(status as Status)) {
    const allowed = NEXT[row.status].join(', ') || '없다'
    throw new Refused(`${raw} 번은 ${row.status} 에서 ${status} 로 바꿀 수 없다. 바꿀 수 있는 상태: ${allowed}`)
  }
  const cells = [...row.cells]
  while (cells.length < COLUMNS.length) cells.push('')
  cells[COLUMNS.length - 1] = `${status}: ${note}`
  table.lines[row.line] = renderRow(cells)
  save(file, table.lines)
  process.stdout.write(`SET ${row.index} ${unescape(cells[COLUMNS.length - 1])}\n`)
}

function main(argv: string[]): number {
  let parsed
  try {
    parsed = parseArgs({ args: expandArgs(argv, OPTIONS, ['topic', 'question', 'origin', 'ref', 'note']), options: OPTIONS, allowPositionals: true })
  } catch (e) {
    process.stderr.write(`${USAGE}\nstudy-candidates: ${(e as Error).message}\n`)
    return 2
  }
  const { values, positionals } = parsed
  if (values.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  const [command, ...rest] = positionals
  if (!['list', 'add', 'set'].includes(command ?? '') || rest.length > 0) {
    process.stderr.write(`${USAGE}\nstudy-candidates: 명령은 list, add, set 가운데 하나다\n`)
    return 2
  }
  const repo = values.repo ?? process.cwd()
  const file = join(pathOf('study', repo), FILE_NAME)
  try {
    if (command === 'list') list(file, values.open === true)
    else if (command === 'add') add(file, repo, values)
    else set(file, values)
  } catch (e) {
    if (e instanceof Usage) {
      process.stderr.write(`${USAGE}\nstudy-candidates: ${e.message}\n`)
      return 2
    }
    if (e instanceof Refused) {
      process.stderr.write(`study-candidates: ${e.message}\n`)
      return 1
    }
    throw e
  }
  return 0
}

process.exitCode = main(process.argv.slice(2))
