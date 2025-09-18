import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// Helper function to check admin permissions
async function checkAdminPermission(req: NextRequest, requiredRole: string[] = ['admin', 'super_admin']) {
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined
  
  if (!token) {
    return { error: "Unauthorized", status: 401 }
  }

  try {
    const supabase = createServerSupabase(token)
    const { data: userRes } = await supabase.auth.getUser()
    const user = userRes?.user
    
    if (!user) {
      return { error: "Unauthorized", status: 401 }
    }

    // Check for hardcoded admin emails as fallback
    const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || []
    
    // Try to get role from user_roles table, fallback to admin emails
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, granted_at, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    // Check database role first, fallback to hardcoded emails
    const isAuthorized = userRole ? 
      requiredRole.includes(userRole.role) : 
      ADMIN_EMAILS.includes(user.email || "")

    if (!isAuthorized) {
      return { error: "Insufficient permissions", status: 403 }
    }

    return { 
      supabase, 
      user, 
      role: userRole?.role || 'admin'
    }
  } catch (error) {
    return { error: "Internal server error", status: 500 }
  }
}

// Advanced scoring calculation engine
export class AdvancedScoringSystem {
  private supabase: any

  constructor(supabase: any) {
    this.supabase = supabase
  }

  // Calculate dynamic points based on solve rate and difficulty
  async calculateDynamicPoints(challengeId: string): Promise<number> {
    try {
      // Get challenge base points and difficulty
      const { data: challenge } = await this.supabase
        .from('challenges')
        .select('points, difficulty, category, daily')
        .eq('id', challengeId)
        .single()

      if (!challenge) return 0

      const basePoints = challenge.points || 100

      // Get total number of teams/users
      const { count: totalTeams } = await this.supabase
        .from('teams')
        .select('*', { count: 'exact', head: true })
        .neq('name', 'guest')

      // Get number of solves for this challenge
      const { count: solveCount } = await this.supabase
        .from('solves')
        .select('*', { count: 'exact', head: true })
        .eq('challenge_id', challengeId)

      if (!totalTeams || totalTeams === 0) return basePoints

      // Dynamic scoring formula
      const solveRate = (solveCount || 0) / totalTeams
      let multiplier = 1.0

      // Fewer solves = higher points (max 2x for unsolved, min 0.5x for >80% solve rate)
      if (solveRate === 0) {
        multiplier = 2.0 // Unsolved challenges are worth double
      } else if (solveRate < 0.1) {
        multiplier = 1.8 // <10% solve rate
      } else if (solveRate < 0.25) {
        multiplier = 1.5 // <25% solve rate
      } else if (solveRate < 0.5) {
        multiplier = 1.2 // <50% solve rate
      } else if (solveRate < 0.8) {
        multiplier = 1.0 // 50-80% solve rate (normal)
      } else {
        multiplier = 0.7 // >80% solve rate (easier challenge)
      }

      // Difficulty bonus
      const difficultyMultiplier: Record<string, number> = {
        'easy': 1.0,
        'medium': 1.3,
        'hard': 1.6,
        'expert': 2.0
      }
      const diffMult = difficultyMultiplier[challenge.difficulty] || 1.0

      // Category bonus (some categories might be worth more)
      const categoryMultiplier: Record<string, number> = {
        'crypto': 1.2,
        'pwn': 1.3,
        'reverse': 1.2,
        'web': 1.0,
        'forensics': 1.1,
        'misc': 1.0
      }
      const catMult = categoryMultiplier[challenge.category] || 1.0

      // Daily challenge bonus
      const dailyMultiplier = challenge.daily ? 1.5 : 1.0

      const finalPoints = Math.round(
        basePoints * multiplier * diffMult * catMult * dailyMultiplier
      )

      return Math.max(finalPoints, Math.round(basePoints * 0.3)) // Minimum 30% of base points
    } catch (error) {
      console.error('Error calculating dynamic points:', error)
      return 100 // Fallback to base points
    }
  }

  // Calculate first blood bonus
  async calculateFirstBloodBonus(challengeId: string, teamId: string): Promise<{points: number, isFirstBlood: boolean}> {
    try {
      // Check if this is the first solve for this challenge
      const { data: firstSolve } = await this.supabase
        .from('solves')
        .select('id, team_name, created_at')
        .eq('challenge_id', challengeId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      const isFirstBlood = !firstSolve

      if (isFirstBlood) {
        // Get competition settings for first blood bonus
        const { data: settings } = await this.supabase
          .from('competition_settings')
          .select('first_blood_bonus')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        
        const bonus = settings?.first_blood_bonus || 50
        return { points: bonus, isFirstBlood: true }
      }

      return { points: 0, isFirstBlood: false }
    } catch (error) {
      console.error('Error calculating first blood bonus:', error)
      return { points: 0, isFirstBlood: false }
    }
  }

  // Calculate team bonus/penalty based on team size
  calculateTeamSizeModifier(teamSize: number, maxTeamSize: number = 4): number {
    if (teamSize <= 1) return 1.0 // Solo players get no penalty
    
    // Linear penalty for larger teams (encourages smaller teams)
    const sizeRatio = teamSize / maxTeamSize
    return Math.max(0.7, 1.0 - (sizeRatio - 1) * 0.3) // Max 30% penalty for max-size teams
  }

  // Calculate time-based bonus for quick solves
  calculateSpeedBonus(challengeReleaseTime: string, solveTime: string, challengeDifficulty: string): number {
    try {
      const releaseMs = new Date(challengeReleaseTime).getTime()
      const solveMs = new Date(solveTime).getTime()
      const timeDiffHours = (solveMs - releaseMs) / (1000 * 60 * 60)

      // Speed bonus thresholds based on difficulty
      const speedThresholds = {
        'easy': { fast: 1, medium: 6, slow: 24 },
        'medium': { fast: 2, medium: 12, slow: 48 },
        'hard': { fast: 4, medium: 24, slow: 72 },
        'expert': { fast: 8, medium: 48, slow: 120 }
      }

      const thresholds = speedThresholds[challengeDifficulty as keyof typeof speedThresholds] || speedThresholds.medium

      if (timeDiffHours <= thresholds.fast) {
        return 25 // Fast solve bonus
      } else if (timeDiffHours <= thresholds.medium) {
        return 10 // Medium speed bonus
      }

      return 0 // No speed bonus for slow solves
    } catch (error) {
      return 0
    }
  }

  // Main scoring calculation with all bonuses and modifiers
  async calculateTotalScore(
    challengeId: string, 
    teamId: string, 
    teamSize: number,
    solveTime: string
  ): Promise<{
    basePoints: number,
    dynamicPoints: number,
    firstBloodBonus: number,
    speedBonus: number,
    teamSizeModifier: number,
    totalPoints: number,
    isFirstBlood: boolean,
    breakdown: any
  }> {
    try {
      // Get challenge details
      const { data: challenge } = await this.supabase
        .from('challenges')
        .select('points, difficulty, category, daily, created_at')
        .eq('id', challengeId)
        .single()

      const basePoints = challenge?.points || 100
      
      // Calculate all components
      const dynamicPoints = await this.calculateDynamicPoints(challengeId)
      const firstBlood = await this.calculateFirstBloodBonus(challengeId, teamId)
      const speedBonus = this.calculateSpeedBonus(
        challenge?.created_at || solveTime, 
        solveTime, 
        challenge?.difficulty || 'medium'
      )
      const teamSizeModifier = this.calculateTeamSizeModifier(teamSize)

      // Calculate final score
      const adjustedPoints = Math.round(dynamicPoints * teamSizeModifier)
      const totalPoints = adjustedPoints + firstBlood.points + speedBonus

      return {
        basePoints,
        dynamicPoints,
        firstBloodBonus: firstBlood.points,
        speedBonus,
        teamSizeModifier,
        totalPoints,
        isFirstBlood: firstBlood.isFirstBlood,
        breakdown: {
          challenge: challenge?.difficulty || 'unknown',
          category: challenge?.category || 'unknown',
          daily: challenge?.daily || false,
          solveTime,
          teamSize
        }
      }
    } catch (error) {
      console.error('Error calculating total score:', error)
      return {
        basePoints: 100,
        dynamicPoints: 100,
        firstBloodBonus: 0,
        speedBonus: 0,
        teamSizeModifier: 1.0,
        totalPoints: 100,
        isFirstBlood: false,
        breakdown: {}
      }
    }
  }
}

// GET /api/admin/scoring - Get scoring configuration and statistics
export async function GET(req: NextRequest) {
  const authCheck = await checkAdminPermission(req)
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase } = authCheck
  const { searchParams } = new URL(req.url)
  const challengeId = searchParams.get('challengeId')

  try {
    if (challengeId) {
      // Get scoring details for a specific challenge
      const scoringSystem = new AdvancedScoringSystem(supabase)
      const dynamicPoints = await scoringSystem.calculateDynamicPoints(challengeId)
      
      // Get solve statistics
      const [
        { data: challenge },
        { count: totalSolves },
        { data: recentSolves }
      ] = await Promise.all([
        supabase.from('challenges').select('*').eq('id', challengeId).single(),
        supabase.from('solves').select('*', { count: 'exact', head: true }).eq('challenge_id', challengeId),
        supabase
          .from('solves')
          .select('team_name, created_at, user_id')
          .eq('challenge_id', challengeId)
          .order('created_at', { ascending: true })
          .limit(10)
      ])

      return NextResponse.json({
        challenge,
        scoring: {
          basePoints: challenge?.points || 100,
          currentDynamicPoints: dynamicPoints,
          totalSolves: totalSolves || 0
        },
        recentSolves: recentSolves || []
      })
    } else {
      // Get overall scoring configuration
      const { data: settings } = await supabase
        .from('competition_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      // Get scoring statistics
      const [
        { count: totalChallenges },
        { data: scoreDistribution }
      ] = await Promise.all([
        supabase.from('challenges').select('*', { count: 'exact', head: true }),
        supabase
          .from('solves')
          .select('challenge_id')
          .then(({ data }) => {
            const distribution: Record<string, number> = {}
            data?.forEach(solve => {
              distribution[solve.challenge_id] = (distribution[solve.challenge_id] || 0) + 1
            })
            return { data: distribution }
          })
      ])

      return NextResponse.json({
        settings: settings || {
          dynamic_scoring: true,
          first_blood_bonus: 50,
          team_size_penalty: true,
          speed_bonus: true,
          points_decay_enabled: false
        },
        statistics: {
          totalChallenges: totalChallenges || 0,
          scoreDistribution: scoreDistribution || {}
        }
      })
    }
  } catch (error) {
    console.error('Error in GET /api/admin/scoring:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/admin/scoring - Update scoring configuration
export async function POST(req: NextRequest) {
  const authCheck = await checkAdminPermission(req, ['super_admin'])
  if ('error' in authCheck) {
    return NextResponse.json({ error: authCheck.error }, { status: authCheck.status })
  }

  const { supabase, user } = authCheck

  try {
    const body = await req.json()
    const {
      dynamicScoring,
      firstBloodBonus,
      teamSizePenalty,
      speedBonus,
      pointsDecayEnabled,
      recalculateExisting
    } = body

    // Update competition settings
    const { error } = await supabase
      .from('competition_settings')
      .upsert({
        dynamic_scoring: dynamicScoring,
        first_blood_bonus: firstBloodBonus,
        team_size_penalty: teamSizePenalty,
        speed_bonus: speedBonus,
        points_decay_enabled: pointsDecayEnabled,
        updated_by: user.id
      })

    if (error) {
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    // Optionally recalculate existing scores
    if (recalculateExisting) {
      // This would be a background job in a real system
      // For now, we'll just log the intent
      await supabase
        .from('user_activity_logs')
        .insert({
          user_id: user.id,
          action_type: 'scoring_recalculation_requested',
          details: { settings: body }
        })
    }

    return NextResponse.json({
      success: true,
      message: 'Scoring configuration updated successfully',
      recalculationRequested: recalculateExisting
    })

  } catch (error) {
    console.error('Error in POST /api/admin/scoring:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}