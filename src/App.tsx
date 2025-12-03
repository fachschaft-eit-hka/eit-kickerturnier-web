import { useState, useEffect, useCallback, useRef } from 'react'
import { Play, Pause, RotateCcw, Timer, Trophy, Clock, Medal, RefreshCw, ChevronDown, GitMerge, Table, Award, Download } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import './App.css'

// Types for Kickertool API
interface TeamStats {
  place: number
  matches: number
  won: number
  lost: number
  draws: number
  goals: number
  goals_in: number
  goal_diff: number
  points: number
}

interface Standing {
  _id: string
  name: string
  stats: TeamStats
}

interface Table {
  _id: string
  name: string
}

interface MatchTeam {
  _id?: string
  name: string
}

interface Match {
  _id: string
  team1: MatchTeam
  team2: MatchTeam
  result: [number, number]
  valid: boolean
  timeEnd: number | null
  tables: Table[] | null
}

interface Round {
  _id: string
  name: string
  matches: Match[]
}

interface EliminationGroup {
  _id: string
  name: string
  size: number
  finished: boolean
  thirdPlace: boolean
  double: boolean
  standings: Standing[]
  levels: Round[]
  leftLevels: Round[]
  third?: Round
}

interface Group {
  standings: Standing[]
  rounds?: Round[]
  levels?: Round[]
}

interface TournamentData {
  name: string
  eliminations: EliminationGroup[]
  qualifying: Group[]
}

interface TournamentInfo {
  _id: string
  name: string
  date: string
  numParticipants: number
}

interface PageData {
  name: string
  tournaments: TournamentInfo[]
}

function App() {
  const [time, setTime] = useState(10 * 60)
  const [isRunning, setIsRunning] = useState(false)
  const [initialTime, setInitialTime] = useState(10 * 60)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [customMinutes, setCustomMinutes] = useState('')
  const [customSeconds, setCustomSeconds] = useState('')
  
  // Tournament data state
  const [tournamentData, setTournamentData] = useState<TournamentData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Track previous positions for animations
  const [prevPositions, setPrevPositions] = useState<Map<string, number>>(new Map())
  const [positionChanges, setPositionChanges] = useState<Map<string, 'up' | 'down' | 'none'>>(new Map())
  
  // Tournament selection state
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([])
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('')
  const [pageName, setPageName] = useState<string>('Kickerturnier')
  const [displayMode, setDisplayMode] = useState<'standings' | 'bracket' | 'results'>('standings')

  // Change this to your Kickertool page slug (from your Kickertool URL)
  const PAGE_SLUG = 'fseithka'
  const PAGE_API_URL = `/api/kickertool/pages/${PAGE_SLUG}.json`
  
  // Auto-scroll ref for standings
  const standingsScrollRef = useRef<HTMLDivElement>(null)
  const [scrollDirection, setScrollDirection] = useState<'down' | 'up'>('down')
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Refs for PDF export
  const resultsRef = useRef<HTMLDivElement>(null)
  const bracketRef = useRef<HTMLDivElement>(null)
  const standingsRef = useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Fetch tournaments list
  const fetchTournamentsList = useCallback(async () => {
    try {
      const response = await fetch(PAGE_API_URL)
      if (!response.ok) throw new Error('Failed to fetch tournaments list')
      const data: PageData = await response.json()
      setTournaments(data.tournaments || [])
      setPageName(data.name || 'Kickerturnier')
      setError(null)
      
      // Select the most recent tournament by default
      if (data.tournaments?.length > 0 && !selectedTournamentId) {
        const sortedTournaments = [...data.tournaments].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        setSelectedTournamentId(sortedTournaments[0]._id)
      }
    } catch (err) {
      console.error('Error fetching tournaments list:', err)
      setError('Fehler beim Laden der Turnierliste - bitte Seite neu laden')
    }
  }, [PAGE_API_URL, selectedTournamentId])

  // Fetch tournament data
  const fetchTournamentData = useCallback(async () => {
    if (!selectedTournamentId) return
    
    try {
      const response = await fetch(`/api/kickertool/tournaments/${selectedTournamentId}.json`)
      if (!response.ok) throw new Error('Failed to fetch tournament data')
      const data = await response.json()
      setTournamentData(data)
      setError(null)
    } catch (err) {
      setError('Fehler beim Laden der Turnierdaten')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedTournamentId])

  // Fetch tournaments list on mount
  useEffect(() => {
    fetchTournamentsList()
  }, [fetchTournamentsList])

  // Fetch tournament data when selection changes and poll for updates
  useEffect(() => {
    if (!selectedTournamentId) return
    
    setIsLoading(true)
    fetchTournamentData()
    const interval = setInterval(fetchTournamentData, 10000) // Refresh every 10 seconds
    return () => clearInterval(interval)
  }, [selectedTournamentId, fetchTournamentData])

  // Track position changes for animations
  useEffect(() => {
    if (!tournamentData?.qualifying?.[0]?.standings) return
    
    const standings = tournamentData.qualifying[0].standings
    const newPositions = new Map<string, number>()
    const changes = new Map<string, 'up' | 'down' | 'none'>()
    
    standings.forEach((team, index) => {
      newPositions.set(team._id, index)
      
      if (prevPositions.has(team._id)) {
        const oldPos = prevPositions.get(team._id)!
        if (index < oldPos) {
          changes.set(team._id, 'up')
        } else if (index > oldPos) {
          changes.set(team._id, 'down')
        } else {
          changes.set(team._id, 'none')
        }
      } else {
        changes.set(team._id, 'none')
      }
    })
    
    setPositionChanges(changes)
    setPrevPositions(newPositions)
    
    // Clear animation classes after animation completes
    const timeout = setTimeout(() => {
      setPositionChanges(new Map())
    }, 2500)
    
    return () => clearTimeout(timeout)
  }, [tournamentData?.qualifying])

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])
  
  // Auto-scroll standings table
  useEffect(() => {
    const scrollContainer = standingsScrollRef.current
    if (!scrollContainer) return
    if (!autoScrollEnabled) return
    
    const scrollStep = 1 // pixels per frame
    const scrollInterval = 50 // ms between scroll steps
    const pauseAtEnds = 2000 // ms to pause at top/bottom
    
    let isPaused = false
    let pauseTimeout: ReturnType<typeof setTimeout>
    let currentDirection = scrollDirection
    
    const autoScroll = setInterval(() => {
      if (isPaused) return
      
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer
      const maxScroll = scrollHeight - clientHeight
      
      if (maxScroll <= 0) return // No need to scroll
      
      if (currentDirection === 'down') {
        if (scrollTop >= maxScroll - 1) {
          isPaused = true
          pauseTimeout = setTimeout(() => {
            currentDirection = 'up'
            setScrollDirection('up')
            isPaused = false
          }, pauseAtEnds)
        } else {
          scrollContainer.scrollTop = scrollTop + scrollStep
        }
      } else {
        if (scrollTop <= 1) {
          isPaused = true
          pauseTimeout = setTimeout(() => {
            currentDirection = 'down'
            setScrollDirection('down')
            isPaused = false
          }, pauseAtEnds)
        } else {
          scrollContainer.scrollTop = scrollTop - scrollStep
        }
      }
    }, scrollInterval)
    
    // Handle user scroll - pause auto-scroll for 10 seconds
    const handleUserScroll = () => {
      setAutoScrollEnabled(false)
      
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
      
      userScrollTimeoutRef.current = setTimeout(() => {
        setAutoScrollEnabled(true)
      }, 10000) // Resume auto-scroll after 10 seconds
    }
    
    scrollContainer.addEventListener('wheel', handleUserScroll)
    scrollContainer.addEventListener('touchmove', handleUserScroll)
    
    return () => {
      clearInterval(autoScroll)
      clearTimeout(pauseTimeout)
      scrollContainer.removeEventListener('wheel', handleUserScroll)
      scrollContainer.removeEventListener('touchmove', handleUserScroll)
    }
  }, [scrollDirection, autoScrollEnabled, tournamentData])

  // Timer countdown
  useEffect(() => {
    let interval: number | undefined
    if (isRunning && time > 0) {
      interval = setInterval(() => {
        setTime((prevTime) => prevTime - 1)
      }, 1000)
    } else if (time === 0) {
      setIsRunning(false)
    }
    return () => clearInterval(interval)
  }, [isRunning, time])

  const toggleTimer = useCallback(() => {
    setIsRunning(!isRunning)
  }, [isRunning])

  const resetTimer = useCallback(() => {
    setIsRunning(false)
    setTime(initialTime)
  }, [initialTime])

  const setPresetTime = useCallback((minutes: number) => {
    setIsRunning(false)
    setTime(minutes * 60)
    setInitialTime(minutes * 60)
    setCustomMinutes('')
    setCustomSeconds('')
  }, [])

  const setCustomTime = useCallback(() => {
    const mins = parseInt(customMinutes) || 0
    const secs = parseInt(customSeconds) || 0
    const totalSeconds = mins * 60 + secs
    if (totalSeconds > 0) {
      setIsRunning(false)
      setTime(totalSeconds)
      setInitialTime(totalSeconds)
    }
  }, [customMinutes, customSeconds])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatCurrentTime = (date: Date) => {
    return date.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const progress = (time / initialTime) * 100
  const isLowTime = time <= 60 && time > 0
  const isTimeUp = time === 0
  
  // Get group/qualifying phase standings
  const getGroupStandings = (): Standing[] => {
    if (!tournamentData) return []
    if (tournamentData.qualifying?.[0]?.standings?.length > 0) {
      return tournamentData.qualifying[0].standings
    }
    return []
  }

  // Get upcoming matches (not yet played)
  const getUpcomingMatches = (): Match[] => {
    if (!tournamentData) return []
    const allMatches: Match[] = []
    
    const groups = [...(tournamentData.qualifying || []), ...(tournamentData.eliminations || [])]
    groups.forEach((group: Group) => {
      const roundsOrLevels = [...(group.rounds || []), ...(group.levels || [])]
      roundsOrLevels.forEach((round: Round) => {
        round.matches?.forEach((match: Match) => {
          // Match is upcoming if not valid (not completed) and has both teams assigned
          if (!match.valid && match.team1?.name && match.team2?.name) {
            allMatches.push(match)
          }
        })
      })
    })
    
    return allMatches.slice(0, 8)
  }

  // Get current matches (in progress - has table assigned but not completed)
  const getCurrentMatches = (): Match[] => {
    if (!tournamentData) return []
    const currentMatches: Match[] = []
    
    const groups = [...(tournamentData.qualifying || []), ...(tournamentData.eliminations || [])]
    groups.forEach((group: Group) => {
      const roundsOrLevels = [...(group.rounds || []), ...(group.levels || [])]
      roundsOrLevels.forEach((round: Round) => {
        round.matches?.forEach((match: Match) => {
          // Match is current if it has a table assigned but is not yet valid (completed)
          const hasTable = match.tables && match.tables.length > 0
          if (!match.valid && hasTable && match.team1?.name && match.team2?.name) {
            currentMatches.push(match)
          }
        })
      })
    })
    
    return currentMatches
  }

  const upcomingMatches = getUpcomingMatches()
  const currentMatches = getCurrentMatches()
  
  // Check if tournament has elimination data
  const hasEliminations = tournamentData?.eliminations?.some(
    (e) => e.levels && e.levels.length > 0
  )
  
  // Get round display name
  const getRoundName = (name: string): string => {
    const upperName = name.toUpperCase()
    if (upperName.includes('FINALS-1-1') || upperName === 'FINALE' || upperName === 'FINAL') return 'Finale'
    if (upperName.includes('FINALS-1-2') || upperName.includes('SEMI') || upperName.includes('HALBFINALE')) return 'Halbfinale'
    if (upperName.includes('FINALS-1-4') || upperName.includes('QUARTER') || upperName.includes('VIERTELFINALE')) return 'Viertelfinale'
    if (upperName.includes('FINALS-1-8') || upperName.includes('ACHTELFINALE')) return 'Achtelfinale'
    if (upperName.includes('FINALS-1-16')) return 'Sechzehntelfinale'
    if (upperName.includes('THIRD') || upperName.includes('PLATZ 3') || upperName.includes('BRONZE')) return 'Platz 3'
    return name
  }

  const getMedalIcon = (place: number) => {
    if (place === 1) return <Medal className="medal gold" />
    if (place === 2) return <Medal className="medal silver" />
    if (place === 3) return <Medal className="medal bronze" />
    return <span className="place-number">{place}</span>
  }

  const getMedalClass = (teamName: string | undefined, standings: Standing[] | undefined, roundName?: string) => {
    // Only highlight in the Finale or Third Place match
    const isFinale = roundName?.includes('FINALS-1-1') || roundName === 'Finale'
    const isThirdPlace = roundName?.includes('THIRD') || roundName === 'Platz 3'
    if (!isFinale && !isThirdPlace) return ''
    if (!teamName || !standings) return ''
    const index = standings.findIndex(s => s.name === teamName)
    if (index === 0) return 'medal-gold'
    if (index === 1) return 'medal-silver'
    if (index === 2) return 'medal-bronze'
    if (index === 3) return 'medal-fourth'
    return ''
  }

  // Export to PDF
  const exportToPDF = async () => {
    if (!tournamentData) return
    
    setIsExporting(true)
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const margin = 10
      
      // Helper function to capture element with white background
      const captureElement = async (element: HTMLElement | null, scale = 2) => {
        if (!element) return null
        const canvas = await html2canvas(element, {
          scale,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
        })
        return canvas
      }
      
      // Page 1: Results (Ergebnisse) - Portrait
      if (resultsRef.current) {
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const canvas = await captureElement(resultsRef.current)
        if (canvas) {
          const imgData = canvas.toDataURL('image/png')
          const imgWidth = pageWidth - margin * 2
          const imgHeight = (canvas.height * imgWidth) / canvas.width
          
          pdf.setFillColor(255, 255, 255)
          pdf.rect(0, 0, pageWidth, pageHeight, 'F')
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, pageHeight - margin * 2))
        }
      }
      
      // Page 2: KO Tree (Bracket) - Landscape
      if (bracketRef.current) {
        pdf.addPage('a4', 'landscape')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const canvas = await captureElement(bracketRef.current, 1.5)
        if (canvas) {
          const imgData = canvas.toDataURL('image/png')
          const imgWidth = pageWidth - margin * 2
          const imgHeight = (canvas.height * imgWidth) / canvas.width
          
          pdf.setFillColor(255, 255, 255)
          pdf.rect(0, 0, pageWidth, pageHeight, 'F')
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, pageHeight - margin * 2))
        }
      }
      
      // Page 3: Group Phase Standings (Vorrunde) - Portrait
      if (standingsRef.current) {
        pdf.addPage('a4', 'portrait')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const canvas = await captureElement(standingsRef.current)
        if (canvas) {
          const imgData = canvas.toDataURL('image/png')
          const imgWidth = pageWidth - margin * 2
          const imgHeight = (canvas.height * imgWidth) / canvas.width
          
          pdf.setFillColor(255, 255, 255)
          pdf.rect(0, 0, pageWidth, pageHeight, 'F')
          pdf.addImage(imgData, 'PNG', margin, margin, imgWidth, Math.min(imgHeight, pageHeight - margin * 2))
        }
      }
      
      // Save the PDF
      const tournamentName = tournamentData.name || 'Turnier'
      const date = new Date().toISOString().split('T')[0]
      pdf.save(`${tournamentName}_${date}.pdf`)
      
    } catch (error) {
      console.error('Error exporting PDF:', error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="tournament-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <Trophy className="trophy-icon" />
            <h1 className="title">{pageName}</h1>
          </div>
          
          {tournaments.length > 0 && (
            <div className="tournament-selector">
              <select
                value={selectedTournamentId}
                onChange={(e) => setSelectedTournamentId(e.target.value)}
                className="tournament-dropdown"
              >
                {tournaments.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name} ({new Date(t.date).toLocaleDateString('de-DE')})
                  </option>
                ))}
              </select>
              <ChevronDown className="dropdown-icon" size={18} />
            </div>
          )}
          
          <div className="clock-section">
            <Clock className="clock-icon" />
            <span className="current-time">{formatCurrentTime(currentTime)}</span>
            
            {/* Export Button */}
            {hasEliminations && (
              <button 
                onClick={exportToPDF} 
                className="export-btn"
                title="Als PDF exportieren"
                disabled={isExporting}
              >
                <Download size={18} className={isExporting ? 'spinning' : ''} />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`main-content ${displayMode === 'results' ? 'results-mode' : ''}`}>
        {/* Timer Section - Hidden in results mode */}
        {displayMode !== 'results' && (
        <section className="timer-section">
          <div className="timer-card">
            <div className="timer-header">
              <Timer className="timer-icon" />
              <h2>Spielzeit</h2>
            </div>
            
            {/* Circular Timer */}
            <div className="timer-circle-container">
              <svg className="timer-circle" viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#8BA829" />
                    <stop offset="50%" stopColor="#a3c432" />
                    <stop offset="100%" stopColor="#b8d943" />
                  </linearGradient>
                </defs>
                <circle
                  className="timer-circle-bg"
                  cx="100"
                  cy="100"
                  r="90"
                />
                <circle
                  className={`timer-circle-progress ${isLowTime ? 'low-time' : ''} ${isTimeUp ? 'time-up' : ''}`}
                  cx="100"
                  cy="100"
                  r="90"
                  strokeDasharray={`${2 * Math.PI * 90}`}
                  strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
                />
              </svg>
              <div className={`timer-display ${isLowTime ? 'pulse' : ''} ${isTimeUp ? 'time-up' : ''}`}>
                {formatTime(time)}
              </div>
            </div>

            {/* Controls */}
            <div className="timer-controls">
              <button
                onClick={toggleTimer}
                className={`control-btn ${isRunning ? 'pause' : 'play'}`}
              >
                {isRunning ? <Pause size={24} /> : <Play size={24} />}
                <span>{isRunning ? 'Pause' : 'Start'}</span>
              </button>
              <button onClick={resetTimer} className="control-btn reset">
                <RotateCcw size={24} />
                <span>Reset</span>
              </button>
            </div>

            {/* Presets */}
            <div className="presets">
              <span className="presets-label">Schnellauswahl:</span>
              <div className="preset-buttons">
                {[8, 10].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setPresetTime(mins)}
                    className={`preset-btn ${initialTime === mins * 60 ? 'active' : ''}`}
                  >
                    {mins} min
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Time Input */}
            <div className="custom-time">
              <span className="presets-label">Eigene Zeit:</span>
              <div className="custom-time-inputs">
                <input
                  type="number"
                  min="0"
                  max="99"
                  placeholder="Min"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className="time-input"
                />
                <span className="time-separator">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  placeholder="Sek"
                  value={customSeconds}
                  onChange={(e) => setCustomSeconds(e.target.value)}
                  className="time-input"
                />
                <button onClick={setCustomTime} className="set-time-btn">
                  Setzen
                </button>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* Live Results Section */}
        <section className="results-section">
          <div className="results-card">
            <div className="results-header">
              <Trophy className="results-icon" />
              <h2>{displayMode === 'standings' ? 'Vorrunde' : displayMode === 'bracket' ? 'KO-Runde' : 'Ergebnisse'}</h2>
              
              {/* Mode Toggle */}
              {hasEliminations && (
                <div className="mode-toggle">
                  <button
                    onClick={() => setDisplayMode('standings')}
                    className={`mode-btn ${displayMode === 'standings' ? 'active' : ''}`}
                    title="Vorrunde anzeigen"
                  >
                    <Table size={16} />
                  </button>
                  <button
                    onClick={() => setDisplayMode('bracket')}
                    className={`mode-btn ${displayMode === 'bracket' ? 'active' : ''}`}
                    title="KO-Baum anzeigen"
                  >
                    <GitMerge size={16} />
                  </button>
                  <button
                    onClick={() => setDisplayMode('results')}
                    className={`mode-btn ${displayMode === 'results' ? 'active' : ''}`}
                    title="Ergebnisse anzeigen"
                  >
                    <Award size={16} />
                  </button>
                </div>
              )}
              
              <button onClick={fetchTournamentData} className="refresh-btn" title="Aktualisieren">
                <RefreshCw size={18} className={isLoading ? 'spinning' : ''} />
              </button>
            </div>
            
            {error ? (
              <div className="error-message">{error}</div>
            ) : isLoading && !tournamentData ? (
              <div className="loading">Lade Turnierdaten...</div>
            ) : displayMode === 'standings' ? (
              /* Group Phase Table View */
              <div className="standings-container">
                {/* Standings Table - at top */}
                <div className="standings-table">
                  <div className="table-header">
                    <span className="col-place">#</span>
                    <span className="col-team">Team</span>
                    <span className="col-stats">S</span>
                    <span className="col-stats">G</span>
                    <span className="col-stats">V</span>
                    <span className="col-goals">Tore</span>
                    <span className="col-points">Pkt</span>
                  </div>
                  <div className="table-scroll-container" ref={standingsScrollRef}>
                    {getGroupStandings().length === 0 ? (
                      <div style={{ padding: '1rem', color: '#94a3b8' }}>
                        Keine Vorrunden-Daten verfügbar.
                      </div>
                    ) : (
                      getGroupStandings().map((team, index) => {
                        const posChange = positionChanges.get(team._id)
                        const animClass = posChange === 'up' ? 'slide-up' : posChange === 'down' ? 'slide-down' : ''
                        return (
                      <div 
                        key={team._id} 
                        className={`table-row ${index < 3 ? `top-${index + 1}` : ''} ${animClass}`}
                      >
                        <span className="col-place">{getMedalIcon(team.stats.place)}</span>
                        <span className="col-team">{team.name}</span>
                        <span className="col-stats">{team.stats.matches}</span>
                        <span className="col-stats win">{team.stats.won}</span>
                        <span className="col-stats loss">{team.stats.lost}</span>
                        <span className="col-goals">
                          {team.stats.goals}:{team.stats.goals_in}
                          <span className={`goal-diff ${team.stats.goal_diff >= 0 ? 'positive' : 'negative'}`}>
                            ({team.stats.goal_diff >= 0 ? '+' : ''}{team.stats.goal_diff})
                          </span>
                        </span>
                        <span className="col-points">{team.stats.points}</span>
                      </div>
                        )
                    })
                    )}
                  </div>
                </div>

                {/* Current Games */}
                {currentMatches.length > 0 && (
                  <div className="current-games">
                    <h3><Play size={18} /> Aktuelle Spiele</h3>
                    <div className="current-games-grid">
                      {currentMatches.map((match) => (
                        <div key={match._id} className="current-game-card">
                          <div className="current-game-table">
                            Tisch {match.tables?.[0]?.name || '?'}
                          </div>
                          <div className="current-game-teams">
                            <span className="current-team">{match.team1?.name}</span>
                            <span className="current-vs">vs</span>
                            <span className="current-team">{match.team2?.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upcoming Matches - filter out matches that are already current (have table) */}
                {upcomingMatches.filter(m => !m.tables || m.tables.length === 0).length > 0 && (
                  <div className="upcoming-matches">
                    <h3><Clock size={18} /> Nächste Spiele</h3>
                    {upcomingMatches.filter(m => !m.tables || m.tables.length === 0).map((match) => (
                      <div key={match._id} className="match-card upcoming">
                        <div className="match-teams">
                          <span className="team">{match.team1?.name}</span>
                          <span className="vs">vs</span>
                          <span className="team">{match.team2?.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : displayMode === 'bracket' ? (
              /* Elimination Bracket View */
              <div className="bracket-container">
                {tournamentData?.eliminations?.map((elimination) => (
                  <div key={elimination._id} className="elimination-bracket">
                    <h3 className="bracket-title">{elimination.name}</h3>
                    
                    {/* Winner Bracket */}
                    <div className="bracket-section">
                      {elimination.double && <div className="bracket-section-title">Winner Bracket</div>}
                      <div className="bracket-rounds">
                        {/* Render levels from earliest to final (left to right) */}
                        {elimination.levels.map((round) => (
                          <div key={round._id} className="bracket-round">
                            <div className="round-name">{getRoundName(round.name)}</div>
                            <div className="round-matches">
                              {round.matches.map((match) => (
                                <div 
                                  key={match._id} 
                                  className={`bracket-match ${match.valid ? 'completed' : 'pending'}`}
                                >
                                  <div className={`bracket-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${getMedalClass(match.team1?.name, elimination.standings, round.name)}`}>
                                    <span className="team-name">{match.team1?.name || 'TBD'}</span>
                                    {match.valid && <span className="team-score">{match.result[0]}</span>}
                                  </div>
                                  <div className={`bracket-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${getMedalClass(match.team2?.name, elimination.standings, round.name)}`}>
                                    <span className="team-name">{match.team2?.name || 'TBD'}</span>
                                    {match.valid && <span className="team-score">{match.result[1]}</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Loser Bracket (Double Elimination) */}
                    {elimination.double && elimination.leftLevels?.length > 0 && (
                      <div className="bracket-section loser-bracket">
                        <div className="bracket-section-title">Loser Bracket</div>
                        <div className="bracket-rounds">
                          {/* Third Place Match at start (leftmost) */}
                          {elimination.thirdPlace && elimination.third && elimination.third.matches && elimination.third.matches.length > 0 && (
                            <div className="bracket-round">
                              <div className="round-name">{getRoundName('THIRD')}</div>
                              <div className="round-matches">
                                {elimination.third.matches.map((match) => {
                                  // In double elimination, the LOSER of Platz 3 gets 3rd place (bronze)
                                  const team1IsBronze = match.valid && match.result[0] < match.result[1]
                                  const team2IsBronze = match.valid && match.result[1] < match.result[0]
                                  return (
                                    <div 
                                      key={match._id} 
                                      className={`bracket-match ${match.valid ? 'completed' : 'pending'}`}
                                    >
                                      <div className={`bracket-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${team1IsBronze ? 'medal-bronze' : ''}`}>
                                        <span className="team-name">{match.team1?.name || 'TBD'}</span>
                                        {match.valid && <span className="team-score">{match.result[0]}</span>}
                                      </div>
                                      <div className={`bracket-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${team2IsBronze ? 'medal-bronze' : ''}`}>
                                        <span className="team-name">{match.team2?.name || 'TBD'}</span>
                                        {match.valid && <span className="team-score">{match.result[1]}</span>}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          
                          {/* Loser bracket rounds in reverse order */}
                          {[...elimination.leftLevels].reverse().map((round) => {
                            // Check if this is the Platz 3 round
                            const isPlatz3Round = round.name.toUpperCase().includes('PLATZ') || round.name.toUpperCase().includes('THIRD')
                            return (
                              <div key={round._id} className="bracket-round">
                                <div className="round-name">{getRoundName(round.name)}</div>
                                <div className="round-matches">
                                  {round.matches.map((match) => {
                                    // In Platz 3 round, the LOSER gets bronze
                                    const team1IsBronze = isPlatz3Round && match.valid && match.result[0] < match.result[1]
                                    const team2IsBronze = isPlatz3Round && match.valid && match.result[1] < match.result[0]
                                    return (
                                      <div 
                                        key={match._id} 
                                        className={`bracket-match ${match.valid ? 'completed' : 'pending'}`}
                                      >
                                        <div className={`bracket-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${team1IsBronze ? 'medal-bronze' : ''}`}>
                                          <span className="team-name">{match.team1?.name || 'TBD'}</span>
                                          {match.valid && <span className="team-score">{match.result[0]}</span>}
                                        </div>
                                        <div className={`bracket-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${team2IsBronze ? 'medal-bronze' : ''}`}>
                                          <span className="team-name">{match.team2?.name || 'TBD'}</span>
                                          {match.valid && <span className="team-score">{match.result[1]}</span>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Third Place Match (only for single elimination with thirdPlace enabled) */}
                    {!elimination.double && elimination.thirdPlace && elimination.third && elimination.third.matches && elimination.third.matches.length > 0 && (
                      <div className="third-place-section">
                        <div className="round-name">{getRoundName('THIRD')}</div>
                        <div className="round-matches">
                          {elimination.third.matches.map((match) => {
                            const team1Name = match.team1?.name || 'TBD'
                            const team2Name = match.team2?.name || 'TBD'
                            return (
                              <div 
                                key={match._id} 
                                className={`bracket-match ${match.valid ? 'completed' : 'pending'}`}
                              >
                                <div className={`bracket-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${getMedalClass(team1Name, elimination.standings, 'THIRD')}`}>
                                  <span className="team-name">{team1Name}</span>
                                  {match.valid && <span className="team-score">{match.result[0]}</span>}
                                </div>
                                <div className={`bracket-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${getMedalClass(team2Name, elimination.standings, 'THIRD')}`}>
                                  <span className="team-name">{team2Name}</span>
                                  {match.valid && <span className="team-score">{match.result[1]}</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    
                  </div>
                ))}
              </div>
            ) : (
              /* Results View */
              <div className="results-view">
                {tournamentData?.eliminations?.map((elimination) => {
                  // Get teams that didn't make it to KO (from qualifying)
                  const koTeamIds = new Set(elimination.standings?.map(t => t._id) || [])
                  const qualifyingTeams = tournamentData.qualifying?.[0]?.standings?.filter(
                    t => !koTeamIds.has(t._id)
                  ) || []
                  
                  // Count total KO participants for correct numbering of non-KO teams
                  const koParticipantCount = elimination.standings?.length || 0
                  
                  return (
                  <div key={elimination._id} className="results-elimination">
                    <h3 className="results-title">{tournamentData.name}</h3>
                    
                    {/* Podium */}
                    <div className="podium">
                      {/* 2nd Place */}
                      {elimination.standings?.[1] && (
                        <div className="podium-place second">
                          <div className="podium-medal">
                            <Medal className="medal silver" />
                          </div>
                          <div className="podium-name">{elimination.standings[1].name}</div>
                          <div className="podium-block">
                            <span className="podium-number">2</span>
                          </div>
                        </div>
                      )}
                      
                      {/* 1st Place */}
                      {elimination.standings?.[0] && (
                        <div className="podium-place first">
                          <div className="podium-medal">
                            <Trophy className="winner-trophy" />
                          </div>
                          <div className="podium-name">{elimination.standings[0].name}</div>
                          <div className="podium-block">
                            <span className="podium-number">1</span>
                          </div>
                        </div>
                      )}
                      
                      {/* 3rd Place */}
                      {elimination.standings?.[2] && (
                        <div className="podium-place third">
                          <div className="podium-medal">
                            <Medal className="medal bronze" />
                          </div>
                          <div className="podium-name">{elimination.standings[2].name}</div>
                          <div className="podium-block">
                            <span className="podium-number">3</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Rest of KO standings - grouped by place */}
                    {elimination.standings && elimination.standings.length > 3 && (
                      <div className="results-remaining">
                        <h4>Weitere Platzierungen (KO-Runde)</h4>
                        <div className="results-list">
                          {(() => {
                            const remainingTeams = elimination.standings.slice(3)
                            const groupedByPlace: { [place: number]: Standing[] } = {}
                            
                            remainingTeams.forEach((team) => {
                              const place = team.stats?.place || 0
                              if (!groupedByPlace[place]) {
                                groupedByPlace[place] = []
                              }
                              groupedByPlace[place].push(team)
                            })
                            
                            return Object.entries(groupedByPlace)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([place, teams]) => (
                                <div key={place} className={`results-place-group ${teams.length > 1 ? 'tied' : ''}`}>
                                  <span className="results-place">{place}.</span>
                                  <div className="results-names">
                                    {teams.map((team) => (
                                      <span key={team._id} className="results-name">
                                        {team.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ))
                          })()}
                        </div>
                      </div>
                    )}
                    
                    {/* Teams that didn't qualify for KO */}
                    {qualifyingTeams.length > 0 && (
                      <div className="results-remaining results-non-ko">
                        <h4>Vorrunde (nicht für KO qualifiziert)</h4>
                        <div className="results-list">
                          {qualifyingTeams
                            .sort((a, b) => (a.stats?.place || 999) - (b.stats?.place || 999))
                            .map((team, index) => (
                              <div key={team._id} className="results-place-group">
                                <span className="results-place">{koParticipantCount + index + 1}.</span>
                                <div className="results-names">
                                  <span className="results-name">{team.name}</span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )})}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>🎯 Viel Erfolg an alle Teilnehmer! 🏆</p>
      </footer>
      
      {/* Hidden PDF Export Containers */}
      <div className="pdf-export-container" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        {/* Results for PDF */}
        <div ref={resultsRef} className="pdf-page pdf-results">
          <h1 className="pdf-title">{tournamentData?.name || 'Turnier'} - Ergebnisse</h1>
          {tournamentData?.eliminations?.map((elimination) => {
            const koTeamIds = new Set(elimination.standings?.map(t => t._id) || [])
            const qualifyingTeams = tournamentData.qualifying?.[0]?.standings?.filter(
              t => !koTeamIds.has(t._id)
            ) || []
            const koParticipantCount = elimination.standings?.length || 0
            
            return (
              <div key={elimination._id} className="pdf-results-content">
                <div className="pdf-podium">
                  {elimination.standings?.[1] && (
                    <div className="pdf-podium-place second">
                      <div className="pdf-place-number">2</div>
                      <div className="pdf-place-name">{elimination.standings[1].name}</div>
                    </div>
                  )}
                  {elimination.standings?.[0] && (
                    <div className="pdf-podium-place first">
                      <div className="pdf-place-number">1</div>
                      <div className="pdf-place-name">{elimination.standings[0].name}</div>
                    </div>
                  )}
                  {elimination.standings?.[2] && (
                    <div className="pdf-podium-place third">
                      <div className="pdf-place-number">3</div>
                      <div className="pdf-place-name">{elimination.standings[2].name}</div>
                    </div>
                  )}
                </div>
                {elimination.standings && elimination.standings.length > 3 && (
                  <div className="pdf-remaining">
                    <h3>Weitere Platzierungen</h3>
                    {(() => {
                      const remainingTeams = elimination.standings.slice(3)
                      const groupedByPlace: { [place: number]: Standing[] } = {}
                      remainingTeams.forEach((team) => {
                        const place = team.stats?.place || 0
                        if (!groupedByPlace[place]) groupedByPlace[place] = []
                        groupedByPlace[place].push(team)
                      })
                      return Object.entries(groupedByPlace)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([place, teams]) => (
                          <div key={place} className="pdf-place-row">
                            <span className="pdf-place">{place}.</span>
                            <span className="pdf-names">{teams.map(t => t.name).join(', ')}</span>
                          </div>
                        ))
                    })()}
                  </div>
                )}
                {qualifyingTeams.length > 0 && (
                  <div className="pdf-remaining pdf-non-ko">
                    <h3>Vorrunde (nicht für KO qualifiziert)</h3>
                    {qualifyingTeams
                      .sort((a, b) => (a.stats?.place || 999) - (b.stats?.place || 999))
                      .map((team, index) => (
                        <div key={team._id} className="pdf-place-row">
                          <span className="pdf-place">{koParticipantCount + index + 1}.</span>
                          <span className="pdf-names">{team.name}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {/* Bracket for PDF */}
        <div ref={bracketRef} className="pdf-page pdf-bracket">
          <h1 className="pdf-title">{tournamentData?.name || 'Turnier'} - KO-Runde</h1>
          {tournamentData?.eliminations?.map((elimination) => (
            <div key={elimination._id} className="pdf-bracket-content">
              {elimination.double && <h3>Winner Bracket</h3>}
              <div className="pdf-bracket-rounds">
                {elimination.levels.map((round) => (
                  <div key={round._id} className="pdf-bracket-round">
                    <div className="pdf-round-name">{getRoundName(round.name)}</div>
                    {round.matches.map((match) => (
                      <div key={match._id} className="pdf-bracket-match">
                        <div className={`pdf-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${getMedalClass(match.team1?.name, elimination.standings, round.name)}`}>
                          {match.team1?.name || 'TBD'} {match.valid && `(${match.result[0]})`}
                        </div>
                        <div className={`pdf-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${getMedalClass(match.team2?.name, elimination.standings, round.name)}`}>
                          {match.team2?.name || 'TBD'} {match.valid && `(${match.result[1]})`}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              {elimination.double && elimination.leftLevels?.length > 0 && (
                <>
                  <h3>Loser Bracket</h3>
                  <div className="pdf-bracket-rounds">
                    {elimination.thirdPlace && elimination.third && elimination.third.matches && elimination.third.matches.length > 0 && (
                      <div className="pdf-bracket-round">
                        <div className="pdf-round-name">Platz 3</div>
                        {elimination.third.matches.map((match) => {
                          // In double elimination, the LOSER of Platz 3 gets 3rd place (bronze)
                          const team1IsBronze = match.valid && match.result[0] < match.result[1]
                          const team2IsBronze = match.valid && match.result[1] < match.result[0]
                          return (
                            <div key={match._id} className="pdf-bracket-match">
                              <div className={`pdf-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${team1IsBronze ? 'medal-bronze' : ''}`}>
                                {match.team1?.name || 'TBD'} {match.valid && `(${match.result[0]})`}
                              </div>
                              <div className={`pdf-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${team2IsBronze ? 'medal-bronze' : ''}`}>
                                {match.team2?.name || 'TBD'} {match.valid && `(${match.result[1]})`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {[...elimination.leftLevels].reverse().map((round) => {
                      const isPlatz3Round = round.name.toUpperCase().includes('PLATZ') || round.name.toUpperCase().includes('THIRD')
                      return (
                        <div key={round._id} className="pdf-bracket-round">
                          <div className="pdf-round-name">{getRoundName(round.name)}</div>
                          {round.matches.map((match) => {
                            const team1IsBronze = isPlatz3Round && match.valid && match.result[0] < match.result[1]
                            const team2IsBronze = isPlatz3Round && match.valid && match.result[1] < match.result[0]
                            return (
                              <div key={match._id} className="pdf-bracket-match">
                                <div className={`pdf-team ${match.valid && match.result[0] > match.result[1] ? 'winner' : ''} ${team1IsBronze ? 'medal-bronze' : ''}`}>
                                  {match.team1?.name || 'TBD'} {match.valid && `(${match.result[0]})`}
                                </div>
                                <div className={`pdf-team ${match.valid && match.result[1] > match.result[0] ? 'winner' : ''} ${team2IsBronze ? 'medal-bronze' : ''}`}>
                                  {match.team2?.name || 'TBD'} {match.valid && `(${match.result[1]})`}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        
        {/* Standings for PDF */}
        <div ref={standingsRef} className="pdf-page pdf-standings">
          <h1 className="pdf-title">{tournamentData?.name || 'Turnier'} - Vorrunde</h1>
          <table className="pdf-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>S</th>
                <th>G</th>
                <th>V</th>
                <th>Tore</th>
                <th>Diff</th>
                <th>Pkt</th>
              </tr>
            </thead>
            <tbody>
              {getGroupStandings().map((team) => (
                <tr key={team._id}>
                  <td>{team.stats.place}</td>
                  <td>{team.name}</td>
                  <td>{team.stats.matches}</td>
                  <td>{team.stats.won}</td>
                  <td>{team.stats.lost}</td>
                  <td>{team.stats.goals}:{team.stats.goals_in}</td>
                  <td>{team.stats.goal_diff >= 0 ? '+' : ''}{team.stats.goal_diff}</td>
                  <td>{team.stats.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App
