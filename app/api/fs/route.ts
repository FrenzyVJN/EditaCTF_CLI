import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerSupabase } from "@/lib/supabase/server"
import { rulesText as fallbackRules } from "@/lib/ctf-data"
import { FsNode } from "@/app/types"
// Helper to recursively find a node by path
function findNodeByPath(node: FsNode, path: string): FsNode | undefined {
  if (node.path === path) return node
  if (node.children) {
    for (const child of node.children) {
      const found = findNodeByPath(child, path)
      if (found) return found
    }
  }
  return undefined
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
  const { searchParams } = _req.nextUrl
  const path = searchParams.get("path")

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

  // If a path is provided, return only that node (with content if available)
  if (path) {
    const node = findNodeByPath(root, path)
    if (!node) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    // For rules.txt, provide fallback content
    if (node.path === "/rules.txt") {
      return NextResponse.json({ ...node, content: fallbackRules })
    }
    // For README.md, generate content on demand
    if (node.name === "README.md" && node.path.startsWith("/challenges/")) {
      // Extract challenge info from path
      const parts = node.path.split("/")
      const category = parts[2]
      const id = parts[3]
      const challenge = (challenges ?? []).find((c) => c.id === id && c.category === category)
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
          `Use 'hint ${challenge.id}' to reveal a hint.`,
          `Submit with: submit ${challenge.id} editaCTF{your_flag_here}`,
        ].join("\n")
        return NextResponse.json({ ...node, content })
      }
    }
    // For other files, just return node (content may be fetched from sourceUrl by frontend)
    return NextResponse.json(node)
  }

  // Default: return the whole tree (names/metadata only)
  return NextResponse.json(root)
}
