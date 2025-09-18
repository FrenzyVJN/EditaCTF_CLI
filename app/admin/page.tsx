"use client"

import { useCallback, useEffect, useState } from "react"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Users,
  Shield,
  Activity,
  Settings,
  Trash2,
  Edit,
  Key,
  UserPlus,
  Database,
  Clock,
  TrendingUp,
} from "lucide-react"

type AdminUser = {
  user_id: string
  display_name: string | null
  team_name: string
  email: string
  email_confirmed: boolean
  last_sign_in: string | null
  created_at: string
  solveCount: number
}

type AdminChallenge = {
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

type AdminActivity = {
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

type AdminTeam = {
  name: string
  members: number
  score: number
  isPasswordProtected: boolean
  created_at: string | null
  members: Array<{
    user_id: string
    display_name: string | null
    joined_at: string
  }>
}

type SystemStats = {
  totalUsers: number
  totalChallenges: number
  totalSolves: number
  totalTeams: number
  recentSolves: number
  lastActivity: string | null
}

export default function AdminPage() {
  const [session, setSession] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [challenges, setChallenges] = useState<AdminChallenge[]>([])
  const [activities, setActivities] = useState<AdminActivity[]>([])
  const [teams, setTeams] = useState<AdminTeam[]>([])
  const [admins, setAdmins] = useState<any[]>([])
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [newChallenge, setNewChallenge] = useState({
    id: "",
    name: "",
    category: "",
    points: "",
    difficulty: "medium",
    description: "",
    daily: false,
    files: "",
    hint: "",
    flag: "",
  })

  const supabase = getSupabaseClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession()
      const s = data.session
      setSession(s)

      if (s) {
        try {
          const res = await fetch("/api/admin/auth", {
            method: "POST",
            headers: { Authorization: `Bearer ${s.access_token}` },
          })
          setIsAdmin(res.ok)
        } catch {
          setIsAdmin(false)
        }
      }
      setLoading(false)
    }
    checkAuth()
  }, [supabase])

  const fetchUsers = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users)
      }
    } catch (e) {
      console.error("Failed to fetch users:", e)
    }
  }, [session?.access_token])

  const fetchChallenges = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/challenges", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setChallenges(data.challenges)
      }
    } catch (e) {
      console.error("Failed to fetch challenges:", e)
    }
  }, [session?.access_token])

  const fetchActivities = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/logs", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        console.log("Activities fetched:", data.debug) // Debug info
        setActivities(data.activities || [])
      } else {
        console.error("Failed to fetch activities:", await res.text())
      }
    } catch (e) {
      console.error("Failed to fetch activities:", e)
    }
  }, [session?.access_token])

  const fetchTeams = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/teams", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTeams(data.teams)
      }
    } catch (e) {
      console.error("Failed to fetch teams:", e)
    }
  }, [session?.access_token])

  const fetchAdmins = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/admins", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setAdmins(data.admins)
      }
    } catch (e) {
      console.error("Failed to fetch admins:", e)
    }
  }, [session?.access_token])

  const fetchSystemStats = useCallback(async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/system", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setSystemStats(data.stats)
      }
    } catch (e) {
      console.error("Failed to fetch system stats:", e)
    }
  }, [session?.access_token])

  const updateUser = async (userId: string, updates: any) => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        fetchUsers()
        setEditingUser(null)
      }
    } catch (e) {
      console.error("Failed to update user:", e)
    }
  }

  const deleteUser = async (userId: string) => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        fetchUsers()
        fetchActivities()
      }
    } catch (e) {
      console.error("Failed to delete user:", e)
    }
  }

  const sendPasswordReset = async (userId: string) => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message)
        fetchActivities()
      }
    } catch (e) {
      console.error("Failed to send password reset:", e)
    }
  }

  const addAdmin = async () => {
    if (!session?.access_token || !newAdminEmail) return
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: newAdminEmail }),
      })
      if (res.ok) {
        const data = await res.json()
        alert(data.message)
        setNewAdminEmail("")
        fetchActivities()
      }
    } catch (e) {
      console.error("Failed to add admin:", e)
    }
  }

  const createChallenge = async () => {
    if (!session?.access_token) return
    try {
      const res = await fetch("/api/admin/challenges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...newChallenge,
          points: Number(newChallenge.points),
          files: newChallenge.files
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean),
        }),
      })
      if (res.ok) {
        setNewChallenge({
          id: "",
          name: "",
          category: "",
          points: "",
          difficulty: "medium",
          description: "",
          daily: false,
          files: "",
          hint: "",
          flag: "",
        })
        fetchChallenges()
        fetchActivities()
      }
    } catch (e) {
      console.error("Failed to create challenge:", e)
    }
  }

  const deleteTeam = async (teamName: string) => {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/admin/teams?name=${encodeURIComponent(teamName)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        fetchTeams()
        fetchUsers()
        fetchActivities()
      }
    } catch (e) {
      console.error("Failed to delete team:", e)
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  if (!session) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Admin Login Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please log in to access the admin panel.</p>
            <Button onClick={() => (window.location.href = "/")} className="mt-4">
              Go to Terminal
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card>
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You don't have admin privileges.</p>
            <Button onClick={() => (window.location.href = "/")} className="mt-4">
              Go to Terminal
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">EditaCTF Admin Panel</h1>
        <Button onClick={() => (window.location.href = "/")} variant="outline">
          Back to Terminal
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="dashboard" onClick={fetchSystemStats}>
            <Settings className="w-4 h-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="users" onClick={fetchUsers}>
            <Users className="w-4 h-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="teams" onClick={fetchTeams}>
            Teams
          </TabsTrigger>
          <TabsTrigger value="challenges" onClick={fetchChallenges}>
            Challenges
          </TabsTrigger>
          <TabsTrigger value="activity" onClick={fetchActivities}>
            <Activity className="w-4 h-4 mr-2" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="admins" onClick={fetchAdmins}>
            <Shield className="w-4 h-4 mr-2" />
            Admins
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.totalUsers || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Challenges</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.totalChallenges || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Solves</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.totalSolves || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemStats?.recentSolves || 0}</div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management ({users.length} users)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.user_id} className="flex items-center justify-between p-4 border rounded">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{user.display_name || "No display name"}</div>
                        {!user.display_name && <Badge variant="destructive">Incomplete Profile</Badge>}
                        {!user.email_confirmed && <Badge variant="outline">Unverified Email</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Email: {user.email} • Team: {user.team_name} • Solves: {user.solveCount}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ID: {user.user_id} • Joined: {new Date(user.created_at).toLocaleDateString()}
                        {user.last_sign_in && ` • Last login: ${new Date(user.last_sign_in).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingUser(user)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendPasswordReset(user.user_id)}>
                        <Key className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete User</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete {user.display_name || user.email} and all their data. This
                              action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteUser(user.user_id)}>Delete User</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {editingUser && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Edit User: {editingUser.display_name || editingUser.email}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="edit-display-name">Display Name</Label>
                  <Input
                    id="edit-display-name"
                    defaultValue={editingUser.display_name || ""}
                    placeholder="Display name"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-team">Team</Label>
                  <Input id="edit-team" defaultValue={editingUser.team_name} placeholder="Team name" />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const displayName = (document.getElementById("edit-display-name") as HTMLInputElement)?.value
                      const teamName = (document.getElementById("edit-team") as HTMLInputElement)?.value
                      updateUser(editingUser.user_id, {
                        display_name: displayName || null,
                        team_name: teamName || "guest",
                      })
                    }}
                  >
                    Save Changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditingUser(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <CardTitle>Team Management ({teams.length} teams)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {teams.map((team) => (
                  <div key={team.name} className="p-4 border rounded">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-lg">{team.name}</h3>
                        {team.isPasswordProtected && <Badge variant="secondary">Password Protected</Badge>}
                        <Badge variant="outline">{team.score} points</Badge>
                        <Badge variant="outline">{team.members.length} members</Badge>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            Delete Team
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Team "{team.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will move all team members to guest status and cannot be undone. All team solves will
                              be attributed to guest.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteTeam(team.name)}>Delete Team</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    {team.created_at && (
                      <div className="text-sm text-muted-foreground mb-3">
                        Created: {new Date(team.created_at).toLocaleDateString()}
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="font-medium">Members:</h4>
                      {team.members.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {team.members.map((member) => (
                            <div
                              key={member.user_id}
                              className="flex items-center justify-between p-2 bg-muted rounded"
                            >
                              <div>
                                <div className="font-medium">{member.display_name || "No display name"}</div>
                                <div className="text-xs text-muted-foreground">
                                  Joined: {new Date(member.joined_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-muted-foreground">No members</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="challenges">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create New Challenge</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="id">Challenge ID</Label>
                    <Input
                      id="id"
                      value={newChallenge.id}
                      onChange={(e) => setNewChallenge({ ...newChallenge, id: e.target.value })}
                      placeholder="e.g., web-sqli-basic"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newChallenge.name}
                      onChange={(e) => setNewChallenge({ ...newChallenge, name: e.target.value })}
                      placeholder="Challenge Name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Input
                      id="category"
                      value={newChallenge.category}
                      onChange={(e) => setNewChallenge({ ...newChallenge, category: e.target.value })}
                      placeholder="web, crypto, pwn, etc."
                    />
                  </div>
                  <div>
                    <Label htmlFor="points">Points</Label>
                    <Input
                      id="points"
                      type="number"
                      value={newChallenge.points}
                      onChange={(e) => setNewChallenge({ ...newChallenge, points: e.target.value })}
                      placeholder="100"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newChallenge.description}
                    onChange={(e) => setNewChallenge({ ...newChallenge, description: e.target.value })}
                    placeholder="Challenge description..."
                  />
                </div>
                <div>
                  <Label htmlFor="hint">Hint</Label>
                  <Input
                    id="hint"
                    value={newChallenge.hint}
                    onChange={(e) => setNewChallenge({ ...newChallenge, hint: e.target.value })}
                    placeholder="Helpful hint for participants"
                  />
                </div>
                <div>
                  <Label htmlFor="flag">Flag</Label>
                  <Input
                    id="flag"
                    value={newChallenge.flag}
                    onChange={(e) => setNewChallenge({ ...newChallenge, flag: e.target.value })}
                    placeholder="editaCTF{flag_here}"
                  />
                </div>
                <Button onClick={createChallenge} className="w-full">
                  Create Challenge
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Existing Challenges ({challenges.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {challenges.map((challenge) => (
                    <div key={challenge.id} className="p-4 border rounded">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium">{challenge.name}</div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{challenge.category}</Badge>
                          <Badge variant="outline">{challenge.points} pts</Badge>
                          <Badge variant="outline">{challenge.solveCount} solves</Badge>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground mb-2">
                        ID: {challenge.id} • Difficulty: {challenge.difficulty}
                      </div>
                      <div className="text-sm">{challenge.description}</div>
                      {challenge.flag && (
                        <div className="text-xs font-mono mt-2 p-2 bg-muted rounded">Flag: {challenge.flag}</div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>System Activity ({activities.length} recent activities)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activities.length > 0 ? (
                  activities.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-3 border rounded text-sm">
                      <div className="flex items-center gap-3">
                        {activity.type === "solve" ? (
                          <Badge variant="default">Solve</Badge>
                        ) : (
                          <Badge variant="secondary">Admin</Badge>
                        )}
                        <span>{activity.description}</span>
                      </div>
                      <div className="text-right">
                        {activity.points && <div className="font-medium">+{activity.points} pts</div>}
                        <div className="text-xs text-muted-foreground">
                          {new Date(activity.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <div className="mb-2">No recent activity found.</div>
                    <div className="text-xs">
                      Activity includes flag solves and admin actions. Try submitting a flag or performing an admin
                      action to see activity here.
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admins">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Admin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="admin-email">Admin Email</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@example.com"
                  />
                </div>
                <Button onClick={addAdmin} disabled={!newAdminEmail}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Admin
                </Button>
                <div className="text-sm text-muted-foreground">
                  Note: You'll need to update the ADMIN_EMAILS environment variable and restart the application.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Admins ({admins.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {admins.map((admin) => (
                    <div key={admin.user_id} className="flex items-center justify-between p-4 border rounded">
                      <div>
                        <div className="font-medium">{admin.display_name || "No display name"}</div>
                        <div className="text-sm text-muted-foreground">{admin.email}</div>
                        <div className="text-xs text-muted-foreground">
                          Added: {new Date(admin.created_at).toLocaleDateString()}
                          {admin.last_sign_in && ` • Last login: ${new Date(admin.last_sign_in).toLocaleDateString()}`}
                        </div>
                      </div>
                      <Badge variant="outline">
                        <Shield className="w-3 h-3 mr-1" />
                        Admin
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
