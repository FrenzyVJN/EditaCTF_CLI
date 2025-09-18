import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { rulesText as fallbackRules } from "@/lib/ctf-data"

type FsNode = {
  name: string
  path: string
  type: "dir" | "file"
  children?: FsNode[]
  content?: string
  mime?: string
  sourceUrl?: string
}

function baseFS(): FsNode {
  const root: FsNode = { name: "/", path: "/", type: "dir", children: [] }

  // rules.txt: from DB via /api/rules (for consistency) but also inline fallback
  root.children!.push({
    name: "rules.txt",
    path: "/rules.txt",
    type: "file",
    sourceUrl: "/api/rules",
    mime: "text/plain",
    content: fallbackRules,
  })

  root.children!.push({
    name: "leaderboard.json",
    path: "/leaderboard.json",
    type: "file",
    sourceUrl: "/api/leaderboard",
    mime: "application/json",
  })

  root.children!.push({
    name: "teams.json",
    path: "/teams.json",
    type: "file",
    sourceUrl: "/api/teams",
    mime: "application/json",
  })

  return root
}

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id,name,category,points,difficulty,daily")
    .order("category", { ascending: true })
    .order("points", { ascending: true })

  const root = baseFS()

  // Challenges folder
  const challengesDir: FsNode = {
    name: "challenges",
    path: "/challenges",
    type: "dir",
    children: [],
  }

  const byCategory = new Map<string, any[]>()
  for (const c of challenges ?? []) {
    const arr = byCategory.get(c.category) ?? []
    arr.push(c)
    byCategory.set(c.category, arr)
  }

  for (const [category, items] of byCategory.entries()) {
    const catDir: FsNode = { name: category, path: `/challenges/${category}`, type: "dir", children: [] }
    for (const c of items) {
      const chDir: FsNode = {
        name: c.id,
        path: `/challenges/${category}/${c.id}`,
        type: "dir",
        children: [],
      }
      chDir.children!.push({
        name: "README.md",
        path: `${chDir.path}/README.md`,
        type: "file",
        mime: "text/markdown",
        content: [
          `# ${c.name}`,
          ``,
          `ID: ${c.id}`,
          `Category: ${c.category}`,
          `Points: ${c.points}`,
          `Difficulty: ${c.difficulty}`,
          `Daily: ${c.daily ? "yes" : "no"}`,
          ``,
          `Use 'challenge ${c.id}' to view full details and files.`,
          `Use 'hint ${c.id}' to reveal a hint.`,
          `Submit with: submit ${c.id} editaCTF{your_flag_here}`,
        ].join("\n"),
      })
      chDir.children!.push({
        name: "challenge.txt",
        path: `${chDir.path}/challenge.txt`,
        type: "file",
        sourceUrl: `/api/challenges?id=${encodeURIComponent(c.id)}`,
        mime: "application/json",
      })
      chDir.children!.push({
        name: "hints.txt",
        path: `${chDir.path}/hints.txt`,
        type: "file",
        sourceUrl: `/api/challenges?hint=${encodeURIComponent(c.id)}`,
        mime: "text/plain",
      })
      catDir.children!.push(chDir)
    }
    challengesDir.children!.push(catDir)
  }

  root.children!.push(challengesDir)

  // Daily shortcut folder
  const dailyDir: FsNode = { name: "daily", path: "/daily", type: "dir", children: [] }
  for (const c of (challenges ?? []).filter((x) => x.daily)) {
    dailyDir.children!.push({
      name: `${c.id}.json`,
      path: `/daily/${c.id}.json`,
      type: "file",
      sourceUrl: `/api/challenges?id=${encodeURIComponent(c.id)}`,
      mime: "application/json",
    })
  }
  root.children!.push(dailyDir)

  return NextResponse.json(root)
}
