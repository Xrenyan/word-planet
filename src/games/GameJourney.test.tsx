import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameHub } from './GameHub'
import { clearPendingPassport, hasPendingPassport, passportKey, readPassport } from './passport'
import type { WordPlanetApi } from '../app/api/client'

vi.mock('./BubbleMatchGame', () => ({ BubbleMatchGame: (props: { rounds: number; onComplete: (result: unknown) => void; onBackToHub: () => void; onNextChallenge?: () => void; onReplay?: () => void }) => <>
  <p>{props.rounds} 轮挑战</p>
  <button onClick={() => props.onComplete({completedRounds: props.rounds,totalRounds: props.rounds,firstTryCorrect: props.rounds - 1})}>完成测试关卡</button>
  <button onClick={props.onBackToHub}>回到游戏大厅</button>
  {props.onNextChallenge && <button onClick={props.onNextChallenge}>下一关</button>}
  {props.onReplay && <button onClick={props.onReplay}>再玩一次</button>}
</> }))
const api = { getBooks: async () => ({books:[{id:'four',label:'四年级上册',grade:4,semester:'upper',status:'source-matched',verifiedWordCount:0,availableWordCount:1}]}), getWords: async () => ({bookId:'four',words:[{id:'sport',bookId:'four',unit:1,order:1,term:'sport',meaningZh:'体育运动',ipaUk:'/spɔːt/',ipaUs:'/spɔːrt/',image:{src:'word-art/sport.webp',alt:'运动',license:'original'},source:{title:'照片',url:'https://example.test',page:82}}]}) } as WordPlanetApi
const props = {api,progressRecorder:{record:async ()=>'saved' as const},onReturnToLearning:()=>undefined}

beforeEach(() => clearPendingPassport())
afterEach(() => { vi.restoreAllMocks(); clearPendingPassport() })

describe('game challenge journey', () => {
  it('unlocks the next challenge only after a real completion and does not multiply stars on repeat', async () => {
    const user = userEvent.setup()
    render(<GameHub {...props} />)
    await user.click(await screen.findByRole('button', {name:'开始泡泡找单词'}))
    expect(screen.queryByRole('button',{name:'下一关'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'完成测试关卡'}))
    expect(readPassport()).toHaveLength(1)
    expect(hasPendingPassport()).toBe(false)
    expect(screen.getByText('获得 1 颗通关星')).toBeVisible()
    await user.click(screen.getByRole('button',{name:'完成测试关卡'}))
    expect(readPassport()).toHaveLength(1)
    await user.click(screen.getByRole('button',{name:'下一关'}))
    expect(screen.getByText('4 轮挑战')).toBeVisible()
    expect(screen.queryByRole('button',{name:'下一关'})).not.toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'回到游戏大厅'}))
    expect(screen.getByLabelText('泡泡找单词：已完成 1/3 关')).toBeVisible()
  })
  it('keeps an unsaved star and its retry after leaving and reopening the games', async () => {
    const user = userEvent.setup()
    const view = render(<GameHub {...props} />)
    await user.click(await screen.findByRole('button', {name:'开始泡泡找单词'}))
    const write = vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full')})
    fireEvent.click(screen.getByRole('button',{name:'完成测试关卡'}))
    expect(screen.getByRole('alert')).toHaveTextContent('通关星尚未保存')
    expect(readPassport()).toEqual([])
    await user.click(screen.getByRole('button',{name:'回到游戏大厅'}))
    expect(screen.getByRole('heading',{name:'游戏星岛'})).toBeVisible()
    view.unmount()
    render(<GameHub {...props} />)
    await screen.findByText('1 个单词 · 随机出题')
    expect(screen.getByText('本单元 1 / 15 颗星')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('通关星尚未保存')
    expect(screen.getByLabelText('泡泡找单词：已完成 1/3 关')).toBeVisible()
    write.mockRestore()
    await user.click(screen.getByRole('button', { name: '重试保存通关星' }))
    expect(readPassport()).toHaveLength(1)
    expect(hasPendingPassport()).toBe(false)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '开始泡泡找单词' }))
    expect(screen.getByText('4 轮挑战')).toBeVisible()
  })
  it('does not overwrite unreadable saved stars when a new challenge completes or retries', async () => {
    localStorage.setItem(passportKey, '{broken')
    const user = userEvent.setup()
    render(<GameHub {...props} />)
    await user.click(await screen.findByRole('button', { name: '开始泡泡找单词' }))
    await user.click(screen.getByRole('button', { name: '完成测试关卡' }))
    expect(localStorage.getItem(passportKey)).toBe('{broken')
    expect(screen.getByRole('alert')).toHaveTextContent('通关星尚未保存')
    await user.click(screen.getByRole('button', { name: '重试保存通关星' }))
    expect(localStorage.getItem(passportKey)).toBe('{broken')
    expect(screen.getByRole('alert')).toHaveTextContent('通关星尚未保存')
  })
  it('does not start a selected-book game using words that belong to the previous book', async () => {
    const { books } = await api.getBooks()
    const previousWords = await api.getWords('four')
    const switchingApi = {
      ...api,
      getBooks: async () => ({ books: [...books, { ...books[0], id: 'five', label: '五年级上册', grade: 5 as const }] }),
      getWords: async (selectedBookId: string) => ({ bookId: selectedBookId, words: previousWords.words }),
    }
    const user = userEvent.setup()
    render(<GameHub {...props} api={switchingApi} />)
    await screen.findByText('1 个单词 · 随机出题')
    await user.selectOptions(screen.getByLabelText('教材'), 'five')
    expect(screen.getByRole('button', { name: '开始泡泡找单词' })).toBeDisabled()
    expect(screen.queryByText('1 个单词 · 随机出题')).not.toBeInTheDocument()
  })
})
