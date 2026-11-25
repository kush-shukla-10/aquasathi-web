import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import './App.css'

const API = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

type Reading = {
  id: number
  pond_id: number
  recorded_at: string
  dissolved_oxygen: number
  temperature: number
  ph: number
  salinity: number
  ammonia: number
  source: 'actual' | 'simulated'
}

type Pond = {
  id: number
  name: string
  location: string
  area_hectares: number
  species: string
  stocked_on: string
  stage: string
  latest_reading: Reading | null
  health: 'stable' | 'attention' | 'unknown'
  observation: string
  alerts: string[]
  is_stale?: boolean
}

type Incident = {
  id: number
  pond_id: number
  pond_name: string
  description: string
  status: string
  severity: string
  image_id: string | null
  image_url: string | null
  image_screening: string | null
  attached_reading: Reading | null
  reading_assessment: { health: string; observation: string; alerts: string[] }
  created_at: string
  reviews: { reviewer_name: string; recommendation: string; case_status: string; created_at: string }[]
}

type Dashboard = {
  farmer_name: string
  total_ponds: number
  attention_count: number
  open_incidents: number
  ponds: Pond[]
  recent_incidents: Incident[]
  data_notice: string
}

type Reference = { id: string; title: string; publisher: string; url: string; text: string }
type ChatMessage = { role: 'farmer' | 'assistant'; text: string; citations?: { title: string; publisher: string; url: string }[] }
type Page = 'Overview' | 'Ponds' | 'Incidents' | 'Image review' | 'Ask AquaSathi' | 'Knowledge' | 'Expert desk'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    Overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    Ponds: <><path d="M3 9c2.4-2 4.7-2 7 0s4.7 2 7 0 4.7-2 7 0" /><path d="M3 15c2.4-2 4.7-2 7 0s4.7 2 7 0 4.7-2 7 0" /></>,
    Incidents: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    'Image review': <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
    'Ask AquaSathi': <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></>,
    Knowledge: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" /><path d="M4 16h16M8 7h8m-8 4h6" /></>,
    'Expert desk': <><circle cx="9" cy="8" r="4" /><path d="M3 21a6 6 0 0 1 12 0m3-11 2 2 4-4" /></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.Overview}</svg>
}

function MetricCard({ label, value, note, icon, tone }: { label: string; value: string | number; note: string; icon: string; tone?: string }) {
  return <article className="metric-card">
    <div className={`metric-icon ${tone ?? ''}`} aria-hidden="true">{icon}</div>
    <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
  </article>
}

function StatusPill({ status }: { status: string }) {
  const label = status === 'stable' ? 'Looking good' : status === 'attention' ? 'Needs attention' : status === 'unknown' ? 'No readings' : status
  return <span className={`status-pill status-${status.replaceAll(' ', '-').toLowerCase()}`}><i />{label}</span>
}

function ReadingChart({ readings }: { readings: Reading[] }) {
  const chronological = [...readings].reverse()
  if (chronological.length < 2) {
    return <div className="chart-empty"><span className="chart-empty-line" /><p>Add more readings to build a pond history.</p></div>
  }
  const values = chronological.map((reading) => reading.dissolved_oxygen)
  const min = Math.min(0, ...values) - 0.5
  const max = Math.max(8, ...values) + 0.5
  const points = values.map((value, index) => {
    const x = 20 + (index / (values.length - 1)) * 560
    const y = 140 - ((value - min) / (max - min)) * 110
    return `${x},${y}`
  }).join(' ')
  return <div className="chart-wrap">
    <svg viewBox="0 0 600 170" role="img" aria-label="Dissolved oxygen history in milligrams per litre">
      <line x1="20" y1="140" x2="580" y2="140" className="chart-axis" />
      <line x1="20" y1="30" x2="580" y2="30" className="chart-grid" />
      <polyline points={points} fill="none" className="chart-line" />
      {values.map((value, index) => {
        const x = 20 + (index / (values.length - 1)) * 560
        const y = 140 - ((value - min) / (max - min)) * 110
        return <circle key={`${chronological[index].id}-${value}`} cx={x} cy={y} r="4" className="chart-point"><title>{value.toFixed(1)} mg/L</title></circle>
      })}
    </svg>
    <div className="chart-legend"><span><i /> Dissolved oxygen <small>(mg/L)</small></span><span>{chronological.length} recorded readings</span></div>
  </div>
}

function formatTime(date: string) {
  return new Date(date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function App() {
  const [page, setPage] = useState<Page>('Overview')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [selectedPondId, setSelectedPondId] = useState<number | null>(null)
  const [readings, setReadings] = useState<Reading[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [references, setReferences] = useState<Reference[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showPondForm, setShowPondForm] = useState(false)
  const [showReadingForm, setShowReadingForm] = useState(false)
  const [showIncidentModal, setShowIncidentModal] = useState(false)
  const [question, setQuestion] = useState('')
  const [language, setLanguage] = useState('en')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [search, setSearch] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [recording, setRecording] = useState(false)
  const [reviewIncidentId, setReviewIncidentId] = useState<number | null>(null)

  const selectedPond = dashboard?.ponds.find((pond) => pond.id === selectedPondId) ?? dashboard?.ponds[0] ?? null
  const activePondId = selectedPond?.id ?? null
  const refresh = useCallback(async () => {
    const data = await request<Dashboard>('/api/dashboard')
    setDashboard(data)
    setSelectedPondId((current) => current && data.ponds.some((pond) => pond.id === current) ? current : data.ponds[0]?.id ?? null)
    const [cases, knowledge] = await Promise.all([
      request<Incident[]>('/api/incidents'),
      request<{ references: Reference[] }>('/api/knowledge'),
    ])
    setIncidents(cases)
    setReferences(knowledge.references)
  }, [])

  useEffect(() => {
    refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not connect to AquaSathi.'))
      .finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    if (!activePondId) {
      setReadings([])
      return
    }
    request<Reading[]>(`/api/ponds/${activePondId}/readings`)
      .then(setReadings)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load readings.'))
  }, [activePondId])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview)
  }, [imagePreview])

  const recentReadings = useMemo(() => readings.slice(0, 5), [readings])

  async function submitPond(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name')),
      location: String(form.get('location')),
      area_hectares: Number(form.get('area_hectares')),
      species: String(form.get('species')),
      stocked_on: String(form.get('stocked_on')),
      stage: String(form.get('stage')),
    }
    try {
      const pond = await request<Pond>('/api/ponds', { method: 'POST', body: JSON.stringify(payload) })
      await refresh()
      setSelectedPondId(pond.id)
      setShowPondForm(false)
      setNotice(`${pond.name} is ready to track.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add pond.')
    }
  }

  async function submitReading(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPond) return
    const form = new FormData(event.currentTarget)
    const payload = {
      dissolved_oxygen: Number(form.get('dissolved_oxygen')),
      temperature: Number(form.get('temperature')),
      ph: Number(form.get('ph')),
      salinity: Number(form.get('salinity')),
      ammonia: Number(form.get('ammonia')),
      source: String(form.get('source')),
    }
    try {
      const result = await request<Reading & { health: string }>(`/api/ponds/${selectedPond.id}/readings`, { method: 'POST', body: JSON.stringify(payload) })
      const [, updatedReadings] = await Promise.all([
        refresh(),
        request<Reading[]>(`/api/ponds/${selectedPond.id}/readings`),
      ])
      setReadings(updatedReadings)
      setShowReadingForm(false)
      setNotice(result.health === 'attention' ? 'Reading saved — please review the flagged values.' : 'Reading saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save reading.')
    }
  }

  async function submitIncident(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (!selectedPond) return
    const description = String(form.get('description') ?? '')
    try {
      const imageData = imageFile ? await readImage(imageFile) : null
      await request<Incident>('/api/incidents', {
        method: 'POST',
        body: JSON.stringify({ pond_id: selectedPond.id, description, image_data: imageData }),
      })
      await refresh()
      setImageFile(null)
      setImagePreview('')
      setPage('Incidents')
      setNotice('Incident saved for follow-up.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save incident.')
    }
  }

  async function sendQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const prompt = question.trim()
    if (!prompt) return
    setMessages((current) => [...current, { role: 'farmer', text: prompt }])
    setQuestion('')
    try {
      const answer = await request<{ answer: string; citations: ChatMessage['citations'] }>('/api/assistant', {
        method: 'POST',
        body: JSON.stringify({ question: prompt, language }),
      })
      setMessages((current) => [...current, { role: 'assistant', text: answer.answer, citations: answer.citations }])
    } catch (reason) {
      setMessages((current) => [...current, { role: 'assistant', text: reason instanceof Error ? reason.message : 'The assistant is unavailable right now.' }])
    }
  }

  async function searchKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const result = await request<{ references: Reference[] }>(`/api/knowledge?q=${encodeURIComponent(search)}`)
      setReferences(result.references)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not search references.')
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reviewIncidentId) return
    const form = new FormData(event.currentTarget)
    try {
      await request(`/api/incidents/${reviewIncidentId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          reviewer_name: String(form.get('reviewer_name')),
          recommendation: String(form.get('recommendation')),
          case_status: String(form.get('case_status')),
        }),
      })
      await refresh()
      setReviewIncidentId(null)
      setNotice('Expert review saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save expert review.')
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, or WebP image smaller than 5 MB.')
      event.target.value = ''
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setError('')
  }

  function startVoiceInput() {
    type RecognitionResult = { results: { [index: number]: { [index: number]: { transcript: string } } } }
    type Recognition = {
      lang: string
      interimResults: boolean
      onresult: ((event: RecognitionResult) => void) | null
      onerror: (() => void) | null
      onend: (() => void) | null
      start: () => void
    }
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
    const SpeechRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setNotice('Voice input is not supported by this browser. You can type your question instead.')
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN'
    recognition.interimResults = false
    recognition.onresult = (event) => {
      setQuestion(event.results[0][0].transcript)
      setRecording(false)
    }
    recognition.onerror = () => {
      setRecording(false)
      setNotice('Voice recognition is unavailable. Please type your question.')
    }
    recognition.onend = () => setRecording(false)
    setRecording(true)
    recognition.start()
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) {
      setNotice('Audio playback is not supported by this browser.')
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = language === 'te' ? 'te-IN' : language === 'hi' ? 'hi-IN' : 'en-IN'
    window.speechSynthesis.speak(utterance)
  }

  const navItems: Page[] = ['Overview', 'Ponds', 'Incidents', 'Image review', 'Ask AquaSathi', 'Knowledge', 'Expert desk']
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="AquaSathi overview" onClick={(event) => { event.preventDefault(); setPage('Overview') }}>
        <span className="brand-mark"><span /></span>
        <span className="brand-name">aqua<span>sathi</span><small>SHRIMP FARMING, SIMPLIFIED</small></span>
      </a>
      <div className="farm-switcher"><div className="farm-avatar">RK</div><div><strong>Ravi’s Farm</strong><small>Andhra Pradesh</small></div><span className="chevron">⌄</span></div>
      <p className="nav-caption">WORKSPACE</p>
      <nav aria-label="Main navigation">
        {navItems.map((item) => <button key={item} aria-label={item} title={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => setPage(item)}>
          <Icon name={item} /><span>{item}</span>{item === 'Incidents' && incidents.some((incident) => incident.status !== 'resolved') && <i className="nav-badge" />}
        </button>)}
      </nav>
      <div className="sidebar-spacer" />
      <div className="help-card"><span className="help-spark">✳</span><strong>Here when you need us</strong><p>Clear guidance for healthier ponds, one day at a time.</p><button onClick={() => setPage('Ask AquaSathi')}>Ask AquaSathi <span>→</span></button></div>
      <div className="sidebar-footer"><span className="online-dot" /> Demo workspace <span className="version">MVP · 0.1</span></div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumb"><span>Farm workspace</span><b>/</b><strong>{page}</strong></div>
        <div className="topbar-actions"><span className="live-status"><i /> Local demo</span><button className="avatar-button" aria-label="Current user Ravi Kumar">RK</button></div>
      </header>
      {error && <div className="notice notice-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {notice && <div className="notice notice-success" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      <div className="page-content">
        {loading ? <div className="loading-state"><div className="spinner" /><p>Getting your farm ready…</p></div> : !dashboard ? <section className="connection-card">
          <span className="connection-icon">⌁</span><h1>Can’t reach the farm server</h1><p>Start the FastAPI service, then try again. Your demo data stays on this device.</p><button className="button button-primary" onClick={() => { setLoading(true); setError(''); refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Connection failed.')).finally(() => setLoading(false)) }}>Try again</button>
        </section> : <>
          {page === 'Overview' && <section>
            <div className="welcome-row"><div><p className="eyebrow">{today} <span className="eyebrow-dot">·</span> YOUR FARM AT A GLANCE</p><h1>Good morning, {dashboard.farmer_name.split(' ')[0]} <span className="wave">☀</span></h1><p className="page-subtitle">A little attention today makes a healthier harvest tomorrow.</p></div><button className="button button-primary" onClick={() => setShowIncidentModal(true)}>＋ Report an incident</button></div>
            <div className="simulation-banner"><span className="simulation-icon">i</span><p><strong>Demo workspace</strong> — seeded sample readings are simulated, not live sensor data. Measurements you enter are labeled separately.</p><button onClick={() => setShowReadingForm(true)}>Add reading <span>→</span></button></div>
            <div className="metrics-grid">
              <MetricCard label="Total ponds" value={dashboard.total_ponds} note="Across your farm" icon="≈" />
              <MetricCard label="Need a closer look" value={dashboard.attention_count} note={dashboard.attention_count ? 'Readings outside demo ranges' : 'No flagged readings'} icon="⌁" tone="metric-amber" />
              <MetricCard label="Open incidents" value={dashboard.open_incidents} note="Cases being followed up" icon="♧" tone="metric-blue" />
              <MetricCard label="Latest readings" value={dashboard.ponds.filter((pond) => pond.latest_reading).length} note="Ponds with a reading" icon="◷" tone="metric-violet" />
            </div>
            <div className="section-heading"><div><p className="eyebrow">YOUR FARM</p><h2>Pond health</h2></div><button className="text-button" onClick={() => setPage('Ponds')}>Manage ponds <span>→</span></button></div>
            <div className="pond-grid">{dashboard.ponds.map((pond) => <button className={`pond-card ${selectedPond?.id === pond.id ? 'pond-selected' : ''}`} key={pond.id} onClick={() => { setSelectedPondId(pond.id); setPage('Ponds') }}>
              <div className="pond-card-top"><div className="pond-icon">⌁</div><StatusPill status={pond.health} /></div>
              <h3>{pond.name}</h3><p className="pond-location"><span>⌖</span> {pond.location}</p>
              <div className="pond-meta"><span>{pond.area_hectares} ha</span><span>{pond.stage}</span></div>
              <div className="pond-values">{pond.latest_reading ? <>
                <span><b>{pond.latest_reading.dissolved_oxygen.toFixed(1)}</b><small>DO mg/L</small></span>
                <span><b>{pond.latest_reading.temperature.toFixed(1)}°</b><small>Temp</small></span>
                <span><b>{pond.latest_reading.ph.toFixed(1)}</b><small>pH</small></span>
              </> : <span className="no-pond-reading">No reading yet</span>}</div>
              <div className="pond-card-foot"><span>{pond.latest_reading ? `Updated ${formatTime(pond.latest_reading.recorded_at)}` : 'Start tracking this pond'}</span><span>↗</span></div>
            </button>)}
              <button className="add-pond-card" onClick={() => setShowPondForm(true)}><span>＋</span><strong>Add another pond</strong><small>Keep all your ponds in one place</small></button>
            </div>
            <div className="overview-lower">
              <section className="panel trend-panel">              <div className="panel-heading"><div><p className="eyebrow">POND MONITORING</p><h2>{selectedPond?.name ?? 'Dissolved oxygen'} <span className="heading-muted">· DO</span></h2></div><select className="select-control" value={selectedPond?.id ?? ''} onChange={(event) => setSelectedPondId(Number(event.target.value))} aria-label="Select pond">{dashboard.ponds.map((pond) => <option key={pond.id} value={pond.id}>{pond.name}</option>)}</select></div>
                <div className="chart-period"><span>Recorded history</span><span className="chart-source-pill">● {readings[0]?.source === 'actual' ? 'Actual measurements' : readings.length ? 'Simulated readings' : 'No data yet'}</span></div>
                <ReadingChart readings={readings} />
                <div className="parameter-strip"><span>Latest ammonia <b>{selectedPond?.latest_reading ? `${selectedPond.latest_reading.ammonia.toFixed(2)} mg/L` : '—'}</b></span><span>Salinity <b>{selectedPond?.latest_reading ? `${selectedPond.latest_reading.salinity} ppt` : '—'}</b></span><span>pH <b>{selectedPond?.latest_reading?.ph.toFixed(1) ?? '—'}</b></span></div>
              </section>
              <section className="panel alerts-panel"><div className="panel-heading"><div><p className="eyebrow">STAY AHEAD</p><h2>Needs your attention</h2></div><button className="more-button" onClick={() => setPage('Ponds')} aria-label="See all pond readings">···</button></div>
                {dashboard.ponds.some((pond) => pond.alerts.length) ? dashboard.ponds.filter((pond) => pond.alerts.length).map((pond) => <div className="alert-item" key={pond.id}><div className="alert-symbol">!</div><div><strong>{pond.name}</strong><p>{pond.alerts[0]}</p><small>{pond.latest_reading ? `Last reading ${formatTime(pond.latest_reading.recorded_at)}` : 'No reading recorded'}</small></div><button onClick={() => { setSelectedPondId(pond.id); setPage('Ponds') }} aria-label={`Review ${pond.name}`}>→</button></div>) : <div className="empty-alerts"><span>✓</span><p>Nothing needs your attention right now.</p></div>}
                <button className="view-all-button" onClick={() => setPage('Ponds')}>View all readings <span>→</span></button>
              </section>
            </div>
            <section className="panel recent-panel"><div className="panel-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>Incident reports</h2></div><button className="text-button" onClick={() => setPage('Incidents')}>All incidents <span>→</span></button></div>
              {dashboard.recent_incidents.length ? <IncidentTable incidents={dashboard.recent_incidents.slice(0, 4)} onReview={(id) => { setReviewIncidentId(id); setPage('Expert desk') }} /> : <div className="empty-row">No incidents reported yet. Use “Report an incident” when something looks unusual.</div>}
            </section>
          </section>}

          {page === 'Ponds' && <section>
            <PageTitle eyebrow="FARM MANAGEMENT" title="Your ponds" subtitle="Keep pond details and water-quality records together." action={<button className="button button-primary" onClick={() => setShowPondForm(true)}>＋ Add pond</button>} />
            <div className="simulation-banner compact-banner"><span className="simulation-icon">i</span><p>Thresholds below are demo screening ranges, not species-specific prescriptions. Verify results with a calibrated test and local expert.</p></div>
            {selectedPond && <div className="pond-detail-layout">
              <div className="panel pond-detail-card"><div className="panel-heading"><div><p className="eyebrow">POND PROFILE</p><h2>{selectedPond.name}</h2></div><StatusPill status={selectedPond.health} /></div>
                <div className="pond-detail-meta"><span><small>LOCATION</small><b>{selectedPond.location}</b></span><span><small>AREA</small><b>{selectedPond.area_hectares} hectares</b></span><span><small>SPECIES</small><b>{selectedPond.species}</b></span><span><small>STOCKED</small><b>{selectedPond.stocked_on}</b></span><span><small>FARMING STAGE</small><b>{selectedPond.stage}</b></span></div>
                <div className="detail-actions"><button className="button button-primary" onClick={() => setShowReadingForm(true)}>＋ Record reading</button><button className="button button-secondary" onClick={() => setShowIncidentModal(true)}>Report a concern</button></div>
              </div>
              <div className="panel health-panel"><p className="eyebrow">LATEST OBSERVATION</p><h3>{selectedPond.health === 'attention' ? 'Worth a closer look' : selectedPond.health === 'unknown' ? 'Waiting for first reading' : 'No demo thresholds flagged'}</h3><p>{selectedPond.observation}</p>{selectedPond.latest_reading && <span className="data-source-note">{selectedPond.latest_reading.source === 'simulated' ? '◷ Simulated sample · ' : '● Actual measurement · '}{formatTime(selectedPond.latest_reading.recorded_at)}</span>}</div>
            </div>}
            <div className="panel readings-panel"><div className="panel-heading"><div><p className="eyebrow">WATER QUALITY</p><h2>Reading history</h2></div><span className="table-units">Latest {recentReadings.length} records</span></div>
              {readings.length ?               <div className="table-scroll"><table><thead><tr><th>Recorded</th><th>DO <small>mg/L</small></th><th>Temperature <small>°C</small></th><th>pH</th><th>Salinity <small>ppt</small></th><th>Ammonia <small>mg/L</small></th><th>Source</th></tr></thead><tbody>{recentReadings.map((reading) => <tr key={reading.id}><td>{formatTime(reading.recorded_at)}</td><td>{reading.dissolved_oxygen.toFixed(1)}</td><td>{reading.temperature.toFixed(1)}</td><td>{reading.ph.toFixed(1)}</td><td>{reading.salinity.toFixed(1)}</td><td>{reading.ammonia.toFixed(2)}</td><td><span className={`source-pill ${reading.source}`}>{reading.source === 'simulated' ? 'Simulated' : 'Actual measurement'}</span></td></tr>)}</tbody></table></div> : <div className="empty-row">No readings for this pond. Add a measurement to start tracking changes.</div>}
            </div>
          </section>}

          {page === 'Incidents' && <section>
            <PageTitle eyebrow="FARMER WORKSPACE" title="Incident reports" subtitle="Record unusual behaviour, add evidence, and follow each case." action={<button className="button button-primary" onClick={() => setShowIncidentModal(true)}>＋ New report</button>} />
            <div className="simulation-banner compact-banner"><span className="simulation-icon">i</span><p>Reports are saved locally to this demo database. Images are attached for review; automated disease diagnosis is not enabled.</p></div>
            <div className="incident-cards">{incidents.length ? incidents.map((incident) => <IncidentCard key={incident.id} incident={incident} onReview={() => { setReviewIncidentId(incident.id); setPage('Expert desk') }} />) : <div className="panel empty-state"><span>♧</span><h2>No incident reports yet</h2><p>When you notice changes in feeding, swimming, or appearance, create a report to keep track.</p><button className="button button-primary" onClick={() => setShowIncidentModal(true)}>Report an incident</button></div>}</div>
          </section>}

          {page === 'Image review' && <section>
            <PageTitle eyebrow="VISUAL OBSERVATIONS" title="Image review" subtitle="Attach clear pond or shrimp photos to an incident for expert follow-up." />
            <div className="image-review-layout"><div className="panel upload-panel"><p className="eyebrow">ADD A PHOTO</p><h2>What are you seeing?</h2><p>Choose a PNG, JPEG, or WebP image (up to 5 MB). Images are stored with your incident for expert review.</p>
              <label className="upload-zone"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /><span className="upload-icon">↑</span><strong>{imageFile ? imageFile.name : 'Choose an image to attach'}</strong><small>{imageFile ? `${(imageFile.size / 1024 / 1024).toFixed(1)} MB · ready to attach` : 'PNG, JPEG, or WebP · max 5 MB'}</small></label>
              {imagePreview && <img className="image-preview" src={imagePreview} alt="Selected photo preview" />}
              <button className="button button-primary" disabled={!imageFile} onClick={() => { if (imageFile) { setPage('Incidents'); setShowIncidentModal(true) } }}>Attach to incident <span>→</span></button>
            </div><aside className="panel screening-panel"><span className="screening-icon">✳</span><p className="eyebrow">IMPORTANT TO KNOW</p><h2>Screening, not diagnosis</h2><p>AquaSathi’s image model is not connected in this demo. We won’t invent visual findings or label a disease from a photo.</p><ul><li>Your photo can be attached to a case.</li><li>A qualified expert can review visible signs.</li><li>Include when the change started and which pond is affected.</li></ul><button className="text-button" onClick={() => setPage('Expert desk')}>Go to expert desk <span>→</span></button></aside></div>
          </section>}

          {page === 'Ask AquaSathi' && <section>
            <PageTitle eyebrow="FARMER ASSISTANT" title="Ask AquaSathi" subtitle="A helpful place to look up general shrimp-farming references." />
            <div className="assistant-layout"><div className="panel chat-panel"><div className="chat-top"><div className="assistant-avatar">✳</div><div><strong>AquaSathi assistant</strong><small><i /> Local reference search · no external AI</small></div><label className="language-select"><span>Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)}><option value="en">English</option><option value="te">తెలుగు · Telugu</option><option value="hi">हिन्दी · Hindi</option></select></label></div>
              <div className="chat-messages"><div className="chat-welcome"><div className="assistant-avatar large">✳</div><h2>What’s happening in your pond?</h2><p>Ask a general question and I’ll look for relevant local references. I can’t diagnose pond-specific problems.</p><div className="suggestion-row"><button onClick={() => setQuestion('What should I record during pond monitoring?')}>What should I monitor?</button><button onClick={() => setQuestion('Tell me about shrimp farming stages')}>Shrimp life cycle</button><button onClick={() => setQuestion('What should I do about unusual shrimp behaviour?')}>Unusual behaviour</button></div></div>
                {messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><div className="message-bubble"><p>{message.text}</p>{message.citations?.map((citation) => <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.publisher} · source ↗</a>)}{message.role === 'assistant' && <button className="speak-button" onClick={() => speak(message.text)}>▶ Read aloud</button>}</div></div>)}
              </div>
              <form className="chat-composer" onSubmit={sendQuestion}><button className={`mic-button ${recording ? 'recording' : ''}`} type="button" onClick={startVoiceInput} aria-label={recording ? 'Listening' : 'Use voice input'} title="Use browser voice input">{recording ? '◉' : '♩'}</button><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={language === 'te' ? 'మీ ప్రశ్నను టైప్ చేయండి…' : language === 'hi' ? 'अपना सवाल लिखें…' : 'Ask a farming question…'} aria-label="Your question" /><button className="send-button" type="submit" disabled={!question.trim()} aria-label="Send question">↑</button></form>
              <p className="chat-disclaimer">Voice depends on your browser’s language support. General guidance only — always confirm farm decisions with a qualified local expert.</p>
            </div><aside className="assistant-side"><div className="panel assistant-info"><p className="eyebrow">HOW IT WORKS</p><h3>Grounded in references</h3><p>Answers use keyword search over a small, locally stored reference set. Citations link to their publishers.</p><div className="info-divider" /><h3>Honest about limits</h3><p>No external language model, medical diagnosis, or treatment recommendations are enabled.</p><button className="text-button" onClick={() => setPage('Knowledge')}>Browse references <span>→</span></button></div><div className="voice-info"><span>♩</span><div><strong>Telugu & Hindi voice</strong><p>Uses speech tools built into your browser when available.</p></div></div></aside></div>
          </section>}

          {page === 'Knowledge' && <section>
            <PageTitle eyebrow="TRUSTED REFERENCES" title="Knowledge library" subtitle="Browse the source material behind the general guidance." />
            <div className="panel knowledge-search-panel"><form onSubmit={searchKnowledge}><span className="search-icon">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search shrimp stages, water quality, biosecurity…" aria-label="Search reference library" /><button className="button button-primary" type="submit">Search</button></form><p>Local search finds matching references; it does not generate a pond-specific conclusion.</p></div>
            <div className="reference-grid">{references.length ? references.map((reference) => <article className="panel reference-card" key={reference.id}><div className="reference-icon">▤</div><span className="reference-label">REFERENCE SOURCE</span><h2>{reference.title}</h2><p className="reference-publisher">{reference.publisher}</p><p className="reference-summary">{reference.text}</p><a href={reference.url} target="_blank" rel="noreferrer">Visit official source <span>↗</span></a></article>) : <div className="panel empty-state"><span>⌕</span><h2>No matching references</h2><p>Try terms such as shrimp, pond, farming, biosecurity, or stages.</p><button className="text-button" onClick={() => { setSearch(''); request<{ references: Reference[] }>('/api/knowledge').then((result) => setReferences(result.references)) }}>Show all references</button></div>}</div>
            <div className="citation-note">References are discovery links, not a substitute for current, locally applicable expert advice.</div>
          </section>}

          {page === 'Expert desk' && <section>
            <PageTitle eyebrow="CASE REVIEW" title="Expert desk" subtitle="Review incident evidence and record recommendations for follow-up." />
            <div className="simulation-banner compact-banner"><span className="simulation-icon">i</span><p>Expert recommendations entered here are stored in the local demo. This screen does not send notifications or connect to a real expert.</p></div>
            <div className="expert-layout"><div className="expert-list"><div className="panel-heading"><div><p className="eyebrow">CASE QUEUE</p><h2>{incidents.filter((incident) => incident.status !== 'resolved').length} open cases</h2></div></div>
              {incidents.filter((incident) => incident.status !== 'resolved').map((incident) => <button key={incident.id} className={`expert-case ${reviewIncidentId === incident.id ? 'selected' : ''}`} onClick={() => setReviewIncidentId(incident.id)}><div className="expert-case-top"><strong>Case #{String(incident.id).padStart(4, '0')}</strong><StatusPill status={incident.status} /></div><p>{incident.pond_name}</p><small>{formatTime(incident.created_at)}</small><span className="case-summary">{incident.description}</span></button>)}
              {!incidents.some((incident) => incident.status !== 'resolved') && <div className="panel empty-state compact-empty"><span>✓</span><h2>Queue is clear</h2><p>New reports will appear here.</p></div>}
            </div>
            <div className="panel expert-detail">{(() => {
              const activeCase = incidents.find((incident) => incident.id === reviewIncidentId) ?? incidents.find((incident) => incident.status !== 'resolved')
              if (!activeCase) return <div className="expert-empty"><span>♧</span><h2>Select a case to review</h2><p>Incident descriptions, attached photos, and pond readings will appear here.</p></div>
              return <><div className="panel-heading"><div><p className="eyebrow">INCIDENT EVIDENCE</p><h2>Case #{String(activeCase.id).padStart(4, '0')}</h2></div><StatusPill status={activeCase.status} /></div><div className="evidence-meta"><span><small>POND</small><b>{activeCase.pond_name}</b></span><span><small>REPORTED</small><b>{formatTime(activeCase.created_at)}</b></span></div><p className="incident-description">{activeCase.description}</p>
                {activeCase.attached_reading && <div className="attached-reading"><strong>Reading attached to report</strong><small>{activeCase.attached_reading.source === 'simulated' ? 'Simulated sample' : 'Actual measurement'} · {formatTime(activeCase.attached_reading.recorded_at)}</small><div><span>DO <b>{activeCase.attached_reading.dissolved_oxygen.toFixed(1)} mg/L</b></span><span>Temp <b>{activeCase.attached_reading.temperature.toFixed(1)} °C</b></span><span>pH <b>{activeCase.attached_reading.ph.toFixed(1)}</b></span><span>Salinity <b>{activeCase.attached_reading.salinity.toFixed(1)} ppt</b></span><span>Ammonia <b>{activeCase.attached_reading.ammonia.toFixed(2)} mg/L</b></span></div><small>{activeCase.reading_assessment.observation}</small></div>}
                {activeCase.image_url && <div className="attached-image"><img src={`${API}${activeCase.image_url}`} alt={`Evidence uploaded for incident ${activeCase.id}`} /><div><strong>Photo attached</strong><small>{activeCase.image_screening}</small></div></div>}
                <div className="evidence-note"><span>i</span><p>Visual screening is not available. No diagnosis or treatment advice has been generated from this incident.</p></div>
                {activeCase.reviews.map((review, index) => <div className="saved-review" key={`${review.reviewer_name}-${index}`}><strong>Review by {review.reviewer_name} <StatusPill status={review.case_status} /></strong><p>{review.recommendation}</p><small>{formatTime(review.created_at)}</small></div>)}
                <form className="review-form" onSubmit={submitReview}><p className="eyebrow">ADD EXPERT REVIEW</p><label>Reviewer name<input required name="reviewer_name" defaultValue="Aquaculture expert" minLength={2} maxLength={120} /></label><label>Recommendation<textarea required name="recommendation" minLength={5} maxLength={2000} placeholder="Record evidence-based guidance and any follow-up needed…" /></label><label>Case status<select name="case_status" defaultValue={activeCase.status === 'monitoring' ? 'monitoring' : 'open'}><option value="open">Open · needs follow-up</option><option value="monitoring">Monitoring</option><option value="resolved">Resolved</option></select></label><button className="button button-primary" type="submit">Save review</button></form></>
            })()}</div></div>
          </section>}
        </>}
      </div>
      <footer className="main-footer"><span>AquaSathi <b>·</b> Better pond decisions, together.</span><span>Demo data only <i /> Built for responsible aquaculture</span></footer>
    </main>

    {showPondForm && <Modal title="Add a pond" description="Add the details you want to track." onClose={() => setShowPondForm(false)}><form className="modal-form" onSubmit={submitPond}>
      <label>Pond name<input name="name" required minLength={2} maxLength={80} placeholder="e.g. Bluewater 04" /></label><label>Location<input name="location" required minLength={2} maxLength={120} placeholder="Village, district" /></label>
      <div className="form-row"><label>Area (hectares)<input name="area_hectares" required type="number" step="0.1" min="0.01" max="500" placeholder="1.5" /></label><label>Species<input name="species" required defaultValue="Litopenaeus vannamei" /></label></div>
      <div className="form-row"><label>Stocking date<input name="stocked_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label><label>Farming stage<select name="stage"><option>Nursery</option><option>Grow-out</option><option>Harvest</option></select></label></div>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setShowPondForm(false)}>Cancel</button><button className="button button-primary" type="submit">Save pond</button></div>
    </form></Modal>}
    {showReadingForm && selectedPond && <Modal title="Record a reading" description={`Water quality for ${selectedPond.name}. Enter values from a recent test.`} onClose={() => setShowReadingForm(false)}><form className="modal-form" onSubmit={submitReading}>
      <div className="form-row"><label>Dissolved oxygen (mg/L)<input name="dissolved_oxygen" type="number" step="0.1" min="0" max="20" required placeholder="6.0" /></label><label>Temperature (°C)<input name="temperature" type="number" step="0.1" min="0" max="50" required placeholder="29.0" /></label></div>
      <div className="form-row"><label>pH<input name="ph" type="number" step="0.1" min="0" max="14" required placeholder="8.0" /></label><label>Salinity (ppt)<input name="salinity" type="number" step="0.1" min="0" max="60" required placeholder="18.0" /></label></div>
      <div className="form-row"><label>Ammonia (mg/L)<input name="ammonia" type="number" step="0.01" min="0" max="10" required placeholder="0.05" /></label><label>Measurement source<select name="source"><option value="actual">Actual · entered measurement</option><option value="simulated">Simulated demo sample</option></select></label></div>
      <p className="form-help">Demo screening uses broad review ranges only. Actual readings require a reliable test or sensor.</p>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setShowReadingForm(false)}>Cancel</button><button className="button button-primary" type="submit">Save reading</button></div>
    </form></Modal>}
    {showIncidentModal && <Modal title="Report a concern" description="Describe what changed. You can include a photo for expert follow-up." onClose={() => { setShowIncidentModal(false); setImageFile(null); setImagePreview('') }}><form className="modal-form" onSubmit={submitIncident}>
      <label>Affected pond<select value={selectedPondId ?? ''} onChange={(event) => setSelectedPondId(Number(event.target.value))}>{dashboard?.ponds.map((pond) => <option key={pond.id} value={pond.id}>{pond.name}</option>)}</select></label>
      <label>What have you noticed?<textarea name="description" required minLength={8} maxLength={2000} placeholder="For example: feeding activity has decreased since this morning…" /></label>
      <label>Photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /></label>{imagePreview && <img className="modal-image-preview" src={imagePreview} alt="Selected evidence preview" />}
      <p className="form-help">Reports are saved for follow-up. Images are not automatically diagnosed.</p>
      <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setShowIncidentModal(false)}>Cancel</button><button className="button button-primary" type="submit">Save incident</button></div>
    </form></Modal>}
  </div>
}

function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>
}

function IncidentTable({ incidents, onReview }: { incidents: Incident[]; onReview: (id: number) => void }) {
  return <div className="table-scroll"><table><thead><tr><th>CASE</th><th>POND</th><th>REPORTED</th><th>STATUS</th><th /></tr></thead><tbody>{incidents.map((incident) => <tr key={incident.id}><td><button className="case-link" onClick={() => onReview(incident.id)}>#{String(incident.id).padStart(4, '0')}</button></td><td>{incident.pond_name}</td><td>{formatTime(incident.created_at)}</td><td><StatusPill status={incident.status} /></td><td><button className="row-action" aria-label={`Review incident ${incident.id}`} onClick={() => onReview(incident.id)}>→</button></td></tr>)}</tbody></table></div>
}

function IncidentCard({ incident, onReview }: { incident: Incident; onReview: () => void }) {
  return <article className="panel incident-card"><div className="incident-card-top"><div className="case-mark">♧</div><StatusPill status={incident.status} /></div><p className="incident-case-id">CASE #{String(incident.id).padStart(4, '0')} <span>·</span> {formatTime(incident.created_at)}</p><h2>{incident.pond_name}</h2><p className="incident-card-description">{incident.description}</p>{incident.image_url && <div className="incident-thumb"><img src={`${API}${incident.image_url}`} alt={`Incident ${incident.id} evidence`} /><span>Photo attached · diagnosis not performed</span></div>}<div className="incident-card-bottom"><span>{incident.reviews.length ? `${incident.reviews.length} expert update${incident.reviews.length === 1 ? '' : 's'}` : 'Awaiting review'}</span><button className="text-button" onClick={onReview}>View case <span>→</span></button></div></article>
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button><p className="eyebrow">AQUASATHI WORKSPACE</p><h2 id="modal-title">{title}</h2><p className="modal-description">{description}</p>{children}</section></div>
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the selected image.'))
    reader.onerror = () => reject(new Error('Could not read the selected image.'))
    reader.readAsDataURL(file)
  })
}

export default App
