// 공부 후보 파일(<orch 루트>/study/candidates.md)의 표를 읽고 고친다. 절차와 상태의 뜻은 references/study-candidates.md 가 소유한다.
//
// 파일 형식:
//     표 머리가 정확히 `| 주제 | 질문 | 생긴 곳 | 참고 | 상태 |` 인 첫 표가 후보 목록이다. 칸 앞뒤 빈칸은 보지 않는다.
//     머리 다음 줄은 구분 줄이고, 그 뒤로 `|` 로 시작하는 줄이 이어지는 동안 한 줄이 후보 하나다.
//     표 앞뒤의 글(파일 머리의 규칙 같은 것)은 읽지 않고 고칠 때도 그대로 둔다.
//     칸 안의 `|` 는 `\|` 로 쓴다. 칸을 나누는 것은 앞에 `\` 가 없는 `|` 다.
//
// 상태 칸:
//     `후보`, `리뷰함: <이유>`, `뺌: <이유>`, `글 씀: <글 경로>` 가운데 하나다. 칸 첫머리의 낱말이 상태이고 `:` 뒤가 메모다.
//     첫머리가 네 낱말 가운데 어느 것도 아니면 상태를 모르는 줄이라 열린 후보로 세지 않는다.
//     열린 후보는 `후보` 와 `리뷰함` 이다. 아직 글을 쓰지도 빼지도 않았다.
//     바꿀 수 있는 것은 후보 → 리뷰함, 후보 → 뺌, 리뷰함 → 글 씀, 리뷰함 → 뺌 이다.

import { readFileSync } from 'node:fs'

export const FILE_NAME = 'candidates.md'
export const COLUMNS = ['주제', '질문', '생긴 곳', '참고', '상태'] as const
export const STATUSES = ['후보', '리뷰함', '뺌', '글 씀'] as const
export type Status = (typeof STATUSES)[number]

export const OPEN: ReadonlySet<Status> = new Set<Status>(['후보', '리뷰함'])
export const NEXT: Readonly<Record<Status, readonly Status[]>> = {
  후보: ['리뷰함', '뺌'],
  리뷰함: ['글 씀', '뺌'],
  뺌: [],
  '글 씀': [],
}

// 새 파일의 머리. 규칙은 스킬 문서가 소유하므로 가리키기만 한다
export const NEW_FILE_HEAD = [
  '# 공부 후보',
  '',
  '일하다 사용자가 뜻을 물은 개념을 모아 두고 다시 본다. 규칙은 orch 스킬의 `references/study-candidates.md` 가 소유한다.',
  '',
]

export type Row = {
  // 표 안에서 1부터 센 번호. list 가 보이고 set 이 받는다
  index: number
  // 파일의 줄 번호(0부터)
  line: number
  // `\|` 를 풀지 않은 칸 그대로
  cells: string[]
  status: Status | null
}

export type Table = {
  lines: string[]
  // 머리 줄 번호. 표가 없으면 -1
  head: number
  // 표의 마지막 줄 번호(구분 줄이나 마지막 행)
  end: number
  rows: Row[]
}

export function splitRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  return body.split(/(?<!\\)\|/).map((cell) => cell.trim())
}

export function statusOf(cell: string): Status | null {
  for (const status of STATUSES) {
    if (cell === status || new RegExp(`^${status}(?=[\\s:：(])`).test(cell)) return status
  }
  return null
}

export function parse(text: string): Table {
  const lines = text.split(/\r?\n/)
  const head = lines.findIndex((line) => {
    if (!line.trim().startsWith('|')) return false
    const cells = splitRow(line)
    return cells.length === COLUMNS.length && cells.every((cell, i) => cell === COLUMNS[i])
  })
  if (head < 0 || head + 1 >= lines.length || !lines[head + 1].trim().startsWith('|')) return { lines, head: -1, end: -1, rows: [] }
  const rows: Row[] = []
  let end = head + 1
  for (let i = head + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const cells = splitRow(lines[i])
    rows.push({ index: rows.length + 1, line: i, cells, status: statusOf(cells[COLUMNS.length - 1] ?? '') })
    end = i
  }
  return { lines, head, end, rows }
}

export function read(file: string): Table {
  return parse(readFileSync(file, 'utf8'))
}

// 열린 후보 수. 파일이 없거나 표가 없으면 null 이다
export function openCount(file: string): number | null {
  let table: Table
  try {
    table = read(file)
  } catch {
    return null
  }
  if (table.head < 0) return null
  return table.rows.filter((row) => row.status !== null && OPEN.has(row.status)).length
}

// 사용자 글을 칸 하나에 담는다. 줄바꿈은 빈칸으로, `|` 는 `\|` 로 바꾼다
export function cell(value: string): string {
  return value
    .replace(/\r?\n|\r/g, ' ')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim()
}

export function renderRow(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

export function unescape(value: string): string {
  return value.replace(/\\\|/g, '|')
}
