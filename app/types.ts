export type FsNode = {
  name: string
  path: string
  type: "dir" | "file"
  children?: FsNode[]
  content?: string
  mime?: string
  sourceUrl?: string
}

export type ChallengeMeta = {
  id: string
  name: string
  category: string
  points: number
  difficulty: "easy" | "medium" | "hard" | string
  daily?: boolean
}

export type LeaderboardRow = {
  rank: number
  team: string
  score: number
  solves: number
}

export type TeamsRow = {
  name: string
  members: number
  score: number
}

export type TerminalLine = {
  type: "input" | "output" | "system"
  text: string
}

export type AdminUserView = {
  user_id: string
  display_name: string | null
  team_name: string
  email: string
  email_confirmed: boolean
  last_sign_in: string | null
  created_at: string
  solveCount: number
}

export type AdminChallengeView = {
  id: string
  name: string
  category: string
  points: number
  difficulty: string
  description: string
  daily: boolean
  files: string[]
  hint: string
  flag: string | null
  solveCount: number
}

export type AdminActivity = {
  id: string
  type: "solve" | "admin"
  description: string
  created_at: string
  user_name?: string
  team_name?: string
  challenge_name?: string
  points?: number
  action?: string
  target_type?: string
}

export type AdminTeamView = {
  name: string
  member_count: number
  score: number
  isPasswordProtected: boolean
  created_at: string | null
  members: Array<{
    user_id: string
    display_name: string | null
    joined_at: string
  }>
}

export type SystemStats = {
  totalUsers: number
  totalChallenges: number
  totalSolves: number
  totalTeams: number
  recentSolves: number
  lastActivity: string | null
}