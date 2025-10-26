"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { runCli, type CliContext, COMMANDS } from "@/lib/cli"

import type { FsNode, ChallengeMeta, LeaderboardRow, TeamsRow, TerminalLine } from "@/app/types"

const WELCOME = ["Welcome to EditaCTF!", "Type 'help' to see available commands.", ""].join("\n")
const DEFAULT_HOST = "EditaCTF"

function joinPath(parts: string[]): string {
  const path = "/" + parts.filter(Boolean).join("/")
  return path.replace(/\/+/g, "/")
}
function splitPath(path: string): string[] {
  if (!path || path === "/") return []
  return path
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .split("/")
}
function findNode(root: FsNode, path: string): FsNode | null {
  if (path === "/") return root
  const parts = splitPath(path)
  let cur: FsNode = root
  for (const part of parts) {
    if (cur.type !== "dir" || !cur.children) return null
    const next = cur.children.find((c) => c.name === part)
    if (!next) return null
    cur = next
  }
  return cur
}
function listChildren(node: FsNode | null): string[] {
  if (!node || node.type !== "dir" || !node.children) return []
  return node.children.map((c) => (c.type === "dir" ? c.name + "/" : c.name))
}
function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [key, state])
  return [state, setState] as const
}

export default function Page() {
  const supabase = useMemo(() => {
    try {
      return getSupabaseClient()
    } catch {
      return null
    }
  }, [])

  const [history, setHistory] = useState<TerminalLine[]>([{ type: "system", text: WELCOME }])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [cwd, setCwd] = useLocalStorage<string[]>("edita-ctf:cwd", [])
  const [fsRoot, setFsRoot] = useState<FsNode | null>(null)
  // Cache for file contents: { [path]: content }
  const [fileCache, setFileCache] = useState<Record<string, string>>({})
  const [challenges, setChallenges] = useState<ChallengeMeta[]>([])
  // Bundle cache for challenge details and hints: { [id]: { challenge, hint } }
  const [challengeBundleCache, setChallengeBundleCache] = useState<Record<string, { challenge: any; hint: string | null }>>({})
  const termEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [cmdHistory, setCmdHistory] = useLocalStorage<string[]>("edita-ctf:cmd-history", [])
  const [cmdIndex, setCmdIndex] = useState<number>(-1)
  // Prevent hydration mismatch: only render terminal after client loads
  const [clientReady, setClientReady] = useState(false)
  useEffect(() => {
    setClientReady(true)
  }, [])

  // Auth state
  const [session, setSession] = useState<{
    access_token: string
    user_email: string
    user_id: string
  } | null>(null)

  // Server-derived summary for logged-in users
  const [summary, setSummary] = useState<{
    team: string
    teamScore: number
    teamSolvedIds: string[]
    userSolvedIds: string[]
    displayName: string | null
  } | null>(null)

  // Local-only progress for guests (not persisted)
  const [localSolved, setLocalSolved] = useState<string[]>([])
  const [localScore, setLocalScore] = useState<number>(0)

  const reloadData = useCallback(async () => {
    try {
      // Invalidate challenge bundle cache on reload
      setChallengeBundleCache({})
      const [fsRes, chRes] = await Promise.all([fetch("/api/fs"), fetch("/api/challenges")])
      const fsData = (await fsRes.json()) as FsNode
      const chData = (await chRes.json()) as { challenges: ChallengeMeta[] }
      setFsRoot(fsData)
      setChallenges(chData.challenges)
    } catch {
      setHistory((h) => [...h, { type: "system", text: "Failed to load CTF data. Try refreshing." }])
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    if (!session?.access_token) {
      setSummary(null)
      return
    }
    try {
      const res = await fetch("/api/me/summary", { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) throw new Error("summary failed")
      const data = await res.json()
      setSummary({
        team: data.team ?? "guest",
        teamScore: Number(data.teamScore ?? 0),
        teamSolvedIds: (data.teamSolvedIds ?? []).map((s: any) => String(s)),
        userSolvedIds: (data.userSolvedIds ?? []).map((s: any) => String(s)),
        displayName: data.display_name ?? null,
      })
    } catch {
      setSummary(null)
    }
  }, [session?.access_token])

  // Load initial data on mount
  useEffect(() => {
    reloadData()
  }, [reloadData])

  useEffect(() => {
    if (!supabase) return
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession()
      const s = data.session
      if (s) {
        setSession({
          access_token: s.access_token,
          user_email: s.user.email ?? "",
          user_id: s.user.id,
        })
      } else {
        setSession(null)
      }
    }
    syncSession()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) {
        setSession({
          access_token: s.access_token,
          user_email: s.user.email ?? "",
          user_id: s.user.id,
        })
      } else {
        setSession(null)
      }
      // Reset local guest progress when auth state changes
      setLocalSolved([])
      setLocalScore(0)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  // Fetch summary on auth changes
  useEffect(() => {
    fetchSummary()
  }, [fetchSummary, session?.access_token])

  // Realtime hint for leaderboard changes
  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel("live-leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "solves" }, () => {
        setHistory((h) => [...h, { type: "system", text: "Leaderboard updated (realtime)." }])
        // Invalidate challenge bundle cache on live update
        setChallengeBundleCache({})
        fetchSummary()
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, fetchSummary])

  const currentTeam = summary?.team ?? "guest"
  const displayIdentity = session ? summary?.displayName || session.user_email : "guest"
  const scoreDisplay = session ? (summary?.teamScore ?? 0) : localScore
  const solvedCountDisplay = session ? (summary?.teamSolvedIds?.length ?? 0) : localSolved.length

  // Helper to determine if user is on a real team (not guest)
  const isOnRealTeam = currentTeam !== "guest" && !currentTeam.startsWith("guest_")

  const prompt = useMemo(() => {
    const path = joinPath(cwd)
    const user = displayIdentity
    return `${user}@${DEFAULT_HOST}:${path}$`
  }, [cwd, displayIdentity])

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [history])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Don't focus if user is selecting text
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) return

      // Don't focus if click is on a button or interactive element
      const target = e.target as HTMLElement
      if (target.tagName === "BUTTON" || target.tagName === "A" || target.tagName === "INPUT") return

      // Focus the input
      inputRef.current?.focus()
    }

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  const resolvePath = useCallback(
    (argPath?: string) => {
      if (!argPath || argPath.trim() === "") return joinPath(cwd)
      if (argPath.startsWith("/")) return argPath
      const parts = [...cwd]
      for (const seg of argPath.split("/")) {
        if (seg === "" || seg === ".") continue
        if (seg === "..") parts.pop()
        else parts.push(seg)
      }
      return joinPath(parts)
    },
    [cwd],
  )

  const doLs = useCallback(
    (target?: string) => {
      if (!fsRoot) return "Filesystem not loaded."
      const path = resolvePath(target)
      const node = findNode(fsRoot, path)
      if (!node) return `ls: cannot access '${path}': No such file or directory`
      if (node.type === "file") return node.name
      const names = listChildren(node)
      const colored = names
        .map((n) => {
          if (n.endsWith("/")) return `<span class="text-emerald-400">${n}</span>`
          if (n.endsWith(".json")) return `<span class="text-amber-300">${n}</span>`
          if (n.endsWith(".txt") || n.endsWith(".md")) return `<span class="text-emerald-200">${n}</span>`
          return n
        })
        .join("  ")
      return colored
    },
    [fsRoot, resolvePath],
  )

  const doCd = useCallback(
    (target?: string) => {
      if (!target) {
        setCwd([])
        return ""
      }
      if (!fsRoot) return "Filesystem not loaded."
      const nextPath = target === "~" ? "/" : resolvePath(target)
      const node = findNode(fsRoot, nextPath)
      if (!node) return `cd: no such file or directory: ${target}`
      if (node.type !== "dir") return `cd: not a directory: ${target}`
      setCwd(splitPath(nextPath))
      return ""
    },
    [fsRoot, resolvePath],
  )

  // Lazy fetch and cache file content
  const fetchFileContent = useCallback(async (node: FsNode, forceRefresh = false): Promise<string> => {
    if (!node.path) return `cat: ${node.name}: Invalid path`
    // Use cache unless forceRefresh
    if (!forceRefresh && fileCache[node.path]) return fileCache[node.path]

    // Client-side generation for README.md in /challenges/*/*
    if (node.name === "README.md" && node.path.startsWith("/challenges/")) {
      const parts = node.path.split("/")
      const category = parts[2]
      const id = parts[3]
      const challenge = challenges.find((c) => c.id === id && c.category === category)
      if (challenge) {
        const content = [
          `# ${challenge.name}`,
          ``,
          `ID: ${challenge.id}`,
          `Category: ${challenge.category}`,
          `Points: ${challenge.points}`,
          `Difficulty: ${challenge.difficulty}`,
          `Daily: ${challenge.daily ? "yes" : "no"}`,
          ``,
          `Use 'challenge ${challenge.id}' to view full details and files.`,
          `Use 'challenge ${challenge.id} -i' to reveal a hint.`,
          `Submit with: challenge ${challenge.id} -s editaCTF{your_flag_here}`,
        ].join("\n")
        setFileCache((cache) => ({ ...cache, [node.path]: content }))
        return content
      }
    }

    // Prefer API fetch for all other files
    const res = await fetch(`/api/fs?path=${encodeURIComponent(node.path)}`)
    if (!res.ok) return `cat: ${node.name}: Failed to fetch content`
    const data = await res.json()
    if (typeof data.content === "string") {
      setFileCache((cache) => ({ ...cache, [node.path]: data.content }))
      return data.content
    }
    // If no content, fallback to sourceUrl if present
    if (node.sourceUrl) {
      const res2 = await fetch(node.sourceUrl)
      const isText = node.mime?.startsWith("text/") || node.sourceUrl.endsWith(".txt") || node.sourceUrl.endsWith(".md")
      if (isText) {
        const txt = await res2.text()
        setFileCache((cache) => ({ ...cache, [node.path]: txt }))
        return txt
      }
      const json = await res2.json()
      const txt = JSON.stringify(json, null, 2)
      setFileCache((cache) => ({ ...cache, [node.path]: txt }))
      return txt
    }
    return `cat: ${node.name}: No content`
  }, [fileCache, challenges])

  const doCat = useCallback(
    async (target?: string, opts?: { refresh?: boolean }) => {
      if (!target) return "cat: missing file operand"
      if (!fsRoot) return "Filesystem not loaded."
      const path = resolvePath(target)
      const node = findNode(fsRoot, path)
      if (!node) return `cat: ${target}: No such file or directory`
      if (node.type !== "file") return `cat: ${target}: Is a directory`
      try {
        const txt = await fetchFileContent(node, opts?.refresh)
        return txt
      } catch {
        return `cat: ${target}: Failed to read file`
      }
    },
    [fsRoot, resolvePath, fetchFileContent],
  )
  // Example: add a command to refresh file content (live update)
  // Usage: cat <file> --refresh
  // Already supported via doCat(target, { refresh: true })

  const doClear = useCallback(() => {
    setHistory([])
    return ""
  }, [])

  const doDate = useCallback(() => new Date().toString(), [])

  const doOpen = useCallback(async (target?: string) => doCat(target), [doCat])

  const doPwd = useCallback(() => joinPath(cwd), [cwd])

  const doRules = useCallback(async () => {
    const res = await fetch("/api/rules")
    const txt = await res.text()
    return txt
  }, [])

  const doLeaderboard = useCallback(async (format?: string) => {
    const res = await fetch("/api/leaderboard")
    const data = (await res.json()) as { leaderboard: LeaderboardRow[]; updatedAt: string }
    if (format === "--json") {
      return JSON.stringify(data, null, 2)
    }

    if (data.leaderboard.length === 0) {
      return [
        "No teams on the leaderboard yet!",
        "",
        "Teams appear here when they:",
        "• Have members with display names set",
        "• Create or join a real team (not individual)",
        "• Solve at least one challenge",
        "",
        "Get started: auth register → profile name → team create",
      ].join("\n")
    }

    const lines = [
      "Rank  Team                  Score   Solves",
      "----- -------------------- ------- ------",
      ...data.leaderboard.map((r) => {
        const team = r.team.padEnd(20, " ").slice(0, 20)
        const score = String(r.score).padStart(5, " ")
        const solves = String(r.solves).padStart(4, " ")
        return `${String(r.rank).padEnd(5, " ")} ${team} ${score}   ${solves}`
      }),
      "",
      `Updated: ${data.updatedAt}`,
    ]
    return lines.join("\n")
  }, [])

  const doTeams = useCallback(async (format?: string) => {
    const res = await fetch("/api/teams")
    const data = (await res.json()) as { teams: TeamsRow[]; updatedAt: string }
    if (format === "--json") return JSON.stringify(data, null, 2)

    if (data.teams.length === 0) {
      return [
        "No teams created yet!",
        "",
        "Create a team: team create <name> <password>",
        "Join a team: team join <name> <password>",
        "",
        "Teams only appear here when they have members with display names.",
      ].join("\n")
    }

    const lines = [
      "Team                 Members  Score",
      "-------------------- ------- ------",
      ...data.teams.map((t) => {
        const name = t.name.padEnd(20, " ").slice(0, 20)
        const members = String(t.members).padStart(5, " ")
        const score = String(t.score).padStart(5, " ")
        return `${name}   ${members}   ${score}`
      }),
      "",
      `Updated: ${data.updatedAt}`,
    ]
    return lines.join("\n")
  }, [])

  const doChallenges = useCallback(
    (arg?: string) => {
      if (!challenges || challenges.length === 0) return "{}"
      if (arg && arg.includes("--help")) {
        return [
          "Usage: challenges [filter] [--compact] [--all] [--help]",
          "",
          "Lists challenges as JSON. Fields: count, challenges[], filter.",
          "",
          "Arguments:",
          "  filter      First non-flag token; matches category, id, or name substring (case-insensitive).",
          "",
          "Flags:",
          "  --compact   Minify JSON output (no pretty formatting).",
          "  --all       Ignore any filter token and list all challenges.",
          "  --help      Show this help text.",
          "",
          "Examples:",
          "  challenges                   # list all (pretty JSON)",
          "  challenges web               # filter by 'web' in category/id/name",
          "  challenges WEB --compact     # filter (case-insensitive) and minify JSON",
          "  challenges --all --compact   # full list, compact JSON",
          "  challenges --help            # this help",
        ].join("\n")
      }
      // Pretty by default; user can request compact via --compact
      let filter: string | undefined = undefined
      let pretty = true
      if (arg && arg.trim().length > 0) {
        const parts = arg.split(/\s+/).filter(Boolean)
        const flagSet = new Set(parts.filter((p) => p.startsWith("--")))
        if (flagSet.has("--compact")) pretty = false
        const nonFlags = parts.filter((p) => !p.startsWith("--"))
        if (nonFlags.length > 0) filter = nonFlags[0]
        if (flagSet.has("--all")) filter = undefined
      }
      let list = challenges
      if (filter) {
        const f = filter.toLowerCase()
        list = challenges.filter(
          (c) =>
            c.category.toLowerCase().includes(f) || c.id.toLowerCase().includes(f) || c.name.toLowerCase().includes(f),
        )
      }
      const payload = {
        count: list.length,
        challenges: list.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          points: c.points,
          difficulty: c.difficulty,
          daily: !!c.daily,
        })),
        filter: filter || null,
      }
      return JSON.stringify(payload, null, pretty ? 2 : 0)
    },
    [challenges],
  )

  // Unified fetch for challenge detail and hint
  const fetchChallengeBundle = useCallback(async (challengeId: string, forceRefresh = false) => {
    if (!forceRefresh && challengeBundleCache[challengeId]) return challengeBundleCache[challengeId]
    const res = await fetch(`/api/challenges?id=${encodeURIComponent(challengeId)}`)
    if (res.status === 404) return null
    const data = await res.json()
    setChallengeBundleCache((s) => ({ ...s, [challengeId]: { challenge: data.challenge, hint: data.hint ?? null } }))
    return { challenge: data.challenge, hint: data.hint ?? null }
  }, [challengeBundleCache])

  const doSubmit = useCallback(
    async (id?: string, flag?: string) => {
      if (!id || !flag) return "Flag submission failed: missing challenge ID or flag"

      // Check if user is logged in
      if (!session) {
        return [
          "Please register and login first to submit flags.",
          "",
          "Quick start:",
          "1. auth register <your-email> <password>",
          "2. auth login <your-email> <password>",
          "3. profile name <your-display-name>",
          "4. team create <team-name> <team-password>",
          "5. challenge <challenge-id> --submit editaCTF{your_flag}",
        ].join("\n")
      }

      // Check if user has set display name
      if (!summary?.displayName) {
        return [
          "Please set your display name first to submit flags.",
          "",
          "Use: profile name <your-display-name>",
          "Example: profile name John Doe",
        ].join("\n")
      }

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`
        const res = await fetch("/api/flag", { method: "POST", headers, body: JSON.stringify({ id, flag }) })
        if (!res.ok) {
          const t = await res.text()
          return `Flag submission failed: ${t || "unknown error"}`
        }
        const data = (await res.json()) as { correct: boolean; points: number; awarded: number; message: string }
        if (data.correct) {
          await fetchSummary()
          return data.awarded > 0
            ? `Correct! +${data.awarded} points to your team.`
            : "Correct! You already solved this challenge."
        } else {
          return data.message
        }
      } catch {
        return "Flag submission failed"
      }
    },
    [session, fetchSummary, summary?.displayName],
  )

  const doChallenge = useCallback(async (id?: string, opts?: { hint?: boolean; submit?: string }) => {
    if (!id) return "challenge: missing challenge id"
    
    const bundle = await fetchChallengeBundle(id)
    if (!bundle || !bundle.challenge) return `challenge: '${id}' not found`
    
    // Handle hint flag
    if (opts?.hint) {
      if (bundle.hint) return `Hint for ${id}: ${bundle.hint}`
      return `No hint available for ${id}`
    }
    
    // Handle submit flag
    if (opts?.submit) {
      return await doSubmit(id, opts.submit)
    }
    
    // Default: show challenge details
    const c = bundle.challenge
    const lines = [
      `ID: ${c.id}`,
      `Name: ${c.name}`,
      `Category: ${c.category}    Points: ${c.points}    Difficulty: ${c.difficulty}`,
      "",
      "Description:",
      c.description,
      "",
      "Files:",
      ...(c.files?.length ? c.files.map((f: string) => ` - ${f}`) : [" (none)"]),
      "",
      "Submit: challenge " + id + " --submit editaCTF{flag}",
      "   or:  challenge " + id + " -s editaCTF{flag}",
    ]
    return lines.join("\n")
  }, [fetchChallengeBundle, doSubmit])

  // Team management
  const doTeam = useCallback(
    async (action?: string, a?: string, b?: string) => {
      if (!action) {
        const userStr = session ? `Logged in as ${displayIdentity}` : "Not logged in"
        const teamDisplay = currentTeam.startsWith("guest_") ? "individual" : currentTeam
        const leaderboardStatus = isOnRealTeam
          ? "✅ Appears on leaderboard"
          : "⚠️  Create/join a team to appear on leaderboard"
        return [
          `Current team: ${teamDisplay}`,
          userStr,
          leaderboardStatus,
          "",
          "Commands:",
          "  team create <name> <password>  - Create and join a team",
          "  team join <name> <password>    - Join existing team",
          "  team leave                     - Leave current team",
          "  team show                      - Show team info",
        ].join("\n")
      }
      if (!session?.access_token) return "team: please 'auth login' first."

      const token = session.access_token
      if (action === "create") {
        if (!a || !b) return "team create: usage: team create <name> <password>"
        const res = await fetch("/api/team/create", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: a, password: b }),
        })
        if (!res.ok) {
          const t = await res.text().catch(() => "")
          return `team create: failed${t ? ` - ${t}` : ""}`
        }
        await fetchSummary()
        return [
          `Team '${a}' created and joined!`,
          "",
          "🎉 Your team will now appear on the leaderboard when you solve challenges!",
        ].join("\n")
      }
      if (action === "join") {
        if (!a || !b) return "team join: usage: team join <name> <password>"
        const res = await fetch("/api/team/join", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: a, password: b }),
        })
        if (!res.ok) {
          const t = await res.text().catch(() => "")
          return `team join: failed${t ? ` - ${t}` : ""}`
        }
        await fetchSummary()
        return [
          `Joined team '${a}'!`,
          "",
          "🎉 Your team will now appear on the leaderboard when you solve challenges!",
        ].join("\n")
      }
      if (action === "leave") {
        const res = await fetch("/api/team/leave", { method: "POST", headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) {
          const t = await res.text().catch(() => "")
          return `team leave: failed${t ? ` - ${t}` : ""}`
        }
        await fetchSummary()
        return [
          "Left team. You're now competing individually.",
          "",
          "ℹ️  Individual players don't appear on the leaderboard.",
          "   Create or join a team to compete publicly!",
        ].join("\n")
      }
      if (action === "show") {
        const teamDisplay = currentTeam.startsWith("guest_") ? "individual" : currentTeam
        const status = isOnRealTeam ? "On leaderboard" : "Individual (not on leaderboard)"
        return `Team: ${teamDisplay} (${status})`
      }
      if (action === "set") {
        return "team set is disabled. Use 'team create <name> <password>' or 'team join <name> <password>'."
      }
      return `team: unknown action '${action}'`
    },
    [session, fetchSummary, currentTeam, displayIdentity, isOnRealTeam],
  )

  // Profile management (display name)
  const doProfile = useCallback(
    async (action?: string, ...rest: string[]) => {
      if (!action || action === "show") {
        const name = summary?.displayName ?? "(none)"
        const email = session?.user_email ?? "(guest)"
        const teamDisplay = currentTeam.startsWith("guest_") ? "individual" : currentTeam
        const leaderboardStatus = isOnRealTeam
          ? "✅ Team appears on leaderboard"
          : "⚠️  Create/join a team to appear on leaderboard"
        return [
          `Display Name: ${name}`,
          `Email: ${email}`,
          `Team: ${teamDisplay}`,
          leaderboardStatus,
          "",
          "Set name with: profile name <display_name>",
          !summary?.displayName && session ? "⚠️  You need to set a display name to submit flags!" : "",
        ]
          .filter(Boolean)
          .join("\n")
      }
      if (action === "name") {
        if (!session?.access_token) return "profile: please 'auth login' first."
        const displayName = rest.join(" ").trim()
        if (!displayName) return "profile name: usage: profile name <display_name>"
        if (displayName.length < 3 || displayName.length > 32) return "profile name: must be 3-32 characters"
        // Basic character whitelist: letters, numbers, space, _ . -
        if (!/^[\w .-]+$/.test(displayName))
          return "profile name: only letters, numbers, space, underscore, dot, and dash allowed"
        const res = await fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ display_name: displayName }),
        })
        if (!res.ok) {
          const t = await res.text().catch(() => "")
          return `profile name: failed${t ? ` - ${t}` : ""}`
        }
        await fetchSummary()
        return `Display name updated to '${displayName}'. You can now submit flags!`
      }
      return `profile: unknown action '${action}'`
    },
    [session, summary?.displayName, currentTeam, fetchSummary, isOnRealTeam],
  )

  const doAuth = useCallback(
    async (action: string, a?: string, b?: string) => {
      if (!supabase) return "Auth is not configured."
      if (action === "register") {
        if (!a || !b) return "register: usage: register <email> <password>"
        const { error } = await supabase.auth.signUp({ email: a, password: b })
        if (error) return `register: ${error.message}`
        return "Registration successful. Please verify your email if required, then 'login'."
      }
      if (action === "login") {
        if (!a || !b) return "login: usage: login <email> <password>"
        const { error } = await supabase.auth.signInWithPassword({ email: a, password: b })
        if (error) return `login: ${error.message}`
        await fetchSummary()
        return "Logged in. Don't forget to set your display name with 'profile name <your_name>'!"
      }
      if (action === "logout") {
        await supabase.auth.signOut()
        setSummary(null)
        setLocalSolved([])
        setLocalScore(0)
        return "Logged out."
      }
      if (action === "me") {
        if (!session) return "me: not logged in"
        const dn = summary?.displayName ? ` (${summary.displayName})` : ""
        const teamDisplay = currentTeam.startsWith("guest_") ? "individual" : currentTeam
        return `User: ${session.user_email}${dn}\nTeam: ${teamDisplay}\nUser ID: ${session.user_id}`
      }
      return "auth: unknown action. Use: auth register|login|logout|me"
    },
    [supabase, session, currentTeam, summary?.displayName, fetchSummary],
  )

  const doExport = useCallback(() => {
    const payload = session
      ? {
          team: summary?.team ?? null,
          teamScore: summary?.teamScore ?? 0,
          user: session.user_email,
          displayName: summary?.displayName ?? null,
          teamSolved: summary?.teamSolvedIds ?? [],
        }
      : { team: "guest", score: localScore, solved: localSolved, user: null }
    return JSON.stringify(payload, null, 2)
  }, [session, summary, localScore, localSolved])

  // Autocomplete helpers
  const getCommonPrefix = (arr: string[]) => {
    if (arr.length === 0) return ""
    let prefix = arr[0]
    for (let i = 1; i < arr.length; i++) {
      const s = arr[i]
      let j = 0
      while (j < prefix.length && j < s.length && prefix[j] === s[j]) j++
      prefix = prefix.slice(0, j)
      if (!prefix) break
    }
    return prefix
  }
  const getPathCandidates = useCallback(
    (prefix: string) => {
      if (!fsRoot) return []
      const cur = findNode(fsRoot, joinPath(cwd))
      const names = listChildren(cur)
      return names.filter((n) => n.startsWith(prefix))
    },
    [cwd, fsRoot],
  )
  const getChallengeCandidates = useCallback(
    (prefix: string) => {
      return challenges.map((c) => c.id).filter((id) => id.startsWith(prefix))
    },
    [challenges],
  )
  const getCommandCandidates = useCallback((prefix: string) => {
    return COMMANDS.filter((c) => c.startsWith(prefix))
  }, [])

  const completeInput = useCallback(() => {
    const text = input
    const parts = text.split(" ").filter((p) => p.length > 0)
    const endsWithSpace = /\s$/.test(text)

    // Check if we're typing a challenge ID (first word, no spaces yet)
    if (parts.length === 1 && !endsWithSpace) {
      const prefix = parts[0]

      // First try command completion
      const cmdCands = getCommandCandidates(prefix)

      // Then try challenge ID completion
      const challengeCands = getChallengeCandidates(prefix)

      // Combine both, prioritizing commands
      const allCands = [...cmdCands, ...challengeCands]

      if (allCands.length === 0) return null
      if (allCands.length === 1) return { insert: allCands[0] + " " }
      return { insert: getCommonPrefix(allCands), suggestions: allCands }
    }

    // If no parts or empty, show commands only
    if (parts.length === 0) {
      const cands = getCommandCandidates("")
      return { suggestions: cands }
    }

    const cmd = parts[0]
    const currentArg = endsWithSpace ? "" : parts[parts.length - 1]
    const before = parts.slice(0, endsWithSpace ? parts.length : parts.length - 1).join(" ")
    let cands: string[] = []

    if (["ls", "cd", "cat", "open"].includes(cmd)) {
      cands = getPathCandidates(currentArg)
    } else if (cmd === "challenge") {
      cands = getChallengeCandidates(currentArg)
    } else if (cmd === "help") {
      cands = getCommandCandidates(currentArg)
    } else if (cmd === "team") {
      const sub = endsWithSpace ? "" : currentArg
      const subs = ["create", "join", "leave", "show"]
      cands = parts.length === 2 || (parts.length === 1 && endsWithSpace) ? subs.filter((s) => s.startsWith(sub)) : []
    } else if (cmd === "profile") {
      const sub = endsWithSpace ? "" : currentArg
      const subs = ["name", "show"]
      cands = parts.length === 2 || (parts.length === 1 && endsWithSpace) ? subs.filter((s) => s.startsWith(sub)) : []
    }

    if (cands.length === 0) return null
    if (cands.length === 1) {
      const next = [before, cands[0]].filter(Boolean).join(" ")
      return { replace: next + " " }
    }
    const prefix = getCommonPrefix(cands)
    const base = [before, prefix].filter(Boolean).join(" ")
    return { replace: base, suggestions: cands }
  }, [getChallengeCandidates, getCommandCandidates, getPathCandidates, input])

  const handleCommand = useCallback(
    async (raw: string) => {
      const line = raw.trim()
      if (!line) return
      setPending(true)
      const parts = line.split(" ").filter(Boolean)
      const cmd = parts[0]
      const args = parts.slice(1)

      setHistory((h) => [...h, { type: "input", text: `${prompt} ${line}` }])
      setCmdHistory((h) => {
        if (h[h.length - 1] === line) return h
        return [...h, line].slice(-200)
      })
      setCmdIndex(-1)

      let out = ""
      try {
        const cliContext: CliContext = {
          doDate,
          doLs,
          doChallenge,
            doChallenges: (opts) => {
              const tokens: string[] = []
              if (opts.filter) tokens.push(opts.filter)
              if (opts.all) tokens.push("--all")
              if (opts.compact) tokens.push("--compact")
              if (opts.help) tokens.push("--help")
              const arg = tokens.join(" ")
              return doChallenges(tokens.length > 0 ? arg : undefined)
            },
            doClear,
            doCd,
            doCat,
            doExport,
            doPwd,
            doWhoami: () => displayIdentity,
            doOpen,
            doRules,
            doLeaderboard,
            doTeams,
            doReload: async () => {
              await reloadData()
              await fetchSummary()
              return "Reloaded CTF data."
            },
            doTeam,
            doProfile,
            doAuth,
          }
          out = await runCli(line, cliContext)
      } catch {
        out = "Error executing command."
      }

      if (out) {
        setHistory((h) => [...h, { type: "output", text: out }])
      }
      setPending(false)
    },
    [
      prompt,
      doLs,
      doCd,
      doPwd,
      doCat,
      doOpen,
      doRules,
      doLeaderboard,
      doTeams,
      doChallenges,
      doChallenge,
      doClear,
      doDate,
      doTeam,
      doProfile,
      doAuth,
      doExport,
      reloadData,
      fetchSummary,
      displayIdentity,
      session,
      summary?.displayName,
      isOnRealTeam,
    ],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const val = input
      setInput("")
      handleCommand(val)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const nextIndex = cmdIndex < 0 ? cmdHistory.length - 1 : Math.max(0, cmdIndex - 1)
      if (cmdHistory[nextIndex] !== undefined) {
        setCmdIndex(nextIndex)
        setInput(cmdHistory[nextIndex])
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      const nextIndex = cmdIndex >= cmdHistory.length - 1 ? -1 : cmdIndex + 1
      setCmdIndex(nextIndex)
      setInput(nextIndex === -1 ? "" : (cmdHistory[nextIndex] ?? ""))
    } else if (e.key === "Tab") {
      e.preventDefault()
      const result = completeInput()
      if (!result) return
      if ((result as any).suggestions) {
        setHistory((h) => [...h, { type: "output", text: (result as any).suggestions.join("  ") }])
      }
      if ((result as any).insert != null) setInput((result as any).insert)
      else if ((result as any).replace != null) setInput((result as any).replace)
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      setHistory((h) => [...h, { type: "output", text: "" }])
      setInput("")
    }
  }

  if (!clientReady) return null
  return (
    <main className="min-h-[100dvh] bg-black text-emerald-200">
      <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
        <div
          className="rounded-lg border border-emerald-800 bg-black/80 shadow-inner"
          role="region"
          aria-label="EditaCTF terminal"
        >
          <header className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between border-b border-emerald-800 px-3 py-2">
            <div className="text-emerald-400 text-sm">{DEFAULT_HOST} Terminal</div>
            <div className="text-emerald-500 text-xs">
              {session
                ? `Signed in: ${displayIdentity} · Team: ${currentTeam.startsWith("guest_") ? "individual" : currentTeam}`
                : "Guest mode"}
              {" · "}
              Score: <span className="text-emerald-300">{scoreDisplay}</span>
              {" · "}
              Solved: <span className="text-emerald-300">{solvedCountDisplay}</span>
              {session && !summary?.displayName && <span className="text-amber-400"> · ⚠️ Set display name!</span>}
              {session && summary?.displayName && !isOnRealTeam && (
                <span className="text-amber-400"> · ⚠️ Join team for leaderboard!</span>
              )}
            </div>
          </header>
          <section
            className="h-[70dvh] md:h-[72dvh] overflow-auto px-3 py-3 font-mono text-sm leading-6 select-text"
            aria-live="polite"
            style={{ userSelect: "text", WebkitUserSelect: "text" }}
          >
            {history.map((line, i) => {
              const isHtml = /<span|&nbsp;/.test(line.text)
              return (
                <div key={i} className={line.type === "input" ? "text-emerald-300" : "text-emerald-200"}>
                  {isHtml ? (
                    <div dangerouslySetInnerHTML={{ __html: line.text }} />
                  ) : (
                    line.text.split("\n").map((t, idx) => <div key={idx}>{t || "\u00A0"}</div>)
                  )}
                </div>
              )
            })}
            {!pending ? (
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">{prompt}</span>
                <input
                  ref={inputRef}
                  aria-label="Terminal input"
                  className="flex-1 bg-transparent outline-none border-none text-emerald-100 placeholder:text-emerald-700 caret-emerald-400"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="type a command or paste editaCTF{flag}"
                  autoFocus
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-emerald-600 animate-pulse">...</span>
              </div>
            )}
            <div ref={termEndRef} />
          </section>
          <footer className="border-t border-emerald-800 px-3 py-2 text-[11px] text-emerald-600">
            {session
              ? summary?.displayName
                ? isOnRealTeam
                  ? "Ready to compete! Just paste editaCTF{flag} or use <challenge-id> editaCTF{flag}"
                  : "Individual mode. Create/join a team to appear on leaderboard: team create <name> <password>"
                : "Set your display name with 'profile name <your_name>' to submit flags."
              : "Register with 'auth register <email> <password>' to start competing."}
          </footer>
        </div>
      </div>
    </main>
  )
}
