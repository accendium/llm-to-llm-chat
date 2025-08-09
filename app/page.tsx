"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Bot,
  Copy,
  Edit,
  Trash2,
  Play,
  Square,
  StepForward,
  MessagesSquare,
  Plus,
  Settings,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  X,
  RefreshCcw,
  Database,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Types
type BotId = "A" | "B"
type Mode = "full-auto" | "semi-auto" | "manual"

type Message = {
  id: string
  author: BotId
  content: string
  createdAt: number
}

type BotParams = {
  temperature: number
  top_p: number
  presence_penalty: number
  frequency_penalty: number
  max_tokens: number | null
}

type BotConfig = {
  name: string
  model: string
  systemPrompt: string
  params: BotParams
}

type Conversation = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  baseUrl: string
  mode: Mode
  bots: Record<BotId, BotConfig>
  messages: Message[]
}

type ModelItem = { id: string; object?: string; created?: number; owned_by?: string }

// Helpers
const defaultBaseUrl = "http://127.0.0.1:1234"

const defaultParams: BotParams = {
  temperature: 0.7,
  top_p: 1,
  presence_penalty: 0,
  frequency_penalty: 0,
  max_tokens: 1024,
}

const defaultBot = (name: string): BotConfig => ({
  name,
  model: "gpt-3.5-turbo", // will be replaced if models found
  systemPrompt: `You are ${name}. Be concise, helpful, and engaging.`,
  params: { ...defaultParams },
})

function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`
}

function now() {
  return Date.now()
}

function titleFromMessages(messages: Message[], fallback = "New Conversation") {
  const first = messages[0]?.content?.slice(0, 48)?.trim()
  return first?.length ? first : fallback
}

// SSE parser for OpenAI chat.completions stream
async function streamOpenAIChat({
  payload,
  baseUrl,
  signal,
  onToken,
}: {
  payload: any
  baseUrl: string
  signal: AbortSignal
  onToken: (delta: string) => void
}) {
  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      baseUrl,
      payload: { ...payload, stream: true },
    }),
    signal,
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Upstream error: ${res.status} ${res.statusText} ${text ? `- ${text}` : ""}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const data = trimmed.slice(5).trim()
      if (data === "[DONE]") {
        return
      }
      try {
        const json = JSON.parse(data)
        // Support both chat (delta.content) and completions (text) streaming formats
        const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.text ?? ""
        if (delta) onToken(delta)
      } catch {
        // ignore parse errors on keep-alive lines
      }
    }
  }
}

// Non-streaming fallback for OpenAI chat/completions
async function nonStreamOpenAIChat({
  payload,
  baseUrl,
  signal,
}: {
  payload: any
  baseUrl: string
  signal: AbortSignal
}): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    body: JSON.stringify({
      baseUrl,
      payload: { ...payload, stream: false },
    }),
    signal,
    headers: { "Content-Type": "application/json" },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Upstream error: ${res.status} ${res.statusText} ${text ? `- ${text}` : ""}`)
  }
  try {
    const data = await res.json()
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      ""
    return typeof content === "string" ? content : ""
  } catch {
    const text = await res.text().catch(() => "")
    return text
  }
}

// Local storage helpers
const STORAGE_KEY = "dual-bot-conversations-v1"

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as Conversation[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveConversations(convos: Conversation[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(convos))
}

// Components
function Sidebar({
  conversations,
  currentId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  collapsed,
  setCollapsed,
}: {
  conversations: Conversation[]
  currentId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  collapsed: boolean
  setCollapsed: (v: boolean) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [tempName, setTempName] = useState<string>("")

  return (
    <div
      className={cn(
        "h-screen border-r bg-zinc-50/60 dark:bg-zinc-900/40 backdrop-blur supports-[backdrop-filter]:bg-zinc-50/40 transition-all overflow-hidden",
        collapsed ? "w-14" : "w-72",
      )}
    >
      <div className="flex h-14 items-center justify-between px-2">
        <div className="flex items-center gap-2 px-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
          {!collapsed && (
            <div className="flex items-center gap-2">
              <MessagesSquare size={18} />
              <span className="font-semibold">Conversations</span>
            </div>
          )}
        </div>
        {!collapsed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onNew} aria-label="New chat">
                  <Plus size={18} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="h-[calc(100vh-56px)]">
        <ScrollArea className="h-full">
          <div className="px-2 pb-4">
            {conversations.length === 0 && !collapsed ? (
              <div className="text-sm text-zinc-500 px-2 py-6">No conversations yet. Start a new one.</div>
            ) : (
              conversations.map((c) => {
                const active = c.id === currentId
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer",
                      active && "bg-zinc-100 dark:bg-zinc-800",
                    )}
                    onClick={() => onSelect(c.id)}
                  >
                    <Badge variant={active ? "default" : "secondary"} className="shrink-0">
                      {new Date(c.updatedAt).toLocaleDateString()}
                    </Badge>
                    {!collapsed && (
                      <div className="flex-1 min-w-0">
                        {editingId === c.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              value={tempName}
                              onChange={(e) => setTempName(e.target.value)}
                              className="h-8"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  onRename(c.id, tempName.trim() || c.title)
                                  setEditingId(null)
                                } else if (e.key === "Escape") {
                                  setEditingId(null)
                                }
                              }}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                onRename(c.id, tempName.trim() || c.title)
                                setEditingId(null)
                              }}
                              aria-label="Save name"
                            >
                              <Check size={16} />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              aria-label="Cancel rename"
                            >
                              <X size={16} />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm">{c.title}</div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingId(c.id)
                                  setTempName(c.title)
                                }}
                                aria-label="Rename"
                              >
                                <Pencil size={16} />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDelete(c.id)
                                }}
                                aria-label="Delete"
                              >
                                <Trash2 size={16} />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function BotSettingsCard({
  id,
  config,
  models,
  onChange,
  loadingModels,
}: {
  id: BotId
  config: BotConfig
  models: ModelItem[]
  onChange: (next: BotConfig) => void
  loadingModels: boolean
}) {
  const pretty = id === "A" ? "Emerald" : "Amber"
  const accent =
    id === "A"
      ? "border-emerald-300/60 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]"
      : "border-amber-300/60 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]"

  return (
    <Card className={cn("w-full", accent)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot size={18} />
            <Input
              value={config.name}
              onChange={(e) => onChange({ ...config, name: e.target.value })}
              className="h-8 w-[200px]"
              placeholder={`Bot ${id} name`}
            />
            <Badge variant="secondary">Bot {id}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Settings size={16} />
            <span className="text-xs text-zinc-500">{pretty}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Model</label>
            <div className="flex items-center gap-2">
              <Select value={config.model} onValueChange={(v) => onChange({ ...config, model: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.length === 0 ? (
                    <SelectItem value={config.model}>{config.model}</SelectItem>
                  ) : (
                    models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {loadingModels && <Loader2 className="animate-spin text-zinc-500" size={16} />}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">Max tokens</label>
            <Input
              type="number"
              value={config.params.max_tokens ?? 0}
              min={0}
              onChange={(e) =>
                onChange({ ...config, params: { ...config.params, max_tokens: Number(e.target.value) } })
              }
              className="h-9"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ParamSlider
            label="Temperature"
            min={0}
            max={2}
            step={0.01}
            value={config.params.temperature}
            onChange={(v) => onChange({ ...config, params: { ...config.params, temperature: v } })}
          />
          <ParamSlider
            label="Top P"
            min={0}
            max={1}
            step={0.01}
            value={config.params.top_p}
            onChange={(v) => onChange({ ...config, params: { ...config.params, top_p: v } })}
          />
          <ParamSlider
            label="Presence Penalty"
            min={-2}
            max={2}
            step={0.01}
            value={config.params.presence_penalty}
            onChange={(v) => onChange({ ...config, params: { ...config.params, presence_penalty: v } })}
          />
          <ParamSlider
            label="Frequency Penalty"
            min={-2}
            max={2}
            step={0.01}
            value={config.params.frequency_penalty}
            onChange={(v) => onChange({ ...config, params: { ...config.params, frequency_penalty: v } })}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-zinc-500">System prompt</label>
          <Textarea
            value={config.systemPrompt}
            onChange={(e) => onChange({ ...config, systemPrompt: e.target.value })}
            rows={4}
            placeholder="Enter system prompt..."
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ParamSlider({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-500">{label}</label>
        <span className="text-xs font-mono text-zinc-600">{value}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(vals) => onChange(vals[0] ?? value)} />
    </div>
  )
}

function MessageBubble({
  msg,
  botA,
  botB,
  onEdit,
  onCopy,
}: {
  msg: Message
  botA: BotConfig
  botB: BotConfig
  onEdit: (id: string, content: string) => void
  onCopy: (id: string) => void
}) {
  const isA = msg.author === "A"
  const name = isA ? botA.name || "Bot A" : botB.name || "Bot B"
  const accent = isA ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msg.content)

  useEffect(() => {
    setDraft(msg.content)
  }, [msg.id, msg.content])

  return (
    <div className={cn("flex items-start gap-3", isA ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg border p-3 shadow-sm relative",
          accent,
          isA ? "rounded-tl-sm" : "rounded-tr-sm",
        )}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <Badge variant="outline">{name}</Badge>
            <span className="text-zinc-400">{new Date(msg.createdAt).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(msg.content)
                      onCopy(msg.id)
                    }}
                    aria-label="Copy message"
                  >
                    <Copy size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" onClick={() => setEditing((e) => !e)} aria-label="Edit message">
                    <Edit size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDraft(msg.content)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onEdit(msg.id, draft)
                  setEditing(false)
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-sm">{msg.content || "..."}</div>
        )}
      </div>
    </div>
  )
}

export default function Page() {
  // App state
  const [baseUrl, setBaseUrl] = useState<string>(defaultBaseUrl)
  const [models, setModels] = useState<ModelItem[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [mode, setMode] = useState<Mode>("full-auto")

  const [botA, setBotA] = useState<BotConfig>(defaultBot("Bot A"))
  const [botB, setBotB] = useState<BotConfig>(defaultBot("Bot B"))

  const [messages, setMessages] = useState<Message[]>([])
  const [running, setRunning] = useState(false)
  const [currentSpeaker, setCurrentSpeaker] = useState<BotId>("A")
  const [manualText, setManualText] = useState("")
  const [manualSpeaker, setManualSpeaker] = useState<BotId>("A")

  // Conversations
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentConvoId, setCurrentConvoId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)
  const runningRef = useRef<boolean>(false)

  // Load initial from localStorage
  useEffect(() => {
    const saved = loadConversations()
    setConversations(saved)
    const last = saved[0] // pick the most recent
    if (last) {
      loadConversation(last.id)
    } else {
      newConversation()
    }
  }, [])

  // Auto-save debounced
  useEffect(() => {
    if (!currentConvoId) return
    const i = conversations.findIndex((c) => c.id === currentConvoId)
    if (i === -1) return
    const next = [...conversations]
    next[i] = {
      ...next[i],
      updatedAt: now(),
      baseUrl,
      mode,
      bots: { A: botA, B: botB },
      messages,
      title: titleFromMessages(messages, next[i].title || "Untitled"),
    }
    setConversations(next)
    const handle = setTimeout(() => saveConversations(next), 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, mode, botA, botB, messages, currentConvoId])

  // Scroll to bottom on new message
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  // Fetch models when baseUrl changes
  async function fetchModels(url: string) {
    setLoadingModels(true)
    try {
      const res = await fetch(`/api/models?baseUrl=${encodeURIComponent(url)}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const json = await res.json()
      const list = Array.isArray(json?.data) ? (json.data as ModelItem[]) : []
      setModels(list)
      // If selected model missing, default to first
      if (list.length > 0) {
        if (!list.find((m) => m.id === botA.model)) {
          setBotA({ ...botA, model: list[0].id })
        }
        if (!list.find((m) => m.id === botB.model)) {
          setBotB({ ...botB, model: list[0].id })
        }
      }
    } catch (e) {
      console.error("Failed to load models", e)
    } finally {
      setLoadingModels(false)
    }
  }

  useEffect(() => {
    fetchModels(baseUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl])

  function newConversation() {
    const id = uid("convo")
    const convo: Conversation = {
      id,
      title: "New Conversation",
      createdAt: now(),
      updatedAt: now(),
      baseUrl,
      mode,
      bots: { A: defaultBot("Bot A"), B: defaultBot("Bot B") },
      messages: [],
    }
    const next = [convo, ...conversations]
    setConversations(next)
    saveConversations(next)
    setCurrentConvoId(id)
    setMessages([])
    setBotA(convo.bots.A)
    setBotB(convo.bots.B)
    setMode("full-auto")
    setCurrentSpeaker("A")
    stopRun()
  }

  function loadConversation(id: string) {
    const c = conversations.find((x) => x.id === id)
    if (!c) return
    setCurrentConvoId(id)
    setBaseUrl(c.baseUrl || defaultBaseUrl)
    setMode(c.mode || "full-auto")
    setBotA(c.bots.A)
    setBotB(c.bots.B)
    setMessages(c.messages)
    setCurrentSpeaker(nextSpeakerFrom(c.messages))
    stopRun()
  }

  function deleteConversation(id: string) {
    const next = conversations.filter((c) => c.id !== id)
    setConversations(next)
    saveConversations(next)
    if (currentConvoId === id) {
      const fallback = next[0]
      if (fallback) loadConversation(fallback.id)
      else newConversation()
    }
  }

  function renameConversation(id: string, title: string) {
    const next = conversations.map((c) => (c.id === id ? { ...c, title, updatedAt: now() } : c))
    setConversations(next)
    saveConversations(next)
  }

  function nextSpeakerFrom(msgs: Message[]): BotId {
    if (msgs.length === 0) return "A"
    return msgs[msgs.length - 1].author === "A" ? "B" : "A"
  }

  function buildOpenAIMessagesFor(speaker: BotId): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    const sys = speaker === "A" ? botA.systemPrompt : botB.systemPrompt
    const msgs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: sys },
    ]
    for (const m of messages) {
      if (m.author === speaker) {
        msgs.push({ role: "assistant", content: m.content })
      } else {
        msgs.push({ role: "user", content: m.content })
      }
    }
    return msgs
  }

  async function generateTurn(speaker: BotId) {
    // Prepare
    const config = speaker === "A" ? botA : botB
    const payload = {
      model: config.model,
      messages: buildOpenAIMessagesFor(speaker),
      temperature: config.params.temperature,
      top_p: config.params.top_p,
      presence_penalty: config.params.presence_penalty,
      frequency_penalty: config.params.frequency_penalty,
      max_tokens:
        typeof config.params.max_tokens === "number" && config.params.max_tokens > 0
          ? config.params.max_tokens
          : undefined,
      stream: true,
    }

    // Append empty message for streaming
    const newMsg: Message = { id: uid("msg"), author: speaker, content: "", createdAt: now() }
    setMessages((prev) => [...prev, newMsg])

    // Start stream
    const controller = new AbortController()
    abortRef.current = controller
    try {
      let produced = false
      await streamOpenAIChat({
        payload,
        baseUrl,
        signal: controller.signal,
        onToken: (delta) => {
          if (delta && delta.length > 0) produced = true
          setMessages((prev) => prev.map((m) => (m.id === newMsg.id ? { ...m, content: m.content + delta } : m)))
        },
      })
      // If stream ended with no tokens, try non-streaming fallback
      if (!produced) {
        try {
          const text = await nonStreamOpenAIChat({ payload: { ...payload, stream: false }, baseUrl, signal: controller.signal })
          if (text && text.length > 0) {
            setMessages((prev) => prev.map((m) => (m.id === newMsg.id ? { ...m, content: text } : m)))
          }
        } catch {
          // ignore, error path handled below in catch
        }
      }
    } catch (e: any) {
      // Fallback to non-streaming request
      try {
        const text = await nonStreamOpenAIChat({ payload, baseUrl, signal: controller.signal })
        setMessages((prev) => prev.map((m) => (m.id === newMsg.id ? { ...m, content: text } : m)))
      } catch (e2: any) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === newMsg.id
              ? { ...m, content: (m.content || "") + `\n\n[Error: ${e2?.message ?? "request failed"}]` }
              : m,
          ),
        )
      }
    } finally {
      abortRef.current = null
    }
  }

  function stopRun() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setRunning(false)
    runningRef.current = false
  }

  async function runLoop(kind: Mode) {
    if (kind === "manual") return

    let speaker: BotId = currentSpeaker
    while (runningRef.current) {
      await generateTurn(speaker)
      const next = speaker === "A" ? "B" : "A"
      setCurrentSpeaker(next)

      if (mode === "semi-auto") {
        // pause until user presses Step
        runningRef.current = false
        setRunning(false)
        break
      }

      if (mode !== "full-auto") break
      speaker = next
      await new Promise((r) => setTimeout(r, 50)) // yield
      if (!runningRef.current) break
    }
  }

  function handleStart() {
    if (mode === "manual") return
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    runLoop(mode)
  }

  function handleStep() {
    if (mode !== "semi-auto") return
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    runLoop("semi-auto")
  }

  function handleManualSend() {
    if (mode !== "manual") return
    const content = manualText.trim()
    if (!content) return
    const m: Message = { id: uid("msg"), author: manualSpeaker, content, createdAt: now() }
    setMessages((prev) => [...prev, m])
    setManualText("")
    setCurrentSpeaker(manualSpeaker === "A" ? "B" : "A")
  }

  function handleEditMessage(id: string, content: string) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content } : m)))
  }

  // UI render
  const currentConvo = useMemo(
    () => conversations.find((c) => c.id === currentConvoId) || null,
    [conversations, currentConvoId],
  )

  return (
    <div className="flex">
      <Sidebar
        conversations={[...conversations].sort((a, b) => b.updatedAt - a.updatedAt)}
        currentId={currentConvoId}
        onSelect={loadConversation}
        onNew={newConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
        collapsed={false}
        setCollapsed={() => {}}
      />
      <main className="flex-1 min-h-screen bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900">
        <header className="h-14 border-b flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Bot size={18} />
            <span className="font-semibold">Dual LLM Chat</span>
            <Badge variant="secondary">Local OpenAI-compatible</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Database size={16} className="text-zinc-500" />
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="h-9 w-[280px]"
              placeholder="Base URL e.g. http://127.0.0.1:1234"
            />
            <Button variant="outline" size="icon" onClick={() => fetchModels(baseUrl)} aria-label="Refresh models">
              <RefreshCcw size={16} />
            </Button>
          </div>
        </header>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BotSettingsCard id="A" config={botA} models={models} onChange={setBotA} loadingModels={loadingModels} />
            <BotSettingsCard id="B" config={botB} models={models} onChange={setBotB} loadingModels={loadingModels} />
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessagesSquare size={18} />
                  Conversation
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
                    <TabsList>
                      <TabsTrigger value="full-auto">Full-auto</TabsTrigger>
                      <TabsTrigger value="semi-auto">Semi-auto</TabsTrigger>
                      <TabsTrigger value="manual">Manual</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Badge variant="outline">
                    Next turn: {currentSpeaker === "A" ? botA.name || "Bot A" : botB.name || "Bot B"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div
                ref={chatScrollRef}
                className="h-[48vh] md:h-[56vh] overflow-y-auto p-4 space-y-4 bg-white/60 dark:bg-zinc-900/40"
              >
                {messages.length === 0 ? (
                  <div className="text-sm text-zinc-500 p-6">
                    No messages yet. {mode === "manual" ? "Add one manually." : "Press Start to begin."}
                  </div>
                ) : (
                  messages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      msg={m}
                      botA={botA}
                      botB={botB}
                      onEdit={handleEditMessage}
                      onCopy={() => {}}
                    />
                  ))
                )}
              </div>

              <div className="border-t p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleStart}
                    disabled={running || mode === "manual"}
                    className="gap-2"
                    aria-label="Start"
                  >
                    <Play size={16} />
                    Start
                  </Button>
                  <Button
                    onClick={stopRun}
                    variant="secondary"
                    disabled={!running && !abortRef.current}
                    className="gap-2"
                    aria-label="Stop"
                  >
                    <Square size={16} />
                    Stop
                  </Button>
                  <Button
                    onClick={handleStep}
                    variant="outline"
                    disabled={mode !== "semi-auto" || running}
                    className="gap-2 bg-transparent"
                    aria-label="Step"
                  >
                    <StepForward size={16} />
                    Step
                  </Button>
                </div>

                {mode === "manual" ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Select value={manualSpeaker} onValueChange={(v) => setManualSpeaker(v as BotId)}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Send as" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">{botA.name || "Bot A"}</SelectItem>
                        <SelectItem value="B">{botB.name || "Bot B"}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder={`Write a message as ${manualSpeaker === "A" ? botA.name || "Bot A" : botB.name || "Bot B"}...`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleManualSend()
                        }
                      }}
                    />
                    <Button onClick={handleManualSend}>Send</Button>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 pr-2">
                    {mode === "full-auto"
                      ? "Bots will alternate turns until you press Stop."
                      : "Press Step to generate the next turn."}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
