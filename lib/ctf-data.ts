export type Challenge = {
  id: string
  name: string
  category: string
  points: number
  difficulty: "easy" | "medium" | "hard" | string
  description: string
  daily?: boolean
  files?: string[] // human-visible file names in pseudo-folder
  hint: string
  // Secret server-only flag (do not expose via public endpoints)
  flag: string
}

export const rulesText = `EditaCTF Rules
----------------
1. Be respectful. No harassment or abuse.
2. No sharing flags, brute force against infrastructure, or attacking other teams.
3. Automated scanning of the platform is prohibited.
4. One account per participant or team; pick a team name using 'team set <name>'.
5. Flag format: editaCTF{...} unless stated otherwise.
6. Have fun and learn!

Contact organizers for issues.`

export const sampleChallenges: Challenge[] = [
  {
    id: "warmup-echo",
    name: "Echoes in the Terminal",
    category: "pwn",
    points: 100,
    difficulty: "easy",
    description:
      "Warm up your terminal-fu. Find the hidden echo in a simple output. Sometimes the obvious is the answer.",
    daily: true,
    files: ["README.md", "challenge.txt", "hints.txt"],
    hint: "Try inspecting simple strings and outputs; maybe something is echoed literally.",
    flag: "editaCTF{terminal_echo_master}",
  },
  {
    id: "web-sqli",
    name: "Login Bypass 101",
    category: "web",
    points: 200,
    difficulty: "medium",
    description:
      "A classic web challenge. Can you find a way to log in without knowing the password?",
    daily: false,
    files: ["README.md", "challenge.txt", "hints.txt"],
    hint: "What does ' OR '1'='1 do in the right context?",
    flag: "editaCTF{no_sql_for_you}",
  },
  {
    id: "crypto-baby-xor",
    name: "Baby XOR",
    category: "crypto",
    points: 150,
    difficulty: "easy",
    description:
      "Decrypt a message encrypted with a single-byte XOR. Determine the key and recover the plaintext.",
    daily: true,
    files: ["README.md", "cipher.txt", "hints.txt"],
    hint: "Frequency of spaces and common letters can be a giveaway.",
    flag: "editaCTF{xor_treasure}",
  },
]

export function getPublicChallengeList() {
  return sampleChallenges.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    points: c.points,
    difficulty: c.difficulty,
    daily: c.daily,
  }))
}

export function getPublicChallengeById(id: string) {
  const c = sampleChallenges.find((x) => x.id === id)
  if (!c) return null
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    points: c.points,
    difficulty: c.difficulty,
    description: c.description,
    files: c.files ?? [],
    daily: c.daily,
  }
}

export function getHintById(id: string) {
  const c = sampleChallenges.find((x) => x.id === id)
  return c?.hint ?? null
}

export function validateFlag(id: string, flag: string) {
  const c = sampleChallenges.find((x) => x.id === id)
  if (!c) return { ok: false, message: "Unknown challenge id." }
  if (!/^editaCTF\{.*\}$/.test(flag)) return { ok: false, message: "Invalid flag format. Expected editaCTF{...}" }
  if (flag === c.flag) return { ok: true, points: c.points }
  return { ok: false, message: "Incorrect flag. Keep trying!" }
}
